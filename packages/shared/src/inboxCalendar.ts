// @effect-diagnostics nodeBuiltinImport:off globalFetch:off globalDate:off - Plain promises, shared with the Vite dev server.
import * as NodeFSP from "node:fs/promises";

import type {
  DesktopInboxCalendar,
  DesktopInboxCalendarEvent,
  DesktopInboxCalendarInput,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import ICAL from "ical.js";

const FETCH_TIMEOUT_MS = 20_000;
// A calendar feed is large and changes rarely.
const FEED_TTL_MS = 5 * 60_000;

/** `url` is a calendar's iCal address; a secret one grants reading it, so the file stays private. */
const CalendarConfig = Schema.Struct({ url: Schema.String });
const decodeConfig = Schema.decodeUnknownSync(Schema.fromJsonString(CalendarConfig));

let feed: { url: string; loadedAt: number; events: ReadonlyArray<ICAL.Event> } | null = null;

function parseFeed(text: string) {
  const calendar = new ICAL.Component(ICAL.parse(text));
  for (const zone of calendar.getAllSubcomponents("vtimezone")) {
    ICAL.TimezoneService.register(zone);
  }
  const masters = new Map<string, ICAL.Component>();
  const exceptions = new Map<string, Array<ICAL.Component>>();
  for (const component of calendar.getAllSubcomponents("vevent")) {
    const uid = String(component.getFirstPropertyValue("uid") ?? "");
    if (component.hasProperty("recurrence-id")) {
      const list = exceptions.get(uid);
      if (list) list.push(component);
      else exceptions.set(uid, [component]);
    } else {
      masters.set(uid, component);
    }
  }
  const events: Array<ICAL.Event> = [];
  for (const [uid, master] of masters) {
    events.push(new ICAL.Event(master, { exceptions: exceptions.get(uid) ?? [] }));
  }
  // A changed occurrence whose series is not in the feed still happens.
  for (const [uid, list] of exceptions) {
    if (!masters.has(uid)) for (const component of list) events.push(new ICAL.Event(component));
  }
  return events;
}

async function loadFeed(url: string, now: number) {
  if (feed && feed.url === url && now - feed.loadedAt < FEED_TTL_MS) return feed.events;
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Calendar answered ${response.status}`);
  const events = parseFeed(await response.text());
  feed = { url, loadedAt: now, events };
  return events;
}

function occurrence(
  event: ICAL.Event,
  item: ICAL.Event,
  start: ICAL.Time,
  end: ICAL.Time,
  range: { start: number; end: number },
): DesktopInboxCalendarEvent | null {
  if (String(item.component.getFirstPropertyValue("status") ?? "") === "CANCELLED") return null;
  const startsAt = start.toJSDate().getTime();
  const endsAt = Math.max(end.toJSDate().getTime(), startsAt);
  // A moment without a duration belongs to the day it falls on.
  const overlaps =
    endsAt === startsAt
      ? startsAt >= range.start && startsAt < range.end
      : startsAt < range.end && endsAt > range.start;
  if (!overlaps) return null;
  return {
    id: `${event.uid}:${startsAt}`,
    title: item.summary || "(No title)",
    start: new Date(startsAt).toISOString(),
    end: new Date(endsAt).toISOString(),
    allDay: start.isDate,
    location: item.location || null,
  };
}

function eventsBetween(events: ReadonlyArray<ICAL.Event>, range: { start: number; end: number }) {
  const found: Array<DesktopInboxCalendarEvent> = [];
  for (const event of events) {
    if (!event.isRecurring()) {
      const single = occurrence(event, event, event.startDate, event.endDate, range);
      if (single) found.push(single);
      continue;
    }
    const iterator = event.iterator();
    for (let next = iterator.next(); next; next = iterator.next()) {
      if (next.toJSDate().getTime() >= range.end) break;
      const details = event.getOccurrenceDetails(next);
      const repeated = occurrence(event, details.item, details.startDate, details.endDate, range);
      if (repeated) found.push(repeated);
    }
  }
  return found.sort(
    (a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start),
  );
}

/**
 * Events of the calendar configured in `configPath` that touch the time between `start` and
 * `end`, all-day ones first. Without a config file no calendar is configured.
 */
export async function loadInboxCalendar(
  configPath: string,
  input: DesktopInboxCalendarInput,
): Promise<DesktopInboxCalendar> {
  const text = await NodeFSP.readFile(configPath, "utf8").catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  });
  if (text === null) return { configured: false, events: [], error: null };
  try {
    const events = await loadFeed(decodeConfig(text).url, Date.now());
    const range = { start: Date.parse(input.start), end: Date.parse(input.end) };
    return { configured: true, events: eventsBetween(events, range), error: null };
  } catch (error) {
    // The address is a secret; an error naming it must not reach the page.
    const message = error instanceof Error ? error.name : "Error";
    return { configured: true, events: [], error: `Calendar could not be read (${message})` };
  }
}
