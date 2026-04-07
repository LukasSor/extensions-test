let templateHtml = "";
let snakeEnabled = true;
let naturalLanguageEnabled = false;
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

const _matchesSnakeQuery = (raw) => {
  const q = raw.trim();
  if (q.length < 3 || q.length > 48) return false;
  if (/^\s*(play\s+)?snake(\s+game)?\s*$/i.test(q)) return true;
  if (/^\s*google\s+snake\s*$/i.test(q)) return true;
  return false;
};

const _isBangSnake = (qRaw) => /^!\s*snake(-game)?(\s|$)/i.test(qRaw.trim());

const _fromBang = (qRaw) => qRaw.trim().startsWith("!");

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

const _applyConfigure = (settings) => {
  snakeEnabled = settings?.enabled !== "false";
  naturalLanguageEnabled =
    settings?.naturalLanguage === true || settings?.naturalLanguage === "true";
  const n = _normalizeSettings(settings || {});
  defaultField = n.field;
  defaultSpeed = n.speed;
  defaultTheme = n.theme;
  defaultFood = n.food;
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

async function _initTemplate(ctx) {
  if (ctx.readFile && !templateHtml) {
    templateHtml = await ctx.readFile("template.html");
  }
}

const SETTINGS_SCHEMA = [
  {
    key: "enabled",
    label: "Enabled",
    type: "toggle",
    description: "Turn off to disable Snake entirely.",
  },
  {
    key: "naturalLanguage",
    label: "Natural language in search",
    type: "toggle",
    description:
      "When on, plain searches like \"snake\" open the game in results. When off, use !snake, !snake-game, or the exact words snake / snake-game as the whole query.",
  },
  {
    key: "defaultField",
    label: "Default field size",
    type: "select",
    options: ["small", "medium", "large"],
    description: "Initial grid size (change before Play).",
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
      "catppuccin",
    ],
    description: "Board and snake colors (Catppuccin ~ Mocha tones).",
  },
  {
    key: "foodOnField",
    label: "Food pellets on field",
    type: "select",
    options: ["1", "3", "5"],
    description:
      "Pellets on the board at once; eating one spawns another until this count is restored.",
  },
];

/**
 * Slot plugin (same shape as math-slot / tmdb-slot: export const slot, trigger is a function).
 * Dual export: default = BangCommand so !snake uses /api/command (see commands/registry.ts).
 */
export const slot = {
  id: "snake-slot",
  name: "Snake",
  description:
    "Snake mini-game in search results. Use !snake / !snake-game (command) or match the search query (optional natural language).",
  position: "at-a-glance",

  settingsSchema: SETTINGS_SCHEMA,

  init: _initTemplate,

  configure(settings) {
    _applyConfigure(settings || {});
  },

  trigger(query) {
    if (!snakeEnabled) return false;
    const q = query.trim();
    if (!q) return false;
    if (_isBangSnake(q)) return true;
    if (!naturalLanguageEnabled) {
      if (!_matchesSnakeQuery(q)) return false;
      const only = q.toLowerCase();
      return only === "snake" || only === "snake-game";
    }
    return _matchesSnakeQuery(q);
  },

  async execute(query, _context) {
    if (!snakeEnabled) {
      return {
        title: "Snake",
        html: `<div class="snake-slot snake-slot--disabled"><p class="snake-disabled-msg">Snake is disabled in plugin settings.</p></div>`,
      };
    }

    const qRaw = query.trim();
    const bang = _fromBang(qRaw);

    if (!naturalLanguageEnabled) {
      if (!bang && _matchesSnakeQuery(qRaw)) {
        const only = qRaw.trim().toLowerCase();
        if (only !== "snake" && only !== "snake-game") {
          return { title: "", html: "" };
        }
      }
      if (!bang && qRaw !== "" && !_matchesSnakeQuery(qRaw)) {
        return { title: "", html: "" };
      }
    } else if (!bang && qRaw !== "" && !_matchesSnakeQuery(qRaw)) {
      return { title: "", html: "" };
    }

    return { title: "Snake", html: _buildHtml() };
  },
};

export default {
  name: "Snake (!snake)",
  description:
    "Run !snake or !snake-game for the game. Defaults: Settings -> Plugins -> Snake (slot).",
  trigger: "snake",
  aliases: ["snake-game"],

  settingsSchema: [],

  init: _initTemplate,

  configure() {},

  async execute(_args, _context) {
    if (!snakeEnabled) {
      return {
        title: "Snake",
        html: `<div class="command-result"><p>Snake is disabled. Enable it under Settings -> Snake (slot).</p></div>`,
      };
    }
    return { title: "Snake", html: _buildHtml() };
  },
};
