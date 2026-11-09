import { DesktopInboxPageInputSchema, DesktopInboxPageSchema } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as DesktopInbox from "../../app/DesktopInbox.ts";
import * as IpcChannels from "../channels.ts";
import { makeIpcMethod } from "../DesktopIpc.ts";

export const loadInboxPage = makeIpcMethod({
  channel: IpcChannels.INBOX_LOAD_PAGE_CHANNEL,
  payload: DesktopInboxPageInputSchema,
  result: DesktopInboxPageSchema,
  handler: Effect.fn("desktop.ipc.inbox.loadPage")(function* (input) {
    return yield* (yield* DesktopInbox.DesktopInbox).loadPage(input);
  }),
});
