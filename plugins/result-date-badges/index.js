/**
 * Result dates — at-a-glance slot that only loads client script/CSS.
 * Badges are injected into each `.result-item` by script.js (all web engines).
 */
let template = "";
let resultDatesEnabled = true;

export const slot = {
  id: "result-date-badges",
  name: "Result date badges",
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

/** Named export is enough; default wrapper kept for tooling. */
export const slotPlugin = slot;

export default { slot };
