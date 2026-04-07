/**
 * Result dates — at-a-glance slot that only loads client script/CSS.
 * Badges are injected into each `.result-item` by script.js (all web engines).
 */
let template = "";
let resultDatesEnabled = true;

export const slot = {
  id: "result-dates",
  name: "Result dates",
  description:
    "Shows an inferred date next to each web result when the snippet, title, URL, or <time> contains a parseable date.",
  position: "at-a-glance",

  settingsSchema: [
    {
      key: "enabled",
      label: "Enabled",
      type: "toggle",
      description:
        "Turn off to hide date badges on search results (slot script will not run).",
    },
  ],

  init(ctx) {
    template = ctx.template || "";
  },

  configure(settings) {
    resultDatesEnabled = settings?.enabled !== "false";
  },

  trigger() {
    return resultDatesEnabled;
  },

  async execute() {
    return { html: template || "" };
  },
};

/** Degoog resolves `mod.slot ?? mod.default?.slot` — default must wrap `slot`. */
export default { slot };
