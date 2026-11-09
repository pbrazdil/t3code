import type {
  DesktopInboxChannel,
  DesktopInboxMessage,
  DesktopInboxPage,
} from "@t3tools/contracts";
import { MessagesSquareIcon, SendIcon } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from "react";

import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { workspaceAreaProps } from "../../lib/workspaceFocus";
import { Badge } from "../ui/badge";
import { SidebarInset } from "../ui/sidebar";
import { WorkspaceBreadcrumb, WorkspaceBreadcrumbItem } from "../WorkspaceBreadcrumb";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { sampleInboxPage } from "./inboxStaticData";

const PAGE_SIZE = 50;

const CHANNEL_LABEL: Record<string, string> = {
  telegram: "Telegram",
  zulip: "Zulip",
};

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

interface InboxState {
  readonly channels: ReadonlyArray<DesktopInboxChannel>;
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

async function loadInboxPage(before: string | undefined) {
  const live = await window.desktopBridge?.inbox.loadPage({
    limit: PAGE_SIZE,
    ...(before ? { before } : {}),
  });
  return live && live.channels.length > 0
    ? { page: live, sample: false }
    : { page: sampleInboxPage(PAGE_SIZE, before), sample: true };
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

export function InboxPage() {
  const [inbox, setInbox] = useState(EMPTY_INBOX);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLLIElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const requestRef = useRef({
    loading: false,
    done: false,
    before: undefined as string | undefined,
    seen: new Set<string>(),
  });

  const loadOlder = useEffectEvent(async () => {
    const request = requestRef.current;
    if (request.loading || request.done) return;
    request.loading = true;
    const loaded = await loadInboxPage(request.before).catch((error: unknown) =>
      error instanceof Error ? error.message : String(error),
    );
    request.loading = false;
    if (typeof loaded === "string") {
      request.done = true;
      setInbox((current) => ({
        ...current,
        hasMore: false,
        errors: [{ channelId: "", message: loaded }],
      }));
      return;
    }
    const { page, sample } = loaded;
    const fresh = page.messages.filter((message) => !request.seen.has(message.id));
    for (const message of fresh) request.seen.add(message.id);
    request.before = page.messages.at(-1)?.receivedAt ?? request.before;
    // A page of only known messages would repeat forever with the same cursor.
    request.done = !page.hasMore || fresh.length === 0;
    const hasMore = !request.done;
    setInbox((current) => ({
      channels: page.channels,
      messages: [...current.messages, ...fresh],
      errors: page.errors,
      hasMore,
      sample,
    }));
    // A short page can leave the sentinel in range; observing again reports it once more.
    const sentinel = sentinelRef.current;
    if (sentinel && observerRef.current) {
      observerRef.current.unobserve(sentinel);
      observerRef.current.observe(sentinel);
    }
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- IntersectionObserver on the end-of-list sentinel loads the first and each older page
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void loadOlder();
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

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <div
        {...workspaceAreaProps("inbox", 1, "Inbox")}
        className="flex min-h-0 min-w-0 flex-1 flex-col bg-background"
      >
        <WorkspacePageHeader electron={isElectron} className="bg-background">
          <WorkspaceBreadcrumb ariaLabel="Inbox breadcrumb">
            <WorkspaceBreadcrumbItem current>
              <h1 className="truncate">Inbox</h1>
            </WorkspaceBreadcrumbItem>
          </WorkspaceBreadcrumb>
        </WorkspacePageHeader>

        <div
          ref={scrollRef}
          className="topbar-scroll-fade scrollbar-gutter-both min-h-0 flex-1 overflow-y-auto"
        >
          <WorkspacePageContainer width="readable" className="gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {inbox.channels.map((channel) => (
                <EnvironmentBadge key={channel.id} channel={channel} />
              ))}
              {inbox.sample ? (
                <span className="ml-auto text-xs text-muted-foreground">Sample data</span>
              ) : null}
            </div>

            {inbox.errors.map((error) => (
              <p key={error.channelId} className="m-0 text-sm text-destructive-foreground">
                {channelById.get(error.channelId)?.label ?? "Inbox"}: {error.message}
              </p>
            ))}

            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {inbox.messages.map((message) => {
                const channel = channelById.get(message.channelId);
                if (!channel) return null;
                return (
                  <li
                    key={message.id}
                    style={{ "--label": channel.color } as CSSProperties}
                    className="flex flex-col gap-1.5 rounded-lg border border-l-4 border-l-(--label) bg-(--label)/5 px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {message.unread ? (
                        <span
                          role="img"
                          aria-label="Unread"
                          className="size-2 shrink-0 rounded-full bg-(--label)"
                        />
                      ) : null}
                      <span
                        className={cn(
                          "truncate text-sm",
                          message.unread ? "font-semibold" : "font-medium",
                        )}
                      >
                        {message.sender ?? "Unknown"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {message.conversation}
                      </span>
                      <EnvironmentBadge channel={channel} />
                      <time
                        dateTime={message.receivedAt}
                        className="shrink-0 text-xs text-muted-foreground tabular-nums"
                      >
                        {TIME_FORMAT.format(new Date(message.receivedAt))}
                      </time>
                    </div>
                    <p
                      className={cn(
                        "m-0 text-sm wrap-break-word whitespace-pre-wrap",
                        message.unread ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {message.text}
                    </p>
                  </li>
                );
              })}
              {inbox.hasMore ? (
                <li ref={sentinelRef} className="py-4 text-center text-xs text-muted-foreground">
                  Loading messages…
                </li>
              ) : (
                <li className="py-4 text-center text-xs text-muted-foreground">
                  No older messages
                </li>
              )}
            </ul>
          </WorkspacePageContainer>
        </div>
      </div>
    </SidebarInset>
  );
}
