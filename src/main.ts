import type { Moment } from 'moment/moment';
import moment from "moment";

// TODO: in the future we want to add a feature to show DONE todos for the purpose
// of looking at historical schedules.

const LOCK_SYMBOL: string = "🔒";
const DUE_DATE_SYMBOL: string = "📅";

class TaskExternal {
  public readonly isDone: Boolean;
  public readonly priority: number; // 1 is the highest priority, any larger number is a lower priority.
  public readonly tags: string[]; // a list of ASCII tags, distilled from the description.
  public readonly originalMarkdown: string; // the original markdown task.
  public readonly description: string; // the description of the task.
  public readonly estimatedTimeToComplete: number | null | undefined; // the estimated time to complete the task, in minutes.
  public readonly startDate: Moment | null;
  public readonly scheduledDate: Moment | null;
  public readonly dueDate: Moment | null;
  public readonly doneDate: Moment | null;
  // TODO: recurring tasks should get sheduled in the calendar as such.
}

enum ScheduleBlockType {
  TASK,
  DATE_HEADER
};

/// this class is a block that the ScheduleAlogrithm outputs.
/// it is meant to be consumed by the ScheduleWriter for rendering
/// the schedule.
class ScheduleBlock {
  public readonly type: ScheduleBlockType; // the type of block.
  public readonly text: string;            // the text to be rendered.
  public readonly startTime: Moment;       // when the block begins.

  constructor(type: ScheduleBlockType, text: string, startTime: Moment) {
    this.type = type;
    this.text = text;
    this.startTime = startTime;
  }
}

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

// TODO: maybe in the future we might want to be scheduling more abstract objects.
// Currently, we are only scheduling a list of TaskExternal.
class ScheduleAlgorithm {
  // TODO: Add parsing of scheduler object params from the .md  
  // ------ SCHEDULE WINDOW ------
  // TODO: Offer more variability in scheduling window size.
  // so, we want more than just scheduleBegin and scheduleEnd.
  // maybe I want many windows, for example.
  private readonly scheduleBegin = 60 * 8; // You may schedule after 8 AM. basic arithmetic is supported.
  private readonly scheduleEnd = 60 * 20; // Not past 8 PM
  // ------ SCHEDULE WINDOW ------
  // ------ SCHEDULE VIEW ------
  // TODO: actually do something with viewBegin/End. Right now I don't care.
  private readonly viewBegin = "2023-02-04"; // begin is inclusive
  private readonly viewEnd = "2023-02-5"; // the end is exclusive.
  // ------ SHCEDULE VIEW ------
  // ------ SCHEDULING BLOCKS ------
  private readonly maxBlockSize = 90; // the unit for these three is always minutes.
  private readonly minBlockSize = 15;
  private readonly blockStepSize = 5; // I always want blocks to be divisible by 5 mins. this is also an implicit alignment for task begin.
  private readonly defaultBlockSize = 30;
  // ------ SCHEDULING BLOCKS ------
  // ------ SCHEDULING ALGORITHM ------
  // TODO: add break time that user can specify.
  private readonly padding = 15;
  private readonly priorityAlgo = (task: TaskExternal) => {
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
  // TODO: currently we are using the descriptionFilter as a workaround to get P1, P2, P3 tags to "work".
  // but optimally it looks like we might want to reinvestigate how we render things.
  // if a ```timeblocking region can do what we want, then maybe we ought to use that.
  private readonly descriptionFilter = (description: string) => {
    const cruftRemoved = description.replace("[[TODO]](Noah):", "");
    const tagsBettered = cruftRemoved.replace(/#([a-zA-Z0-9]+)/g, (match : string) => {
      return `**${match}**`;
    });
    return tagsBettered;
  };
  // TODO: Implement this sort of thing as a future feature. don't need for MVP right now.
  private readonly floatDeadlines = true; // this setting
  private readonly floatDeadlinesRegion = 60 * 24; // in minutes.
  // ------ SCHEDULING ALGORITHM ------

  public isEqual(other: ScheduleAlgorithm) {
    // TODO: two equal schedules are defined as having the same parameters.
    // because then they will produce the same schedule.
    return true;
  }

