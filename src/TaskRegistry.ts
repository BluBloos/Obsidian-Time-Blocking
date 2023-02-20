import {TaskUID, TaskExternal} from './types';
import { ScheduleBlock } from './main';

import {
    App,
  } from "obsidian";

export class TaskRenderIdxEntry {
  public uid: TaskUID;
  public block: ScheduleBlock;
  constructor(uid: TaskUID, block: ScheduleBlock) {
    this.uid = uid;
    this.block = block;
  }
}

class TaskRegistry {
  private app: App;
  private static instance: TaskRegistry;
  private tasks: Map<TaskUID, TaskExternal>;
  private renderIdxMap: Map<number, TaskRenderIdxEntry>;

  private constructor() {
    this.tasks = new Map();
    this.renderIdxMap = new Map();
  }

  public reset() {
    this.tasks = new Map();
    this.renderIdxMap = new Map();
  }

  public static getInstance(): TaskRegistry {
    if (!TaskRegistry.instance) {
      TaskRegistry.instance = new TaskRegistry();
    }
    return TaskRegistry.instance;
  }

  public addRenderIdxMapping(idx: number, uid: TaskUID, block:ScheduleBlock): void {
    this.renderIdxMap.set(idx, new TaskRenderIdxEntry(uid, block));
  }

  public addTask(task: TaskExternal): void {
    this.tasks.set(task.uid, task);
  }

  public getTask(uid: TaskUID): TaskExternal | undefined {
    return this.tasks.get(uid);
  }

  public getBlockFromRenderIdx(idx: number): ScheduleBlock | undefined {
    const uid = this.renderIdxMap.get(idx).uid;
    if (uid) {
      return this.renderIdxMap.get(idx).block;
    }
    return undefined;
  }

  public getTaskFromRenderIdx(idx: number): TaskExternal | undefined {
    const uid = this.renderIdxMap.get(idx).uid;
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
