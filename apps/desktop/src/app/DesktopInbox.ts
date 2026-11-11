import type {
  DesktopInboxCalendar,
  DesktopInboxCalendarInput,
  DesktopInboxPage,
  DesktopInboxPageInput,
  DesktopInboxTask,
  DesktopInboxTasksSaveInput,
} from "@t3tools/contracts";
import { loadInboxCalendar } from "@t3tools/shared/inboxCalendar";
import { loadInboxPage } from "@t3tools/shared/inboxChannels";
import { loadInboxTasks, saveInboxTasks } from "@t3tools/shared/inboxTasks";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as DesktopEnvironment from "./DesktopEnvironment.ts";

export class DesktopInbox extends Context.Service<
  DesktopInbox,
  {
    /** One page across the channels in `<home>/inbox/channels.json`, newest first. */
    readonly loadPage: (input: DesktopInboxPageInput) => Effect.Effect<DesktopInboxPage>;
    /** Tasks of every environment, from `<home>/inbox/tasks`. */
    readonly loadTasks: Effect.Effect<ReadonlyArray<DesktopInboxTask>>;
    readonly saveTasks: (input: DesktopInboxTasksSaveInput) => Effect.Effect<void>;
    /** Events of the calendar in `<home>/inbox/calendar.json`. */
    readonly loadCalendar: (
      input: DesktopInboxCalendarInput,
    ) => Effect.Effect<DesktopInboxCalendar>;
  }
>()("@t3tools/desktop/app/DesktopInbox") {}

const make = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const configPath = environment.path.join(environment.baseDir, "inbox", "channels.json");
  const tasksDir = environment.path.join(environment.baseDir, "inbox", "tasks");
  const calendarPath = environment.path.join(environment.baseDir, "inbox", "calendar.json");
  return DesktopInbox.of({
    loadTasks: Effect.promise(() => loadInboxTasks(tasksDir)),
    saveTasks: Effect.fn("desktop.inbox.saveTasks")((input) =>
      Effect.promise(() => saveInboxTasks(tasksDir, input)),
    ),
    loadCalendar: Effect.fn("desktop.inbox.loadCalendar")((input) =>
      Effect.promise(() => loadInboxCalendar(calendarPath, input)),
    ),
    loadPage: Effect.fn("desktop.inbox.loadPage")((input) =>
      Effect.promise(() => loadInboxPage(configPath, input)),
    ),
  });
});

export const layer = Layer.effect(DesktopInbox, make);
