import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import type { PluginValue  } from '@codemirror/view';

import { renderTimeblocking } from './main';
import TaskRegistry from './TaskRegistry';
import { TaskExternal } from './types';
const taskRegistry = TaskRegistry.getInstance();

export const newLivePreviewExtension = () => {
    return ViewPlugin.fromClass(LivePreviewExtension);
};

export const TASK_SYMBOL = 'X';
export const TASK_EDIT_SYMBOL = 'E';

// TODO: seems there are some things we could do like when update decorations basically add a bunch of event listenters :)

class LivePreviewExtension implements PluginValue {
    private readonly view: EditorView;

    public update(update: ViewUpdate) {
        this.updateDecorations(update.view);
    }

    updateDecorations(view : EditorView) {
        const dom = view.dom;
        // find all HTMLSpanElements with class cm-underline.
        const cmUnderlines : HTMLSpanElement[] = dom.querySelectorAll('span.cm-underline');
        // make sure includes TASK_SYMBOL.
        for (const cmUnderline of cmUnderlines) {
            if (cmUnderline.innerText.includes(TASK_SYMBOL)) {
                cmUnderline.innerText=TASK_SYMBOL;
            }
        }
      }

    constructor(view: EditorView) {
        this.view = view;
        this.handleClickEvent = this.handleClickEvent.bind(this);
        this.view.dom.addEventListener('click', this.handleClickEvent);
        this.updateDecorations(view);
    }

    public destroy(): void {
        this.view.dom.removeEventListener('click', this.handleClickEvent);
        //this.observer.disconnect();
    }

    private async editTask(task: TaskExternal, editOp : (plugin : any, task : any) => Promise<void> ) {
        const app = taskRegistry.getApp();
        if (app) {
            const TasksPlugin = app.plugins.plugins["obsidian-tasks-plugin"];
            const TasksTask = TasksPlugin.taskFromTaskExternal(task);

            // TODO: Make tasks-plugin.replaceTaskWithTasks actually waitable. afaik it returns immediately
            // currently.
            await editOp(TasksPlugin, TasksTask);

            // NOTE: dirty hack, we're going to wait for like 1s here before re-render because apparently we cannot wait
            // on the replace task call ...
            setTimeout(() => {
                renderTimeblocking(app);
            }, 1000);
        }
    }

    private async toggleTask(task: TaskExternal) {
        this.editTask(task, async (plugin:any, task : any) => {
            const toggledTasks = task.toggle();
            plugin.replaceTaskWithTasks(task, toggledTasks);
        });
    }

    private getTaskFromTarget(target:any) : any {
        // get line that was clicked.
        const { state } = this.view;
        const position = this.view.posAtDOM(target);
        const line = state.doc.lineAt(position);
        console.log("line", line);
        const regex = new RegExp(`${TASK_SYMBOL}(\\d+)`, 'u'); // TODO:make more robust. what if task desc contains this?
        const renderIdx = parseInt(line.text.match(regex)?.[1]??'-1');
        return {
            task:taskRegistry.getTaskFromRenderIdx(renderIdx),
            block:taskRegistry.getBlockFromRenderIdx(renderIdx),
        };
    }

    private handleClickEvent(event: MouseEvent): boolean {

        console.log("live_preview clk event");
        const { target } = event;

        console.log(target);

        // Only CM-LINK.
        if (!target || !(target instanceof HTMLSpanElement)) {
            return false;
        }

        // TODO: match a regex.
        if (target.innerText.includes(TASK_SYMBOL) && target.classList.contains('cm-underline')) {
            // get the parent.
            const parent = target.parentElement;
            if (parent && parent.classList.contains('cm-link')) {
                console.log("Obsidian-Time-Blocking: Clicked on task complete button!");
                // don't navigate the link.
                event.preventDefault();
                const taskFromTarget = this.getTaskFromTarget(target);
                const task = taskFromTarget.task;
                if (task) {
                    this.toggleTask(task);
                }
                return true;              
            }
        } else if (target.innerText.includes(TASK_EDIT_SYMBOL) && target.classList.contains('cm-underline')) {
            const parent = target.parentElement;
            if (parent && parent.classList.contains('cm-link')) {
                console.log("Obsidian-Time-Blocking: Clicked on task edit button!");
                // don't navigate the link.
                event.preventDefault();
                const taskFromTarget = this.getTaskFromTarget(target);
                const task = taskFromTarget.task;
                if (task) {
                    this.editTask(task, (plugin:any, Task : any) : Promise<void> => {
                        return plugin.editTaskWithModal(Task);
                    });
                }
                return true;
            }
        }

        return false;

    }
}