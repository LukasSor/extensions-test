let templateHtml = "";

const _buildHtml = () => templateHtml || "";

export default {
  name: "Coin flip",
  description:
    "Flip a coin: use !coinflip or !flip. 3D spin with illustrated SVG coin (portrait on heads, numeral on tails). Spin again without leaving the page.",
  trigger: "coinflip",
  aliases: ["flip"],
  naturalLanguagePhrases: [
    "coin flip",
    "flip a coin",
    "toss a coin",
    "heads or tails",
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
      title: "Coin flip",
      html: _buildHtml(),
    };
  },
};
