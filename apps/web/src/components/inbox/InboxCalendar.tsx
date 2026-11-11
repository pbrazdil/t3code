import type { DesktopInboxCalendarEvent } from "@t3tools/contracts";

import { cn } from "~/lib/utils";
import { useInboxCalendar } from "./inboxCalendarStore";

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const DAY_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function timeLabel(event: DesktopInboxCalendarEvent) {
  if (event.allDay) return "All day";
  const start = TIME_FORMAT.format(new Date(event.start));
  return event.end === event.start
    ? start
    : `${start} – ${TIME_FORMAT.format(new Date(event.end))}`;
}

/** Today's events of the configured calendar; nothing without one. */
export function InboxCalendarWidget() {
  const { calendar, now } = useInboxCalendar();
  if (!calendar?.configured) return null;
  return (
    <section
      aria-label="Calendar"
      className="flex flex-col gap-2 rounded-xl border bg-card px-3 py-3 shadow-xs"
    >
      <h2 className="m-0 flex items-baseline justify-between gap-2 px-1 text-sm font-semibold">
        Today
        <span className="text-xs font-normal text-muted-foreground">{DAY_FORMAT.format(now)}</span>
      </h2>
      {calendar.events.length === 0 && !calendar.error ? (
        <p className="m-0 px-1 text-xs text-muted-foreground">No events today</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {calendar.events.map((event) => {
            const past = !event.allDay && Date.parse(event.end) <= now;
            const current =
              !event.allDay && Date.parse(event.start) <= now && Date.parse(event.end) > now;
            return (
              <li
                key={event.id}
                className={cn(
                  "flex items-baseline gap-3 rounded-md px-1 py-0.5 text-sm",
                  past && "text-muted-foreground",
                  current && "bg-accent font-medium",
                )}
              >
                <span className="w-24 shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                  {timeLabel(event)}
                </span>
                <span className="min-w-0 flex-1">
                  {event.title}
                  {event.location ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {event.location}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {calendar.error ? (
        <p className="m-0 px-1 text-xs text-destructive-foreground">{calendar.error}</p>
      ) : null}
    </section>
  );
}
