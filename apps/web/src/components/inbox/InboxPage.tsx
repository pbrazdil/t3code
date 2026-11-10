import type {
  DesktopInboxChannel,
  DesktopInboxMessage,
  DesktopInboxPage,
  DesktopInboxPageInput,
} from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { MessagesSquareIcon, PaperclipIcon, SendIcon } from "lucide-react";
import {
  Fragment,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { workspaceAreaProps } from "../../lib/workspaceFocus";
import { Badge } from "../ui/badge";
import { SidebarInset } from "../ui/sidebar";
import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbSeparator,
} from "../WorkspaceBreadcrumb";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { sampleInboxPage } from "./inboxStaticData";

const PAGE_SIZE = 50;
const STICK_TO_BOTTOM_PX = 80;

const CHANNEL_LABEL: Record<string, string> = {
  telegram: "Telegram",
  zulip: "Zulip",
};

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

export interface InboxSearch {
  readonly channel?: string;
  readonly chat?: string;
}

interface InboxState {
  readonly channels: ReadonlyArray<DesktopInboxChannel>;
  /** Oldest first, so the newest message sits at the bottom. */
  readonly messages: ReadonlyArray<DesktopInboxMessage>;
  readonly errors: DesktopInboxPage["errors"];
  readonly hasMore: boolean;
  readonly sample: boolean;
}

const EMPTY_INBOX: InboxState = {
  channels: [],
  messages: [],
  errors: [],
  hasMore: true,
  sample: false,
};

// Reopening the Inbox or a chat shows what was loaded last time while the newest page refreshes.
const inboxCache = new Map<string, InboxState>();

/** The chat card at the top of the view and how far it sits from the top edge. */
interface ScrollPosition {
  readonly group: string;
  readonly offset: number;
}

// Where each list was left when scrolled away from the newest message, to return there.
const inboxScroll = new Map<string, ScrollPosition>();

// Matches INBOX_DEV_PATH in vite/inboxDev.ts: the dev server reads the channels for a browser.
async function loadDevInboxPage(input: DesktopInboxPageInput) {
  const response = await fetch("/__garden/inbox", { method: "POST", body: JSON.stringify(input) });
  if (!response.ok) throw new Error(`Inbox dev server: ${response.status}`);
  return (await response.json()) as DesktopInboxPage;
}

async function loadInboxPage(input: DesktopInboxPageInput) {
  const live = window.desktopBridge
    ? await window.desktopBridge.inbox.loadPage(input)
    : import.meta.env.DEV
      ? await loadDevInboxPage(input)
      : undefined;
  return live && live.channels.length > 0
    ? { page: live, sample: false }
    : { page: sampleInboxPage(input), sample: true };
}

function mergeMessages(
  current: ReadonlyArray<DesktopInboxMessage>,
  incoming: ReadonlyArray<DesktopInboxMessage>,
) {
  const known = new Set(current.map((message) => message.id));
  const fresh = incoming.filter((message) => !known.has(message.id));
  return fresh.length === 0
    ? current
    : [...current, ...fresh].toSorted((a, b) => a.receivedAt.localeCompare(b.receivedAt));
}

interface MessageGroup {
  readonly key: string;
  readonly channelId: string;
  readonly conversationId: string | null;
  readonly conversation: string | null;
  readonly messages: Array<DesktopInboxMessage>;
}

/** Consecutive messages of one chat share a card. */
function groupByConversation(messages: ReadonlyArray<DesktopInboxMessage>) {
  const groups: Array<MessageGroup> = [];
  for (const message of messages) {
    const last = groups.at(-1);
    if (
      last &&
      last.channelId === message.channelId &&
      last.conversationId === message.conversationId &&
      last.conversation === message.conversation
    ) {
      last.messages.push(message);
    } else {
      groups.push({
        key: message.id,
        channelId: message.channelId,
        conversationId: message.conversationId,
        conversation: message.conversation,
        messages: [message],
      });
    }
  }
  return groups;
}

const DAY_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

function dayOf(message: DesktopInboxMessage) {
  return new Date(message.receivedAt).toDateString();
}

const SENDER_TONES = [
  { text: "text-sky-600 dark:text-sky-400", avatar: "bg-sky-500/15" },
  { text: "text-emerald-600 dark:text-emerald-400", avatar: "bg-emerald-500/15" },
  { text: "text-amber-600 dark:text-amber-400", avatar: "bg-amber-500/15" },
  { text: "text-rose-600 dark:text-rose-400", avatar: "bg-rose-500/15" },
  { text: "text-violet-600 dark:text-violet-400", avatar: "bg-violet-500/15" },
  { text: "text-teal-600 dark:text-teal-400", avatar: "bg-teal-500/15" },
  { text: "text-orange-600 dark:text-orange-400", avatar: "bg-orange-500/15" },
  { text: "text-fuchsia-600 dark:text-fuchsia-400", avatar: "bg-fuchsia-500/15" },
] as const;

