import type {
  DesktopInboxChannel,
  DesktopInboxMessage,
  DesktopInboxTask,
  DesktopInboxTaskStatus,
} from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { CircleCheckIcon, CircleDotIcon, CircleIcon, ListPlusIcon, XIcon } from "lucide-react";
import { useState, type CSSProperties, type FormEvent } from "react";

import { cn } from "~/lib/utils";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import {
  Menu,
  MenuCheckboxItem,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import {
  createInboxTask,
  deleteInboxTask,
  toggleInboxTaskMessage,
  updateInboxTask,
  useInboxTasks,
} from "./inboxTaskStore";

const TITLE_LENGTH = 80;

const NEXT_STATUS: Record<DesktopInboxTaskStatus, DesktopInboxTaskStatus> = {
  todo: "in-progress",
  "in-progress": "done",
  done: "todo",
};

const STATUS_LABEL: Record<DesktopInboxTaskStatus, string> = {
  todo: "To do",
  "in-progress": "In progress",
  done: "Done",
};

const GITHUB_PULL_REQUEST = /github\.com\/[^/]+\/([^/]+)\/pull\/(\d+)/;

function pullRequestLabel(url: string) {
  const found = GITHUB_PULL_REQUEST.exec(url);
  return found ? `${found[1]}#${found[2]}` : url.replace(/^https?:\/\//, "");
}

/** Reads the form's only text field and clears it. */
function takeField(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const value = String(new FormData(event.currentTarget).get("value") ?? "").trim();
  event.currentTarget.reset();
  return value;
}

function StatusIcon({ status }: { status: DesktopInboxTaskStatus }) {
  if (status === "done") return <CircleCheckIcon aria-hidden className="text-success" />;
  if (status === "in-progress") return <CircleDotIcon aria-hidden className="text-warning" />;
  return <CircleIcon aria-hidden />;
}

const WHEN_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function PullRequestLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-w-0 items-center gap-1 hover:underline"
    >
      <PullRequestGlyph.pullRequest aria-hidden className="size-3 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate">{pullRequestLabel(url)}</span>
    </a>
  );
}

function TaskDialog({ task, onClose }: { task: DesktopInboxTask; onClose: () => void }) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Task</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <div className="flex flex-col gap-5">
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const title = String(new FormData(event.currentTarget).get("value") ?? "").trim();
                if (title) updateInboxTask({ ...task, title });
              }}
              onBlur={(event) => {
                const title = String(new FormData(event.currentTarget).get("value") ?? "").trim();
                if (title && title !== task.title) updateInboxTask({ ...task, title });
              }}
            >
              <Input name="value" aria-label="Task title" defaultValue={task.title} />
              <ToggleGroup
                aria-label="Status"
                value={[task.status]}
                onValueChange={(next) => {
                  const status = next[0] as DesktopInboxTaskStatus | undefined;
                  if (status) updateInboxTask({ ...task, status });
                }}
              >
                <Toggle value="todo">{STATUS_LABEL.todo}</Toggle>
                <Toggle value="in-progress">{STATUS_LABEL["in-progress"]}</Toggle>
                <Toggle value="done">{STATUS_LABEL.done}</Toggle>
              </ToggleGroup>
            </form>
            <section className="flex flex-col gap-2">
              <h3 className="m-0 text-xs font-medium text-muted-foreground">Pull requests</h3>
              {task.pullRequests.map((url) => (
                <div key={url} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <PullRequestLink url={url} />
                  </span>
                  <Button
                    variant="ghost-muted"
                    size="icon-xs"
                    aria-label={`Remove ${pullRequestLabel(url)}`}
                    onClick={() =>
                      updateInboxTask({
                        ...task,
                        pullRequests: task.pullRequests.filter((existing) => existing !== url),
                      })
                    }
                  >
                    <XIcon aria-hidden />
                  </Button>
                </div>
              ))}
              <form
                onSubmit={(event) => {
                  const url = takeField(event);
                  if (/^https?:\/\//.test(url) && !task.pullRequests.includes(url)) {
                    updateInboxTask({ ...task, pullRequests: [...task.pullRequests, url] });
                  }
                }}
              >
                <Input
                  name="value"
                  size="sm"
                  aria-label="Pull request link"
                  placeholder="Paste a PR link and press Enter"
                />
              </form>
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="m-0 text-xs font-medium text-muted-foreground">Messages</h3>
              {task.messages.length === 0 ? (
                <p className="m-0 text-sm text-muted-foreground">
                  Link messages from the Inbox with the button next to their star.
                </p>
              ) : null}
              {task.messages.map((message) => (
                <div
                  key={message.id}
                  className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="min-w-0 truncate font-medium text-foreground">
                        {message.sender ?? "Unknown"}
                      </span>
                      {message.conversationId === null ? (
                        <span className="min-w-0 truncate">{message.conversation}</span>
                      ) : (
                        <Link
                          to="/inbox"
                          search={{
                            channel: task.environmentId,
                            chat: message.conversationId,
                            filter: "all",
                          }}
                          onClick={onClose}
                          className="min-w-0 truncate hover:underline"
                        >
                          {message.conversation ?? "Open chat"}
                        </Link>
                      )}
                      <time dateTime={message.receivedAt} className="shrink-0 tabular-nums">
                        {WHEN_FORMAT.format(new Date(message.receivedAt))}
                      </time>
                    </div>
                    <p className="m-0 text-sm wrap-anywhere whitespace-pre-wrap">{message.text}</p>
                  </div>
                  <Button
                    variant="ghost-muted"
                    size="icon-xs"
                    aria-label="Unlink message"
                    onClick={() =>
                      updateInboxTask({
                        ...task,
                        messages: task.messages.filter((existing) => existing.id !== message.id),
                      })
                    }
                  >
                    <XIcon aria-hidden />
                  </Button>
                </div>
              ))}
            </section>
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button
            variant="destructive-outline"
            onClick={() => {
              onClose();
              deleteInboxTask(task);
            }}
          >
            Delete task
          </Button>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function TaskRow({ task }: { task: DesktopInboxTask }) {
  const [open, setOpen] = useState(false);
  const done = task.status === "done";
  return (
    <li className="flex items-start gap-1.5 border-t py-2 first:border-t-0">
      <Button
        variant="ghost-muted"
        size="icon-xs"
        aria-label={`${STATUS_LABEL[task.status]}: change status of ${task.title}`}
        onClick={() => updateInboxTask({ ...task, status: NEXT_STATUS[task.status] })}
      >
        <StatusIcon status={task.status} />
      </Button>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
        <div className="flex items-baseline gap-2">
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
            className={cn(
              "min-w-0 flex-1 cursor-pointer rounded-sm text-left text-sm font-medium wrap-anywhere outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              done && "text-muted-foreground line-through",
            )}
          >
            {task.title}
          </button>
          <span className="shrink-0 text-xs text-muted-foreground">
            {STATUS_LABEL[task.status]}
          </span>
        </div>
        {done ? null : (
          <>
            {task.pullRequests.length > 0 ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {task.pullRequests.map((url) => (
                  <PullRequestLink key={url} url={url} />
                ))}
              </div>
            ) : null}
            {task.messages.map((message) => (
              <p
                key={message.id}
                className="m-0 line-clamp-2 border-l-2 pl-2 text-xs text-muted-foreground wrap-anywhere"
              >
                <span className="font-medium text-foreground">{message.sender ?? "Unknown"}</span>
                {message.conversation && message.conversation !== message.sender
                  ? ` in ${message.conversation}`
                  : ""}
                {": "}
                {message.text}
              </p>
            ))}
          </>
        )}
      </div>
      {open ? <TaskDialog task={task} onClose={() => setOpen(false)} /> : null}
    </li>
  );
}

