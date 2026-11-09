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

export const INBOX_MESSAGES: ReadonlyArray<InboxMessage> = [
  {
    id: "m1",
    environmentId: "veroc",
    sender: "Veronika",
    conversation: "Veroc",
    text: "The invoice export finished. Can you check the totals before I send it out?",
    receivedAt: "2026-11-09T20:42:00Z",
    unread: true,
  },
  {
    id: "m2",
    environmentId: "braiins",
    sender: "Jan Novák",
    conversation: "#engineering > release 26.11",
    text: "Release branch is cut. Please hold merges to main until the smoke tests pass.",
    receivedAt: "2026-11-09T20:15:00Z",
    unread: true,
  },
  {
    id: "m3",
    environmentId: "mac-studio",
    sender: "Garden agent",
    conversation: "#agents > garden fork",
    text: "Rebase onto upstream finished without conflicts. Waiting for approval to push custom.",
    receivedAt: "2026-11-09T19:58:00Z",
    unread: true,
  },
  {
    id: "m4",
    environmentId: "veroc",
    sender: "Veronika",
    conversation: "Veroc",
    text: "Also, the calendar sync skipped two events from last week.",
    receivedAt: "2026-11-09T18:30:00Z",
    unread: false,
  },
  {
    id: "m5",
    environmentId: "braiins",
    sender: "Eva Svobodová",
    conversation: "#design > inbox",
    text: "New mockups for the unified inbox are in Figma. Feedback welcome by Thursday.",
    receivedAt: "2026-11-09T16:05:00Z",
    unread: false,
  },
  {
    id: "m6",
    environmentId: "mac-studio",
    sender: "Garden agent",
    conversation: "#agents > builds",
    text: "Desktop build 0.1.7-preview.20261109.6 is ready to install.",
    receivedAt: "2026-11-09T14:47:00Z",
    unread: false,
  },
  {
    id: "m7",
    environmentId: "veroc",
    sender: "Veroc bot",
    conversation: "Veroc alerts",
    text: "Nightly backup completed in 4 minutes.",
    receivedAt: "2026-11-09T03:02:00Z",
    unread: false,
  },
  {
    id: "m8",
    environmentId: "braiins",
    sender: "Jan Novák",
    conversation: "#engineering > incidents",
    text: "Postmortem for Friday's outage is published. Action items are assigned.",
    receivedAt: "2026-11-08T17:20:00Z",
    unread: false,
  },
];
