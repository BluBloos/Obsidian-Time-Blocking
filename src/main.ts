import type { Moment } from 'moment/moment';
import moment from "moment";
import { RRule } from 'rrule';




// ----------------- MVP: -----------------

// MORE TASKS PLUGIN MODS:
// TODO: Be able to mark a task as done right from within the schedule (does set dirty bit).


// TODO: SCHEDULE EDITING:
// - adjust formatting of individual tasks to be `endTime - taskDescription`.
// - adjust formmatting of entire thing to go at the granularity of the block size and put tasks at the block wherre they begin.
// - hook the ScheduleHelper into the plugin.
// - add dirty bit and reschedule after edits made with ScheduleHelper.
// TODO: ScheduleHelper:
// - make delete put the task into recycle bin.
// - make copy potentially yank from recycle bin.
// - add reflow of tasks when inserting
// - add implicit lock insertion.

// QOL:
// TODO: verify that we have fixed file overwrite thing.

// ----------------- MVP: -----------------

const LOCK_SYMBOL: string = "🔒";
const DUE_DATE_SYMBOL: string = "📅";
const SCHEDULED_DATE_SYMBOL: string = "⏳";
const SCHEDULED_START_DATE_SYMBOL : string = /*plane */ "🛫";
const ESTIMATED_TIME_TO_COMPLETE_SYMBOL: string = "⏱️";
const RECURRENCE_RULE_SYMBOL: string = "🔁";

class TaskExternal {
  public  isDone: Boolean;
  public  priority: number;                                    // 1 is the highest priority, any larger number is a lower priority.
  public  tags: string[];                                      // a list of tags, distilled from the description.
  public  originalMarkdown: string;                            // the original markdown task.
  public  description: string;                                 // the description of the task.
  public  estimatedTimeToComplete: number | null | undefined;  // the estimated time to complete the task, in minutes.
  public  startDate: Moment | null;                            // the day on and after which the task is allowed to be scheduled.
  public  scheduledDate: Moment | null;
  public  dueDate: Moment | null;                              // the day on which that task must be completed EOD.
  public  doneDate: Moment | null;         
  
  public  recurrenceRrule: RRule | undefined;                  ///< RRule as per the lib.
  public  recurrenceReferenceDate: Moment | undefined | null;  ///< The date after which the recurrence rule applies, may be
                                                                       ///  null if the RRule itself has a ref date,
                                                                       ///  ex) "every Monday".

  constructor({
    isDone,
    priority,
    tags,
    originalMarkdown,
    description,
    estimatedTimeToComplete,
    startDate,
    scheduledDate,
    dueDate,
    doneDate,
    recurrenceRrule,
    recurrenceReferenceDate,
  } : {
    isDone : Boolean,
    priority : number,
    tags : string[],
    originalMarkdown : string,
    description : string,
    estimatedTimeToComplete : number | null | undefined,
    startDate : Moment | null,
    scheduledDate : Moment | null,
    dueDate : Moment | null,
    doneDate : Moment | null,
    recurrenceRrule : RRule | null,
    recurrenceReferenceDate : Moment | null,
  }) {
    this.isDone = isDone;
    this.priority = priority;
    this.tags = tags;
    this.originalMarkdown = originalMarkdown;
    this.description = description;
    this.estimatedTimeToComplete = estimatedTimeToComplete;
    this.startDate = CREATE_MOMENT(startDate);
    this.scheduledDate = CREATE_MOMENT(scheduledDate);
    this.dueDate = CREATE_MOMENT(dueDate);
    this.doneDate = CREATE_MOMENT(doneDate);
    this.recurrenceRrule = recurrenceRrule;
    this.recurrenceReferenceDate = CREATE_MOMENT(recurrenceReferenceDate);
  }

}

