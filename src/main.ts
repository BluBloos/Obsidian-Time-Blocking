import type { Moment } from 'moment/moment';
import moment from "moment";
import { RRule } from 'rrule';

import { newLivePreviewExtension } from './live_preview';

import TaskRegistry from './TaskRegistry';

import { TASK_SYMBOL, TASK_EDIT_SYMBOL } from './live_preview';

// create the one true taskRegistry :D (singleton design pattern).
const taskRegistry = TaskRegistry.getInstance();

// ----------------- MVP: -----------------
// QOL + TASKS PLUGIN MODS:
// TODO: Verify that we have fixed file overwrite thing.
// ----------------- MVP: -----------------

const LOCK_SYMBOL: string = "🔒";
const DUE_DATE_SYMBOL: string = "📅";
const SCHEDULED_DATE_SYMBOL: string = "⏳";
const SCHEDULED_START_DATE_SYMBOL : string = /*plane */ "🛫";
const ESTIMATED_TIME_TO_COMPLETE_SYMBOL: string = "⏱️";
const RECURRENCE_RULE_SYMBOL: string = "🔁";
const START_TASK_TIMER_SYMBOL: string = "🏃‍♂️";
const BACKLINK_SYMBOL: string = "🔗";
const PRIORITY_HIGH_SYMBOL: string = "🔥";
const PRIORITY_MEDIUM_SYMBOL: string = "🔼";
const PRIORITY_LOW_SYMBOL: string = "🔽";
const PRIORITY_NONE_SYMBOL: string = "";

function priorityToSymbol(priority: number) {
  switch (priority) {
    case 1:
      return PRIORITY_HIGH_SYMBOL;
    case 2:
      return PRIORITY_MEDIUM_SYMBOL;
    case 3:
      return PRIORITY_NONE_SYMBOL;
    case 4:
    default:
      return PRIORITY_LOW_SYMBOL;
  }
}

import {TaskUID, TaskExternal} from './types';

enum ScheduleBlockType {
  TASK,
  DATE_HEADER,
  EXIT
};

/// this class is a block that the ScheduleAlogrithm outputs.
/// it is meant to be consumed by the ScheduleWriter for rendering
/// the schedule.
export class ScheduleBlock {
  public readonly type: ScheduleBlockType;   // the type of block.
  public readonly text: string;              // the text to be rendered.
  public readonly textBare: string;          // the text to be rendered, without any symbols for the purpose of reflow.
  public readonly startTime: Moment;         // when the block begins.
  public readonly duration: number;          // how long the block lasts, in minutes.
  public readonly taskUID: TaskUID | null;   // the UID of the task that this block is associated with.
  public readonly renderIdx: number;         // the render index of the block. -1 is invalid.
  constructor(type: ScheduleBlockType, text: string, textBare:string, startTime: Moment, duration: number, renderIdx: number, taskUID: TaskUID | null) {
    this.type = type;
    this.text = text;
    this.startTime = startTime;
    this.duration = duration;
    this.renderIdx = renderIdx;
    this.taskUID = taskUID;
    this.textBare = textBare;
  }
}

import {
  App,
  TFile,
  Plugin,
  WorkspaceLeaf,
  MarkdownView,
  PluginSettingTab,
  Setting
} from "obsidian";


// interface seems to be a Typescript thing.
interface ObsidianTimeBlockingSettings {
  useChromeTimer : boolean;
}

