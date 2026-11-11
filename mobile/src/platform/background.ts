// The background task: when the system lets it run (Android WorkManager, iOS BGTaskScheduler — at
// most every 15 minutes, often much later, never guaranteed), it records scheduled payments that
// came due and refreshes the reminders, exactly as opening the application would. The database's
// unique occurrence index makes a second posting impossible whoever runs first.
// This module is imported by the entry point, so the task is defined before anything else runs.
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { appStore } from "./app-store.ts";
import { rebuildReminders } from "./notifications.ts";

export const POST_DUE_TASK = "monivra-post-due";

TaskManager.defineTask(POST_DUE_TASK, async () => {
  try {
    const store = appStore();
    store.postDueNow();
    const state = store.getState();
    if (state.status === "ready") await rebuildReminders(state.data, store.env.clock.today(), store.env.clock.time());
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.warn("background posting failed", error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundPosting(): Promise<boolean> {
  try {
    if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available) return false;
    if (!(await TaskManager.isTaskRegisteredAsync(POST_DUE_TASK))) await BackgroundTask.registerTaskAsync(POST_DUE_TASK, { minimumInterval: 60 });
    return true;
  } catch (error) {
    console.warn("background task not registered", error);
    return false;
  }
}
