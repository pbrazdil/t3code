import type {
  DesktopInboxChannel,
  DesktopInboxMessage,
  DesktopInboxPage,
  DesktopInboxTask,
} from "@t3tools/contracts";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CheckCheckIcon,
  CheckIcon,
  ListFilterIcon,
  MessagesSquareIcon,
  PaperclipIcon,
  SendIcon,
  StarIcon,
} from "lucide-react";
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
import { ExpandedImageDialogHost, openExpandedImagePreview } from "../chat/ExpandedImageDialog";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "../ui/menu";
import { SidebarInset } from "../ui/sidebar";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbSeparator,
} from "../WorkspaceBreadcrumb";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import {
  INBOX_PAGE_SIZE,
  INBOX_REFRESH_MS,
  loadInboxPage,
  publishNewestInboxMessages,
} from "./inboxFeed";
import { InboxTasksWidget, MessageTaskMenu } from "./InboxTasks";
import { useInboxTasks } from "./inboxTaskStore";
import {
  isInboxEnvironmentShown,
  isInboxMessageUnread,
  setInboxMessagesRead,
  showInboxEnvironment,
  toggleInboxMessageStar,
  useInboxLocalState,
} from "./inboxLocalState";

const STICK_TO_BOTTOM_PX = 80;
const INBOX_OVERLAY_KEY = "inbox";
const NO_TASKS: ReadonlyArray<DesktopInboxTask> = [];

const CHANNEL_LABEL: Record<string, string> = {
  telegram: "Telegram",
  zulip: "Zulip",
};

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

export interface InboxSearch {
  readonly channel?: string;
  readonly chat?: string;
  /** Absent means unread, the list the Inbox opens with. */
  readonly filter?: "all" | "starred";
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

// Links, and the inline Markdown that Zulip sends as source: [label](url), **bold**,
// @**mention** and `code`.
// A link target may hold brackets two levels deep, as Kibana URLs do.
const INLINE_PATTERN =
  /(\[[^\]\n]+\]\(https?:\/\/(?:[^\s()]+|\((?:[^\s()]+|\([^\s()]*\))*\))+\)|https?:\/\/[^\s<>]+|@?\*\*[^*\n]+\*\*|`[^`\n]+`)/;
const MARKDOWN_LINK = /^\[([^\]]+)\]\((.+)\)$/;

function InlineLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-(--label) underline underline-offset-2 hover:no-underline"
    >
      {children}
    </a>
  );
}

function InlinePart({ part }: { part: string }) {
  const link = MARKDOWN_LINK.exec(part);
  if (link) return <InlineLink href={link[2]!}>{link[1]!}</InlineLink>;
  if (part.startsWith("http")) return <InlineLink href={part}>{part}</InlineLink>;
  if (part.startsWith("`")) {
    return (
      <code className="rounded-sm bg-background/60 px-1 font-mono text-xs">
        {part.slice(1, -1)}
      </code>
    );
  }
  const mention = part.startsWith("@");
  const text = part.slice(mention ? 3 : 2, -2);
  // A mention may carry the user id: @**Name|123**.
  return (
    <strong className="font-semibold">{mention ? `@${text.replace(/\|\d+$/, "")}` : text}</strong>
  );
}

const EMOJI_ONLY = /^[\p{Extended_Pictographic}\p{Emoji_Component}\s]+$/u;

function isEmojiOnly(text: string) {
  return text.length <= 12 && EMOJI_ONLY.test(text) && /\p{Extended_Pictographic}/u.test(text);
}

