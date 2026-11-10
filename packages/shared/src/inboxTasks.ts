// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import {
  DesktopInboxTaskSchema,
  type DesktopInboxTask,
  type DesktopInboxTasksSaveInput,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const decodeTasks = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Array(DesktopInboxTaskSchema)),
);

// The environment id names the file, so it must not be able to leave the directory.
const ENVIRONMENT_ID = /^[A-Za-z0-9_-]+$/;

/** Tasks of every environment stored in `tasksDir`, one JSON file per environment. */
export async function loadInboxTasks(tasksDir: string): Promise<ReadonlyArray<DesktopInboxTask>> {
  const names = await NodeFSP.readdir(tasksDir).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  });
  const files = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(async (name) =>
        decodeTasks(await NodeFSP.readFile(NodePath.join(tasksDir, name), "utf8")),
      ),
  );
  return files.flat();
}

/** Replaces the stored tasks of one environment. */
export async function saveInboxTasks(
  tasksDir: string,
  { environmentId, tasks }: DesktopInboxTasksSaveInput,
): Promise<void> {
  if (!ENVIRONMENT_ID.test(environmentId)) {
    throw new Error(`Invalid environment id: ${environmentId}`);
  }
  await NodeFSP.mkdir(tasksDir, { recursive: true, mode: 0o700 });
  const file = NodePath.join(tasksDir, `${environmentId}.json`);
  // Written beside and renamed, so a crash never leaves half a file.
  const draft = `${file}.${process.pid}.tmp`;
  await NodeFSP.writeFile(draft, JSON.stringify(tasks, null, 2), { mode: 0o600 });
  await NodeFSP.rename(draft, file);
}