  public makeSchedule(tasks: TaskExternal[]) : ScheduleBlock[] {
    // TODO: We need to add to the tasks plugin another piece of metadata for estimated time to complete.
    // This will be part of our priv extension.
    let timeNow = moment();
    let today = moment(timeNow.format("YYYY-MM-DD"));
    let alignUp = (from: number, alignment: number) => {
      return Math.ceil(from / alignment) * alignment;
    }
    let timeCursor = alignUp(Math.max(this.scheduleBegin, timeNow.diff(today, "minutes")), this.blockStepSize);
    let blocks: ScheduleBlock[] = [];
    let dateCursor = moment(today);
    let insertDateHeader = () => {
      blocks.push(new ScheduleBlock(ScheduleBlockType.DATE_HEADER, "", moment(dateCursor)));
    }
    insertDateHeader();
    // also render task, I suppose.
    let insertTask = (task : TaskExternal) => {
      let renderDueDate = (task.dueDate) ? ` ${DUE_DATE_SYMBOL} ${task.dueDate.format("YYYY-MM-DD")}` : "";
      blocks.push(new ScheduleBlock(ScheduleBlockType.TASK, 
        `${this.descriptionFilter(task.description)} ${renderDueDate}`, moment(dateCursor).add(timeCursor, "minutes")));
    }
    let insertBreak = () => {
      blocks.push(new ScheduleBlock(ScheduleBlockType.TASK, "BREAK", moment(dateCursor).add(timeCursor, "minutes")));
      timeCursor += this.padding;
      checkBoundary();
    }
    let checkBoundary = () => {
      // TODO: currently right now it is possible for us to go over scheduleBound, or "lose" some of a task across the 24 Hour boundary.
      // check if the timeCursor has crossed the boundary of a day.
      if (timeCursor >= this.scheduleEnd) {
        dateCursor.add(1, "days");
        timeCursor = this.scheduleBegin;
        insertDateHeader();
      }
    }
    // begin by sort the tasks by their priority.
    //
    // things with the largest numerical priorities get bubbled to the end of the list,
    // and hence are scheduled last.
    tasks.sort((a, b) => {
      // > 0 means sort a after b.
      // < 0 means sort a before b.
      // 0 means leave a and b unchanged.
      return this.priorityAlgo(a) - this.priorityAlgo(b);
    });
    for (let task of tasks) {
      // NOTE: we must call moment on a moment to clone it.
      if (task.estimatedTimeToComplete) {
        let timeLeft = task.estimatedTimeToComplete;
        let times = Math.ceil(task.estimatedTimeToComplete / this.maxBlockSize);
        while (times > 0) {
          insertTask(task);
          timeCursor += alignUp(Math.max(Math.min(this.maxBlockSize, timeLeft), this.minBlockSize), this.blockStepSize);
          checkBoundary();
          insertBreak();          
          times--;
          timeLeft -= this.maxBlockSize;
        }
      } else {
        insertTask(task);
        timeCursor += this.defaultBlockSize;
        checkBoundary();
        insertBreak();        
      }
    }
    blocks.push(new ScheduleBlock(ScheduleBlockType.TASK, "FIN", moment(dateCursor).add(timeCursor, "minutes")));
    return blocks;
  }

}

export class ScheduleWriter {

  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  // TODO: It would be preferred if our plugin could render to a custom ```timeblocking block.
  // as this would ensure data integrity of the rest of the markdown file.
  async writeSchedule(mv : MarkdownView, blocks: ScheduleBlock[]) {
    // TODO: The below code is very slow and crude. We need to optimize it. I suspect shlemiel the painter's algorithm is at play here.
    const fileContent = mv.data;
    if (fileContent === undefined || fileContent === null) {
      console.log("Obsidian-Time-Blocking: fileContent is undefined|null.");
      return;
    }
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
        let scheduleOut = "```markdown";
/* Example schedule:
2023-02-05: 

08:00 - Task 1
09:00 - Task 2
10:00 - Task 3

2023-02-06:

08:00 - Task 4
09:00 - Task 5
10:00 - Task 6

2023-02-07: 

08:00 - Task 7
09:00 - Task 8
10:00 - Task 9
</pre>*/
        for (let i = 0; i < blocks.length; i++)
        {
          const block = blocks[i];
          switch(block.type) {
            case ScheduleBlockType.TASK:
              scheduleOut += `*${block.startTime.format("HH:mm")}* - ${block.text}\n`;
              break;
            case ScheduleBlockType.DATE_HEADER:
              scheduleOut += `\n*${block.startTime.format("YYYY-MM-DD")}*:\n\n`;
              break;
          }
        }
        scheduleOut += "```";

        const textToWrite = `${textBefore}${preamble}\n${EOF}\n${scheduleOut}\n${EOF}${textAfterPostambleEof}`;
        this.app.vault.modify(mv.file, textToWrite); 
      } else {
        console.log("Obsidian-Time-Blocking: we cannot continue as unable to find postamble section.");
      }     
    } else if (textSections.length > 1) {
      console.log("Obsidian-Time-Blocking: too many timeblocking sections");
    } else {
      console.log("Obsidian-Time-Blocking: no timeblocking section found");
    }
  }
};

export default class ObsidianTimeBlocking extends Plugin {

  settings: ObsidianTimeBlockingSettings;
  private scheduleWriter: ScheduleWriter;
  private scheduleAlgorithm: ScheduleAlgorithm;

  async unload(): Promise<void> {
    this.app.workspace.off("active-leaf-change", (leaf: WorkspaceLeaf) => {});
  }

  async onload(): Promise<void> {
    console.log("loading Obsidian-Time-Blocking plugin...");

    this.scheduleWriter = new ScheduleWriter(this.app);
    this.scheduleAlgorithm = new ScheduleAlgorithm();

    await this.loadSettings();

    this.addSettingTab(new ObsidianTimeBlockingSettingTab(this.app, this));

    // this is where the main logic of the plugin goes.
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf: WorkspaceLeaf) => {
        if (leaf.view instanceof MarkdownView) {
          console.log("leaf.view",leaf.view);

          let tasks = this.app.plugins.plugins["obsidian-tasks-plugin"].oneHotResolveQueryToTasks(
`not done 
description includes TODO 
path does not include TODO Template 
`
          ).then((tasks : TaskExternal[]) => {
            console.log("Obsidian-Time-Blocking: ",tasks);
            let blocks : ScheduleBlock[] = this.scheduleAlgorithm.makeSchedule(tasks);
            this.scheduleWriter.writeSchedule(leaf.view, blocks);
          });
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
            console.log("Obsidian-Time-Blocking: note has been registered");
          }
          return true; // show command in pallete.
        }
      },
    });

    console.log("done loading Obsidian-Time-Blocking plugin.");
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