(function () {
  const FIELD_DIM = { small: 12, medium: 18, large: 26 };
  const SPEED_MS = { turtle: 220, rabbit: 95, snake: 145 };

  const THEMES = {
    normal: {
      bg: "#14532d",
      grid: "#166534",
      snake: "#bbf7d0",
      head: "#f0fdf4",
      food: "#facc15",
      chess: false,
    },
    dark: {
      bg: "#18181b",
      grid: "#27272a",
      snake: "#6ee7b7",
      head: "#d1fae5",
      food: "#fb7185",
      chess: false,
    },
    frozen: {
      bg: "#0c4a6e",
      grid: "#075985",
      snake: "#7dd3fc",
      head: "#f0f9ff",
      food: "#bae6fd",
      chess: false,
    },
    vulcan: {
      bg: "#422006",
      grid: "#78350f",
      snake: "#fdba74",
      head: "#ffedd5",
      food: "#dc2626",
      chess: false,
    },
    chess: {
      bg: "#404040",
      grid: "#525252",
      snake: "#22c55e",
      head: "#86efac",
      food: "#ef4444",
      chess: true,
    },
    synthwave: {
      bg: "#2d1b4e",
      grid: "#4c1d95",
      snake: "#f472b6",
      head: "#fce7f3",
      food: "#38bdf8",
      chess: false,
    },
  };

  const _parseConfig = (el) => {
    const raw = el.getAttribute("data-snake-config");
    if (!raw) return {};
    try {
      return JSON.parse(decodeURIComponent(raw)) || {};
    } catch {
      return {};
    }
  };

  const _key = (x, y) => x + "," + y;

  function boot(root) {
    if (root.dataset.snakeBooted === "1") return;
    root.dataset.snakeBooted = "1";

    const canvas = root.querySelector(".snake-canvas");
    const btnPlay = root.querySelector(".snake-play");
    const btnSettings = root.querySelector(".snake-settings-toggle");
    const panel = root.querySelector("[data-snake-settings]");
    const selField = root.querySelector(".snake-select-field");
    const selSpeed = root.querySelector(".snake-select-speed");
    const selTheme = root.querySelector(".snake-select-theme");
    const selFood = root.querySelector(".snake-select-food");
    const elScore = root.querySelector(".snake-score");
    const elStatus = root.querySelector(".snake-status");

    if (!canvas || !btnPlay || !panel) return;

    const cfg = _parseConfig(root);
    if (cfg.field && selField) selField.value = cfg.field;
    if (cfg.speed && selSpeed) selSpeed.value = cfg.speed;
    if (cfg.theme && selTheme) selTheme.value = cfg.theme;
    if (cfg.food && selFood) selFood.value = String(cfg.food);

    let timer = null;
    let snake = [];
    let dir = { x: 1, y: 0 };
    let pendingDir = null;
    const foods = new Set();
    let score = 0;
    let running = false;

    let grid = 18;

    const setSettingsOpen = (open) => {
      if (open) {
        panel.setAttribute("data-snake-settings-collapsed", "false");
        if (btnSettings) {
          btnSettings.setAttribute("aria-expanded", "true");
        }
      } else {
        panel.setAttribute("data-snake-settings-collapsed", "true");
        if (btnSettings) {
          btnSettings.setAttribute("aria-expanded", "false");
        }
      }
    };

    const setPlayingUi = (playing) => {
      if (playing) {
        root.classList.add("snake-slot--playing");
        setSettingsOpen(false);
        btnPlay.textContent = "Restart";
        if (btnSettings) btnSettings.disabled = true;
      } else {
        root.classList.remove("snake-slot--playing");
        btnPlay.textContent = "Start";
        if (btnSettings) btnSettings.disabled = false;
      }
    };

    const getTheme = () =>
      THEMES[selTheme && selTheme.value] || THEMES.normal;

    const getFoodTarget = () => {
      const v = selFood ? parseInt(selFood.value, 10) : 1;
      return v === 3 || v === 5 ? v : 1;
    };

    const occupied = () => {
      const s = new Set();
      for (const seg of snake) s.add(_key(seg.x, seg.y));
      return s;
    };

    const resizeCanvas = () => {
      const wrap = canvas.parentElement;
      const maxPx = wrap
        ? Math.min(360, wrap.clientWidth || 360)
        : 360;
      const dpr =
        typeof window.devicePixelRatio === "number"
          ? window.devicePixelRatio
          : 1;
      const gs = grid;
      const cell = Math.max(6, Math.floor(maxPx / gs));
      const px = cell * gs;
      canvas.width = Math.floor(px * dpr);
      canvas.height = Math.floor(px * dpr);
      canvas.style.width = px + "px";
      canvas.style.height = px + "px";
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx, cell, px };
    };

    const draw = () => {
      const { ctx, cell } = resizeCanvas();
      if (!ctx) return;
      const th = getTheme();
      const g = grid;
      ctx.fillStyle = th.bg;
      ctx.fillRect(0, 0, g * cell, g * cell);

      for (let y = 0; y < g; y++) {
        for (let x = 0; x < g; x++) {
          if (th.chess) {
            ctx.fillStyle =
              (x + y) % 2 === 0 ? "#f5f5f5" : "#171717";
            ctx.fillRect(x * cell, y * cell, cell, cell);
          } else {
            ctx.strokeStyle = th.grid;
            ctx.lineWidth = 1;
            ctx.strokeRect(
              x * cell + 0.5,
              y * cell + 0.5,
              cell - 1,
              cell - 1,
            );
          }
        }
      }

      for (const f of foods) {
        const [fx, fy] = f.split(",").map(Number);
        ctx.fillStyle = th.food;
        const pad = Math.max(1, cell * 0.15);
        ctx.beginPath();
        ctx.arc(
          fx * cell + cell / 2,
          fy * cell + cell / 2,
          cell / 2 - pad,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }

      for (let i = 0; i < snake.length; i++) {
        const seg = snake[i];
        const isHead = i === snake.length - 1;
        ctx.fillStyle = isHead ? th.head : th.snake;
        const inset = Math.max(0, Math.floor(cell * 0.08));
        ctx.fillRect(
          seg.x * cell + inset,
          seg.y * cell + inset,
          cell - inset * 2,
          cell - inset * 2,
        );
      }
    };

    const spawnFood = () => {
      const occ = occupied();
      for (const f of foods) occ.add(f);
      const empty = [];
      for (let y = 0; y < grid; y++) {
        for (let x = 0; x < grid; x++) {
          if (!occ.has(_key(x, y))) empty.push({ x, y });
        }
      }
      if (empty.length === 0) return false;
      const pick = empty[Math.floor(Math.random() * empty.length)];
      foods.add(_key(pick.x, pick.y));
      return true;
    };

    const replenishFood = () => {
      const target = getFoodTarget();
      while (foods.size < target) {
        if (!spawnFood()) break;
      }
    };

    const resetGame = () => {
      grid = FIELD_DIM[(selField && selField.value) || "medium"] || 18;
      const cx = Math.floor(grid / 2);
      const cy = Math.floor(grid / 2);
      snake = [
        { x: cx - 2, y: cy },
        { x: cx - 1, y: cy },
        { x: cx, y: cy },
      ];
      dir = { x: 1, y: 0 };
      pendingDir = null;
      foods.clear();
      score = 0;
      if (elScore) elScore.textContent = "0";
      if (elStatus) elStatus.textContent = "";
      replenishFood();
      draw();
    };

    const gameOver = (msg) => {
      running = false;
      if (timer != null) {
        clearInterval(timer);
        timer = null;
      }
      setPlayingUi(false);
      setSettingsOpen(true);
      if (elStatus) {
        elStatus.textContent =
          msg ||
          "Game over — change settings if you like, then Start.";
      }
      draw();
    };

    const tick = () => {
      if (!running) return;
      if (pendingDir) {
        if (!(pendingDir.x === -dir.x && pendingDir.y === -dir.y)) {
          dir = pendingDir;
        }
        pendingDir = null;
      }
      const head = snake[snake.length - 1];
      const nx = head.x + dir.x;
      const ny = head.y + dir.y;
      if (nx < 0 || ny < 0 || nx >= grid || ny >= grid) {
        gameOver("Hit the wall.");
        return;
      }
      const nk = _key(nx, ny);
      const onFood = foods.has(nk);
      for (let i = 0; i < snake.length; i++) {
        const seg = snake[i];
        if (!onFood && i === 0) continue;
        if (seg.x === nx && seg.y === ny) {
          gameOver("Ran into yourself.");
          return;
        }
      }
      snake.push({ x: nx, y: ny });
      if (onFood) {
        foods.delete(nk);
        score += 1;
        if (elScore) elScore.textContent = String(score);
        replenishFood();
      } else {
        snake.shift();
      }
      draw();
    };

    const startGame = () => {
      if (timer != null) {
        clearInterval(timer);
        timer = null;
      }
      resetGame();
      running = true;
      setPlayingUi(true);
      if (elStatus) elStatus.textContent = "Go!";
      canvas.tabIndex = 0;
      canvas.focus();
      const spd =
        SPEED_MS[(selSpeed && selSpeed.value) || "snake"] || SPEED_MS.snake;
      timer = setInterval(tick, spd);
    };

    btnPlay.addEventListener("click", startGame);

    if (btnSettings) {
      btnSettings.addEventListener("click", () => {
        if (running) return;
        const collapsed =
          panel.getAttribute("data-snake-settings-collapsed") === "true";
        setSettingsOpen(collapsed);
      });
    }

    const onKey = (e) => {
      if (!running) return;
      let nd = null;
      if (e.key === "ArrowUp") nd = { x: 0, y: -1 };
      else if (e.key === "ArrowDown") nd = { x: 0, y: 1 };
      else if (e.key === "ArrowLeft") nd = { x: -1, y: 0 };
      else if (e.key === "ArrowRight") nd = { x: 1, y: 0 };
      if (nd) {
        e.preventDefault();
        pendingDir = nd;
      }
    };
    canvas.addEventListener("keydown", onKey);
    canvas.addEventListener("click", () => {
      if (running) canvas.focus();
    });

    window.addEventListener("resize", () => {
      draw();
    });

    panel.setAttribute("data-snake-settings-collapsed", "false");
    if (btnSettings) btnSettings.setAttribute("aria-expanded", "true");
    resetGame();
  }

  function scan() {
    document.querySelectorAll(".snake-slot:not(.snake-slot--disabled)").forEach(boot);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan);
  } else {
    scan();
  }

  const mo = new MutationObserver(() => scan());
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
