import * as NodeOS from "node:os";
// @effect-diagnostics-next-line nodeBuiltinImport:off -- Vite plugin code runs outside any Effect runtime.
import * as NodePath from "node:path";

import { loadInboxPage } from "@t3tools/shared/inboxChannels";
import type { Plugin } from "vite-plus";

const INBOX_DEV_PATH = "/__garden/inbox";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
// The config the installed Garden reads, so the browser shows the same channels.
const CONFIG_PATH = NodePath.join(
  process.env.GARDEN_INBOX_HOME?.trim() || NodePath.join(NodeOS.homedir(), ".garden"),
  "inbox",
  "channels.json",
);

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
            .then(() =>
              loadInboxPage(CONFIG_PATH, JSON.parse(Buffer.concat(chunks).toString("utf8"))),
            )
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
