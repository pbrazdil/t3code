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

async function loadInboxPage(input: DesktopInboxPageInput) {
  const live = await window.desktopBridge?.inbox.loadPage(input);
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

function MessageBubble({
  message,
  showSender,
}: {
  message: DesktopInboxMessage;
  showSender: boolean;
}) {
  const own = message.sender === "You";
  return (
    <li className={cn("flex min-w-0 flex-col gap-0.5", own ? "items-end" : "items-start")}>
      {showSender && !own ? (
        <span className="px-1 text-xs font-medium text-muted-foreground">
          {message.sender ?? "Unknown"}
        </span>
      ) : null}
      <div className={cn("flex max-w-4/5 items-end gap-2", own && "flex-row-reverse")}>
        <div
          className={cn(
            "flex min-w-0 flex-col gap-1.5 rounded-2xl px-3 py-1.5 text-sm",
            own ? "rounded-br-md bg-(--label)/15" : "rounded-bl-md bg-muted",
            message.unread && "font-medium",
          )}
        >
          {message.media?.image ? (
            <img
              src={message.media.image}
              alt={message.media.label}
              className="h-40 max-w-full rounded-lg object-cover"
            />
          ) : message.media ? (
            <span className="flex items-center gap-1.5 text-muted-foreground italic">
              <PaperclipIcon aria-hidden className="size-3.5 shrink-0" />
              {message.media.label}
            </span>
          ) : null}
          {message.text ? (
            <p className="m-0 wrap-break-word whitespace-pre-wrap">{message.text}</p>
          ) : null}
        </div>
        {message.unread ? (
          <span
            role="img"
            aria-label="Unread"
            className="mb-2 size-2 shrink-0 rounded-full bg-(--label)"
          />
        ) : null}
        <time
          dateTime={message.receivedAt}
          className="mb-1 shrink-0 text-xs text-muted-foreground tabular-nums"
        >
          {TIME_FORMAT.format(new Date(message.receivedAt))}
        </time>
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
  const anchorRef = useRef<"bottom" | { height: number; top: number } | null>("bottom");

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
    scroller.scrollTop =
      anchor === "bottom"
        ? scroller.scrollHeight
        : anchor.top + scroller.scrollHeight - anchor.height;
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
          className="topbar-scroll-fade scrollbar-gutter-both min-h-0 flex-1 overflow-y-auto"
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
                return (
                  <li
                    key={group.key}
                    style={{ "--label": channel.color } as CSSProperties}
                    className="flex flex-col gap-3 rounded-xl border border-l-4 border-l-(--label) bg-card px-4 py-3 shadow-xs"
                  >
                    {conversation === null ? (
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          aria-hidden
                          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-(--label)/15 text-xs font-semibold text-(--label)"
                        >
                          {name.replace(/^#/, "").trim().charAt(0).toUpperCase()}
                        </span>
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
                    <ul className="m-0 flex list-none flex-col gap-1 p-0">
                      {group.messages.map((message, index) => {
                        const previous = group.messages[index - 1];
                        const newDay = previous
                          ? dayOf(previous) !== dayOf(message)
                          : conversation !== null;
                        return (
                          <Fragment key={message.id}>
                            {newDay ? (
                              <li className="my-1 text-center text-xs text-muted-foreground">
                                {DAY_FORMAT.format(new Date(message.receivedAt))}
                              </li>
                            ) : null}
                            <MessageBubble
                              message={message}
                              showSender={newDay || previous?.sender !== message.sender}
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
