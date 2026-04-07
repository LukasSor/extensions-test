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
]);

const _matchesSnakeQuery = (raw) => {
  const q = raw.trim();
  if (q.length < 3 || q.length > 48) return false;
  if (/^\s*(play\s+)?snake(\s+game)?\s*$/i.test(q)) return true;
  if (/^\s*google\s+snake\s*$/i.test(q)) return true;
  return false;
};

const _normalizeSettings = (settings) => {
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

export const slot = {
  id: "snake-slot",
  name: "Snake",
  description: "Play Snake from the search bar (e.g. type “snake” or “play snake”).",
  position: "at-a-glance",

  settingsSchema: [
    {
      key: "enabled",
      label: "Enabled",
      type: "toggle",
      description: "Show the Snake game when the search matches snake / play snake.",
    },
    {
      key: "defaultField",
      label: "Default field size",
      type: "select",
      options: ["small", "medium", "large"],
      description: "Initial grid size in the game panel (can be changed before Start).",
    },
    {
      key: "defaultSpeed",
      label: "Default speed",
      type: "select",
      options: ["turtle", "rabbit", "snake"],
      description: "Snake = default pace between turtle and rabbit.",
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
      ],
      description: "Colors for grid, snake, and food.",
    },
    {
      key: "foodOnField",
      label: "Food pellets on field",
      type: "select",
      options: ["1", "3", "5"],
      description:
        "How many pellets exist at once; eating one spawns another until this count is restored.",
    },
  ],

  async init(ctx) {
    if (ctx.readFile) {
      templateHtml = await ctx.readFile("template.html");
    }
  },

  configure(settings) {
    snakeEnabled = settings?.enabled !== "false";
    const n = _normalizeSettings(settings || {});
    defaultField = n.field;
    defaultSpeed = n.speed;
    defaultTheme = n.theme;
    defaultFood = n.food;
  },

  trigger(query) {
    if (!snakeEnabled) return false;
    return _matchesSnakeQuery(query);
  },

  async execute() {
    const cfg = {
      field: defaultField,
      speed: defaultSpeed,
      theme: defaultTheme,
      food: defaultFood,
    };
    const encoded = encodeURIComponent(JSON.stringify(cfg));

    const html = (templateHtml || "").replace(/\{\{config\}\}/g, encoded);

    return { title: "Snake", html };
  },
};

export default { slot };
