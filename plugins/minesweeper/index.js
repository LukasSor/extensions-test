let templateHtml = "";
let defaultTheme = "classic";
let defaultDifficulty = "medium";

const THEME_KEYS = new Set(["classic", "dark", "ocean"]);
const DIFFICULTY_KEYS = new Set(["easy", "medium", "hard"]);

const normalizeDefaults = (settings) => {
  const theme = settings?.defaultTheme;
  const difficulty = settings?.defaultDifficulty;

  return {
    theme: typeof theme === "string" && THEME_KEYS.has(theme.trim()) ? theme.trim() : "classic",
    difficulty:
      typeof difficulty === "string" && DIFFICULTY_KEYS.has(difficulty.trim())
        ? difficulty.trim()
        : "medium",
  };
};

const buildHtml = () => {
  const cfg = {
    theme: defaultTheme,
    difficulty: defaultDifficulty,
  };
  const encoded = encodeURIComponent(JSON.stringify(cfg));
  return (templateHtml || "").replace(/\{\{config\}\}/g, encoded);
};

const minesweeperCommand = {
  name: "Minesweeper",
  description:
    "Minesweeper: !minesweeper or !mines. Header shows only Time and Flags, with selectable difficulty (easy/medium/hard) and board theme.",
  trigger: "minesweeper",
  aliases: ["mines"],
  naturalLanguagePhrases: ["minesweeper", "play minesweeper", "mine sweeper"],

  settingsSchema: [
    {
      key: "defaultDifficulty",
      label: "Default difficulty",
      type: "select",
      options: ["easy", "medium", "hard"],
      description: "Starting board size and mine count.",
    },
    {
      key: "defaultTheme",
      label: "Default theme",
      type: "select",
      options: ["classic", "dark", "ocean"],
      description: "Visual style for hidden and revealed tiles.",
    },
  ],

  init(ctx) {
    templateHtml = ctx.template || "";
  },

  configure(settings) {
    const normalized = normalizeDefaults(settings || {});
    defaultTheme = normalized.theme;
    defaultDifficulty = normalized.difficulty;
  },

  async isConfigured() {
    return true;
  },

  async execute() {
    return {
      title: "Minesweeper",
      html: buildHtml(),
    };
  },
};

export default minesweeperCommand;
export { minesweeperCommand as command };