/** The same sender keeps the same colour everywhere. */
function senderTone(sender: string) {
  let hash = 0;
  for (const char of sender) hash = (hash * 31 + char.codePointAt(0)!) % 9973;
  return SENDER_TONES[hash % SENDER_TONES.length]!;
}

function initialOf(name: string) {
  return (
    [...name.replace(/^#/, "").trim()].find((char) => /[\p{L}\p{N}]/u.test(char)) ?? "?"
  ).toUpperCase();
}

const LABEL_TONE = { text: "text-(--label)", avatar: "bg-(--label)/15" };

function Avatar({
  name,
  image,
  tone,
}: {
  name: string;
  image: string | null;
  tone: { text: string; avatar: string };
}) {
  return image ? (
    <img src={image} alt="" className="size-7 shrink-0 rounded-full object-cover" />
  ) : (
    <span
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        tone.avatar,
        tone.text,
      )}
    >
      {initialOf(name)}
    </span>
  );
}

const URL_PATTERN = /(https?:\/\/[^\s<>]+)/;
const EMOJI_ONLY = /^[\p{Extended_Pictographic}\p{Emoji_Component}\s]+$/u;

function isEmojiOnly(text: string) {
  return text.length <= 12 && EMOJI_ONLY.test(text) && /\p{Extended_Pictographic}/u.test(text);
}

