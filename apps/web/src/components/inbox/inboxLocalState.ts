import type { DesktopInboxMessage } from "@t3tools/contracts";
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "garden.inbox.v1";

/** What the user did with messages here; channels are only read and never learn of it. */
interface InboxLocalState {
  /** Messages received after this count as unread until marked read. */
  readonly baseline: string;
  readonly read: ReadonlySet<string>;
  readonly unread: ReadonlySet<string>;
  /** Whole messages, so the starred view needs no channel to find them again. */
  readonly starred: ReadonlyMap<string, DesktopInboxMessage>;
}

interface StoredState {
  readonly baseline: string;
  readonly read: ReadonlyArray<string>;
  readonly unread: ReadonlyArray<string>;
  readonly starred: ReadonlyArray<DesktopInboxMessage>;
}

function readStored(): InboxLocalState {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as StoredState | null;
    if (stored) {
      return {
        baseline: stored.baseline,
        read: new Set(stored.read),
        unread: new Set(stored.unread),
        starred: new Map(stored.starred.map((message) => [message.id, message])),
      };
    }
  } catch {
    // Unreadable or blocked storage starts over.
  }
  return {
    baseline: new Date().toISOString(),
    read: new Set(),
    unread: new Set(),
    starred: new Map(),
  };
}

function serialize(next: InboxLocalState, withImages: boolean) {
  const stored: StoredState = {
    baseline: next.baseline,
    read: [...next.read],
    unread: [...next.unread],
    starred: [...next.starred.values()].map((message) =>
      withImages || !message.media
        ? message
        : { ...message, media: { ...message.media, image: null } },
    ),
  };
  return JSON.stringify(stored);
}

let state = readStored();
const listeners = new Set<() => void>();

function commit(next: InboxLocalState) {
  state = next;
  try {
    localStorage.setItem(STORAGE_KEY, serialize(next, true));
  } catch {
    try {
      // Over the storage quota: keep the stars, drop their image previews.
      localStorage.setItem(STORAGE_KEY, serialize(next, false));
    } catch {
      // Still usable for this session.
    }
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInboxLocalState() {
  return useSyncExternalStore(subscribe, () => state);
}

export function isInboxMessageUnread(local: InboxLocalState, message: DesktopInboxMessage) {
  if (message.sender === "You" || local.read.has(message.id)) return false;
  return local.unread.has(message.id) || message.unread || message.receivedAt > local.baseline;
}

export function setInboxMessagesRead(ids: ReadonlyArray<string>, read: boolean) {
  const marked = new Set(read ? state.read : state.unread);
  const cleared = new Set(read ? state.unread : state.read);
  for (const id of ids) {
    marked.add(id);
    cleared.delete(id);
  }
  commit({ ...state, read: read ? marked : cleared, unread: read ? cleared : marked });
}

export function toggleInboxMessageStar(message: DesktopInboxMessage) {
  const starred = new Map(state.starred);
  if (!starred.delete(message.id)) starred.set(message.id, message);
  commit({ ...state, starred });
}
