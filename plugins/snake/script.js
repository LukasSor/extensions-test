(function () {
  /** Width (x) × height (y); width is always the larger side on each preset. */
  const FIELD_DIM = {
    small: { w: 10, h: 9 },
    medium: { w: 17, h: 15 },
    large: { w: 24, h: 21 },
  };
  const SPEED_MS = { turtle: 220, rabbit: 95, snake: 145 };
  const DIR_QUEUE_MAX = 3;

  const THEMES = {
    normal: {
      boardA: "#157f4c",
      boardB: "#136b41",
      snake: "#bbf7d0",
      head: "#86efac",
      food: "#facc15",
      chess: false,
      eyeWhite: "#ffffff",
      eyePupil: "#1e3a8a",
    },
    dark: {
      boardA: "#1f1f23",
      boardB: "#2a2a30",
      snake: "#6ee7b7",
      head: "#34d399",
      food: "#fb7185",
      chess: false,
      eyeWhite: "#f4f4f5",
      eyePupil: "#3b82f6",
    },
    frozen: {
      boardA: "#0e5f8a",
      boardB: "#0c4a6e",
      snake: "#7dd3fc",
      head: "#38bdf8",
      food: "#e0f2fe",
      chess: false,
      eyeWhite: "#f8fafc",
      eyePupil: "#1d4ed8",
    },
    vulcan: {
      boardA: "#5c2e16",
      boardB: "#4a250f",
      snake: "#fdba74",
      head: "#fb923c",
      food: "#fca5a5",
      chess: false,
      eyeWhite: "#fff7ed",
      eyePupil: "#7c2d12",
    },
    chess: {
      boardA: "#fafafa",
      boardB: "#171717",
      snake: "#15803d",
      head: "#22c55e",
      food: "#dc2626",
      chess: true,
      eyeWhite: "#ffffff",
      eyePupil: "#1e40af",
    },
    synthwave: {
      boardA: "#3d2a5c",
      boardB: "#2f1f4a",
      snake: "#f472b6",
      head: "#e879f9",
      food: "#38bdf8",
      chess: false,
      eyeWhite: "#fdf4ff",
      eyePupil: "#7c3aed",
    },
    catppuccin: {
      boardA: "#242438",
      boardB: "#1e1e2e",
      snake: "#a6e3a1",
      head: "#94e2d5",
      food: "#fab387",
      chess: false,
      eyeWhite: "#dce0e8",
      eyePupil: "#89b4fa",
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

  /** Eyes on the tube head (center of head cell, offset toward travel direction). */
  function _drawHeadFace(ctx, seg, cell, dir, th) {
    const mx = seg.x * cell + cell * 0.5;
    const my = seg.y * cell + cell * 0.5;
    const s = cell;
    const forward = s * 0.2;
    const eyeR = Math.max(1.5, s * 0.1);
    const pupilR = Math.max(1, eyeR * 0.4);
    const eyeSpread = s * 0.12;
    const pupilNudge = Math.max(0.55, eyeR * 0.32);

    const disc = (cx, cy, r, fill) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    };

    let c1x, c1y, c2x, c2y;
    let ux, uy;
    if (dir.x === 1) {
      c1x = mx + forward;
      c1y = my - eyeSpread;
      c2x = mx + forward;
      c2y = my + eyeSpread;
      ux = 1;
      uy = 0;
    } else if (dir.x === -1) {
      c1x = mx - forward;
      c1y = my - eyeSpread;
      c2x = mx - forward;
      c2y = my + eyeSpread;
      ux = -1;
      uy = 0;
    } else if (dir.y === -1) {
      c1x = mx - eyeSpread;
      c1y = my - forward;
      c2x = mx + eyeSpread;
      c2y = my - forward;
      ux = 0;
      uy = -1;
    } else {
      c1x = mx - eyeSpread;
      c1y = my + forward;
      c2x = mx + eyeSpread;
      c2y = my + forward;
      ux = 0;
      uy = 1;
    }

    disc(c1x, c1y, eyeR, th.eyeWhite);
    disc(c2x, c2y, eyeR, th.eyeWhite);
    disc(c1x + ux * pupilNudge, c1y + uy * pupilNudge, pupilR, th.eyePupil);
    disc(c2x + ux * pupilNudge, c2y + uy * pupilNudge, pupilR, th.eyePupil);
  }

  function boot(root) {
    if (root.dataset.snakeBooted === "1") return;
    root.dataset.snakeBooted = "1";

    const canvas = root.querySelector(".snake-canvas");
    const overlay = root.querySelector("[data-snake-overlay]");
    const panelSettings = root.querySelector('[data-snake-panel="settings"]');
    const panelPause = root.querySelector('[data-snake-panel="pause"]');
    const panelDeath = root.querySelector('[data-snake-panel="death"]');
    const btnToolbarPause = root.querySelector("[data-snake-pause-btn]");
    const btnStart = root.querySelector(".snake-start");
    const btnSettingsBack = root.querySelector(".snake-settings-back");
    const btnPauseResume = root.querySelector(".snake-pause-resume");
    const btnPauseOpenSettings = root.querySelector(".snake-pause-open-settings");
    const btnDeathRestart = root.querySelector(".snake-death-restart");
    const btnDeathSettings = root.querySelector(".snake-death-settings");
    const elDeathMsg = root.querySelector(".snake-death-msg");
    const elScore = root.querySelector(".snake-score");

    if (!canvas || !btnStart || !panelSettings || !panelDeath || !overlay || !panelPause) return;

    const cfg = _parseConfig(root);
    const FIELD_KEYS = new Set(["small", "medium", "large"]);
    const SPEED_KEYS = new Set(["turtle", "rabbit", "snake"]);
    const THEME_KEYS = new Set(Object.keys(THEMES));
    const FOOD_KEYS = new Set(["1", "3", "5"]);

    let fieldKey = FIELD_KEYS.has(cfg.field) ? cfg.field : "medium";
    let speedKey = SPEED_KEYS.has(cfg.speed) ? cfg.speed : "snake";
    let themeKey = THEME_KEYS.has(cfg.theme) ? cfg.theme : "normal";
    let foodKey = FOOD_KEYS.has(String(cfg.food)) ? String(cfg.food) : "1";

    const chipsField = root.querySelectorAll(".snake-chip-field");
    const chipsSpeed = root.querySelectorAll(".snake-chip-speed");
    const chipsFood = root.querySelectorAll(".snake-chip-food");
    const chipsTheme = root.querySelectorAll(".snake-chip-theme");

    const syncChips = () => {
      chipsField.forEach((b) => {
        const v = b.getAttribute("data-snake-field");
        b.setAttribute("aria-pressed", v === fieldKey ? "true" : "false");
      });
      chipsSpeed.forEach((b) => {
        const v = b.getAttribute("data-snake-speed");
        b.setAttribute("aria-pressed", v === speedKey ? "true" : "false");
      });
      chipsFood.forEach((b) => {
        const v = b.getAttribute("data-snake-food");
        b.setAttribute("aria-pressed", v === foodKey ? "true" : "false");
      });
      chipsTheme.forEach((b) => {
        const v = b.getAttribute("data-snake-theme");
        b.setAttribute("aria-pressed", v === themeKey ? "true" : "false");
      });
    };

    chipsField.forEach((b) => {
      b.addEventListener("click", () => {
        const v = b.getAttribute("data-snake-field");
        if (v && FIELD_KEYS.has(v)) {
          fieldKey = v;
          syncChips();
          if (!running && uiMode !== "paused") resetGame();
        }
      });
    });
    chipsSpeed.forEach((b) => {
      b.addEventListener("click", () => {
        const v = b.getAttribute("data-snake-speed");
        if (v && SPEED_KEYS.has(v)) {
          speedKey = v;
          syncChips();
        }
      });
    });
    chipsFood.forEach((b) => {
      b.addEventListener("click", () => {
        const v = b.getAttribute("data-snake-food");
        if (v && FOOD_KEYS.has(v)) {
          foodKey = v;
          syncChips();
          if (!running && uiMode !== "paused") resetGame();
        }
      });
    });
    chipsTheme.forEach((b) => {
      b.addEventListener("click", () => {
        const v = b.getAttribute("data-snake-theme");
        if (v && THEME_KEYS.has(v)) {
          themeKey = v;
          syncChips();
          if (!running) draw();
        }
      });
    });

    syncChips();

    /** playing | menu | death | paused */
    let uiMode = "menu";
    /** When paused: main strip vs settings sheet */
    let pauseSub = "main";

    let timer = null;
    let snake = [];
    let dir = { x: 1, y: 0 };
    /** Queued directions (max DIR_QUEUE_MAX); each tick consumes one if legal. */
    const dirQueue = [];
    const foods = new Set();
    let score = 0;
    let running = false;
    let gridW = 17;
    let gridH = 15;

    const getTheme = () => THEMES[themeKey] || THEMES.normal;

    const getFoodTarget = () => {
      const v = parseInt(foodKey, 10);
      return v === 3 || v === 5 ? v : 1;
    };

    const occupied = () => {
      const s = new Set();
      for (const seg of snake) s.add(_key(seg.x, seg.y));
      return s;
    };

    const queueDir = (nd) => {
      if (!running) return;
      const last = dirQueue.length ? dirQueue[dirQueue.length - 1] : dir;
      if (nd.x === -last.x && nd.y === -last.y) return;
      while (dirQueue.length >= DIR_QUEUE_MAX) dirQueue.shift();
      dirQueue.push(nd);
    };

    const applyUi = () => {
      if (uiMode === "playing") {
        overlay.hidden = true;
        if (btnToolbarPause) btnToolbarPause.hidden = false;
        root.classList.add("snake-slot--playing");
        return;
      }

      overlay.hidden = false;
      if (btnToolbarPause) btnToolbarPause.hidden = true;
      root.classList.remove("snake-slot--playing");

      const deathOn = uiMode === "death";
      const pauseMain = uiMode === "paused" && pauseSub === "main";
      const pauseSettings = uiMode === "paused" && pauseSub === "settings";
      const menuOn = uiMode === "menu";

      panelDeath.hidden = !deathOn;
      panelPause.hidden = !pauseMain;
      panelSettings.hidden = !(menuOn || pauseSettings);

      if (btnSettingsBack) btnSettingsBack.hidden = !pauseSettings;
      if (btnStart) btnStart.hidden = !menuOn;
    };

    const setView = (v) => {
      uiMode = v;
      if (v !== "paused") pauseSub = "main";
      applyUi();
    };

    const resizeCanvas = () => {
      const wrap = canvas.parentElement;
      if (!wrap) return { ctx: null, cell: 8, pxW: 0, pxH: 0 };
      const pad = 8;
      const availW = Math.max(64, (wrap.clientWidth || 200) - pad);
      /** Square cells sized from width so the grid spans ~100% of the row; height follows rows. */
      let cell = Math.floor(availW / gridW);
      cell = Math.max(4, cell);
      const pxW = cell * gridW;
      const pxH = cell * gridH;
      const dpr =
        typeof window.devicePixelRatio === "number" ? window.devicePixelRatio : 1;
      canvas.width = Math.floor(pxW * dpr);
      canvas.height = Math.floor(pxH * dpr);
      canvas.style.width = pxW + "px";
      canvas.style.height = pxH + "px";
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx, cell, pxW, pxH };
    };

    const draw = () => {
      const { ctx, cell } = resizeCanvas();
      if (!ctx) return;
      const th = getTheme();
      const gw = gridW;
      const gh = gridH;

      for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
          const alt = (x + y) % 2 === 0;
          ctx.fillStyle = th.chess
            ? alt
              ? th.boardA
              : th.boardB
            : alt
              ? th.boardA
              : th.boardB;
          ctx.fillRect(x * cell, y * cell, cell, cell);
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

      if (snake.length > 0) {
        const cx = (x) => x * cell + cell * 0.5;
        const cy = (y) => y * cell + cell * 0.5;
        const tubeW = Math.max(2.5, cell * 0.4);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx(snake[0].x), cy(snake[0].y));
        for (let i = 1; i < snake.length; i++) {
          ctx.lineTo(cx(snake[i].x), cy(snake[i].y));
        }
        ctx.strokeStyle = th.snake;
        ctx.lineWidth = tubeW;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.restore();

        const head = snake[snake.length - 1];
        ctx.fillStyle = th.head;
        ctx.beginPath();
        ctx.arc(cx(head.x), cy(head.y), tubeW * 0.5, 0, Math.PI * 2);
        ctx.fill();

        _drawHeadFace(ctx, head, cell, dir, th);
      }
    };

    const spawnFood = () => {
      const occ = occupied();
      for (const f of foods) occ.add(f);
      const empty = [];
      for (let y = 0; y < gridH; y++) {
        for (let x = 0; x < gridW; x++) {
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
      const dim = FIELD_DIM[fieldKey] || FIELD_DIM.medium;
      gridW = dim.w;
      gridH = dim.h;
      const cx = Math.floor(gridW / 2);
      const cy = Math.floor(gridH / 2);
      snake = [
        { x: cx - 2, y: cy },
        { x: cx - 1, y: cy },
        { x: cx, y: cy },
      ];
      dir = { x: 1, y: 0 };
      dirQueue.length = 0;
      foods.clear();
      score = 0;
      if (elScore) elScore.textContent = "0";
      if (elDeathMsg) elDeathMsg.textContent = "";
      replenishFood();
      draw();
    };

    const gameOver = (msg) => {
      running = false;
      if (timer != null) {
        clearInterval(timer);
        timer = null;
      }
      if (elDeathMsg) elDeathMsg.textContent = msg || "You crashed.";
      setView("death");
      draw();
    };

    const pauseGame = () => {
      if (!running || uiMode !== "playing") return;
      running = false;
      pauseSub = "main";
      if (timer != null) {
        clearInterval(timer);
        timer = null;
      }
      setView("paused");
      draw();
      if (btnPauseResume) {
        queueMicrotask(() => btnPauseResume.focus());
      }
    };

    const resumeGame = () => {
      if (uiMode !== "paused") return;
      running = true;
      setView("playing");
      const spd = SPEED_MS[speedKey] || SPEED_MS.snake;
      timer = setInterval(tick, spd);
      canvas.focus();
      draw();
    };

    const tick = () => {
      if (!running) return;
      if (dirQueue.length > 0) {
        const nd = dirQueue.shift();
        if (!(nd.x === -dir.x && nd.y === -dir.y)) {
          dir = nd;
        }
      }
      const head = snake[snake.length - 1];
      const nx = head.x + dir.x;
      const ny = head.y + dir.y;
      if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) {
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
      setView("playing");
      canvas.tabIndex = 0;
      canvas.focus();
      const spd = SPEED_MS[speedKey] || SPEED_MS.snake;
      timer = setInterval(tick, spd);
    };

    btnStart.addEventListener("click", startGame);
    btnDeathRestart.addEventListener("click", startGame);
    btnDeathSettings.addEventListener("click", () => {
      setView("menu");
      draw();
    });

    if (btnToolbarPause) {
      btnToolbarPause.addEventListener("click", () => pauseGame());
    }
    if (btnPauseResume) {
      btnPauseResume.addEventListener("click", () => resumeGame());
    }
    if (btnPauseOpenSettings) {
      btnPauseOpenSettings.addEventListener("click", () => {
        pauseSub = "settings";
        applyUi();
        if (btnSettingsBack) queueMicrotask(() => btnSettingsBack.focus());
      });
    }
    if (btnSettingsBack) {
      btnSettingsBack.addEventListener("click", () => {
        pauseSub = "main";
        applyUi();
        if (btnPauseResume) queueMicrotask(() => btnPauseResume.focus());
      });
    }

    const _dirFromKey = (key) => {
      if (key === "ArrowUp" || key === "w" || key === "W") return { x: 0, y: -1 };
      if (key === "ArrowDown" || key === "s" || key === "S") return { x: 0, y: 1 };
      if (key === "ArrowLeft" || key === "a" || key === "A") return { x: -1, y: 0 };
      if (key === "ArrowRight" || key === "d" || key === "D") return { x: 1, y: 0 };
      return null;
    };

    const onCanvasKey = (e) => {
      const nd = _dirFromKey(e.key);
      if (nd) {
        e.preventDefault();
        queueDir(nd);
      }
    };

    const onEscapeKey = (e) => {
      if (e.key !== "Escape") return;
      if (!root.contains(e.target)) return;
      if (uiMode === "playing") {
        e.preventDefault();
        e.stopPropagation();
        pauseGame();
      } else if (uiMode === "paused") {
        e.preventDefault();
        e.stopPropagation();
        if (pauseSub === "settings") {
          pauseSub = "main";
          applyUi();
          if (btnPauseResume) btnPauseResume.focus();
        } else {
          resumeGame();
        }
      }
    };

    canvas.addEventListener("keydown", onCanvasKey);
    root.addEventListener("keydown", onEscapeKey, true);
    canvas.addEventListener("click", () => {
      if (running) canvas.focus();
    });

    const EDGE = 0.22;
    canvas.addEventListener("pointerdown", (e) => {
      if (!running) return;
      const r = canvas.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return;
      const fx = (e.clientX - r.left) / r.width;
      const fy = (e.clientY - r.top) / r.height;
      let q = null;
      if (fy < EDGE) q = { x: 0, y: -1 };
      else if (fy > 1 - EDGE) q = { x: 0, y: 1 };
      else if (fx < EDGE) q = { x: -1, y: 0 };
      else if (fx > 1 - EDGE) q = { x: 1, y: 0 };
      if (q) {
        e.preventDefault();
        queueDir(q);
      }
    });

    const wrap = canvas.parentElement;
    let ro = null;
    if (wrap && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => draw());
      ro.observe(wrap);
    }
    window.addEventListener("resize", () => draw());

    setView("menu");
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
