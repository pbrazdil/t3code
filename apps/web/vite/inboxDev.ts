// @effect-diagnostics-next-line nodeBuiltinImport:off -- Vite plugin code runs outside any Effect runtime.
import * as NodeChildProcess from "node:child_process";
// @effect-diagnostics-next-line nodeBuiltinImport:off -- Vite plugin code runs outside any Effect runtime.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
// @effect-diagnostics-next-line nodeBuiltinImport:off -- Vite plugin code runs outside any Effect runtime.
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";

import type { DesktopInboxPage, DesktopInboxPageInput } from "@t3tools/contracts";
import type { Plugin } from "vite-plus";

const INBOX_DEV_PATH = "/__garden/inbox";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
const COMMAND_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

const execFile = NodeUtil.promisify(NodeChildProcess.execFile);

interface ChannelConfig {
  readonly id: string;
  readonly label: string;
  readonly channel: string;
  readonly color: string;
  readonly command: ReadonlyArray<string>;
}

type Message = DesktopInboxPage["messages"][number];

// The browser counterpart of the desktop Inbox service: same config file, same command contract.
async function loadPage(input: DesktopInboxPageInput): Promise<DesktopInboxPage> {
  const configPath = NodePath.join(
    process.env.GARDEN_INBOX_HOME?.trim() || NodePath.join(NodeOS.homedir(), ".garden"),
    "inbox",
    "channels.json",
  );
  const configs = await NodeFSP.readFile(configPath, "utf8").then(
    (text) => JSON.parse(text) as ReadonlyArray<ChannelConfig>,
    () => [],
  );
  const active = input.conversation
    ? configs.filter((config) => config.id === input.conversation?.channelId)
    : configs;
  const messages: Array<Message> = [];
  const errors: Array<DesktopInboxPage["errors"][number]> = [];
  let hasMore = false;
  for (const config of active) {
    const [command, ...args] = config.command;
    try {
      const { stdout } = await execFile(
        command!,
        [
          ...args,
          "--limit",
          String(input.limit),
          ...(input.before ? ["--before", input.before] : []),
          ...(input.conversation ? [`--chat=${input.conversation.conversationId}`] : []),
        ],
        { timeout: COMMAND_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES },
      );
      const rows = JSON.parse(stdout) as ReadonlyArray<Partial<Message> & { id: string }>;
      hasMore ||= rows.length >= input.limit;
      for (const row of rows) {
        messages.push({
          id: `${config.id}:${row.id}`,
          channelId: config.id,
          sender: row.sender ?? null,
          conversation: row.conversation ?? null,
          conversationId: row.conversationId ?? null,
          senderAvatar: row.senderAvatar ?? null,
          conversationAvatar: row.conversationAvatar ?? null,
          text: row.text ?? "",
          media: row.media ?? null,
          receivedAt: row.receivedAt ?? "",
          unread: row.unread ?? false,
        });
      }
    } catch (error) {
      errors.push({
        channelId: config.id,
        message: error instanceof Error ? error.message.split("\n")[0]! : String(error),
      });
    }
  }
  return {
    channels: configs.map(({ id, label, channel, color }) => ({ id, label, channel, color })),
    messages: messages
      .toSorted((a, b) => b.receivedAt.localeCompare(a.receivedAt))
      .slice(0, input.limit),
    hasMore,
    errors,
  };
}

/** Serves the Inbox to the dev web app in a browser, where no desktop bridge exists. */
export function inboxDevPlugin(): Plugin {
  return {
    name: "garden:inbox-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(INBOX_DEV_PATH, (request, response) => {
        // Private messages: only this machine's own dev page may read them, never a
        // shared or tunnelled origin and never another site.
        const hostname = (request.headers.host ?? "").replace(/:\d+$/, "");
        if (
          request.method !== "POST" ||
          !LOCAL_HOSTNAMES.has(hostname) ||
          request.headers["sec-fetch-site"] !== "same-origin"
        ) {
          response.statusCode = 403;
          response.end();
          return;
        }
        const chunks: Array<Buffer> = [];
        request.on("data", (chunk: Buffer) => chunks.push(chunk));
        request.on("end", () => {
          void Promise.resolve()
            .then(() => loadPage(JSON.parse(Buffer.concat(chunks).toString("utf8"))))
            .then(
              (page) => {
                response.setHeader("content-type", "application/json");
                response.setHeader("cache-control", "no-store");
                response.end(JSON.stringify(page));
              },
              (error: unknown) => {
                response.statusCode = 500;
                response.end(error instanceof Error ? error.message : String(error));
              },
            );
        });
      });
    },
  };
}