const DEFAULT_SETTINGS: ObsidianTimeBlockingSettings = {
  useChromeTimer: true
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

import { CREATE_MOMENT } from './utils';

function VISIBLE_COUNT(str:string) {
  // TODO:
  // https://cestoliv.com/blog/how-to-count-emojis-with-javascript/
    return str.length;
}

// -------------------------------------------------- SETTINGS --------------------------------------------------
class ScheduleSettings {
  public readonly scheduleBegin : number;// = NOON + MIN_PER_HOUR * 5;
  public readonly scheduleEnd : number;//   = NOON + MIN_PER_HOUR * 9;
  public readonly viewBegin:string|null;     // = "2023-02-04";  // begin is inclusive
  public viewEnd:string|null;     // =   "2023-12-30";  //< the end is exclusive (date granularity)
  public readonly maxBlockSize : number;// = 90;  // the unit for these three is always minutes.
  public readonly minBlockSize : number;// = 15;
  public readonly blockStepSize : number;// = 5;  //< I always want blocks to be divisible by 5 mins. this is
                                      //  also an implicit alignment for task begin.
  public readonly defaultBlockSize : number;//= 30;
  public readonly padding : number;
  public readonly assignTaskBias : (task:TaskExternal) => number;
  public readonly scheduleAlgo : (tasks : TaskExternal[]) => void;
  public readonly descriptionFilter : (description: string) => string;
  public readonly query : string;

  // TODO: is there any way to greatly simplify this sort of thing????? like come on man, this sort of code is MASSIVELY boilerplate esque.
  // I'm not a fan in any way at all.
  constructor({
    scheduleBegin,
    scheduleEnd,
    viewBegin,
    viewEnd,
    maxBlockSize,
    minBlockSize,
    blockStepSize,
    defaultBlockSize,
    padding,
    assignTaskBias,
    scheduleAlgo,
    descriptionFilter,
    query
  } : {
    scheduleBegin : number,
    scheduleEnd : number,
    viewBegin:string|null,
    viewEnd:string|null,
    maxBlockSize : number,
    minBlockSize : number,
    blockStepSize : number,
    defaultBlockSize : number,
    padding : number,
    assignTaskBias : (task:TaskExternal) => number,
    scheduleAlgo : (tasks : TaskExternal[]) => void,
    descriptionFilter : (description: string) => string,
    query : string
  }) {
    this.scheduleBegin = scheduleBegin;
    this.scheduleEnd = scheduleEnd;
    this.viewBegin = viewBegin;
    this.viewEnd = viewEnd;
    this.maxBlockSize = maxBlockSize;
    this.minBlockSize = minBlockSize;
    this.blockStepSize = blockStepSize;
    this.defaultBlockSize = defaultBlockSize;
    this.padding = padding;
    this.assignTaskBias = assignTaskBias;
    this.scheduleAlgo = scheduleAlgo;
    this.descriptionFilter = descriptionFilter;
    this.query = query;
  }
}
// -------------------------------------------------- SETTINGS --------------------------------------------------

class Schedule {
  public readonly blocks : ScheduleBlock[];
  public readonly report : any;
  constructor(blocks: ScheduleBlock[], report: any) {
    this.blocks = blocks;
    this.report = report;
  }
}

// Sort just a filtered part of an array then "merge" it back into the original array.
// this does in place for the array.
function filterSort( array:any[], filterFn: (a:any) => boolean, sortFn: (a:any, b:any) => number ) {
  // pass 2.
  let filtered = array.filter(filterFn);
  filtered.sort( sortFn);
  // merge filteredTasks back in.
  for (let i = 0, Idx = 0; Idx < array.length; Idx++) {
    if (filtered.includes(array[Idx])) {
      array[Idx] = filtered[i++];
    }
  }
}

class ScheduleAlgorithm {

  private readonly settings : ScheduleSettings;

  constructor(settings : ScheduleSettings) {
    this.settings = settings;
  }

  public isEqual(other: ScheduleAlgorithm) {
    // TODO:
    return true;
  }

  public makeSchedule(tasks: TaskExternal[]) : Schedule {
    
    let runningTaskIdx = 0;
    let canGetEverythingDone = true;

    // ensure tasks are reset in registry.
    taskRegistry.reset();

    // TODO: We need to add to the tasks plugin another piece of metadata for estimated time to complete.
    // This will be part of our priv extension.
    let timeNow = moment();
    const virtualToday = getLaterOfTwoDates(moment(timeNow.format("YYYY-MM-DD")),
      this.settings.viewBegin ? moment(this.settings.viewBegin) : null);
    if (!this.settings.viewEnd) {
      this.settings.viewEnd = moment(virtualToday).add(1, 'd').format("YYYY-MM-DD"); // TODO: this seems kinda redundant cuz we
      // end up parsing it later anyway ...
    }

    let alignUp = (from: number, alignment: number) => {
      return Math.ceil(from / alignment) * alignment;
    }
    let timeCursor = alignUp(Math.max(this.settings.scheduleBegin, timeNow.diff(virtualToday, "minutes")), this.settings.blockStepSize);
    let blocks: ScheduleBlock[] = [];
    let dateCursor = moment(virtualToday);
    let insertDateHeader = () => {
      blocks.push(new ScheduleBlock(ScheduleBlockType.DATE_HEADER, "", "",moment(dateCursor), 0, -1, null));
    }
    let minutesToString = (time: number) : string => {
      let hours = Math.floor(time / 60);
      let minutes = time % 60;
      let hoursString = (hours > 0) ? `${hours}h` : "";
      let minutesString = (minutes > 0) ? `${minutes}m` : "";
      return `${hoursString}${minutesString}`;
    }
    // also render task, I suppose.
    let insertTask = (task : TaskExternal, duration : number) => {
      const renderDueDate = (task.dueDate) ? ` ${DUE_DATE_SYMBOL} ${task.dueDate.format("YYYY-MM-DD")}` : "";
      const renderScheduledDate = (task.scheduledDate) ? ` ${SCHEDULED_DATE_SYMBOL} ${task.scheduledDate.format("YYYY-MM-DD")}` : "";
      const renderStartDate = (task.startDate) ? ` ${SCHEDULED_START_DATE_SYMBOL} ${task.startDate.format("YYYY-MM-DD")}` : "";
      const renderEstimatedTimeToComplete =
        (task.estimatedTimeToComplete) ? ` ${ESTIMATED_TIME_TO_COMPLETE_SYMBOL} ${minutesToString(task.estimatedTimeToComplete)}` : "";
      const shortPath = task.uid.path.split("/").slice(-1)[0];
      const renderBacklink = ` ${BACKLINK_SYMBOL} [${shortPath}](${task.uid.path.replace(/ /g, (m)=>'%20')})`;
      const renderBacklinkBare = ` ${BACKLINK_SYMBOL} ${shortPath}`;
      const renderRecurrence = (task.recurrenceRrule) ? ` ${RECURRENCE_RULE_SYMBOL} ${task.recurrenceRrule.toText()}` : "";
      const renderPriority = (task.priority !== 3) ? ` ${priorityToSymbol(task.priority)}` : "";
      const taskText = `${minutesToString(duration)} - ${this.settings.descriptionFilter(task.description)}${renderDueDate}${renderScheduledDate}${renderStartDate}${renderPriority}${renderEstimatedTimeToComplete}${renderRecurrence}${renderBacklink}`;
      const taskTextBare = `${minutesToString(duration)} - ${this.settings.descriptionFilter(task.description)}${renderDueDate}${renderScheduledDate}${renderStartDate}${renderPriority}${renderEstimatedTimeToComplete}${renderRecurrence}${renderBacklinkBare}`;
      const newBlock = new ScheduleBlock(ScheduleBlockType.TASK, taskText, taskTextBare,
        moment(dateCursor).add(timeCursor, "minutes"), duration, runningTaskIdx++, task.uid);
      blocks.push(newBlock);
      // check if task extent of task goes past EOD for due date.
      if (task.dueDate) {
        const newBlockEnd = moment(newBlock.startTime).add(newBlock.duration, 'minutes');
        if (newBlockEnd.diff(moment(moment(task.dueDate.format('YYYY-MM-DD')).add(1,'d')), "minutes") > 0) {
          canGetEverythingDone = false;
        }
      } 
    }
    let insertBreak = () => {
      blocks.push(new ScheduleBlock(ScheduleBlockType.TASK, "*BREAK*", "BREAK",moment(dateCursor).add(timeCursor, "minutes"), this.settings.padding, -1, null));
      timeCursor += this.settings.padding;
      checkBoundary();
    }
    /// @returns true if we crossed the boundary.
    /// may emit an EXIT block if no more tasks may be scheduled.
    let checkBoundary = () : Boolean => {
      let result : Boolean = false;
      // TODO: currently right now it is possible for us to go over scheduleBound, or "lose" some of a task across the 24 Hour boundary.
      // check if the timeCursor has crossed the boundary of a day.
      if (timeCursor >= this.settings.scheduleEnd) {
        let datesToAdd = 1 + Math.floor( (timeCursor - this.settings.scheduleEnd) / (24 * 60) );
        dateCursor.add(datesToAdd, "days");
        timeCursor = this.settings.scheduleBegin;
        result = true;
      }

      // viewEnd is always at the beginning of a day at the time of writing this comment.
      // so we could put this within the above if.
      // but incase viewEnd ever changes, best to keep this here.
      if (moment(dateCursor).add(timeCursor, "minutes").isAfter(moment(this.settings.viewEnd))) {
        // overwrite last added task as its extent exceeds the viewEnd.
        blocks[blocks.length-1]=(new ScheduleBlock(ScheduleBlockType.EXIT, "", "",moment(this.settings.viewEnd), 0, -1, null));
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
            // NOTE: the rrule lib is really odd. we provide values in "UTC" and we get back values in "UTC".
            // aka offset=0. HOWEVER, these dates are not _actually_ in UTC. They are in the local timezone
            // and should be interpreted as such...
            // so if you see sillyness going on below, that is why.
            const recurRefDate = task.recurrenceReferenceDate ? moment.utc(task.recurrenceReferenceDate.format('YYYY-MM-DD')):null;
            let beginDate = getLaterOfTwoDates(
              recurRefDate, moment.utc(virtualToday.format('YYYY-MM-DD')));
            if (beginDate) {
              taskRegistry.addTask(task); // ADD ORIGINAL TASK TO REGISTRY.
              tasks.splice(i, 1); // we want to remove this particular task from the array.
              const begin = beginDate.toDate();
              // viewEnd is the exlusive date so subtract 1 minute to make it so that tasks cannot be schedule om
              // the viewEnd date.
              const end = moment.utc(this.settings.viewEnd).add(-1,'minutes').toDate(); 
              //console.log('begin',begin.toISOString());
              //console.log('end',end.toISOString());
              let newTasks = task.recurrenceRrule.between(
                begin,
                end,
                true // inclusive
              ); 
              for (let date of newTasks) {
                let newTask = new TaskExternal({...task});
                // NOTE: .getUTCMonth is a zero-based value so we add 1.
                newTask.scheduledDate = moment(`${date.getUTCFullYear()}-${date.getUTCMonth()+1}-${date.getUTCDate()}`);
                tasks.push(newTask); // OK, because everything will get re-order right after.
              }
              continue; // don't increment i so as to land on next task which is now in slot just deleted.
            } else {
              // TODO:
              console.error("something is wrong");
            }
          }          
          
        } else {
          tasks[i] = new TaskExternal({...task}); // clone to convert from local to UTC.
          taskRegistry.addTask(tasks[i]);
        }
        i++;
      }
    }
    // USER GETS TO DO A CUSTOM SORTING OF TASKS.
    this.settings.scheduleAlgo(tasks); // WORKS IN PLACE.

    // use the user settings to bias tasks for starting at a very specific time.
    {
      let IterCount = tasks.length;
      const biasedTasks = [];
      for (let i = 0, Idx = 0; Idx < IterCount; Idx++ ) {
        let task : TaskExternal = tasks[i];
        const bias = this.settings.assignTaskBias(task);
        if (bias) {
          task.startTime = bias;
          tasks.splice(i, 1); // we want to remove this particular task from the array.
          biasedTasks.push(task);
          continue;
        }
        i++;
      }
     tasks = biasedTasks.concat(tasks);
    }

    // pass 2 sort.
    {
      filterSort(tasks, (a) => {
        return !!getTaskStartDate(a);
      }, (a,b) => {
        let aEarliestStart = getTaskStartDate(a);
        let bEarliestStart = getTaskStartDate(b);
        return aEarliestStart.isAfter(bEarliestStart, 'D') ? 1 :
          (aEarliestStart.isSame(bEarliestStart, 'D') ? 0 : -1);
      });
    }

    // TODO: there are quite a few sorts going on ... can we reduce them?
    // pass 3 sort.
    {
      filterSort(tasks, (a) => {
        return !!a.startTime;
      }, (a,b) => {
        let aEarliestStart = getTaskStartDate(a);
        let bEarliestStart = getTaskStartDate(b);
        if (aEarliestStart && bEarliestStart) {
          if (aEarliestStart.isSame(bEarliestStart, 'D')) {
           return a.startTime - b.startTime;
          }
        }
        return 0;
      });
    }

    console.log("tasks pre-blocking", tasks);
    // USER GETS TO DO A CUSTOM SORTING OF TASKS.
    let taskStack : TaskExternal[] = [];
    let shouldNotDefer = (task: TaskExternal) => {
      let taskStartDate = getTaskStartDate(task);
      const shouldDeferByStartDate = taskStartDate ?
        taskStartDate.isAfter(dateCursor, "day") : false;
      const shouldDeferByStartTime = task.startTime ? (task.startTime > timeCursor) : false;
      return !(shouldDeferByStartDate || shouldDeferByStartTime);
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
          if (getTaskStartDate(task)) {
            timeCursor = getTaskStartDate(task).diff(dateCursor, "minutes");
            checkBoundary(); // we may be on new date now, check.
          }
          if (task.startTime) {
            timeCursor += Math.max(0,task.startTime - timeCursor);
            checkBoundary(); // if they wrote a startTime that kicks us out boundary...
          }
        } else {
          taskStack.push(task);
          taskIdx++;
          continue;
        }
      }
      // NOTE: we must call moment on a moment to clone it.
      if (task.estimatedTimeToComplete) {
        let timeLeft = task.estimatedTimeToComplete;
        let times = Math.ceil(task.estimatedTimeToComplete / this.settings.maxBlockSize);
        while (times > 0) {
          const taskDuration = alignUp(Math.max(Math.min(this.settings.maxBlockSize, timeLeft), this.settings.minBlockSize), this.settings.blockStepSize);
          insertTask(task, taskDuration);
          timeCursor += taskDuration;
          if (!checkBoundary()) {
            insertBreak();
          }
          times--;
          timeLeft -= this.settings.maxBlockSize;
        }
      } else {
        const taskDuration = this.settings.defaultBlockSize
        insertTask(task, taskDuration);
        timeCursor += taskDuration;
        if (!checkBoundary()) {
          insertBreak();
        }
      }
      taskIdx++;
    }
    blocks.push(new ScheduleBlock(ScheduleBlockType.TASK, "FIN","FIN", moment(dateCursor).add(timeCursor, "minutes"), 0, -1, null));
    return new Schedule(blocks, {
      items: [
        {what: "Can I get everything done?", value: canGetEverythingDone},
        {what: "Last generated time", value: moment().format("HH:mm:ss")},
      ]
    });
  }

}

