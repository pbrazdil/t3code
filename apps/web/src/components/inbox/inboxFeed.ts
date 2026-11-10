import type {
  DesktopInboxMessage,
  DesktopInboxPage,
  DesktopInboxPageInput,
} from "@t3tools/contracts";
import { useSyncExternalStore } from "react";

import { isInboxMessageUnread, useInboxLocalState } from "./inboxLocalState";
import { sampleInboxPage } from "./inboxStaticData";

export const INBOX_PAGE_SIZE = 50;
export const INBOX_REFRESH_MS = 60_000;

// Matches INBOX_DEV_PATH in vite/inboxDev.ts: the dev server reads the channels for a browser.
async function loadDevInboxPage(input: DesktopInboxPageInput) {
  const response = await fetch("/__garden/inbox", { method: "POST", body: JSON.stringify(input) });
  if (!response.ok) throw new Error(`Inbox dev server: ${response.status}`);
  return (await response.json()) as DesktopInboxPage;
}

export async function loadInboxPage(input: DesktopInboxPageInput) {
  const live = window.desktopBridge
    ? await window.desktopBridge.inbox.loadPage(input)
    : import.meta.env.DEV
      ? await loadDevInboxPage(input)
      : undefined;
  return live && live.channels.length > 0
    ? { page: live, sample: false }
    : { page: sampleInboxPage(input), sample: true };
}

// The newest page of every channel, kept fresh while anything counts unread messages in it.
// A page across channels would hide a quiet channel behind a busy one.
let newest: ReadonlyArray<DesktopInboxMessage> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

async function refresh() {
  if (document.hidden) return;
  const loaded = await loadInboxPage({ limit: INBOX_PAGE_SIZE, perChannel: true }).catch(
    () => null,
  );
  if (!loaded || loaded.sample) return;
  newest = loaded.page.messages;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === null) {
    void refresh();
    timer = setInterval(() => void refresh(), INBOX_REFRESH_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** The newest page of every channel, or null before the first load. */
export function useNewestInboxMessages() {
  return useSyncExternalStore(subscribe, () => newest);
}

/**
 * Counts unread messages of one environment, or of all for `null`: "12", or "50+" when the
 * loaded page ends in an unread message and older ones may be unread too.
 */
export function useInboxUnreadLabel() {
  const messages = useSyncExternalStore(subscribe, () => newest);
  const local = useInboxLocalState();
  return (environment: string | null) => {
    const byChannel = new Map<string, Array<DesktopInboxMessage>>();
    for (const message of messages ?? []) {
      if (environment !== null && message.channelId !== environment) continue;
      const list = byChannel.get(message.channelId);
      if (list) list.push(message);
      else byChannel.set(message.channelId, [message]);
    }
    let count = 0;
    let more = false;
    for (const page of byChannel.values()) {
      count += page.filter((message) => isInboxMessageUnread(local, message)).length;
      // Newest first, so the last row is the oldest one loaded.
      if (page.length >= INBOX_PAGE_SIZE && isInboxMessageUnread(local, page.at(-1)!)) more = true;
    }
    return count === 0 ? null : `${count}${more ? "+" : ""}`;
  };
}
