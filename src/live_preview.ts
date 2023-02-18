import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import type { PluginValue  } from '@codemirror/view';

import TaskRegistry from './TaskRegistry';
import { TaskExternal } from './types';
const taskRegistry = TaskRegistry.getInstance();

export const newLivePreviewExtension = () => {
    return ViewPlugin.fromClass(LivePreviewExtension);
};

const TASK_SYMBOL = '🥡';

class LivePreviewExtension implements PluginValue {
    private readonly view: EditorView;

    public update(update: ViewUpdate) {
        console.log("live_preview update", update);
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

    private handleClickEvent(event: MouseEvent): boolean {

        console.log("live_preview clk event");
        const { target } = event;

        console.log(target);

        // Only CM-LINK.
        if (!target || !(target instanceof HTMLSpanElement)) {
            return false;
        }

        return false; // we do this for now as hack.

        // TODO: match a regex.
        if (target.innerText.includes(TASK_SYMBOL) && target.classList.contains('cm-underline')) {
            // get the parent.
            const parent = target.parentElement;
            if (parent && parent.classList.contains('cm-link')) {
                // get line that was clicked.
                const { state } = this.view;
                const position = this.view.posAtDOM(target);
                const line = state.doc.lineAt(position);
                // don't navigate the link.
                event.preventDefault();

                console.log("line", line);
                
                // 1. get task part of the line.
                // the task part of the line comes after the first '-'.
                // write code below:
                const taskPart = line.text.split('-')[1];

                console.log("taskPart", taskPart);

                if (taskPart && taskRegistry.getApp()) {
                    const TasksPlugin = taskRegistry.getApp().plugins.plugins["obsidian-tasks-plugin"];

                    // TODO: lol, of course this doesn't work - I'm not adding anything to the registry yet.
                    const task = taskRegistry.getTaskFromRenderedLine(taskPart);
                    if (task) {
                        console.log('task from registry', task);
                        const TasksTask = TasksPlugin.taskFromTaskExternal(task);
                        const toggledTask = new TaskExternal({
                            ...task,
                            isDone: !task.isDone
                        });
                        const TaskToggledTask = TasksPlugin.taskFromTaskExternal(toggledTask);
                        
                        TasksPlugin.replaceTaskWithTasks(TasksTask, [TaskToggledTask]);
    
    // TODO: now we want to re-render our plugin.
    
                        console.log("the button has BEEN clicked");
                        
                    }
                }

                return true;
                
            }
        }

        return false;

    }
}