export class ScheduleWriter {

  private app: App;

  private cachedQuery: string = "";

  constructor(app: App) {
    this.app = app;
  }

  static areTwoFilesSame(file1: TFile, file2: TFile) {
    return file1.path === file2.path;
  }

  // TODO: It would be preferred if our plugin could render to a custom ```timeblocking block.
  // as this would ensure data integrity of the rest of the markdown file.
  async writeSchedule(mv : MarkdownView, getTasks: (query:string)=>Promise<TaskExternal[]>) {

    const fileRef = mv.file;
    if (!fileRef) {
      console.error("Obsidian-Time-Blocking: fileRef for MarkdownView is undefined|null. Returning early.");
      return;
    }

    // TODO: in the case that the user has updated some data in the view but autosave has 
    // not kicked-in, we need to force save to get our update schedule settings :)

    let tempTasks = await getTasks(this.cachedQuery);

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

          // get the schedule settings from postamble bit.
          const settingsRegex = /^\s*```javascript([\s\S]*?)(```)/u; // u is for unicode.
          const settingsMatch = textAfterPostambleEof.match(settingsRegex);
          const generateSettingsFuncString = settingsMatch ? settingsMatch[1] : "";
          
          const generateSettingsFunDefault = (moment: any, getTaskStartDate: any, filterSort: any) => {
            const MIN_PER_HOUR = 60;
            const NOON = MIN_PER_HOUR * 12;
            const nullVal = null;
            return {
              scheduleBegin: MIN_PER_HOUR * 9,
              scheduleEnd: NOON + MIN_PER_HOUR * 5,
              viewBegin: nullVal,
              viewEnd: nullVal,
              maxBlockSize: 90,
              minBlockSize: 15,
              blockStepSize: 5,
              defaultBlockSize: 30,
              padding: 15,
              assignTaskBias: (task) => {
                return null;
              },
              query:
`not done 
`,
              descriptionFilter: (description) => {
                const cruftRemoved = description.replace("[[TODO]](Noah):", "");
                const tagsBettered = cruftRemoved.replace(/#([a-zA-Z0-9]+)/g, (match) => {
                  return `**${match}**`;
                });
                return tagsBettered.trim();
              },
              scheduleAlgo: (tasks) => {
                const priorityAlgo = (task) => {
                  if (task.dueDate) {
                    const timeUntilDue = task.dueDate.diff(moment(), "hours");
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
                  // 0 means leave a and b unchanged
                  return priorityAlgo(a) - priorityAlgo(b);
                });
              }
            };
          }
          
          const generateSettingsFun = generateSettingsFuncString ? new Function('moment', 'getTaskStartDate', generateSettingsFuncString) :
            generateSettingsFunDefault;
          const settingsObj : ScheduleSettings = generateSettingsFun(moment, getTaskStartDate, filterSort);
          const settingsObjDefault : ScheduleSettings = generateSettingsFunDefault(moment, getTaskStartDate, filterSort);

          // for those settings that are missing in settingsObj, fill in the gaps using the default settings obj.
          // TODO: can we remove these ignores?
          for (let key of Object.keys(settingsObjDefault)) {
            // @ts-ignore
            if (settingsObj[key] === undefined) {
              // @ts-ignore
              settingsObj[key] = settingsObjDefault[key];
            } 
          }

          // update cachedQuery.
          if (settingsObj.query !== this.cachedQuery) {
            console.warn('Obsidian-Time-Blocking: the query has changed. Using old query this time. Refresh to use new one.');
          }
          this.cachedQuery = settingsObj.query;

          // compute schedule.
          let scheduleAlgorithm : ScheduleAlgorithm = new ScheduleAlgorithm(settingsObj);
          
          const schedule : Schedule = scheduleAlgorithm.makeSchedule(tempTasks);
          const blocks = schedule.blocks;

          let scheduleOut = "";

          // begin with rendering the report.
          scheduleOut += `**Report** = \n`;
          scheduleOut += `\`\`\`json\n${JSON.stringify(schedule.report, null, 2)}\n\`\`\`\n\n`;

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
                const maxTaskChars = 60;
                const editBttn = block.taskUID ? `[${TASK_EDIT_SYMBOL}](.) | ` : `  | `; // Will be borrow renderIdx from complete bttn.
                const editBttnBare = block.taskUID ? `${TASK_EDIT_SYMBOL} | ` : `  | `;
                const completeBttn = block.taskUID ? `[${TASK_SYMBOL}${block.renderIdx}](.) | ` : `  | `;
                const completeBttnBare = block.taskUID ? `${TASK_SYMBOL} | ` : `  | `;
                const timer = (block.duration>0)?
                  `-> [${START_TASK_TIMER_SYMBOL}](https://www.google.com/search?q=timer+${block.duration}+minutes)`: "";
                const timerBare = (block.duration>0)?
                  `-> ${START_TASK_TIMER_SYMBOL}`: "";
                const renderLineBeginBare = `${block.startTime.format("HH:mm")} | ${completeBttnBare}${editBttnBare}}`;
                const renderLineBegin = `*${block.startTime.format("HH:mm")}* | ${completeBttn}${editBttn}`;
                const indentLen = VISIBLE_COUNT(renderLineBeginBare);
                let renderLineTask = `${block.text} ${timer}`;
                let renderLineTaskBare = `${block.textBare} ${timerBare}`;
                // reflow toWriteToSchedule by maxTaskChars and indentLen.
                //console.log('renderLineTask', renderLineTask);
                //console.log('renderLineTaskBare', renderLineTaskBare);
                {
                  if (VISIBLE_COUNT(renderLineTaskBare) > maxTaskChars) {
                    let reflowed = "";
                    let line = "";
                    let lineCount = 0;
                    let words = renderLineTask.split(" ");
                    //console.log('words', words);
                    let wordsBare = renderLineTaskBare.split(" ");
                    //console.log('wordsBare', wordsBare);
                    for (let j = 0; j < words.length && j < wordsBare.length; j++) {
                      if (lineCount + (VISIBLE_COUNT(wordsBare[j]) + 1) > maxTaskChars) {
                        reflowed += line + "\n";
                        line = " ".repeat(indentLen);
                        lineCount = 0;
                      }
                      line += words[j] + " ";
                      lineCount += VISIBLE_COUNT(wordsBare[j]) + 1;
                    }
                    if (VISIBLE_COUNT(line) > 0) {
                      reflowed += line;
                    }
                    renderLineTask = reflowed;
                  }
                }
                scheduleOut += renderLineBegin + renderLineTask + "\n\n";
                if (block.renderIdx >= 0) {
                  taskRegistry.addRenderIdxMapping(block.renderIdx, block.taskUID, block);
                }
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

