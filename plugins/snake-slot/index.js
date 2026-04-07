import * as core from "./snake-core.js";

export const slot = {
  id: "snake-slot",
  name: "Snake",
  description:
    "Snake mini-game (at-a-glance). Configure here; use !snake via the Snake (!snake) command plugin.",
  position: "at-a-glance",

  settingsSchema: core.SETTINGS_SCHEMA,

  init: (ctx) => core.initTemplate(ctx),

  configure(settings) {
    core.applyConfigure(settings || {});
  },

  trigger(query) {
    return core.slotTrigger(query);
  },

  async execute(query, _context) {
    return core.slotExecute(query);
  },
};

export default { slot };
