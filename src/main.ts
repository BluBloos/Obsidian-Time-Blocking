import {
  App,
  addIcon,
  FileView,
  Plugin,
  TFile,
  WorkspaceLeaf,
  Notice,
  PluginSettingTab,
  Setting,
} from "obsidian";

addIcon(
  "extract",
  '<path d="M16 71.25L16 24.5C16 19.8056 19.8056 16 24.5' +
    "16L71.25 16C75.9444 16 79.75 19.8056 79.75 24.5L79.75 41.5L71.25" +
    "41.5L71.25 24.5L24.5 24.5L24.5 71.25L41.5 71.25L41.5 79.75L24.5" +
    "79.75C19.8056 79.75 16 75.9444 16 71.25ZM42.7452 48.725L48.7547" +
    "42.7325L75.5 69.4778L75.5 54.25L84 54.25L84 84L54.25 84L54.25" +
    '75.5L69.4862 75.5L42.7452 48.725Z" fill="white" fill-opacity="0.5"/>'
);

// interface seems to be a Typescript thing.
interface ObsidianTimeBlockingSettings {
  scheduleBegin: string;
  scheduleEnd: string;
}

const DEFAULT_SETTINGS: ObsidianTimeBlockingSettings = {
    scheduleBegin: "08:00",
    scheduleEnd: "18:00"
};

export default class ObsidianTimeBlocking extends Plugin {
  settings: ObsidianTimeBlockingSettings;
  /**
   /// Unload Obsidian-PDF state.
   */
  async unload(): Promise<void> {
    this.app.workspace.off("active-leaf-change", (leaf: WorkspaceLeaf) => {});
  }

  /**
   * Hook into Obsidian callbacks to support runtime behaviour of Obsidian-PDF.
   */
  async onload(): Promise<void> {

    console.log("loading Obsidian-Time-Blocking plugin...");

    await this.loadSettings();
    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new ObsidianTimeBlockingSettingTab(this.app, this));
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf: WorkspaceLeaf) => {})
    );

    let tasks = await this.app.plugins.plugins['obsidian-tasks-plugin'].oneHotResolveQueryToTasks(
`not done 
description includes TODO 
path does not include TODO Template 
tags include #P1 
`
    ).then((tasks) => { console.log(tasks); console.log("done loading Obsidian-Time-Blocking plugin."); });
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
      .setDesc("time in HH:MM (24h) format after which tasks may be scheduled in a day")
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
      .setDesc("time in HH:MM (24h) format before which tasks must be scheduled in a day")
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