enum ScheduleBlockType {
  TASK,
  DATE_HEADER,
  EXIT
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
  TFile,
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

function getEarlierOfTwoDates(date1:Moment|null, date2:Moment|null) {
  if (date1 && !date2) return date1;
  if (!date1 && date2) return date2;
  if (date1 && date2) {
    return date1.isAfter(date2, 'D') ? date2 : date1;
  }
  return null;
}

function getLaterOfTwoDates(date1:Moment|null, date2:Moment|null) {
  if (date1 && !date2) return date1;
  if (!date1 && date2) return date2;
  if (date1 && date2) {
    return date1.isAfter(date2, 'D') ? date1 : date2;
  }
  return null;
}

function getTaskStartDate(task: TaskExternal) {
  return(getEarlierOfTwoDates(task.startDate, task.scheduledDate));
}

function CREATE_MOMENT(any? : any) {
  if (any === undefined) {
    return moment.utc();
  }
  if (any === null) return any;
  return moment.utc(any);
}

class ScheduleAlgorithm {

  // ------ SCHEDULE WINDOW ------
  private readonly scheduleBegin = 60 * 8; // You may schedule after 8 AM. basic arithmetic is supported.
  private readonly scheduleEnd = 60 * 20; // Not past 8 PM
  // ------ SCHEDULE WINDOW ------
  // ------ SCHEDULE VIEW ------
  private readonly viewBegin = "2023-02-04"; // begin is inclusive
  private readonly viewEnd = "2024-09-10"; // the end is exclusive, so for this specific example it is 2023-02-10 EOD.
  // ------ SHCEDULE VIEW ------
  // ------ SCHEDULING BLOCKS ------
  private readonly maxBlockSize = 90; // the unit for these three is always minutes.
  private readonly minBlockSize = 15;
  private readonly blockStepSize = 5; // I always want blocks to be divisible by 5 mins. this is also an implicit alignment for task begin.
  private readonly defaultBlockSize = 30;
  // ------ SCHEDULING BLOCKS ------
  // ------ SCHEDULING ALGORITHM ------
  
  private readonly padding = 15;

  private readonly scheduleAlgo = (tasks : TaskExternal[]) => {
    const priorityAlgo = (task: TaskExternal) => {
      if (task.dueDate) {
        const timeUntilDue = task.dueDate.diff(CREATE_MOMENT(), "hours");
        if (timeUntilDue <= 24) return 1;
        if (timeUntilDue <= 24 * 14) return 2; // my personal rule is if within next 2 weeks, it's effectively P1, but not quite.
      }
      if (task.tags.includes("#P1")) return 1;
      if (task.tags.includes("#P2")) return 3;
      if (task.tags.includes("#P3")) return 4;
      return 5;
    };
    tasks.sort((a, b) => {
      // > 0 means sort a after b.
      // < 0 means sort a before b.
      // 0 means leave a and b unchanged.
      return priorityAlgo(a) - priorityAlgo(b);
    });
    // pass 2.
    let filteredTasks = tasks.filter((task) => {
      return !!getTaskStartDate(task);
    });
    filteredTasks.sort( (a, b) => {
      let aEarliestStart = getTaskStartDate(a);
      let bEarliestStart = getTaskStartDate(b);
      let result :number = 0;
      if (aEarliestStart && bEarliestStart) {
        result = aEarliestStart.isAfter(bEarliestStart, 'D') ? 1 : (aEarliestStart.isSame(bEarliestStart, 'D') ? 0 : -1);
      }
      //console.log("compare func", aEarliestStart, bEarliestStart, result);
      return result;
    });
    // merge filteredTasks back in.
    for (let i = 0, Idx = 0; Idx < tasks.length; Idx++) {
      //tasks[i] = filteredTasks[i];
      if (filteredTasks.includes(tasks[Idx])) {
        tasks[Idx] = filteredTasks[i++];
      }
    }
  }

  private readonly descriptionFilter = (description: string) => {
    const cruftRemoved = description.replace("[[TODO]](Noah):", "");
    const tagsBettered = cruftRemoved.replace(/#([a-zA-Z0-9]+)/g, (match : string) => {
      return `**${match}**`;
    });
    return tagsBettered.trim();
  };
  // ------ SCHEDULING ALGORITHM ------

  public isEqual(other: ScheduleAlgorithm) {
    // TODO:
    return true;
  }

