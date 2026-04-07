let template = "";
let resultDatesEnabled = true;

export const slot = {
  id: "result-dates",
  name: "Result dates",
  description:
    "Parses dates from titles and snippets and shows a small badge on each web result (all engines).",
  position: "at-a-glance",

  settingsSchema: [
    {
      key: "enabled",
      label: "Enabled",
      type: "toggle",
      description:
        "When on, inferred dates appear next to each result cite line when the snippet or title contains a recognizable date.",
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

export default { slot };
