import { useLocation, useNavigate } from "@tanstack/react-router";
import { FolderPlusIcon, InboxIcon, SquarePenIcon } from "lucide-react";
import {
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { cn } from "~/lib/utils";
import { useNewestInboxMessages } from "../inbox/inboxFeed";
import { isInboxMessageUnread, useInboxLocalState } from "../inbox/inboxLocalState";
import { SidebarMenuButton, useSidebar } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/** Unread messages on the newest Inbox page; "+" when the whole page is unread. */
function InboxUnreadCount() {
  const newest = useNewestInboxMessages();
  const local = useInboxLocalState();
  const count = newest?.filter((message) => isInboxMessageUnread(local, message)).length ?? 0;
  if (!newest || count === 0) return null;
  return (
    <span
      aria-label={`${count} unread`}
      className="ml-auto rounded-full bg-primary/15 px-1.5 text-xs font-medium text-primary tabular-nums"
    >
      {count}
      {count === newest.length ? "+" : ""}
    </span>
  );
}

export interface SidebarThreadHeaderProps {
  hasProjects: boolean;
  projectScope: ReactNode;
  onNewProject: () => void;
  onNewThread: (event: ReactMouseEvent) => void;
  newThreadDisabled: boolean;
  newThreadShortcutLabel: string | null | undefined;
  newThreadInProjectShortcutLabel: string | null | undefined;
  showNewThreadInProjectHint: boolean;
  // Garden shows Inbox in place of the search field; the search props stay so Sidebar.tsx
  // keeps matching upstream.
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSearchKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  isSearching: boolean;
  searchResultCount: number;
  activeSearchResultIndex: number;
  onClearSearch: () => void;
}

export function SidebarThreadHeader({
  hasProjects,
  projectScope,
  onNewProject,
  onNewThread,
  newThreadDisabled,
  newThreadShortcutLabel,
  newThreadInProjectShortcutLabel,
  showNewThreadInProjectHint,
}: SidebarThreadHeaderProps) {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const inboxOpen = useLocation({ select: (location) => location.pathname === "/inbox" });
  const newThreadLabel = newThreadShortcutLabel
    ? `New thread (${newThreadShortcutLabel})`
    : "New thread";

  return (
    <div className="flex items-center gap-1">
      <SidebarMenuButton
        type="button"
        isActive={inboxOpen}
        className="min-w-0 flex-1"
        onClick={() => {
          if (isMobile) setOpenMobile(false);
          void navigate({ to: "/inbox" });
        }}
      >
        <InboxIcon />
        <span>Inbox</span>
        <InboxUnreadCount />
      </SidebarMenuButton>
      <div className="flex shrink-0 items-center">
        {hasProjects ? (
          <>
            {projectScope}
            <SidebarHeaderIconButton label="Add project" onClick={onNewProject}>
              <FolderPlusIcon />
            </SidebarHeaderIconButton>
          </>
        ) : null}
        <SidebarHeaderIconButton
          label="New thread"
          tooltip={
            showNewThreadInProjectHint ? (
              <span className="flex flex-col gap-0.5">
                <span>{newThreadLabel}</span>
                <span className="text-muted-foreground">
                  New thread in current project: Shift+click
                  {newThreadInProjectShortcutLabel ? ` (${newThreadInProjectShortcutLabel})` : ""}
                </span>
              </span>
            ) : (
              newThreadLabel
            )
          }
          disabled={newThreadDisabled}
          onClick={onNewThread}
        >
          <SquarePenIcon />
        </SidebarHeaderIconButton>
      </div>
    </div>
  );
}

export function SidebarHeaderIconButton({
  label,
  tooltip = label,
  className,
  children,
  ...rest
}: {
  label: string;
  tooltip?: ReactNode;
  className?: string | undefined;
  children?: ReactNode;
} & Omit<
  ComponentProps<typeof SidebarMenuButton>,
  "children" | "className" | "tooltip" | "isActive" | "aria-label"
>) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <SidebarMenuButton
            size="icon"
            type="button"
            aria-label={label}
            {...rest}
            className={cn("relative size-7 shrink-0", className)}
          />
        }
      >
        {children}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
        />
      </TooltipTrigger>
      <TooltipPopup side="top">{tooltip}</TooltipPopup>
    </Tooltip>
  );
}
