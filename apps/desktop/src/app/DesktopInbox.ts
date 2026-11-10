import type { DesktopInboxPage, DesktopInboxPageInput } from "@t3tools/contracts";
import { loadInboxPage } from "@t3tools/shared/inboxChannels";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as DesktopEnvironment from "./DesktopEnvironment.ts";

export class DesktopInbox extends Context.Service<
  DesktopInbox,
  {
    /** One page across the channels in `<home>/inbox/channels.json`, newest first. */
    readonly loadPage: (input: DesktopInboxPageInput) => Effect.Effect<DesktopInboxPage>;
  }
>()("@t3tools/desktop/app/DesktopInbox") {}

const make = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const configPath = environment.path.join(environment.baseDir, "inbox", "channels.json");
  return DesktopInbox.of({
    loadPage: Effect.fn("desktop.inbox.loadPage")((input) =>
      Effect.promise(() => loadInboxPage(configPath, input)),
    ),
  });
});

export const layer = Layer.effect(DesktopInbox, make);
