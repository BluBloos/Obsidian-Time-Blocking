import type { Moment } from 'moment/moment';
import { RRule } from 'rrule';
import { CREATE_MOMENT_LOCAL } from './utils';

export class TaskUID {
    public readonly path: string; // file path
    public readonly sectionIndex: number; // which index
    public readonly taskIndex: number; // which task index in setion
  
    constructor(path: string, sectionIndex: number, taskIndex: number) {
        this.path = path;
        this.sectionIndex = sectionIndex;
        this.taskIndex = taskIndex;
    }
  }
  
export class TaskExternal {
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
    public readonly uid: TaskUID;     
    
    public  recurrenceRrule: RRule | undefined;                  ///< RRule as per the lib.
    public  recurrenceReferenceDate: Moment | undefined | null;  ///< The date after which the recurrence rule applies, may be
                                                                         ///  null if the RRule itself has a ref date,
                                                                         ///  ex) "every Monday".
  
    // NOTE: This piece of a data is not coming from Tasks. patched in at a later time.
    public startTime: number | null;                            // the high granularity time at which the task is scheduled to start.

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
      uid
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
      uid : TaskUID
    }) {
      this.isDone = isDone;
      this.priority = priority;
      this.tags = tags;
      this.originalMarkdown = originalMarkdown;
      this.description = description;
      this.estimatedTimeToComplete = estimatedTimeToComplete;
      this.startDate = CREATE_MOMENT_LOCAL(startDate);
      this.scheduledDate = CREATE_MOMENT_LOCAL(scheduledDate);
      this.dueDate = CREATE_MOMENT_LOCAL(dueDate);
      this.doneDate = CREATE_MOMENT_LOCAL(doneDate);
      this.recurrenceRrule = recurrenceRrule;
      this.recurrenceReferenceDate = CREATE_MOMENT_LOCAL(recurrenceReferenceDate);
      this.uid = uid;
      this.startTime = null;
    }
  
  }