  public makeSchedule(tasks: TaskExternal[]) : ScheduleBlock[] {
    // TODO: We need to add to the tasks plugin another piece of metadata for estimated time to complete.
    // This will be part of our priv extension.
    let timeNow = CREATE_MOMENT();
    let today = CREATE_MOMENT(timeNow.format("YYYY-MM-DD"));
    let alignUp = (from: number, alignment: number) => {
      return Math.ceil(from / alignment) * alignment;
    }
    let timeCursor = alignUp(Math.max(this.scheduleBegin, timeNow.diff(today, "minutes")), this.blockStepSize);
    let blocks: ScheduleBlock[] = [];
    let dateCursor = CREATE_MOMENT(today);
    let insertDateHeader = () => {
      blocks.push(new ScheduleBlock(ScheduleBlockType.DATE_HEADER, "", CREATE_MOMENT(dateCursor)));
    }
    let estimatedTimeToCompleteToString = (time: number) : string => {
      let hours = Math.floor(time / 60);
      let minutes = time % 60;
      let hoursString = (hours > 0) ? `${hours}h` : "";
      let minutesString = (minutes > 0) ? `${minutes}m` : "";
      return `${hoursString}${minutesString}`;
    }
    // also render task, I suppose.
    let insertTask = (task : TaskExternal) => {
      let renderDueDate = (task.dueDate) ? ` ${DUE_DATE_SYMBOL} ${task.dueDate.format("YYYY-MM-DD")}` : "";
      let renderScheduledDate = (task.scheduledDate) ? ` ${SCHEDULED_DATE_SYMBOL} ${task.scheduledDate.format("YYYY-MM-DD")}` : "";
      let renderStartDate = (task.startDate) ? ` ${SCHEDULED_START_DATE_SYMBOL} ${task.startDate.format("YYYY-MM-DD")}` : "";
      let renderEstimatedTimeToComplete =
        (task.estimatedTimeToComplete) ? ` ${ESTIMATED_TIME_TO_COMPLETE_SYMBOL} ${estimatedTimeToCompleteToString(task.estimatedTimeToComplete)}` : "";
      let renderRecurrence = (task.recurrenceRrule) ? ` ${RECURRENCE_RULE_SYMBOL} ${task.recurrenceRrule.toText()}` : "";
        blocks.push(new ScheduleBlock(ScheduleBlockType.TASK, 
        `${this.descriptionFilter(task.description)}${renderDueDate}${renderScheduledDate}${renderStartDate}${renderEstimatedTimeToComplete}${renderRecurrence}`,
        CREATE_MOMENT(dateCursor).add(timeCursor, "minutes")));
    }
    let insertBreak = () => {
      blocks.push(new ScheduleBlock(ScheduleBlockType.TASK, "*BREAK*", CREATE_MOMENT(dateCursor).add(timeCursor, "minutes")));
      timeCursor += this.padding;
      checkBoundary();
    }
    /// @returns true if we crossed the boundary.
    /// may emit an EXIT block if no more tasks may be scheduled.
    let checkBoundary = () : Boolean => {
      let result : Boolean = false;
      // TODO: currently right now it is possible for us to go over scheduleBound, or "lose" some of a task across the 24 Hour boundary.
      // check if the timeCursor has crossed the boundary of a day.
      if (timeCursor >= this.scheduleEnd) {
        let datesToAdd = 1 + Math.floor( (timeCursor - this.scheduleEnd) / (24 * 60) );
        dateCursor.add(datesToAdd, "days");
        timeCursor = this.scheduleBegin;
        result = true;
      }

      // viewEnd is always at the beginning of a day at the time of writing this comment.
      // so we could put this within the above if.
      // but incase viewEnd ever changes, best to keep this here.
      if (CREATE_MOMENT(dateCursor).add(timeCursor, "minutes").isAfter(CREATE_MOMENT(this.viewEnd))) {
        // overwrite last added task as its extent exceeds the viewEnd.
        blocks[blocks.length-1]=(new ScheduleBlock(ScheduleBlockType.EXIT, "", CREATE_MOMENT(this.viewEnd)));
        return true;
      }

      if (result) {
        insertDateHeader();
      }

      return result;
    }
    if (!checkBoundary()) {
      insertDateHeader();
    }

    // before we sauce the block of tasks to the user, we are to decompose the recurring ones.
    {
      let IterCount = tasks.length;
      for (let i = 0, Idx = 0; Idx < IterCount; Idx++ ) {
        let task : TaskExternal = tasks[i];
        if (task.recurrenceRrule) {
          {
            let beginDate = getLaterOfTwoDates(task.recurrenceReferenceDate, CREATE_MOMENT(today));
            if (beginDate) {
              tasks.splice(i, 1); // we want to remove this particular task from the array.
              let newTasks = task.recurrenceRrule.between(
                beginDate.toDate(),
                CREATE_MOMENT(this.viewEnd).add(-1,'day').toDate(),
                true // inclusive
              )
              for (let date of newTasks) {
                let newTask = new TaskExternal({...task}); // TODO: does this work?
                newTask.scheduledDate = CREATE_MOMENT(date);
                tasks.push(newTask); // OK, because everything will get re-order right after.
              }
            } else {
              // TODO:
              console.error("something is wrong");
            }
          }          
          continue; // don't increment i so as to land on next task which is now in slot just deleted.
        } else {
          tasks[i] = new TaskExternal({...task}); // clone to convert from local to UTC.
        }
        i++;
      }
    }
    // USER GETS TO DO A CUSTOM SORTING OF TASKS.
    this.scheduleAlgo(tasks); // WORKS IN PLACE.
    console.log("tasks pre-blocking", tasks);
    // USER GETS TO DO A CUSTOM SORTING OF TASKS.
    let taskStack : TaskExternal[] = [];
    let shouldNotDefer = (task: TaskExternal) => {      
      let taskStartDate = getTaskStartDate(task);
      return taskStartDate ?
        !taskStartDate.isAfter(dateCursor, "day") : true;
    }
    let taskIdx = 0;
    while ( (taskIdx < tasks.length) || (taskStack.length > 0) ) {
      let task = tasks[taskIdx];
      let bLeftoverStackCase = taskIdx >= tasks.length ;
      if (taskStack.length > 0) {
        let firstIn = taskStack[0]; // FIFO
        if (bLeftoverStackCase || shouldNotDefer(firstIn)) {
          task = taskStack.shift();
          taskIdx--;
        }
      }
      if (!shouldNotDefer(task)) {
        if (bLeftoverStackCase) {
          // need to adjust the dateCursor so that we can fulfill the leftover stack case, and actually
          // insert this task into the schedule.
          // TODO: investigate if this works in odd cases where for example
          // the user says to schedule tasks within the full 24h slot.
          timeCursor = getTaskStartDate(task).diff(dateCursor, "minutes");
          checkBoundary();
        } else {
          taskStack.push(task);
          taskIdx++;
          continue;
        }
      }
      // NOTE: we must call moment on a moment to clone it.
      if (task.estimatedTimeToComplete) {
        let timeLeft = task.estimatedTimeToComplete;
        let times = Math.ceil(task.estimatedTimeToComplete / this.maxBlockSize);
        while (times > 0) {
          insertTask(task);
          timeCursor += alignUp(Math.max(Math.min(this.maxBlockSize, timeLeft), this.minBlockSize), this.blockStepSize);
          if (!checkBoundary()) {
            insertBreak();
          }
          times--;
          timeLeft -= this.maxBlockSize;
        }
      } else {
        insertTask(task);
        timeCursor += this.defaultBlockSize;
        if (!checkBoundary()) {
          insertBreak();
        }
      }
      taskIdx++;
    }
    blocks.push(new ScheduleBlock(ScheduleBlockType.TASK, "FIN", CREATE_MOMENT(dateCursor).add(timeCursor, "minutes")));
    return blocks;
  }

}