const STATUS_ORDER: Record<DesktopInboxTaskStatus, number> = {
  "in-progress": 0,
  todo: 1,
  done: 2,
};

/** Tasks of the shown environments, each environment with its own list. */
export function InboxTasksWidget({
  channels,
  environment,
}: {
  channels: ReadonlyArray<DesktopInboxChannel>;
  environment: string | null;
}) {
  const { tasks, error } = useInboxTasks();
  const shown = channels.filter((channel) => environment === null || channel.id === environment);
  return (
    <section
      aria-label="Tasks"
      className="flex flex-col gap-3 rounded-xl border bg-card px-3 py-3 shadow-xs"
    >
      <h2 className="m-0 px-1 text-sm font-semibold">Tasks</h2>
      {shown.map((channel) => (
        <div
          key={channel.id}
          className="flex flex-col gap-1.5"
          style={{ "--label": channel.color } as CSSProperties}
        >
          {shown.length > 1 ? (
            <h3 className="m-0 flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
              <span aria-hidden className="size-2 rounded-full bg-(--label)" />
              {channel.label}
            </h3>
          ) : null}
          <ul className="m-0 flex list-none flex-col p-0">
            {tasks
              .filter((task) => task.environmentId === channel.id)
              .toSorted(
                (a, b) =>
                  STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
                  a.createdAt.localeCompare(b.createdAt),
              )
              .map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
          </ul>
          <form
            onSubmit={(event) => {
              const title = takeField(event);
              if (title) createInboxTask(channel.id, title);
            }}
          >
            <Input
              name="value"
              size="compact"
              aria-label={`New task in ${channel.label}`}
              placeholder="New task…"
            />
          </form>
        </div>
      ))}
      {error ? <p className="m-0 px-1 text-xs text-destructive-foreground">{error}</p> : null}
    </section>
  );
}

function titleOf(message: DesktopInboxMessage) {
  const line = message.text.trim().split("\n")[0] ?? "";
  return line.slice(0, TITLE_LENGTH) || message.media?.label || "Task";
}

/** Links a message to tasks of its environment, or starts a task from it. */
export function MessageTaskMenu({
  message,
  tasks,
}: {
  message: DesktopInboxMessage;
  /** Tasks of the message's environment. */
  tasks: ReadonlyArray<DesktopInboxTask>;
}) {
  const isLinked = (task: DesktopInboxTask) =>
    task.messages.some((linked) => linked.id === message.id);
  const offered = tasks.filter((task) => task.status !== "done" || isLinked(task));
  const linked = tasks.some(isLinked);
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            variant="ghost-muted"
            size="icon-xs"
            aria-label={linked ? "Linked to a task" : "Add to a task"}
            data-linked={linked || undefined}
          />
        }
      >
        <ListPlusIcon aria-hidden className={cn(linked && "text-primary")} />
      </MenuTrigger>
      <MenuPopup align="start">
        {offered.map((task) => (
          <MenuCheckboxItem
            key={task.id}
            checked={isLinked(task)}
            onCheckedChange={() => toggleInboxTaskMessage(task, message)}
          >
            {task.title}
          </MenuCheckboxItem>
        ))}
        {offered.length > 0 ? <MenuSeparator /> : null}
        <MenuItem onClick={() => createInboxTask(message.channelId, titleOf(message), message)}>
          New task from message
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
