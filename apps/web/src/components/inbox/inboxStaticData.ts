import type {
  DesktopInboxChannel,
  DesktopInboxMessage,
  DesktopInboxPage,
  DesktopInboxPageInput,
} from "@t3tools/contracts";

// Shown when no channel is configured on this device (and in the browser, which has no bridge).
const SAMPLE_CHANNELS: ReadonlyArray<DesktopInboxChannel> = [
  { id: "veroc", label: "Veroc", channel: "telegram", color: "#0ea5e9" },
  { id: "mac-studio", label: "Mac Studio", channel: "zulip", color: "#8b5cf6" },
  { id: "braiins", label: "Braiins", channel: "zulip", color: "#f59e0b" },
];

const SAMPLE_MESSAGES: ReadonlyArray<
  Pick<DesktopInboxMessage, "channelId" | "sender" | "conversation" | "text">
> = [
  {
    channelId: "veroc",
    sender: "Veronika",
    conversation: "Veroc",
    text: "The invoice export finished. Can you check the totals before I send it out?",
  },
  {
    channelId: "braiins",
    sender: "Jan Novák",
    conversation: "#engineering > release 26.11",
    text: "Release branch is cut. Please hold merges to main until the smoke tests pass.",
  },
  {
    channelId: "mac-studio",
    sender: "Garden agent",
    conversation: "#agents > garden fork",
    text: "Rebase onto upstream finished without conflicts. Waiting for approval to push custom.",
  },
  {
    channelId: "veroc",
    sender: "Veronika",
    conversation: "Veroc",
    text: "Also, the calendar sync skipped two events from last week.",
  },
  {
    channelId: "braiins",
    sender: "Eva Svobodová",
    conversation: "#design > inbox",
    text: "New mockups for the unified inbox are in Figma. Feedback welcome by Thursday.",
  },
  {
    channelId: "mac-studio",
    sender: "Garden agent",
    conversation: "#agents > builds",
    text: "The desktop build is ready to install.",
  },
  {
    channelId: "veroc",
    sender: "Veroc bot",
    conversation: "Veroc alerts",
    text: "Nightly backup completed in 4 minutes.",
  },
  {
    channelId: "braiins",
    sender: "Jan Novák",
    conversation: "#engineering > incidents",
    text: "Postmortem for Friday's outage is published. Action items are assigned.",
  },
];

const NEWEST_RECEIVED_AT = Date.parse("2026-11-09T20:42:00Z");
const MESSAGE_INTERVAL_MS = 47 * 60_000;
const SAMPLE_MESSAGE_COUNT = 240;
const UNREAD_COUNT = 3;

/** Newest first. */
const SAMPLE_INBOX: ReadonlyArray<DesktopInboxMessage> = Array.from(
  { length: SAMPLE_MESSAGE_COUNT },
  (_, index) => ({
    ...SAMPLE_MESSAGES[index % SAMPLE_MESSAGES.length]!,
    id: `sample:${index}`,
    conversationId: SAMPLE_MESSAGES[index % SAMPLE_MESSAGES.length]!.conversation,
    receivedAt: new Date(NEWEST_RECEIVED_AT - index * MESSAGE_INTERVAL_MS).toISOString(),
    unread: index < UNREAD_COUNT,
  }),
);

export function sampleInboxPage({
  limit,
  before,
  conversation,
}: DesktopInboxPageInput): DesktopInboxPage {
  const older = SAMPLE_INBOX.filter(
    (message) =>
      (!before || message.receivedAt < before) &&
      (!conversation ||
        (message.channelId === conversation.channelId &&
          message.conversationId === conversation.conversationId)),
  );
  return {
    channels: SAMPLE_CHANNELS,
    messages: older.slice(0, limit),
    hasMore: older.length > limit,
    errors: [],
  };
}
