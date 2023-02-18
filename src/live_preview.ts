import { EditorView, ViewPlugin } from '@codemirror/view';
import type { PluginValue } from '@codemirror/view';

import TaskRegistry from './TaskRegistry';
import { TaskExternal } from './types';
const taskRegistry = TaskRegistry.getInstance();

export const newLivePreviewExtension = () => {
    return ViewPlugin.fromClass(LivePreviewExtension);
};

const TASK_SYMBOL = '🥡';

class LivePreviewExtension implements PluginValue {
    private readonly view: EditorView;
    //private readonly observer: MutationObserver;
    constructor(view: EditorView) {

        /*this.view.requestMeasure({
            read: (view: EditorView) : HTMLSpanElement[] => {
                const dom = view.dom;
                // find all HTMLSpanElements with class cm-underline.
                const cmUnderlines : HTMLSpanElement[] = dom.querySelectorAll('span.cm-underline');
                // make sure includes TASK_SYMBOL.
                const cmUnderlinesWithTaskSymbol = Array.from(cmUnderlines).filter((cmUnderline : HTMLSpanElement) => {
                    return cmUnderline.innerText.includes(TASK_SYMBOL);
                });
                return cmUnderlinesWithTaskSymbol;
            },
            write: (measure: HTMLSpanElement[], view: EditorView) => {
                console.log("measure", measure);
            },
            key: 'obsidian-tasks-plugin'
        });*/

        this.view = view;
        this.handleClickEvent = this.handleClickEvent.bind(this);
        this.view.dom.addEventListener('click', this.handleClickEvent);
/*
        // listen for DOM changes.
        // we want to silently remove the render of the UID :)
        const targetNode = this.view.dom;
        const config = { characterData:true, subtree: true };
        const callback = (mutationList : any, observer : MutationObserver) => {
            console.log("live_preview mutationList", mutationList);
            // TODO: check if any of the links changed. if they did, need to re-render.
          };
        this.observer = new MutationObserver(callback);
        this.observer.observe(targetNode, config);*/
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