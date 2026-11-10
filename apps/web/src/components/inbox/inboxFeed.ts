import type {
  DesktopInboxMessage,
  DesktopInboxPage,
  DesktopInboxPageInput,
} from "@t3tools/contracts";
import { useSyncExternalStore } from "react";

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

// The newest page across all chats, kept fresh while anything shows it (the sidebar count).
let newest: ReadonlyArray<DesktopInboxMessage> | null = null;
let newestAt = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

/** The open Inbox loads the same page; sharing it saves the feed a channel round trip. */
export function publishNewestInboxMessages(messages: ReadonlyArray<DesktopInboxMessage>) {
  newest = messages;
  newestAt = Date.now();
  for (const listener of listeners) listener();
}

async function refresh() {
  if (document.hidden || Date.now() - newestAt < INBOX_REFRESH_MS / 2) return;
  const loaded = await loadInboxPage({ limit: INBOX_PAGE_SIZE }).catch(() => null);
  if (loaded && !loaded.sample) publishNewestInboxMessages(loaded.page.messages);
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

export function useNewestInboxMessages() {
  return useSyncExternalStore(subscribe, () => newest);
}
