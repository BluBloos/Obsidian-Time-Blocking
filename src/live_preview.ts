import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import type { PluginValue  } from '@codemirror/view';

import TaskRegistry from './TaskRegistry';
import { TaskExternal } from './types';
const taskRegistry = TaskRegistry.getInstance();

export const newLivePreviewExtension = () => {
    return ViewPlugin.fromClass(LivePreviewExtension);
};

export const TASK_SYMBOL = '🥡';

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
                console.log("line", line);
                const regex = new RegExp(`${TASK_SYMBOL}(\\d+)`, 'u');
                const renderIdx = parseInt(line.text.match(regex)?.[1]??'-1');

                // don't navigate the link.
                event.preventDefault();

                

                if (taskRegistry.getApp()) {
                    const TasksPlugin = taskRegistry.getApp().plugins.plugins["obsidian-tasks-plugin"];

                    //const renderIdx = target.innerText.replace(TASK_SYMBOL, '');
                    const task = taskRegistry.getTaskFromRenderIdx(renderIdx);
                    if (task) {
                        console.log('task from registry', task);

/*                      const TasksTask = TasksPlugin.taskFromTaskExternal(task);
                        const toggledTask = new TaskExternal({
                            ...task,
                            isDone: !task.isDone
                        });
                        const TaskToggledTask = TasksPlugin.taskFromTaskExternal(toggledTask);
                        
                        TasksPlugin.replaceTaskWithTasks(TasksTask, [TaskToggledTask]);
                        */
    
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