function MessageText({ text }: { text: string }) {
  return text.split(URL_PATTERN).map((part, index) =>
    index % 2 === 1 ? (
      <a
        // oxlint-disable-next-line react/no-array-index-key -- parts of one immutable message text
        key={index}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-(--label) underline underline-offset-2 hover:no-underline"
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
}

function MessageBubble({
  message,
  first,
  last,
  showSender,
}: {
  message: DesktopInboxMessage;
  /** First and last message of a run by one sender. */
  first: boolean;
  last: boolean;
  /** Chats with several other senders show who wrote each run. */
  showSender: boolean;
}) {
  const own = message.sender === "You";
  const sender = message.sender ?? "Unknown";
  const tone = senderTone(sender);
  const emojiOnly = message.media === null && isEmojiOnly(message.text);
  const meta = (
    <span className="float-right mt-1.5 ml-3 flex items-center gap-1.5 text-xs leading-none text-muted-foreground tabular-nums">
      {message.unread ? (
        <span role="img" aria-label="Unread" className="size-1.5 rounded-full bg-(--label)" />
      ) : null}
      <time dateTime={message.receivedAt}>{TIME_FORMAT.format(new Date(message.receivedAt))}</time>
    </span>
  );
  return (
    <li
      className={cn(
        "flex min-w-0 items-end gap-2",
        own && "flex-row-reverse",
        first ? "mt-2.5 first:mt-0" : "mt-0.5",
      )}
    >
      {showSender && !own ? (
        last ? (
          <Avatar name={sender} image={message.senderAvatar} tone={tone} />
        ) : (
          <span aria-hidden className="w-7 shrink-0" />
        )
      ) : null}
      <div
        className={cn(
          "flex max-w-4/5 min-w-0 flex-col overflow-hidden rounded-2xl text-sm",
          emojiOnly ? null : own ? "bg-(--label)/15" : "bg-muted",
          own ? !first && "rounded-tr-md" : !first && "rounded-tl-md",
          own ? !last && "rounded-br-md" : !last && "rounded-bl-md",
        )}
      >
        {showSender && !own && first && !emojiOnly ? (
          <span className={cn("truncate px-3 pt-1.5 text-xs font-semibold", tone.text)}>
            {sender}
          </span>
        ) : null}
        {message.media?.image ? (
          <img
            src={message.media.image}
            alt={message.media.label}
            className="m-1 max-h-72 max-w-full self-start rounded-xl object-contain"
          />
        ) : message.media ? (
          <span className="flex items-center gap-2 px-3 pt-2 text-muted-foreground">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background">
              <PaperclipIcon aria-hidden className="size-3.5" />
            </span>
            <span className="min-w-0 truncate">{message.media.label}</span>
          </span>
        ) : null}
        <div
          className={cn(
            "flow-root wrap-break-word whitespace-pre-wrap",
            emojiOnly ? "text-4xl" : "px-3 py-1.5",
            message.unread && "font-medium",
          )}
        >
          <MessageText text={message.text} />
          {meta}
        </div>
      </div>
    </li>
  );
}

function EnvironmentBadge({ channel }: { channel: DesktopInboxChannel }) {
  const Icon = channel.channel === "telegram" ? SendIcon : MessagesSquareIcon;
  return (
    <Badge variant="label" style={{ "--label": channel.color } as CSSProperties}>
      <Icon aria-hidden className="size-3" />
      {channel.label} · {CHANNEL_LABEL[channel.channel] ?? channel.channel}
    </Badge>
  );
}

export function InboxPage({ search }: { search: InboxSearch }) {
  const conversation =
    search.channel !== undefined && search.chat !== undefined
      ? { channelId: search.channel, conversationId: search.chat }
      : null;
  const cacheKey = conversation ? `${conversation.channelId}:${conversation.conversationId}` : "";
  const [inbox, setInbox] = useState(() => inboxCache.get(cacheKey) ?? EMPTY_INBOX);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLLIElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef(false);
  // A list shown from the cache refreshes its newest page on the observer's first report.
  const refreshNewestRef = useRef(inboxCache.has(cacheKey));
  // Where the scroll position goes once the next list renders: the bottom, or the
  // message that was at the top before older ones were added above it.
  const anchorRef = useRef<"bottom" | { height: number; top: number } | ScrollPosition | null>(
    inboxScroll.get(cacheKey) ?? "bottom",
  );

  const rememberScroll = () => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < STICK_TO_BOTTOM_PX) {
      inboxScroll.delete(cacheKey);
      return;
    }
    const top = scroller.getBoundingClientRect().top;
    const groups = scroller.querySelectorAll<HTMLElement>("[data-inbox-group]");
    for (let index = groups.length - 1; index >= 0; index -= 1) {
      const group = groups[index]!;
      const offset = group.getBoundingClientRect().top - top;
      if (offset <= 0 || index === 0) {
        inboxScroll.set(cacheKey, { group: group.dataset.inboxGroup!, offset });
        return;
      }
    }
  };

  const load = useEffectEvent(async (direction: "older" | "newest") => {
    if (loadingRef.current || (direction === "older" && !inbox.hasMore)) return;
    loadingRef.current = true;
    const before = direction === "older" ? inbox.messages[0]?.receivedAt : undefined;
    const loaded = await loadInboxPage({
      limit: PAGE_SIZE,
      ...(before ? { before } : {}),
      ...(conversation ? { conversation } : {}),
    }).catch((error: unknown) => (error instanceof Error ? error.message : String(error)));
    loadingRef.current = false;
    if (typeof loaded === "string") {
      setInbox({
        ...inbox,
        hasMore: direction === "older" ? false : inbox.hasMore,
        errors: [{ channelId: "", message: loaded }],
      });
      return;
    }
    const { page, sample } = loaded;
    const messages = mergeMessages(inbox.messages, page.messages);
    const next: InboxState = {
      channels: page.channels,
      messages,
      errors: page.errors,
      // A page of only known messages would repeat forever with the same cursor.
      hasMore: direction === "older" ? page.hasMore && messages !== inbox.messages : inbox.hasMore,
      sample,
    };
    const scroller = scrollRef.current;
    if (scroller && messages !== inbox.messages) {
      const atBottom =
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < STICK_TO_BOTTOM_PX;
      anchorRef.current =
        inbox.messages.length === 0 || (direction === "newest" && atBottom)
          ? "bottom"
          : direction === "older"
            ? { height: scroller.scrollHeight, top: scroller.scrollTop }
            : null;
    }
    inboxCache.set(cacheKey, next);
    setInbox(next);
    // A short page can leave the sentinel in range; observing again reports it once more.
    const sentinel = sentinelRef.current;
    if (sentinel && observerRef.current) {
      observerRef.current.unobserve(sentinel);
      observerRef.current.observe(sentinel);
    }
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- restores the scroll position after messages are added above or below what is on screen
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const anchor = anchorRef.current;
    if (!scroller || anchor === null) return;
    anchorRef.current = null;
    if (anchor === "bottom") {
      scroller.scrollTop = scroller.scrollHeight;
    } else if ("group" in anchor) {
      const group = Array.from(scroller.querySelectorAll<HTMLElement>("[data-inbox-group]")).find(
        (element) => element.dataset.inboxGroup === anchor.group,
      );
      scroller.scrollTop = group
        ? scroller.scrollTop +
          group.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top -
          anchor.offset
        : scroller.scrollHeight;
    } else {
      scroller.scrollTop = anchor.top + scroller.scrollHeight - anchor.height;
    }
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- IntersectionObserver on the top-of-list sentinel loads older pages; a cached list also refreshes its newest page once
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (refreshNewestRef.current) {
          refreshNewestRef.current = false;
          void load("newest");
        } else if (entry?.isIntersecting) {
          void load("older");
        }
      },
      { root: scrollRef.current, rootMargin: "600px 0px" },
    );
    observerRef.current = observer;
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, []);

  const channelById = new Map(inbox.channels.map((channel) => [channel.id, channel]));
  const conversationName = conversation ? (inbox.messages.at(-1)?.conversation ?? "Chat") : null;
  const groups = groupByConversation(inbox.messages);

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <div
        {...workspaceAreaProps("inbox", 1, "Inbox")}
        className="flex min-h-0 min-w-0 flex-1 flex-col bg-background"
      >
        <WorkspacePageHeader electron={isElectron} className="bg-background">
          <WorkspaceBreadcrumb ariaLabel="Inbox breadcrumb">
            {conversationName === null ? (
              <WorkspaceBreadcrumbItem current>
                <h1 className="truncate">Inbox</h1>
              </WorkspaceBreadcrumbItem>
            ) : (
              <>
                <WorkspaceBreadcrumbItem>
                  <Link to="/inbox" className="text-muted-foreground hover:text-foreground">
                    Inbox
                  </Link>
                </WorkspaceBreadcrumbItem>
                <WorkspaceBreadcrumbSeparator />
                <WorkspaceBreadcrumbItem current className="min-w-0">
                  <h1 className="truncate">{conversationName}</h1>
                </WorkspaceBreadcrumbItem>
              </>
            )}
          </WorkspaceBreadcrumb>
          <div className="min-w-0 flex-1" />
          <div className="flex shrink-0 items-center gap-2">
            {inbox.sample ? (
              <span className="text-xs text-muted-foreground">Sample data</span>
            ) : null}
            {inbox.channels.map((channel) => (
              <EnvironmentBadge key={channel.id} channel={channel} />
            ))}
          </div>
        </WorkspacePageHeader>

        <div
          ref={scrollRef}
          onScroll={rememberScroll}
          // Area focus lands here; the first chat link would pull the list to its oldest end.
          data-workspace-focus-default
          tabIndex={0}
          className="topbar-scroll-fade scrollbar-gutter-both min-h-0 flex-1 overflow-y-auto outline-none"
        >
          <WorkspacePageContainer width="readable" className="min-h-full justify-end gap-4">
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              <li ref={sentinelRef} className="py-4 text-center text-xs text-muted-foreground">
                {inbox.hasMore ? "Loading messages…" : "No older messages"}
              </li>
              {groups.map((group) => {
                const channel = channelById.get(group.channelId);
                if (!channel) return null;
                const last = group.messages.at(-1)!;
                const name = group.conversation ?? "Chat";
                const showSenders = group.messages.some(
                  (message) => message.sender !== "You" && message.sender !== name,
                );
                return (
                  <li
                    key={group.key}
                    data-inbox-group={group.key}
                    style={{ "--label": channel.color } as CSSProperties}
                    className="flex flex-col gap-3 rounded-xl border border-l-4 border-l-(--label) bg-card px-4 py-3 shadow-xs"
                  >
                    {conversation === null ? (
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={name} image={last.conversationAvatar} tone={LABEL_TONE} />
                        {group.conversationId !== null ? (
                          <Link
                            to="/inbox"
                            search={{ channel: group.channelId, chat: group.conversationId }}
                            className="min-w-0 truncate text-sm font-semibold underline-offset-2 hover:underline"
                          >
                            {name}
                          </Link>
                        ) : (
                          <span className="min-w-0 truncate text-sm font-semibold">{name}</span>
                        )}
                        <span className="flex-1" />
                        <EnvironmentBadge channel={channel} />
                        <time
                          dateTime={last.receivedAt}
                          className="shrink-0 text-xs text-muted-foreground tabular-nums"
                        >
                          {DAY_FORMAT.format(new Date(last.receivedAt))}
                        </time>
                      </div>
                    ) : null}
                    <ul className="m-0 flex list-none flex-col p-0">
                      {group.messages.map((message, index) => {
                        const previous = group.messages[index - 1];
                        const next = group.messages[index + 1];
                        const newDay = previous
                          ? dayOf(previous) !== dayOf(message)
                          : conversation !== null;
                        return (
                          <Fragment key={message.id}>
                            {newDay ? (
                              <li className="my-3 flex items-center gap-3 text-xs text-muted-foreground first:mt-0">
                                <span aria-hidden className="h-px flex-1 bg-border" />
                                {DAY_FORMAT.format(new Date(message.receivedAt))}
                                <span aria-hidden className="h-px flex-1 bg-border" />
                              </li>
                            ) : null}
                            <MessageBubble
                              message={message}
                              first={newDay || previous?.sender !== message.sender}
                              last={
                                next?.sender !== message.sender || dayOf(next) !== dayOf(message)
                              }
                              showSender={showSenders}
                            />
                          </Fragment>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
            {inbox.errors.map((error) => (
              <p key={error.channelId} className="m-0 text-sm text-destructive-foreground">
                {channelById.get(error.channelId)?.label ?? "Inbox"}: {error.message}
              </p>
            ))}
          </WorkspacePageContainer>
        </div>
      </div>
    </SidebarInset>
  );
}