export function renderTimeblocking(app : App, leafView : MarkdownView | null) {
  const plugin = app.plugins.plugins["obsidian-time-blocking"];
  const scheduleWriter = plugin.scheduleWriter;

  // maybe need to find leafView
  if (!leafView) {
    leafView = app.workspace.getActiveViewOfType(MarkdownView);
  }

  if (!leafView) {
    console.error("Obsidian-Time-Blocking: No active leaf view found, aborting render.");
    return;
  }

  scheduleWriter.writeSchedule(leafView, (query:string) => {
    return new Promise((resolve, reject) => {
      this.app.plugins.plugins["obsidian-tasks-plugin"].oneHotResolveQueryToTasks(query).then((tasks : TaskExternal[]) => {
        console.log("Obsidian-Time-Blocking: ", tasks);
        let tempTasks = Array.from(tasks);
        resolve(tempTasks);
      });
    });
  });
}

export default class ObsidianTimeBlocking extends Plugin {

  settings: ObsidianTimeBlockingSettings;
  
  // TODO: make not public. bad design.
  public scheduleWriter: ScheduleWriter;

  async onunload(): Promise<void> {
    console.log("unloading Obsidian-Time-Blocking plugin...");
    this.app.workspace.off("active-leaf-change", (leaf: WorkspaceLeaf) => {});
  }

