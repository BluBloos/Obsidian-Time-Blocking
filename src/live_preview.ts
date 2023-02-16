import { EditorView, ViewPlugin } from '@codemirror/view';
import type { PluginValue } from '@codemirror/view';

//import { Notice } from 'obsidian';

//import { Task } from './Task';

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
                console.log("line",line);


                // don't navigate the link.
                event.preventDefault();

                // Creates a CodeMirror transaction in order to update the document.
        /*        const transaction = state.update({
                    changes: {
                        from: line.from,
                        to: line.to,
                        insert: toggledString,
                    },
                });
                this.view.dispatch(transaction);*/
                console.log("the button has BEEN clicked");
                return true;
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