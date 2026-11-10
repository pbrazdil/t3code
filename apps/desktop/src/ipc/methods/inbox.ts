import {
  DesktopInboxPageInputSchema,
  DesktopInboxPageSchema,
  DesktopInboxTaskSchema,
  DesktopInboxTasksSaveInputSchema,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

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

export const loadInboxTasks = makeIpcMethod({
  channel: IpcChannels.INBOX_LOAD_TASKS_CHANNEL,
  payload: Schema.Void,
  result: Schema.Array(DesktopInboxTaskSchema),
  handler: Effect.fn("desktop.ipc.inbox.loadTasks")(function* () {
    return yield* (yield* DesktopInbox.DesktopInbox).loadTasks;
  }),
});

export const saveInboxTasks = makeIpcMethod({
  channel: IpcChannels.INBOX_SAVE_TASKS_CHANNEL,
  payload: DesktopInboxTasksSaveInputSchema,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.inbox.saveTasks")(function* (input) {
    yield* (yield* DesktopInbox.DesktopInbox).saveTasks(input);
  }),
});
