let templateHtml = "";

const _buildHtml = () => templateHtml || "";

export default {
  name: "Coin flip",
  description:
    "Flip a coin: use !coinflip or !flip. Card UI with a 3D spin; result shows under the coin. Spin again without leaving the page.",
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
