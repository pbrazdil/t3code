import type { DesktopInboxMessage, DesktopInboxTask } from "@t3tools/contracts";
import { useSyncExternalStore } from "react";

import { randomUUID } from "~/lib/utils";

type TaskMessage = DesktopInboxTask["messages"][number];

// Matches INBOX_DEV_PATH in vite/inboxDev.ts; a browser has no desktop bridge.
async function devRequest(path: string, body: unknown) {
  const response = await fetch(`/__garden/inbox${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Inbox dev server: ${response.status}`);
  return (await response.json()) as unknown;
}

const store = window.desktopBridge
  ? window.desktopBridge.inbox
  : import.meta.env.DEV
    ? {
        loadTasks: () => devRequest("/tasks", null) as Promise<ReadonlyArray<DesktopInboxTask>>,
        saveTasks: (input: unknown) => devRequest("/tasks/save", input),
      }
    : null;

interface TasksState {
  readonly tasks: ReadonlyArray<DesktopInboxTask>;
  /** Why the tasks could not be read or the last change not stored. */
  readonly error: string | null;
}

let state: TasksState = { tasks: [], error: null };
let loaded = false;
const listeners = new Set<() => void>();

function publish(next: TasksState) {
  state = next;
  for (const listener of listeners) listener();
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!loaded) {
    loaded = true;
    store?.loadTasks().then(
      (tasks) => publish({ tasks, error: null }),
      (error: unknown) => publish({ ...state, error: messageOf(error) }),
    );
  }
  return () => listeners.delete(listener);
}

export function useInboxTasks() {
  return useSyncExternalStore(subscribe, () => state);
}

function commit(environmentId: string, tasks: ReadonlyArray<DesktopInboxTask>) {
  publish({ tasks, error: null });
  store
    ?.saveTasks({
      environmentId,
      tasks: tasks.filter((task) => task.environmentId === environmentId),
    })
    .catch((error: unknown) => publish({ ...state, error: messageOf(error) }));
}

function linkedMessage(message: DesktopInboxMessage): TaskMessage {
  return {
    id: message.id,
    conversationId: message.conversationId,
    conversation: message.conversation,
    sender: message.sender,
    text: message.text || (message.media?.label ?? ""),
    receivedAt: message.receivedAt,
  };
}

export function createInboxTask(
  environmentId: string,
  title: string,
  message?: DesktopInboxMessage,
) {
  const task: DesktopInboxTask = {
    id: randomUUID(),
    environmentId,
    title,
    status: "todo",
    pullRequests: [],
    messages: message ? [linkedMessage(message)] : [],
    createdAt: new Date().toISOString(),
  };
  commit(environmentId, [...state.tasks, task]);
}

export function updateInboxTask(task: DesktopInboxTask) {
  commit(
    task.environmentId,
    state.tasks.map((existing) => (existing.id === task.id ? task : existing)),
  );
}

export function deleteInboxTask(task: DesktopInboxTask) {
  commit(
    task.environmentId,
    state.tasks.filter((existing) => existing.id !== task.id),
  );
}

/** Links the message to the task, or unlinks it when it already is. */
export function toggleInboxTaskMessage(task: DesktopInboxTask, message: DesktopInboxMessage) {
  const linked = task.messages.some((existing) => existing.id === message.id);
  updateInboxTask({
    ...task,
    messages: linked
      ? task.messages.filter((existing) => existing.id !== message.id)
      : [...task.messages, linkedMessage(message)],
  });
}
