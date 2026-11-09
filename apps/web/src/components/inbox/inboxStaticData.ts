export type InboxChannelKind = "telegram" | "zulip";

export interface InboxEnvironment {
  readonly id: string;
  readonly label: string;
  readonly channel: InboxChannelKind;
  readonly color: string;
}

export interface InboxMessage {
  readonly id: string;
  readonly environmentId: string;
  readonly sender: string;
  /** Telegram chat or Zulip stream and topic. */
  readonly conversation: string;
  readonly text: string;
  readonly receivedAt: string;
  readonly unread: boolean;
}

// Placeholder data until the channels are connected. Each environment owns one channel.
export const INBOX_ENVIRONMENTS: ReadonlyArray<InboxEnvironment> = [
  { id: "veroc", label: "Veroc", channel: "telegram", color: "#0ea5e9" },
  { id: "mac-studio", label: "Mac Studio", channel: "zulip", color: "#8b5cf6" },
  { id: "braiins", label: "Braiins", channel: "zulip", color: "#f59e0b" },
];

const SAMPLE_MESSAGES: ReadonlyArray<Omit<InboxMessage, "id" | "receivedAt" | "unread">> = [
  {
    environmentId: "veroc",
    sender: "Veronika",
    conversation: "Veroc",
    text: "The invoice export finished. Can you check the totals before I send it out?",
  },
  {
    environmentId: "braiins",
    sender: "Jan Novák",
    conversation: "#engineering > release 26.11",
    text: "Release branch is cut. Please hold merges to main until the smoke tests pass.",
  },
  {
    environmentId: "mac-studio",
    sender: "Garden agent",
    conversation: "#agents > garden fork",
    text: "Rebase onto upstream finished without conflicts. Waiting for approval to push custom.",
  },
  {
    environmentId: "veroc",
    sender: "Veronika",
    conversation: "Veroc",
    text: "Also, the calendar sync skipped two events from last week.",
  },
  {
    environmentId: "braiins",
    sender: "Eva Svobodová",
    conversation: "#design > inbox",
    text: "New mockups for the unified inbox are in Figma. Feedback welcome by Thursday.",
  },
  {
    environmentId: "mac-studio",
    sender: "Garden agent",
    conversation: "#agents > builds",
    text: "The desktop build is ready to install.",
  },
  {
    environmentId: "veroc",
    sender: "Veroc bot",
    conversation: "Veroc alerts",
    text: "Nightly backup completed in 4 minutes.",
  },
  {
    environmentId: "braiins",
    sender: "Jan Novák",
    conversation: "#engineering > incidents",
    text: "Postmortem for Friday's outage is published. Action items are assigned.",
  },
];

const NEWEST_RECEIVED_AT = Date.parse("2026-11-09T20:42:00Z");
const MESSAGE_INTERVAL_MS = 47 * 60_000;
const INBOX_MESSAGE_COUNT = 240;
const UNREAD_COUNT = 3;

/** Newest first. */
const INBOX_MESSAGES: ReadonlyArray<InboxMessage> = Array.from(
  { length: INBOX_MESSAGE_COUNT },
  (_, index) => ({
    ...SAMPLE_MESSAGES[index % SAMPLE_MESSAGES.length]!,
    id: `m${index}`,
    receivedAt: new Date(NEWEST_RECEIVED_AT - index * MESSAGE_INTERVAL_MS).toISOString(),
    unread: index < UNREAD_COUNT,
  }),
);

const INBOX_PAGE_SIZE = 50;

/** Stands in for the paged channel fetch: one page of older messages after `offset`. */
export function loadInboxPage(offset: number): {
  readonly messages: ReadonlyArray<InboxMessage>;
  readonly hasMore: boolean;
} {
  const messages = INBOX_MESSAGES.slice(offset, offset + INBOX_PAGE_SIZE);
  return { messages, hasMore: offset + messages.length < INBOX_MESSAGES.length };
}