export class ScheduleWriter {

  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  static areTwoFilesSame(file1: TFile, file2: TFile) {
    return file1.path === file2.path;
  }

  // TODO: It would be preferred if our plugin could render to a custom ```timeblocking block.
  // as this would ensure data integrity of the rest of the markdown file.
  async writeSchedule(mv : MarkdownView, blocks: ScheduleBlock[]) {

    const fileRef = mv.file;
    if (!fileRef) {
      console.error("Obsidian-Time-Blocking: fileRef for MarkdownView is undefined|null. Returning early.");
      return;
    }

    // atomically read, process, and write file.
    this.app.vault.process(fileRef, (fileContent:string) => {

      // TODO: The below code is very slow and crude. We need to optimize it. I suspect shlemiel the painter's algorithm is at play here.
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
            let shouldExit = false;
            switch(block.type) {
              case ScheduleBlockType.TASK:
                scheduleOut += `*${block.startTime.format("HH:mm")}* - ${block.text}\n`;
                break;
              case ScheduleBlockType.DATE_HEADER:
                scheduleOut += `\n*${block.startTime.format("YYYY-MM-DD")}*:\n\n`;
                break;
              case ScheduleBlockType.EXIT:
                shouldExit = true;
                break;
            }
            if (shouldExit) {
              break;
            }
          }
          scheduleOut += "```";
  
          const textToWrite = `${textBefore}${preamble}\n${EOF}\n${scheduleOut}\n${EOF}${textAfterPostambleEof}`;

          // NOTE: because of race conditions ... we must ensure that the markdown file on the markdown view does not
          // get pulled from right under us 
          if (ScheduleWriter.areTwoFilesSame(mv.file, fileRef)) {      
            return textToWrite;
          } else {
            console.error("Obsidian-Time-Blocking: TFile slipped out from under us(MarkdownView) during write, aborting write.");
          }
        } else {
          console.error("Obsidian-Time-Blocking: Unable to find postamble section, aborting write.");
        }     
      } else if (textSections.length > 1) {
        console.error("Obsidian-Time-Blocking: Too many timeblocking sections, aborting write.");
      } else {
        console.error("Obsidian-Time-Blocking: No timeblocking section found, aborting write.");
      }
      return fileContent;
    });
      
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
          //console.log("leaf.view",leaf.view);

          this.app.plugins.plugins["obsidian-tasks-plugin"].oneHotResolveQueryToTasks(
`not done 
description includes TODO 
path does not include TODO Template
path does not include Weekly Journal Template
tags do not include #someday
`
          ).then((tasks : TaskExternal[]) => {
            console.log("Obsidian-Time-Blocking: ", tasks);
            let tempTasks = Array.from(tasks);
            let blocks : ScheduleBlock[] = this.scheduleAlgorithm.makeSchedule(tempTasks);
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

// ------------- TESTS TO ADD LATER -------------

/*

1. That the startOn tasks are orderded correctly.
2. The relative ordering between startOn and scheduledOn is correct when same. scheduledOn should come first (higher priority).


*/

// ------------- POST MVP -------------

// TODO: add support for "lunch" and other smart scheduling sort of things by making such tasks
// with particular descriptions get biased towards what type they ought to be but using an hourly or minutely granularity.

// TODO: make it react to vault changes. do by alter Tasks plugin instead of "oneHot" model do the "register callback model".
// we are effectively a virtual QueryRenderer.

// USER SETTINGS:
// TODO: Add parsing of scheduler object params from the .md, including the taskFilter.

// TODO: Give scheduled on a higher priority.

// TODO: Offer more variability in scheduling window size.
// so, we want more than just scheduleBegin and scheduleEnd.
// maybe I want many windows, for example.

// TODO: don't schedule breaks at the end of a day.

// TODO: fix bug where when the tasks prior come flush with scheduleEnd and the next task is a "startOn", then we get double date headers.
// TODO: resolve bug where FIN does not show if there is an EXIT block. 
// TODO: resolve "bug" where output is not-so-helpful when no tasks have been scheduled.

// TODO: maybe in the future we might want to be scheduling more abstract objects.
// Currently, we are only scheduling a list of TaskExternal.

// TODO: for autocomplete writing something like "90" might mean 90 minutes,
// so autocomplete to 1:00 is welcome.

// TODO: show DONE todos for the purpose of looking at historical schedules.

// TODO: add break time that user can specify. For MVP, make a recurring task that is for ex) "lunch".

// TODO: with description filter we have quite a bit of flexibility in what we can do. but in a future version we might
// want to automate some of the "syntax highlighting".

// TODO: Deadline floating.

// TODO: opt, schedule caching.