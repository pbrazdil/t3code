import type { DesktopInboxChannel } from "@t3tools/contracts";

import { deriveProjectIdentity } from "../../projectIdentity";
import { ProjectMonogram } from "../ProjectMonogram";

/** The monogram a project of the same name gets in the sidebar. */
export function InboxEnvironmentIcon({
  channel,
  className,
}: {
  channel: Pick<DesktopInboxChannel, "label">;
  className?: string;
}) {
  const identity = deriveProjectIdentity(channel.label);
  return <ProjectMonogram text={identity.monogram} color={identity.color} className={className} />;
}
