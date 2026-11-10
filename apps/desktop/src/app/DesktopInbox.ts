import type {
  DesktopInboxChannel,
  DesktopInboxMessage,
  DesktopInboxPage,
  DesktopInboxPageInput,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import { makeComponentLogger } from "./DesktopObservability.ts";

const { logWarning } = makeComponentLogger("desktop-inbox");

const CHANNEL_TIMEOUT = "60 seconds";

// `<home>/inbox/channels.json`. Each channel's `command` gets `--limit N` and, for older pages,
// `--before <ISO time>` and, for a single chat, `--chat=<conversationId>` appended, and prints a JSON array of messages, newest first.
const ChannelConfig = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  channel: Schema.String,
  color: Schema.String,
  command: Schema.NonEmptyArray(Schema.String),
});
const decodeConfig = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Array(ChannelConfig)));

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
const decodeMessages = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Array(ChannelMessage)),
);

export class DesktopInbox extends Context.Service<
  DesktopInbox,
  {
    /** One page across all configured channels, newest first. A failing channel is reported, not fatal. */
    readonly loadPage: (input: DesktopInboxPageInput) => Effect.Effect<DesktopInboxPage>;
  }
>()("@t3tools/desktop/app/DesktopInbox") {}

const make = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const fs = yield* FileSystem.FileSystem;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const configPath = environment.path.join(environment.baseDir, "inbox", "channels.json");
  // Channel commands may hold a single-writer session file, so pages never overlap.
  const permit = yield* Semaphore.make(1);

  const readConfig = fs.readFileString(configPath).pipe(
    Effect.flatMap(decodeConfig),
    Effect.catch((error) =>
      error._tag === "PlatformError" && error.reason._tag === "NotFound"
        ? Effect.succeed([])
        : logWarning("inbox channel config is unreadable", { error: String(error) }).pipe(
            Effect.as([]),
          ),
    ),
  );

  const readChannel = Effect.fn("desktop.inbox.readChannel")(function* (
    config: typeof ChannelConfig.Type,
    args: ReadonlyArray<string>,
  ) {
    const [command, ...baseArgs] = config.command;
    const handle = yield* spawner.spawn(
      ChildProcess.make(command, [...baseArgs, ...args], { stdin: "ignore", stderr: "ignore" }),
    );
    const [stdout, exitCode] = yield* Effect.all(
      [handle.stdout.pipe(Stream.decodeText(), Stream.mkString), handle.exitCode],
      { concurrency: "unbounded" },
    );
    if (exitCode !== 0) return yield* Effect.fail(`exited with ${exitCode}`);
    const rows = yield* decodeMessages(stdout);
    return rows.map((row): DesktopInboxMessage => ({
      ...row,
      id: `${config.id}:${row.id}`,
      channelId: config.id,
      conversationId: row.conversationId ?? null,
      senderAvatar: row.senderAvatar ?? null,
      conversationAvatar: row.conversationAvatar ?? null,
      media: row.media ?? null,
    }));
  });

  const loadPage: DesktopInbox["Service"]["loadPage"] = Effect.fn("desktop.inbox.loadPage")(
    function* ({ limit, before, conversation }) {
      const configs = yield* readConfig;
      const args = [
        "--limit",
        String(limit),
        ...(before ? ["--before", before] : []),
        // One argument, so an id with a leading minus is not read as an option.
        ...(conversation ? [`--chat=${conversation.conversationId}`] : []),
      ];
      const results = yield* Effect.forEach(
        conversation ? configs.filter((config) => config.id === conversation.channelId) : configs,
        (config) =>
          Effect.scoped(readChannel(config, args)).pipe(
            Effect.timeoutOption(CHANNEL_TIMEOUT),
            Effect.map(
              Option.match({
                onNone: () => ({ messages: [], error: "timed out" }),
                onSome: (messages) => ({ messages, error: null }),
              }),
            ),
            Effect.catch((error) =>
              Effect.succeed({
                messages: [],
                error: typeof error === "string" ? error : error.message,
              }),
            ),
            Effect.map((result) => ({ ...result, channelId: config.id })),
          ),
        { concurrency: "unbounded" },
      );
      const messages = results
        .flatMap((result) => result.messages)
        .toSorted((a, b) => b.receivedAt.localeCompare(a.receivedAt));
      return {
        channels: configs.map(({ id, label, channel, color }): DesktopInboxChannel => ({
          id,
          label,
          channel,
          color,
        })),
        messages: messages.slice(0, limit),
        // A channel that filled its limit may hold older messages.
        hasMore: results.some((result) => result.messages.length >= limit),
        errors: results.flatMap((result) =>
          result.error === null ? [] : [{ channelId: result.channelId, message: result.error }],
        ),
      };
    },
    permit.withPermits(1),
  );

  return DesktopInbox.of({ loadPage });
});

export const layer = Layer.effect(DesktopInbox, make);
