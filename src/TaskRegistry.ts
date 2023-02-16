import {TaskUID, TaskExternal} from './types';

import {
    App,
  } from "obsidian";

class TaskRegistry {
  private app: App;
  private static instance: TaskRegistry;
  private tasks: Map<TaskUID, TaskExternal>;
  private sourceLineToUidMap: Map<string, TaskUID>;

  private constructor() {
    this.tasks = new Map();
    this.sourceLineToUidMap = new Map();
  }

  public reset() {
    this.tasks = new Map();
    this.sourceLineToUidMap = new Map();
  }

  public static getInstance(): TaskRegistry {
    if (!TaskRegistry.instance) {
      TaskRegistry.instance = new TaskRegistry();
    }
    return TaskRegistry.instance;
  }

  public addMapping(line: string, uid: TaskUID): void {
    this.sourceLineToUidMap.set(line, uid);
  }

  public addTask(task: TaskExternal): void {
    this.tasks.set(task.uid, task);
  }

  public getTask(uid: TaskUID): TaskExternal | undefined {
    return this.tasks.get(uid);
  }

  public getTaskFromRenderedLine(line: string): TaskExternal | undefined {
    const uid = this.sourceLineToUidMap.get(line);
    if (uid) {
      return this.getTask(uid);
    }
    return undefined;
  }

  public addApp(app : App) {
    this.app = app;
  }

  public getApp() {
    return this.app;
  }

}

export default TaskRegistry;
