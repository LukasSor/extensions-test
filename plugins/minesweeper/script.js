(function () {
  const DIFFICULTIES = {
    easy: { cols: 9, rows: 9, mines: 10, maxWidth: "420px" },
    medium: { cols: 16, rows: 16, mines: 40, maxWidth: "640px" },
    hard: { cols: 30, rows: 16, mines: 99, maxWidth: "920px" },
  };

  const THEME_KEYS = new Set(["classic", "dark", "ocean"]);

  const parseConfig = (root) => {
    const raw = root.getAttribute("data-mw-config");
    if (!raw) return {};
    try {
      return JSON.parse(decodeURIComponent(raw)) || {};
    } catch {
      return {};
    }
  };

  const inBounds = (x, y, cols, rows) => x >= 0 && y >= 0 && x < cols && y < rows;

  const eachNeighbor = (x, y, cols, rows, fn) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(nx, ny, cols, rows)) continue;
        fn(nx, ny);
      }
    }
  };

  function boot(root) {
    if (root.dataset.mwBooted === "1") return;
    root.dataset.mwBooted = "1";

    const boardEl = root.querySelector(".mw-board");
    const overlay = root.querySelector("[data-mw-overlay]");
    const panelSettings = root.querySelector('[data-mw-panel="settings"]');
    const panelStatus = root.querySelector('[data-mw-panel="status"]');
    const statusTitle = root.querySelector(".mw-status-title");
    const statusMsg = root.querySelector(".mw-status-msg");
    const timeEl = root.querySelector(".mw-time");
    const flagsEl = root.querySelector(".mw-flags");
    const btnStart = root.querySelector(".mw-start");
    const btnRestart = root.querySelector(".mw-restart");
    const btnOpenSettings = root.querySelector(".mw-open-settings");

    if (
      !boardEl ||
      !overlay ||
      !panelSettings ||
      !panelStatus ||
      !timeEl ||
      !flagsEl ||
      !btnStart ||
      !btnRestart ||
      !btnOpenSettings
    ) {
      return;
    }

    const config = parseConfig(root);
    let difficultyKey = DIFFICULTIES[config.difficulty] ? config.difficulty : "medium";
    let themeKey =
      typeof config.theme === "string" && THEME_KEYS.has(config.theme) ? config.theme : "classic";

    const chipsDifficulty = root.querySelectorAll(".mw-chip-difficulty");
    const chipsTheme = root.querySelectorAll(".mw-chip-theme");

    let cols = DIFFICULTIES.medium.cols;
    let rows = DIFFICULTIES.medium.rows;
    let mines = DIFFICULTIES.medium.mines;
    let board = [];
    let cellButtons = [];
    let minesPlaced = false;
    let revealedSafe = 0;
    let flaggedCount = 0;
    let timerSeconds = 0;
    let timerId = null;
    let mode = "menu";

    const setTheme = () => {
      root.setAttribute("data-mw-theme", themeKey);
    };

    const setCounterText = () => {
      const remainingFlags = Math.max(0, mines - flaggedCount);
      flagsEl.textContent = String(remainingFlags);
      timeEl.textContent = String(Math.max(0, Math.min(999, timerSeconds))).padStart(3, "0");
    };

    const stopTimer = () => {
      if (timerId != null) {
        clearInterval(timerId);
        timerId = null;
      }
    };

    const resetTimer = () => {
      stopTimer();
      timerSeconds = 0;
      setCounterText();
    };

    const startTimer = () => {
      if (timerId != null) return;
      timerId = setInterval(() => {
        timerSeconds = Math.min(999, timerSeconds + 1);
        setCounterText();
      }, 1000);
    };

    const setView = (nextMode, message) => {
      mode = nextMode;
      if (mode === "playing") {
        overlay.hidden = true;
        root.classList.add("mw-slot--playing");
        return;
      }

      overlay.hidden = false;
      root.classList.remove("mw-slot--playing");
      panelSettings.hidden = mode !== "menu";
      panelStatus.hidden = mode !== "won" && mode !== "lost";

      if (mode === "won") {
        statusTitle.textContent = "You won";
        statusMsg.textContent = message || "All safe tiles cleared.";
      } else if (mode === "lost") {
        statusTitle.textContent = "Game over";
        statusMsg.textContent = message || "You hit a mine.";
      }
    };

    const syncChips = () => {
      chipsDifficulty.forEach((chip) => {
        const value = chip.getAttribute("data-mw-difficulty");
        chip.setAttribute("aria-pressed", value === difficultyKey ? "true" : "false");
      });
      chipsTheme.forEach((chip) => {
        const value = chip.getAttribute("data-mw-theme");
        chip.setAttribute("aria-pressed", value === themeKey ? "true" : "false");
      });
    };

    const createBoardData = () => {
      board = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => ({
          mine: false,
          revealed: false,
          flagged: false,
          adj: 0,
        })),
      );
      minesPlaced = false;
      revealedSafe = 0;
      flaggedCount = 0;
    };

    const placeMines = (safeX, safeY) => {
      const blocked = new Set();
      eachNeighbor(safeX, safeY, cols, rows, (nx, ny) => blocked.add(nx + "," + ny));
      blocked.add(safeX + "," + safeY);

      const positions = [];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const key = x + "," + y;
          if (!blocked.has(key)) positions.push({ x, y });
        }
      }

      for (let i = positions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = positions[i];
        positions[i] = positions[j];
        positions[j] = tmp;
      }

      const pickCount = Math.min(mines, positions.length);
      for (let i = 0; i < pickCount; i++) {
        const p = positions[i];
        board[p.y][p.x].mine = true;
      }

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const cell = board[y][x];
          if (cell.mine) continue;
          let count = 0;
          eachNeighbor(x, y, cols, rows, (nx, ny) => {
            if (board[ny][nx].mine) count += 1;
          });
          cell.adj = count;
        }
      }

      minesPlaced = true;
    };

    const paintCell = (x, y) => {
      const cell = board[y][x];
      const btn = cellButtons[y][x];
      if (!btn) return;

      btn.removeAttribute("data-num");
      btn.textContent = "";

      if (mode === "lost" && cell.mine && !cell.flagged) {
        btn.dataset.state = "mine";
        btn.textContent = "*";
        btn.disabled = true;
        btn.setAttribute("aria-label", "Mine");
        return;
      }

      if (cell.revealed) {
        btn.dataset.state = cell.mine ? "mine" : "revealed";
        btn.disabled = true;
        if (cell.mine) {
          btn.textContent = "*";
          btn.setAttribute("aria-label", "Mine");
        } else if (cell.adj > 0) {
          btn.textContent = String(cell.adj);
          btn.dataset.num = String(cell.adj);
          btn.setAttribute("aria-label", "Revealed " + cell.adj);
        } else {
          btn.setAttribute("aria-label", "Revealed empty");
        }
        return;
      }

      btn.disabled = mode !== "playing";
      if (cell.flagged) {
        btn.dataset.state = "flagged";
        btn.textContent = "F";
        btn.setAttribute("aria-label", "Flagged");
      } else {
        btn.dataset.state = "hidden";
        btn.setAttribute("aria-label", "Hidden tile");
      }
    };

    const paintAll = () => {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          paintCell(x, y);
        }
      }
      setCounterText();
    };

    const revealRegion = (startX, startY) => {
      const stack = [{ x: startX, y: startY }];
      while (stack.length > 0) {
        const cur = stack.pop();
        if (!cur) continue;
        const cell = board[cur.y][cur.x];
        if (cell.revealed || cell.flagged) continue;
        cell.revealed = true;
        revealedSafe += 1;

        if (cell.adj !== 0) continue;

        eachNeighbor(cur.x, cur.y, cols, rows, (nx, ny) => {
          const n = board[ny][nx];
          if (n.revealed || n.flagged || n.mine) return;
          stack.push({ x: nx, y: ny });
        });
      }
    };

    const checkWin = () => {
      if (revealedSafe !== cols * rows - mines) return false;
      stopTimer();
      setView("won", "You cleared the field in " + timerSeconds + "s.");
      paintAll();
      return true;
    };

    const loseGame = () => {
      stopTimer();
      setView("lost", "You hit a mine after " + timerSeconds + "s.");
      paintAll();
    };

    const onReveal = (x, y) => {
      if (mode !== "playing") return;
      const cell = board[y][x];
      if (cell.revealed || cell.flagged) return;

      if (!minesPlaced) {
        placeMines(x, y);
        startTimer();
      }

      if (cell.mine) {
        cell.revealed = true;
        loseGame();
        return;
      }

      revealRegion(x, y);
      if (checkWin()) return;
      paintAll();
    };

    const onFlag = (x, y) => {
      if (mode !== "playing") return;
      const cell = board[y][x];
      if (cell.revealed) return;
      if (cell.flagged) {
        cell.flagged = false;
        flaggedCount -= 1;
      } else {
        if (flaggedCount >= mines) return;
        cell.flagged = true;
        flaggedCount += 1;
      }
      paintCell(x, y);
      setCounterText();
    };

    const renderBoard = () => {
      boardEl.innerHTML = "";
      boardEl.style.gridTemplateColumns = "repeat(" + cols + ", minmax(0, 1fr))";
      boardEl.style.maxWidth = DIFFICULTIES[difficultyKey].maxWidth;
      boardEl.style.marginInline = "auto";

      cellButtons = [];
      for (let y = 0; y < rows; y++) {
        const rowButtons = [];
        for (let x = 0; x < cols; x++) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "mw-cell";
          btn.dataset.alt = (x + y) % 2 === 0 ? "0" : "1";
          btn.dataset.x = String(x);
          btn.dataset.y = String(y);
          btn.tabIndex = 0;
          btn.addEventListener("click", () => onReveal(x, y));
          btn.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            onFlag(x, y);
          });
          btn.addEventListener("keydown", (e) => {
            if (e.key === "f" || e.key === "F") {
              e.preventDefault();
              onFlag(x, y);
            }
          });
          boardEl.appendChild(btn);
          rowButtons.push(btn);
        }
        cellButtons.push(rowButtons);
      }
    };

    const setupBoard = () => {
      const cfg = DIFFICULTIES[difficultyKey] || DIFFICULTIES.medium;
      cols = cfg.cols;
      rows = cfg.rows;
      mines = cfg.mines;
      createBoardData();
      renderBoard();
      setCounterText();
      paintAll();
    };

    const startRun = () => {
      resetTimer();
      setView("playing");
      setupBoard();
      paintAll();
    };

    chipsDifficulty.forEach((chip) => {
      chip.addEventListener("click", () => {
        const value = chip.getAttribute("data-mw-difficulty");
        if (!value || !DIFFICULTIES[value] || mode === "playing") return;
        difficultyKey = value;
        syncChips();
        setupBoard();
      });
    });

    chipsTheme.forEach((chip) => {
      chip.addEventListener("click", () => {
        const value = chip.getAttribute("data-mw-theme");
        if (!value || !THEME_KEYS.has(value)) return;
        themeKey = value;
        setTheme();
        syncChips();
      });
    });

    btnStart.addEventListener("click", () => startRun());
    btnRestart.addEventListener("click", () => startRun());
    btnOpenSettings.addEventListener("click", () => {
      stopTimer();
      resetTimer();
      setView("menu");
      setupBoard();
    });

    boardEl.addEventListener("contextmenu", (e) => e.preventDefault());

    setTheme();
    syncChips();
    resetTimer();
    setupBoard();
    setView("menu");
  }

  function scan() {
    document.querySelectorAll(".mw-slot").forEach(boot);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan);
  } else {
    scan();
  }

  const observer = new MutationObserver(() => scan());
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
