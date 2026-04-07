let templateHtml = "";
let snakeEnabled = true;
let defaultField = "medium";
let defaultSpeed = "snake";
let defaultTheme = "normal";
let defaultFood = "1";

const FIELD_KEYS = new Set(["small", "medium", "large"]);
const SPEED_KEYS = new Set(["turtle", "rabbit", "snake"]);
const THEME_KEYS = new Set([
  "normal",
  "dark",
  "frozen",
  "vulcan",
  "chess",
  "synthwave",
  "catppuccin",
]);

const _normalizeDefaults = (settings) => {
  const f = settings?.defaultField;
  const sp = settings?.defaultSpeed;
  const th = settings?.defaultTheme;
  const fd = settings?.foodOnField;

  return {
    field: FIELD_KEYS.has(f) ? f : "medium",
    speed: SPEED_KEYS.has(sp) ? sp : "snake",
    theme:
      typeof th === "string" && THEME_KEYS.has(th.trim()) ? th.trim() : "normal",
    food:
      fd === "3" || fd === 3 ? "3" : fd === "5" || fd === 5 ? "5" : "1",
  };
};

const _buildHtml = () => {
  const cfg = {
    field: defaultField,
    speed: defaultSpeed,
    theme: defaultTheme,
    food: defaultFood,
  };
  const encoded = encodeURIComponent(JSON.stringify(cfg));
  return (templateHtml || "").replace(/\{\{config\}\}/g, encoded);
};

export default {
  name: "Snake",
  description:
    "Play Snake: use !snake or !snake-game, or enable Natural language (under Plugins, like Weather) to type snake or play snake without the bang.",
  trigger: "snake",
  aliases: ["snake-game"],
  naturalLanguagePhrases: [
    "snake",
    "play snake",
    "snake game",
    "google snake",
  ],

  settingsSchema: [
    {
      key: "enabled",
      label: "Enabled",
      type: "toggle",
      description:
        "Turn off to hide Snake entirely (!snake and natural-language matches will not run).",
    },
    {
      key: "defaultField",
      label: "Default field size",
      type: "select",
      options: ["small", "medium", "large"],
      description:
        "Starting grid (wide × tall): small (9×10), medium (15×17), large (21×24). You can change this in the panel before Start.",
    },
    {
      key: "defaultSpeed",
      label: "Default speed",
      type: "select",
      options: ["turtle", "rabbit", "snake"],
      description:
        "Tick speed: turtle (slow), snake (default), rabbit (fast). Adjustable before Start in the UI.",
    },
    {
      key: "defaultTheme",
      label: "Default theme",
      type: "select",
      options: [
        "normal",
        "dark",
        "frozen",
        "vulcan",
        "chess",
        "synthwave",
        "catppuccin",
      ],
      description:
        "Board and snake colors. Catppuccin follows Mocha-style tones; chess uses a high-contrast checker grid.",
    },
    {
      key: "foodOnField",
      label: "Food pellets on field",
      type: "select",
      options: ["1", "3", "5"],
      description:
        "How many apples exist at once; eating one spawns another until this count is restored (see in-game help).",
    },
  ],

  init(ctx) {
    templateHtml = ctx.template || "";
  },

  configure(settings) {
    snakeEnabled = settings?.enabled !== "false";
    const n = _normalizeDefaults(settings || {});
    defaultField = n.field;
    defaultSpeed = n.speed;
    defaultTheme = n.theme;
    defaultFood = n.food;
  },

  async isConfigured() {
    return true;
  },

  async execute(_args, _context) {
    if (!snakeEnabled) {
      return {
        title: "Snake",
        html: `<div class="command-result"><p>Snake is disabled in Settings &rarr; Plugins &rarr; Snake.</p></div>`,
      };
    }
    return {
      title: "Snake",
      html: _buildHtml(),
    };
  },
};
