import * as NodeOS from "node:os";
// @effect-diagnostics-next-line nodeBuiltinImport:off -- Vite plugin code runs outside any Effect runtime.
import * as NodePath from "node:path";

import { loadInboxCalendar } from "@t3tools/shared/inboxCalendar";
import { loadInboxPage } from "@t3tools/shared/inboxChannels";
import { loadInboxTasks, saveInboxTasks } from "@t3tools/shared/inboxTasks";
import {
  DesktopInboxCalendarInputSchema,
  DesktopInboxTasksSaveInputSchema,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import type { Plugin } from "vite-plus";

const decodeTasksSaveInput = Schema.decodeUnknownSync(
  Schema.fromJsonString(DesktopInboxTasksSaveInputSchema),
);

const decodeCalendarInput = Schema.decodeUnknownSync(
  Schema.fromJsonString(DesktopInboxCalendarInputSchema),
);

const INBOX_DEV_PATH = "/__garden/inbox";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
// The config the installed Garden reads, so the browser shows the same channels.
const INBOX_DIR = NodePath.join(
  process.env.GARDEN_INBOX_HOME?.trim() || NodePath.join(NodeOS.homedir(), ".garden"),
  "inbox",
);
const CONFIG_PATH = NodePath.join(INBOX_DIR, "channels.json");
const TASKS_DIR = NodePath.join(INBOX_DIR, "tasks");
const CALENDAR_PATH = NodePath.join(INBOX_DIR, "calendar.json");

// Paths below INBOX_DEV_PATH, matching the desktop bridge's inbox methods.
function handle(path: string, body: string): Promise<unknown> {
  if (path === "/tasks") return loadInboxTasks(TASKS_DIR);
  if (path === "/tasks/save") {
    return saveInboxTasks(TASKS_DIR, decodeTasksSaveInput(body)).then(() => null);
  }
  if (path === "/calendar") return loadInboxCalendar(CALENDAR_PATH, decodeCalendarInput(body));
  return loadInboxPage(CONFIG_PATH, JSON.parse(body));
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
            .then(() => handle(request.url ?? "/", Buffer.concat(chunks).toString("utf8")))
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
