# Obsidian-Time-Blocking
The official time blocking plugin for Obsidian.

## Required Features

- Integrate with Tasks plugin. https://obsidian-tasks-group.github.io/obsidian-tasks/.
- Have a settings page to set what times of the day that tasks may be permissibly scheduled.
- Ical integration. Pull from a users cal to have the automated scheduling work around these existing events.
- Integrate with Toggl track. https://github.com/mcndt/obsidian-toggl-integration.
- The output of scheduling is a plain-text format in daily notes file.
- Modifying the schedule is as easy as modifying this plain-text.
- The automated scheduling goes as far as it needs to into the future to schedule all TODOs.
- The plugin provides feedbcak for if all TODOs can be completed in time. This is done by using Tasks plugin deadline metadata.
- We should be able to visualize the time-blocked regions.
- Obsidian give me notifs for blocks.

## MVP

- integrating with tasks plugin is a must.
- output of scheduling is plain-text format in daily notes file.
- modifying the schedule is as easy as modifying the plain-text.
- The automated scheduling goes as far as it needs to into the future to schedule all TODOs.
- App gives me notifs for schedule.

### Maybe

- conider TODO deadlines and tell user if it was scheduled after.
- don't require a settings page (can just hard-code) but should be easy.

### Drop

- no need to visualize the schedule.
- no need for iCal integration right now.
- no need to integrate with Toggl track right now.
