import type { Moment } from 'moment/moment';
import moment from "moment";

// TODO: We need to add to the tasks plugin another piece of metadata for estimated time to complete.
// This will be part of our priv extension.

const LOCK_SYMBOL: string = "🔒";

class TaskExternal {
  public readonly isDone: Boolean;
  public readonly priority: number; // 1 is the highest priority, any larger number is a lower priority.
  public readonly tags: string[]; // a list of ASCII tags, distilled from the description.
  public readonly originalMarkdown: string; // the original markdown task.
  public readonly startDate: Moment | null;
  public readonly scheduledDate: Moment | null;
  public readonly dueDate: Moment | null;
  public readonly doneDate: Moment | null;
  // TODO: recurring tasks should get sheduled in the calendar as such.
}

// TODO: Offer more variability in scheduling window size.
// so, we want more than just scheduleBegin and scheduleEnd.
// TODO: Add parsing of scheduler object params from the .md
const tasksFilter =
  "not done\
happens before {{2023-02-04}}";
const padding = 15;
const scheduleBegin = 60 * 8; // You may schedule after 8 AM. basic arithmetic is supported.
const scheduleEnd = 60 * 20; // Not past 8 PM
const viewBegin = "2023-02-04"; // begin is inclusive
const viewEnd = "2023-02-5"; // the end is exclusive.
const maxBlockSize = 60; // the unit for these three is always minutes.
const minBlockSize = 15;
const blockStepSize = 5; // I always want blocks to be divisible by 5 mins.
const priorityAlgo = (task: TaskExternal) => {
  if (task.dueDate) {
    const timeUntilDue = task.dueDate.diff(moment(), "hours");
    if (timeUntilDue <= 24) return 1;
    if (timeUntilDue <= 48) return 2;
  }
  if (task.tags.includes("#P1")) return 1;
  if (task.tags.includes("#P2")) return 2;
  if (task.tags.includes("#P3")) return 3;
  return 4;
};
const floatDeadlines = true; // this setting
const floatDeadlinesRegion = 60 * 24; // in minutes.

import {
  App,
  addIcon,
  Plugin,
  WorkspaceLeaf,
  MarkdownView,
  PluginSettingTab,
  Setting,
} from "obsidian";


// interface seems to be a Typescript thing.
interface ObsidianTimeBlockingSettings {
  scheduleBegin: string;
  scheduleEnd: string;
}

const DEFAULT_SETTINGS: ObsidianTimeBlockingSettings = {
  scheduleBegin: "08:00",
  scheduleEnd: "18:00",
};

export class ScheduleWriter {

  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  // TODO: It would be preferred if our plugin could render to a custom ```timeblocking block.
  // as this would ensure data integrity of the rest of the markdown file.
  async writeSchedule(mv : MarkdownView) {
    // TODO: The below code is very slow and crude. We need to optimize it. I suspect shlemiel the painter's algorithm is at play here.
    const fileContent = mv.data;
    const preamble = "# begin timeblocking";
    const EOF = "---";
    const postamble = "# end timeblocking";
    const textSections = fileContent.split(preamble);
    if (textSections.length == 2) {
      const textBefore = textSections[0];
      let oneAfterPreambleEof = 0;
      let isWhitespace = (char:string ) : Boolean => {
        return char === " " || char === "\t" || char === "\r" || char === "\n";
      };
      // NOTE: we allow for an aribtrary amount of whitespace after the preamble (or no whitespace).
      while ( (oneAfterPreambleEof < textSections[1].length) && isWhitespace(textSections[1][oneAfterPreambleEof]) ) {oneAfterPreambleEof++;}
      // NOTE: we allow for an aribtrary amount of dashes     after the preamble (or no dashes).
      while( (oneAfterPreambleEof < textSections[1].length) && textSections[1][oneAfterPreambleEof] === '-' ) {oneAfterPreambleEof++;}
      const textAfter  = textSections[1].slice(oneAfterPreambleEof).split(EOF); // If indexStart >= str.length, an empty string is returned.
      if (textAfter.length > 1) {
        const textAfterPostambleEof = textAfter[1];
        const scheduleOut = `<pre>
Monday     08:00 - Task 1
           09:00 - Task 2
           10:00 - Task 3

Tuesday    08:00 - Task 4
           09:00 - Task 5
           10:00 - Task 6

Wednesday  08:00 - Task 7
           09:00 - Task 8
           10:00 - Task 9
</pre>`;
        const textToWrite = `${textBefore}${preamble}\n${EOF}\n${scheduleOut}\n${EOF}${textAfterPostambleEof}`;
        this.app.vault.modify(mv.file, textToWrite); 
      } else {
        console.log("we cannot continue as unable to find postamble section.");
      }     
    } else if (textSections.length > 1) {
      console.log("too many timeblocking sections");
    } else {
      console.log("no timeblocking section found");
    }
  }
};

export default class ObsidianTimeBlocking extends Plugin {

  settings: ObsidianTimeBlockingSettings;
  private scheduleWriter: ScheduleWriter;

  async unload(): Promise<void> {
    this.app.workspace.off("active-leaf-change", (leaf: WorkspaceLeaf) => {});
  }

  async onload(): Promise<void> {
    console.log("loading Obsidian-Time-Blocking plugin...");

    this.scheduleWriter = new ScheduleWriter(this.app);

    await this.loadSettings();

    this.addSettingTab(new ObsidianTimeBlockingSettingTab(this.app, this));

    // this is where the main logic of the plugin goes.
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf: WorkspaceLeaf) => {
        if (leaf.view instanceof MarkdownView) {
          console.log("leaf.view",leaf.view);
          this.scheduleWriter.writeSchedule(leaf.view);
        }
      })
    );

    this.addCommand({
      id: "obsidian-time-blocking:register-note",
      name: "Register Note",
      checkCallback: (checking: boolean) => {
        const markdownView =
          this.app.workspace.getActiveViewOfType(MarkdownView);
        if (markdownView) {
          if (!checking) {
            // TODO: for now, our plugin will only work with the active note.
            console.log("note has been registered");
          }
          return true; // show command in pallete.
        }
      },
    });

    let tasks = await this.app.plugins.plugins["obsidian-tasks-plugin"]
      .oneHotResolveQueryToTasks(
        `not done 
description includes TODO 
path does not include TODO Template 
tags include #P1 
`
      )
      .then((tasks) => {
        console.log(tasks);
        console.log("done loading Obsidian-Time-Blocking plugin.");
      });
  }

  async loadSettings() {
    // TODO: figure out how this works.
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class ObsidianTimeBlockingSettingTab extends PluginSettingTab {
  plugin: ObsidianTimeBlocking;

  constructor(app: App, plugin: ObsidianTimeBlocking) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl("h2", { text: "Settings for Obsidian-Time-Blocking" });

    new Setting(containerEl)
      .setName("Schedule begin")
      .setDesc(
        "time in HH:MM (24h) format after which tasks may be scheduled in a day"
      )
      .addText((text) =>
        text
          .setPlaceholder("HH:MM")
          .setValue(this.plugin.settings.scheduleBegin)
          .onChange(async (value) => {
            //console.log("Secret: " + value);
            this.plugin.settings.scheduleBegin = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Schedule end")
      .setDesc(
        "time in HH:MM (24h) format before which tasks must be scheduled in a day"
      )
      .addText((text) =>
        text
          .setPlaceholder("HH:MM")
          .setValue(this.plugin.settings.scheduleEnd)
          .onChange(async (value) => {
            //console.log("Secret: " + value);
            this.plugin.settings.scheduleEnd = value;
            await this.plugin.saveSettings();
          })
      );
  }
}