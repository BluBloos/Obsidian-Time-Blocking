# Obsidian-Time-Blocking
The official time blocking plugin for Obsidian.

## What does this plugin do for me?

- **Integrates with Tasks plugin. https://obsidian-tasks-group.github.io/obsidian-tasks/.**

> *IMPORTANT*: It currently integrates with a fork of the Tasks plugin.

- **Outputs an optimized schedule of how to complete your tasks in plain-text (with minimal markdown) format.**

- **Updates the schedule automatically as tasks are completed, edited, as new ones are added to the vault, and as
  real-world time advances forward.**

- **Reports if all the tasks can be completed in time.**

> i.e. if there are no tasks that have been scheduled beyond EOD of their due date.

- **Provides controls for each scheduled task.**

> `X` to complete. `E` to edit (open Tasks-plugin edit modal). `🏃‍♂️` to begin a timer with the duration of the task
> (uses your browser). Clicking `X` sometimes opens the modal if the scheduled duration is less than the estimated time
> of completion for that task - clicking `Apply` in the modal works to deplete the estimated time to complete.

- **Allows for user-settings on a per-schedule-render-block basis.**

## How to Use

### How to render a schedule

To render a schedule, place the following within one of your notes.

```text
# begin timeblocking
---
// the schedule gets "rendered" here
---
# end timeblocking
```

### How to alter settings of a schedule

Between the `---` and the `# end timeblocking`, place a Javascript code block.

```javascript
/* This is a regular-old javascript block that gets parsed by the Ob-Time-Blocking plugin. It gets run and "merged" with
default params. "Merging" means that for any params not defined here, default ones are used. You can find the default
params in the plugin source code.

The type of tasks are TaskExternal. See the plugin source for the def of this type.

This code is the body of a function. We get as parameters moment(), getTaskStartDate(), and filterSort(). See the plugin
source for more details. */

const MIN_PER_HOUR = 60;
const NOON = MIN_PER_HOUR * 12;

return {
	scheduleBegin: MIN_PER_HOUR * 5.5,
	scheduleEnd: NOON + MIN_PER_HOUR * 9,
    // the query string to provide to Tasks plugin
    // to get list of tasks to schedule.
	query:
`not done
description includes TODO
path does not include TODO Template
path does not include Weekly Journal Template
tags do not include #someday
`,
	// used to modify desc of task before "rendering".
    descriptionFilter: (description) => {
		const cruftRemoved = description.replace("[[TODO]](Noah):", "");
		const tagsBettered = cruftRemoved.replace(/#([a-zA-Z0-9]+)/g, (match) => {
			return `**${match}**`;
		});
		return tagsBettered.trim();
	},
	// for any task, return when we want to bias it to begin.
    assignTaskBias: (task) => {
		const lunchRe = /\blunch\b/g;
		if (task.description.match(lunchRe)) {
		}
		const runRe = /\brun\b/g
		if (task.description.match(runRe)) {
			return 8.5 * MIN_PER_HOUR;
		}
		return null;
	}
};
```

## Still don't understand the plugin (FAQ)?

- By default, tasks will only ever be scheduled past the current time.
- By default, the view of the schedule will not extend past today.
- There exists the scheduleBegin/End, and the schedule view.
- The begin/End is the region of time _during a single day_ that tasks may be scheduled.
- The viewBegin/End is some (Begin, End] _range of days_ which tasks can be scheduled.

## Okay, cool, how do I use this?

In it's current form, this plugin is best for developers. The documentation is minimal and you will need to _build this
plugin from source_ to use it.

### Build Steps

First, build the Tasks plugin fork and install that into your vault.

Then, build and install this plugin.

```bash
node build.mjs
```

Running the build script will generate a `main.js`. To install the plugin, copy this as well as `manifest.json` to your
Ob vault.