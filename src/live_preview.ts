import { EditorView, ViewPlugin } from '@codemirror/view';
import type { PluginValue } from '@codemirror/view';

import TaskRegistry from './TaskRegistry';
import { TaskExternal } from './types';
const taskRegistry = TaskRegistry.getInstance();

export const newLivePreviewExtension = () => {
    return ViewPlugin.fromClass(LivePreviewExtension);
};

class LivePreviewExtension implements PluginValue {
    private readonly view: EditorView;
    constructor(view: EditorView) {
        this.view = view;
        this.handleClickEvent = this.handleClickEvent.bind(this);
        this.view.dom.addEventListener('click', this.handleClickEvent);
    }
    public destroy(): void {
        this.view.dom.removeEventListener('click', this.handleClickEvent);
    }
    private handleClickEvent(event: MouseEvent): boolean {
console.log("live_preview clk event");
        const { target } = event;

        console.log(target);

        // Only CM-LINK.
        if (!target || !(target instanceof HTMLSpanElement)) {
            return false;
        }

        if (target.innerText === '🥡' && target.classList.contains('cm-underline')) {
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





                // 2. figure out what TaskExternal it is.
                // maybe we want to begin rendering the original markdown so as to make comparison easy.
                //
                // either way, we'll likely need some sort of a 'TaskRegistry'.
                // this is a hash table using the UID structure as key.
                // it is importable into this file.
                // the store is update from main.ts
                // everyone else is readonly.
                // so no need for mutex or anything like that.

                

                // Creates a CodeMirror transaction in order to update the document.
        /*        const transaction = state.update({
                    changes: {
                        from: line.from,
                        to: line.to,
                        insert: toggledString,
                    },
                });
                this.view.dispatch(transaction);*/
                
            }
        }

        return false;


// TODO:
        /* Right now Obsidian API does not give us a way to handle checkbox clicks inside rendered-widgets-in-LP such as
         * callouts, tables, and transclusions because `this.view.posAtDOM` will return the beginning of the widget
         * as the position for any click inside the widget.
         * For callouts, this means that the task will never be found, since the `lineAt` will be the beginning of the callout.
         * Therefore, produce an error message pop-up using Obsidian's "Notice" feature, log a console warning, then return.
         */

        // Tasks from "task" query codeblocks handle themselves thanks to `toLi`, so be specific about error messaging, but still return.
     /*   const ancestor = target.closest('ul.plugin-tasks-query-result, div.callout-content');
        if (ancestor) {
            if (ancestor.matches('div.callout-content')) {
                // Error message for now.
                const msg =
                    'obsidian-tasks-plugin warning: Tasks cannot add or remove completion dates or make the next copy of a recurring task for tasks written inside a callout when you click their checkboxes in Live Preview. \n' +
                    'If you wanted Tasks to do these things, please undo your change, then either click the line of the task and use the "Toggle Task Done" command, or switch to Reading View to click the checkbox.';
                console.warn(msg);
                new Notice(msg, 45000);
            }
            return false;
        }*/
    }
}