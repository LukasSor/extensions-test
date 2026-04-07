import * as core from "./snake-core.js";

export default {
  name: "Snake (!snake)",
  description:
    "Run !snake or !snake-game. Defaults and toggles: Settings -> Snake (slot).",
  trigger: "snake",
  aliases: ["snake-game"],

  settingsSchema: [],

  init: (ctx) => core.initTemplate(ctx),

  configure() {},

  async execute(_args, _context) {
    return core.commandExecute();
  },
};