  async onload(): Promise<void> {
    console.log("loading Obsidian-Time-Blocking plugin...");

    this.scheduleWriter = new ScheduleWriter(this.app);

    //await this.loadSettings();
    //this.addSettingTab(new ObsidianTimeBlockingSettingTab(this.app, this));

    // this is where the main logic of the plugin goes.
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf: WorkspaceLeaf) => {
        if (leaf.view instanceof MarkdownView) {
          renderTimeblocking(this.app, leaf.view);
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

    taskRegistry.addApp(this.app);

    this.registerEditorExtension(newLivePreviewExtension()); // needed for getting task complete clicks

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
    .setName('Use Google Timer')
    .setDesc(
        'ON: `google.com/search?q=timer...`. OFF: https://github.com/BluBloos/python-timer.',
    )
    .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.useChromeTimer)
          .onChange(async (value) => {
            this.plugin.settings.useChromeTimer = value;
            await this.plugin.saveSettings();
          });
    });
  }
}

// ------------- TESTS TO ADD LATER -------------

/*

1. That the startOn tasks are orderded correctly.
2. The relative ordering between startOn and scheduledOn is correct when same. scheduledOn should come first (higher priority).


*/

// ------------- POST MVP -------------

// TODO: Mobile is broken af - fix that.

// TODO: fix bug where multiple settings tabs are created.