function MessageText({ text }: { text: string }) {
  return text.split(INLINE_PATTERN).map((part, index) =>
    index % 2 === 1 ? (
      // oxlint-disable-next-line react/no-array-index-key -- parts of one immutable message text
      <InlinePart key={index} part={part} />
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
  unread,
  starred,
  tasks,
}: {
  message: DesktopInboxMessage;
  unread: boolean;
  starred: boolean;
  /** Tasks of the message's environment. */
  tasks: ReadonlyArray<DesktopInboxTask>;
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
      {unread ? (
        <span role="img" aria-label="Unread" className="size-1.5 rounded-full bg-(--label)" />
      ) : null}
      <time dateTime={message.receivedAt}>{TIME_FORMAT.format(new Date(message.receivedAt))}</time>
    </span>
  );
  return (
    <li
      className={cn(
        "group/message flex min-w-0 items-end gap-2",
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
          <button
            type="button"
            aria-label={`Enlarge ${message.media.label}`}
            onClick={() =>
              openExpandedImagePreview(INBOX_OVERLAY_KEY, {
                images: [{ src: message.media!.image, name: message.media!.label }],
                index: 0,
              })
            }
            className="m-1 cursor-zoom-in self-start rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <img
              src={message.media.image}
              alt={message.media.label}
              className="max-h-72 max-w-full rounded-xl object-contain"
            />
          </button>
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
            unread && "font-medium",
          )}
        >
          <MessageText text={message.text} />
          {meta}
        </div>
      </div>
      <span
        className={cn(
          "flex self-center",
          !starred &&
            "opacity-0 group-hover/message:opacity-100 has-focus-visible:opacity-100 has-data-linked:opacity-100 has-data-popup-open:opacity-100",
        )}
      >
        <Button
          variant="ghost-muted"
          size="icon-xs"
          aria-label={starred ? "Remove star" : "Star message"}
          aria-pressed={starred}
          title={starred ? "Remove star" : "Star message"}
          onClick={() => toggleInboxMessageStar(message)}
        >
          <StarIcon aria-hidden className={cn(starred && "fill-warning text-warning")} />
        </Button>
        <MessageTaskMenu message={message} tasks={tasks} />
      </span>
    </li>
  );
}

const ALL_ENVIRONMENTS = "all";

function EnvironmentFilter({
  channels,
  selected,
}: {
  channels: ReadonlyArray<DesktopInboxChannel>;
  selected: string | null;
}) {
  const channel = channels.find((candidate) => candidate.id === selected);
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            variant="ghost-muted"
            size="icon-xs"
            aria-label={channel ? `Filter environments: ${channel.label}` : "Filter environments"}
          />
        }
      >
        {channel === undefined ? (
          <ListFilterIcon className="size-4" />
        ) : channel.channel === "telegram" ? (
          <SendIcon className="size-4" style={{ color: channel.color }} />
        ) : (
          <MessagesSquareIcon className="size-4" style={{ color: channel.color }} />
        )}
      </MenuTrigger>
      <MenuPopup align="end">
        <MenuRadioGroup
          value={selected ?? ALL_ENVIRONMENTS}
          onValueChange={(value: string) =>
            showInboxEnvironment(value === ALL_ENVIRONMENTS ? null : value)
          }
        >
          <MenuRadioItem value={ALL_ENVIRONMENTS} closeOnClick>
            All environments
          </MenuRadioItem>
          {channels.map((candidate) => (
            <MenuRadioItem key={candidate.id} value={candidate.id} closeOnClick>
              {candidate.label} · {CHANNEL_LABEL[candidate.channel] ?? candidate.channel}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
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
  const filter = search.filter ?? "unread";
  const scrollKey = `${cacheKey}|${filter}`;
  const navigate = useNavigate();
  const local = useInboxLocalState();
  // A filtered list stops loading by itself once a page adds nothing to it.
  const [searchPaused, setSearchPaused] = useState(false);
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
    inboxScroll.get(scrollKey) ?? "bottom",
  );

  const rememberScroll = () => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < STICK_TO_BOTTOM_PX) {
      inboxScroll.delete(scrollKey);
      return;
    }
    const top = scroller.getBoundingClientRect().top;
    const groups = scroller.querySelectorAll<HTMLElement>("[data-inbox-group]");
    for (let index = groups.length - 1; index >= 0; index -= 1) {
      const group = groups[index]!;
      const offset = group.getBoundingClientRect().top - top;
      if (offset <= 0 || index === 0) {
        inboxScroll.set(scrollKey, { group: group.dataset.inboxGroup!, offset });
        return;
      }
    }
  };

  // A chat is opened on purpose, so hiding its environment only thins the overview.
  const isShown = (message: DesktopInboxMessage) =>
    conversation !== null || isInboxEnvironmentShown(local, message.channelId);

  const load = useEffectEvent(async (direction: "older" | "newest", requested = false) => {
    if (loadingRef.current) return;
    if (direction === "older") {
      if (!inbox.hasMore || (searchPaused && !requested)) return;
      // Stars are kept here; channels are only asked once, for their names and colours.
      if (filter === "starred" && inbox.channels.length > 0) return;
    }
    loadingRef.current = true;
    const before = direction === "older" ? inbox.messages[0]?.receivedAt : undefined;
    const loaded = await loadInboxPage({
      limit: INBOX_PAGE_SIZE,
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
    if (!before && !conversation && !sample) publishNewestInboxMessages(page.messages);
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
    if (direction === "older") {
      const known = new Set(inbox.messages.map((message) => message.id));
      setSearchPaused(
        filter === "unread" &&
          !messages.some(
            (message) =>
              !known.has(message.id) && isShown(message) && isInboxMessageUnread(local, message),
          ),
      );
    }
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

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- IntersectionObserver on the top-of-list sentinel loads older pages, a timer loads new messages; a cached list also refreshes its newest page once
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
    const refresh = setInterval(() => {
      if (!document.hidden) void load("newest");
    }, INBOX_REFRESH_MS);
    return () => {
      clearInterval(refresh);
      observer.disconnect();
      observerRef.current = null;
    };
  }, []);

  const { tasks } = useInboxTasks();
  const tasksByEnvironment = new Map<string, Array<DesktopInboxTask>>();
  for (const task of tasks) {
    const list = tasksByEnvironment.get(task.environmentId);
    if (list) list.push(task);
    else tasksByEnvironment.set(task.environmentId, [task]);
  }
  const channelById = new Map(inbox.channels.map((channel) => [channel.id, channel]));
  const conversationName = conversation ? (inbox.messages.at(-1)?.conversation ?? "Chat") : null;
  const shown =
    filter === "starred"
      ? [...local.starred.values()]
          .filter((message) =>
            conversation === null
              ? isInboxEnvironmentShown(local, message.channelId)
              : message.channelId === conversation.channelId &&
                message.conversationId === conversation.conversationId,
          )
          .toSorted((a, b) => a.receivedAt.localeCompare(b.receivedAt))
      : filter === "unread"
        ? inbox.messages.filter(
            (message) => isShown(message) && isInboxMessageUnread(local, message),
          )
        : inbox.messages.filter(isShown);
  const groups = groupByConversation(shown);

  const showFilter = (next: string) => {
    const nextFilter = next === "all" || next === "starred" ? next : undefined;
    anchorRef.current = inboxScroll.get(`${cacheKey}|${nextFilter ?? "unread"}`) ?? "bottom";
    setSearchPaused(false);
    void navigate({
      to: "/inbox",
      search: {
        ...(conversation
          ? { channel: conversation.channelId, chat: conversation.conversationId }
          : {}),
        ...(nextFilter ? { filter: nextFilter } : {}),
      },
      replace: true,
    });
  };

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
          <ToggleGroup
            aria-label="Show messages"
            value={[filter]}
            onValueChange={(next) => {
              if (next[0]) showFilter(next[0]);
            }}
          >
            <Toggle value="unread">Unread</Toggle>
            <Toggle value="all">All</Toggle>
            <Toggle value="starred">Starred</Toggle>
          </ToggleGroup>
          <div className="flex shrink-0 items-center gap-2">
            {inbox.sample ? (
              <span className="text-xs text-muted-foreground">Sample data</span>
            ) : null}
            {conversation === null ? (
              <EnvironmentFilter channels={inbox.channels} selected={local.environment} />
            ) : null}
          </div>
        </WorkspacePageHeader>

        <div className="flex min-h-0 flex-1">
          <div
            ref={scrollRef}
            onScroll={rememberScroll}
            // Area focus lands here; the first chat link would pull the list to its oldest end.
            data-workspace-focus-default
            tabIndex={0}
            className="topbar-scroll-fade scrollbar-gutter-both min-h-0 min-w-0 flex-1 overflow-y-auto outline-none"
          >
            <WorkspacePageContainer className="min-h-full max-w-3xl justify-end gap-4">
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                <li ref={sentinelRef} className="py-4 text-center text-xs text-muted-foreground">
                  {filter === "starred" ? (
                    groups.length === 0 ? (
                      "No starred messages"
                    ) : null
                  ) : !inbox.hasMore ? (
                    groups.length === 0 && filter === "unread" ? (
                      "No unread messages"
                    ) : (
                      "No older messages"
                    )
                  ) : searchPaused ? (
                    <Button
                      variant="ghost-muted"
                      size="xs"
                      onClick={() => void load("older", true)}
                    >
                      {groups.length === 0 ? "No unread messages here. " : ""}Search older messages
                    </Button>
                  ) : (
                    "Loading messages…"
                  )}
                </li>
                {groups.map((group) => {
                  const channel = channelById.get(group.channelId);
                  if (!channel) return null;
                  const last = group.messages.at(-1)!;
                  const name = group.conversation ?? "Chat";
                  const showSenders = group.messages.some(
                    (message) => message.sender !== "You" && message.sender !== name,
                  );
                  const received = group.messages.filter((message) => message.sender !== "You");
                  const groupUnread = received.some((message) =>
                    isInboxMessageUnread(local, message),
                  );
                  const readButton =
                    received.length > 0 ? (
                      <Button
                        variant="ghost-muted"
                        size="icon-xs"
                        aria-label={groupUnread ? "Mark as read" : "Mark as unread"}
                        title={groupUnread ? "Mark as read" : "Mark as unread"}
                        onClick={() =>
                          setInboxMessagesRead(
                            received.map((message) => message.id),
                            groupUnread,
                          )
                        }
                      >
                        {groupUnread ? <CheckIcon aria-hidden /> : <CheckCheckIcon aria-hidden />}
                      </Button>
                    ) : null;
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
                              search={{
                                channel: group.channelId,
                                chat: group.conversationId,
                                filter: "all",
                              }}
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
                          {readButton}
                        </div>
                      ) : readButton ? (
                        <div className="flex justify-end">{readButton}</div>
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
                                unread={isInboxMessageUnread(local, message)}
                                starred={local.starred.has(message.id)}
                                tasks={tasksByEnvironment.get(message.channelId) ?? NO_TASKS}
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
          <aside className="hidden w-1/2 shrink-0 flex-col gap-4 overflow-y-auto border-l px-4 py-6 lg:flex">
            <InboxTasksWidget channels={inbox.channels} environment={local.environment} />
          </aside>
        </div>
      </div>
      <ExpandedImageDialogHost threadKey={INBOX_OVERLAY_KEY} />
    </SidebarInset>
  );
}
