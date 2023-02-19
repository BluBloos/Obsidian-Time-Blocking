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

    private async replaceTask(task: TaskExternal) {
        const app = taskRegistry.getApp();
        if (app) {
            const TasksPlugin = app.plugins.plugins["obsidian-tasks-plugin"];
            const TasksTask = TasksPlugin.taskFromTaskExternal(task);
            const toggledTasks = TasksTask.toggle();
            TasksPlugin.replaceTaskWithTasks(TasksTask, toggledTasks);

            // NOTE: dirty hack, we're going to wait for like 1s here before re-render because apparently we cannot wait
            // on the replace task call ...
            setTimeout(() => {
                renderTimeblocking(app);
            }, 1000);
        }
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

                // get line that was clicked.
                const { state } = this.view;
                const position = this.view.posAtDOM(target);
                const line = state.doc.lineAt(position);
                console.log("line", line);
                const regex = new RegExp(`${TASK_SYMBOL}(\\d+)`, 'u');
                const renderIdx = parseInt(line.text.match(regex)?.[1]??'-1');

                // don't navigate the link.
                event.preventDefault();

                //const renderIdx = target.innerText.replace(TASK_SYMBOL, '');
                const task = taskRegistry.getTaskFromRenderIdx(renderIdx);
                if (task) {
                    console.log('task from registry', task);
                    this.replaceTask(task);
                }

                return true;
                
            }
        } else if (target.innerText.includes(TASK_EDIT_SYMBOL) && target.classList.contains('cm-underline')) {
            const parent = target.parentElement;
            if (parent && parent.classList.contains('cm-link')) {
                console.log("Obsidian-Time-Blocking: Clicked on task edit button!");
            }
        }

        return false;

    }
}