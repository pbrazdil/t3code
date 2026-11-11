import type { DesktopInboxCalendar, DesktopInboxCalendarInput } from "@t3tools/contracts";
import { useSyncExternalStore } from "react";

const TICK_MS = 60_000;
const REFRESH_MS = 5 * 60_000;

// Matches INBOX_DEV_PATH in vite/inboxDev.ts; a browser has no desktop bridge.
async function loadDevCalendar(input: DesktopInboxCalendarInput) {
  const response = await fetch("/__garden/inbox/calendar", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`Inbox dev server: ${response.status}`);
  return (await response.json()) as DesktopInboxCalendar;
}

const loadCalendar = window.desktopBridge
  ? window.desktopBridge.inbox.loadCalendar
  : import.meta.env.DEV
    ? loadDevCalendar
    : null;

interface CalendarState {
  /** Today's events, or null until the first answer. */
  readonly calendar: DesktopInboxCalendar | null;
  /** Epoch ms of the last tick, so a view can tell past events from coming ones. */
  readonly now: number;
}

let state: CalendarState = { calendar: null, now: Date.now() };
let loadedAt = 0;
let loadedDay = "";
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function publish(next: CalendarState) {
  state = next;
  for (const listener of listeners) listener();
}

function tick() {
  const now = new Date();
  publish({ ...state, now: now.getTime() });
  if (document.hidden || !loadCalendar) return;
  const day = now.toDateString();
  if (day === loadedDay && now.getTime() - loadedAt < REFRESH_MS) return;
  loadedAt = now.getTime();
  loadedDay = day;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  loadCalendar({ start: start.toISOString(), end: end.toISOString() }).then(
    (calendar) => publish({ ...state, calendar }),
    (error: unknown) =>
      publish({
        ...state,
        calendar: {
          configured: true,
          events: state.calendar?.events ?? [],
          error: error instanceof Error ? error.message : String(error),
        },
      }),
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === null) {
    tick();
    timer = setInterval(tick, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Today's calendar, refreshed while something shows it. */
export function useInboxCalendar() {
  return useSyncExternalStore(subscribe, () => state);
}
