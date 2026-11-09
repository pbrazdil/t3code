import { MessagesSquareIcon, SendIcon } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { workspaceAreaProps } from "../../lib/workspaceFocus";
import { Badge } from "../ui/badge";
import { SidebarInset } from "../ui/sidebar";
import { WorkspaceBreadcrumb, WorkspaceBreadcrumbItem } from "../WorkspaceBreadcrumb";
import { WorkspacePageContainer } from "../WorkspacePageContainer";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import {
  INBOX_ENVIRONMENTS,
  loadInboxPage,
  type InboxChannelKind,
  type InboxEnvironment,
} from "./inboxStaticData";

const CHANNEL_LABEL: Record<InboxChannelKind, string> = {
  telegram: "Telegram",
  zulip: "Zulip",
};

const ENVIRONMENT_BY_ID = new Map(
  INBOX_ENVIRONMENTS.map((environment) => [environment.id, environment]),
);

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function ChannelIcon({ channel }: { channel: InboxChannelKind }) {
  const Icon = channel === "telegram" ? SendIcon : MessagesSquareIcon;
  return <Icon aria-hidden className="size-3" />;
}

function EnvironmentBadge({ environment }: { environment: InboxEnvironment }) {
  return (
    <Badge variant="label" style={{ "--label": environment.color } as CSSProperties}>
      <ChannelIcon channel={environment.channel} />
      {environment.label} · {CHANNEL_LABEL[environment.channel]}
    </Badge>
  );
}

export function InboxPage() {
  const [page, setPage] = useState(() => loadInboxPage(0));
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLLIElement | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- IntersectionObserver on the end-of-list sentinel loads the next page of older messages
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setPage((current) => {
          if (!current.hasMore) return current;
          const next = loadInboxPage(current.messages.length);
          return { messages: [...current.messages, ...next.messages], hasMore: next.hasMore };
        });
      },
      { root: scrollRef.current, rootMargin: "600px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // Each page pushes the sentinel out of range, so it intersects again on the next approach.
  }, []);

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
              {INBOX_ENVIRONMENTS.map((environment) => (
                <EnvironmentBadge key={environment.id} environment={environment} />
              ))}
              <span className="ml-auto text-xs text-muted-foreground">Sample data</span>
            </div>

            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {page.messages.map((message) => {
                const environment = ENVIRONMENT_BY_ID.get(message.environmentId);
                if (!environment) return null;
                return (
                  <li
                    key={message.id}
                    style={{ "--label": environment.color } as CSSProperties}
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
                        {message.sender}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {message.conversation}
                      </span>
                      <EnvironmentBadge environment={environment} />
                      <time
                        dateTime={message.receivedAt}
                        className="shrink-0 text-xs text-muted-foreground tabular-nums"
                      >
                        {TIME_FORMAT.format(new Date(message.receivedAt))}
                      </time>
                    </div>
                    <p
                      className={cn(
                        "m-0 text-sm",
                        message.unread ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {message.text}
                    </p>
                  </li>
                );
              })}
              {page.hasMore ? (
                <li ref={sentinelRef} aria-hidden className="h-px" />
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
