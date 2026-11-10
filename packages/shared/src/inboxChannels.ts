// @effect-diagnostics nodeBuiltinImport:off
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeUtil from "node:util";

import type {
  DesktopInboxMessage,
  DesktopInboxPage,
  DesktopInboxPageInput,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const CHANNEL_TIMEOUT_MS = 60_000;
// Messages carry previews and profile pictures as data URLs.
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

// Each channel's `command` gets `--limit N` and, for older pages, `--before <ISO time>` and,
// for a single chat, `--chat=<conversationId>` appended, and prints a JSON array of messages,
// newest first.
const ChannelConfig = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  channel: Schema.String,
  color: Schema.String,
  command: Schema.NonEmptyArray(Schema.String),
});
const decodeConfig = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Array(ChannelConfig)));

const ChannelMessage = Schema.Struct({
  id: Schema.String,
  sender: Schema.NullOr(Schema.String),
  conversation: Schema.NullOr(Schema.String),
  conversationId: Schema.optional(Schema.NullOr(Schema.String)),
  senderAvatar: Schema.optional(Schema.NullOr(Schema.String)),
  conversationAvatar: Schema.optional(Schema.NullOr(Schema.String)),
  media: Schema.optional(
    Schema.NullOr(Schema.Struct({ label: Schema.String, image: Schema.NullOr(Schema.String) })),
  ),
  text: Schema.String,
  receivedAt: Schema.String,
  unread: Schema.Boolean,
});
const decodeMessages = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Array(ChannelMessage)),
);

const execFile = NodeUtil.promisify(NodeChildProcess.execFile);

function firstLine(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).split("\n")[0]!;
}

async function readConfig(configPath: string) {
  const text = await NodeFSP.readFile(configPath, "utf8").catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "[]";
    throw error;
  });
  return decodeConfig(text);
}

async function readChannel(config: typeof ChannelConfig.Type, args: ReadonlyArray<string>) {
  const [command, ...baseArgs] = config.command;
  const { stdout } = await execFile(command, [...baseArgs, ...args], {
    timeout: CHANNEL_TIMEOUT_MS,
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  return decodeMessages(stdout).map((row): DesktopInboxMessage => ({
    ...row,
    id: `${config.id}:${row.id}`,
    channelId: config.id,
    conversationId: row.conversationId ?? null,
    senderAvatar: row.senderAvatar ?? null,
    conversationAvatar: row.conversationAvatar ?? null,
    media: row.media ?? null,
  }));
}

async function loadPage(
  configPath: string,
  { limit, before, conversation, perChannel }: DesktopInboxPageInput,
): Promise<DesktopInboxPage> {
  const configs = await readConfig(configPath).catch((error: unknown) => firstLine(error));
  if (typeof configs === "string") {
    return {
      channels: [],
      messages: [],
      hasMore: false,
      errors: [{ channelId: "", message: configs }],
    };
  }
  const args = [
    "--limit",
    String(limit),
    ...(before ? ["--before", before] : []),
    // One argument, so an id with a leading minus is not read as an option.
    ...(conversation ? [`--chat=${conversation.conversationId}`] : []),
  ];
  const results = await Promise.all(
    (conversation ? configs.filter((config) => config.id === conversation.channelId) : configs).map(
      (config) =>
        readChannel(config, args).then(
          (messages) => ({ channelId: config.id, messages, error: null }),
          (error: unknown) => ({ channelId: config.id, messages: [], error: firstLine(error) }),
        ),
    ),
  );
  return {
    channels: configs.map(({ id, label, channel, color }) => ({ id, label, channel, color })),
    messages: results
      .flatMap((result) => result.messages)
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
      // Cut to the newest overall, so paging before the oldest row skips no channel's messages.
      .slice(0, perChannel ? undefined : limit),
    // A channel that filled its limit may hold older messages.
    hasMore: results.some((result) => result.messages.length >= limit),
    errors: results.flatMap((result) =>
      result.error === null ? [] : [{ channelId: result.channelId, message: result.error }],
    ),
  };
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * One page across the channels configured in `configPath`, newest first. A failing channel is
 * reported in `errors`, not fatal. Pages never overlap: channel commands may hold a
 * single-writer session file.
 */
export function loadInboxPage(
  configPath: string,
  input: DesktopInboxPageInput,
): Promise<DesktopInboxPage> {
  const page = queue.then(() => loadPage(configPath, input));
  queue = page.catch(() => undefined);
  return page;
}
