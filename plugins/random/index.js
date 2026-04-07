let templateHtml = "";

const _buildHtml = () => templateHtml || "";

export default {
  name: "Random number",
  description:
    "Random number in a card: !random or !rng. Set min/max, optional decimals, and decimal places; fractional results use a comma. Generate on demand.",
  trigger: "random",
  aliases: ["rng", "rand"],
  naturalLanguagePhrases: [
    "random number",
    "pick a random number",
    "generate random number",
    "number between",
  ],

  settingsSchema: [],

  init(ctx) {
    templateHtml = ctx.template || "";
  },

  async isConfigured() {
    return true;
  },

  async execute() {
    return {
      title: "Random number",
      html: _buildHtml(),
    };
  },
};
