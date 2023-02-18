import {TaskUID, TaskExternal} from './types';

import {
    App,
  } from "obsidian";

class TaskRegistry {
  private app: App;
  private static instance: TaskRegistry;
  private tasks: Map<TaskUID, TaskExternal>;
  private renderIdxToUID: Map<number, TaskUID>;

  private constructor() {
    this.tasks = new Map();
    this.renderIdxToUID = new Map();
  }

  public reset() {
    this.tasks = new Map();
    this.renderIdxToUID = new Map();
  }

  public static getInstance(): TaskRegistry {
    if (!TaskRegistry.instance) {
      TaskRegistry.instance = new TaskRegistry();
    }
    return TaskRegistry.instance;
  }

  public addRenderIdxMapping(idx: number, uid: TaskUID): void {
    this.renderIdxToUID.set(idx, uid);
  }

  public addTask(task: TaskExternal): void {
    this.tasks.set(task.uid, task);
  }

  public getTask(uid: TaskUID): TaskExternal | undefined {
    return this.tasks.get(uid);
  }

  public getTaskFromRenderIdx(idx: number): TaskExternal | undefined {
    const uid = this.renderIdxToUID.get(idx);
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
