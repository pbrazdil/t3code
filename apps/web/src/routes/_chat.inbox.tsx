import { createFileRoute } from "@tanstack/react-router";

import { InboxPage, type InboxSearch } from "../components/inbox/InboxPage";

export const Route = createFileRoute("/_chat/inbox")({
  validateSearch: (raw: Record<string, unknown>): InboxSearch =>
    (typeof raw.channel === "string" || typeof raw.channel === "number") &&
    (typeof raw.chat === "string" || typeof raw.chat === "number")
      ? { channel: String(raw.channel), chat: String(raw.chat) }
      : {},
  component: InboxRoute,
});

function InboxRoute() {
  const search = Route.useSearch();
  // Remounting per chat drops the previous list and its paging cursor.
  return <InboxPage key={`${search.channel}:${search.chat}`} search={search} />;
}