// TODO: add a blacklist setting for files that we ignore any timeblocking sections.

// TODO: maybe add ability to make tasks dependent on each other.

// TODO: hook in default schedule settings into plugin settings page.

// TODO: address the speed issues introduced frrom code mirror crap.

// TODO: hook secondary start timer option - https://github.com/BluBloos/python-timer

// --- SCHEDULE EDITING ---
// TODO: SCHEDULE EDITING (in order):
// - adjust formatting of entire thing to go at the granularity of the block size and put tasks at the block where they begin.

// resolve locks:
// - this considers the already "rendered" schedule for the locks.
// - hook locks into scheduling algo.
// there are a few different locks:
// - lock a slot for any tasks that begin then.
// - lock the endTime of a task.
// - the implicit lock in the recycle bin (which shouldbe? at top for visibility).

// we can do this after impl lock code because we already have "re-navigate to MV to reschedule" option for testing.
// - add manual reschedule button.

// SCHEDULE_HELPER is to help, but things can still be done manually. we hook that first ^.
// - hook the ScheduleHelper into the plugin (need to think)
// - ideally I want this to be like a Copilot where it just tab completes.
// - so there is some timing thing. Like, you type. and maybe you do edits in a continuous stream. this tab completion shows
// only if you stop the stream.
// - is this possible in Ob? there is a "replace text region in file".
// - can I render a list of "replace text region op" as a greyed-out-suggestion-tab-complete-thing?

// TODO: ScheduleHelper:
// - make delete put the task into recycle bin.
// - make copy potentially yank from recycle bin.
// - add reflow of tasks when inserting
// - add implicit lock insertion.

// --- SCHEDULE EDITING ---

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