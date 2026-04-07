(function () {
  /** Width × height (columns × rows); second dimension is longer on each preset. */
  const FIELD_DIM = {
    small: { w: 9, h: 10 },
    medium: { w: 15, h: 17 },
    large: { w: 21, h: 24 },
  };
  const SPEED_MS = { turtle: 220, rabbit: 95, snake: 145 };

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
      nostril: "#172554",
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
      nostril: "#1d4ed8",
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
      nostril: "#1e3a8a",
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
      nostril: "#431407",
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
      nostril: "#1e3a8a",
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
      nostril: "#5b21b6",
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
      nostril: "#45475a",
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

  function _drawHeadFace(ctx, seg, cell, dir, th) {
    const px = seg.x * cell;
    const py = seg.y * cell;
    const s = cell;
    const ew = Math.max(2, Math.round(s * 0.18));
    const eh = Math.max(2, Math.round(s * 0.17));
    const pup = Math.max(1, Math.round(ew * 0.38));
    const inset = Math.max(0, Math.floor(s * 0.08));
    const margin = Math.max(1, Math.round(s * 0.04));

    const hx0 = px + inset;
    const hy0 = py + inset;
    const hx1 = px + s - inset;
    const hy1 = py + s - inset;
    const midY = Math.round((hy0 + hy1) / 2);
    const midX = Math.round((hx0 + hx1) / 2);

    /** Inset eyes/nose from the leading edge so the face sits nearer the middle of the tile. */
    const fromFront = Math.round(s * 0.2);

    let ex1, ey1, ex2, ey2;
    let pdx, pdy;
    if (dir.x === 1) {
      ex1 = hx1 - ew - fromFront;
      ey1 = midY - eh - Math.round(s * 0.07);
      ex2 = ex1;
      ey2 = midY + Math.round(s * 0.07);
      pdx = 1;
      pdy = 0;
    } else if (dir.x === -1) {
      ex1 = hx0 + fromFront;
      ey1 = midY - eh - Math.round(s * 0.07);
      ex2 = ex1;
      ey2 = midY + Math.round(s * 0.07);
      pdx = -1;
      pdy = 0;
    } else if (dir.y === -1) {
      ey1 = hy0 + fromFront;
      ex1 = midX - ew - Math.round(s * 0.07);
      ey2 = ey1;
      ex2 = midX + Math.round(s * 0.07);
      pdx = 0;
      pdy = -1;
    } else {
      ey1 = hy1 - eh - fromFront;
      ex1 = midX - ew - Math.round(s * 0.07);
      ey2 = ey1;
      ex2 = midX + Math.round(s * 0.07);
      pdx = 0;
      pdy = 1;
    }

    const drawPupil = (wx, wy) => {
      let px0 = wx + Math.round((ew - pup) / 2);
      let py0 = wy + Math.round((eh - pup) / 2);
      if (pdx === 1) px0 = wx + ew - pup - margin;
      if (pdx === -1) px0 = wx + margin;
      if (pdy === 1) py0 = wy + eh - pup - margin;
      if (pdy === -1) py0 = wy + margin;
      ctx.fillRect(px0, py0, pup, pup);
    };

    ctx.fillStyle = th.eyeWhite;
    ctx.fillRect(ex1, ey1, ew, eh);
    ctx.fillRect(ex2, ey2, ew, eh);

    ctx.fillStyle = th.eyePupil;
    drawPupil(ex1, ey1);
    drawPupil(ex2, ey2);

    const nz = Math.max(1, Math.round(s * 0.045));
    const nyOff = Math.round(eh / 2) - Math.floor(nz / 2);
    ctx.fillStyle = th.nostril;
    if (dir.x === 1) {
      const nx = hx1 - fromFront + Math.round(ew * 0.35);
      ctx.fillRect(nx, ey1 + nyOff, nz, nz);
      ctx.fillRect(nx, ey2 + nyOff, nz, nz);
    } else if (dir.x === -1) {
      const nx = hx0 + fromFront - Math.round(ew * 0.35) - nz;
      ctx.fillRect(nx, ey1 + nyOff, nz, nz);
      ctx.fillRect(nx, ey2 + nyOff, nz, nz);
    } else if (dir.y === -1) {
      const ny = hy0 + fromFront - Math.round(ew * 0.35) - nz;
      ctx.fillRect(ex1 + nyOff, ny, nz, nz);
      ctx.fillRect(ex2 + nyOff, ny, nz, nz);
    } else {
      const ny = hy1 - fromFront + Math.round(ew * 0.35);
      ctx.fillRect(ex1 + nyOff, ny, nz, nz);
      ctx.fillRect(ex2 + nyOff, ny, nz, nz);
    }
  }

  function boot(root) {
    if (root.dataset.snakeBooted === "1") return;
    root.dataset.snakeBooted = "1";

    const canvas = root.querySelector(".snake-canvas");
    const panelSettings = root.querySelector('[data-snake-panel="settings"]');
    const panelDeath = root.querySelector('[data-snake-panel="death"]');
    const btnStart = root.querySelector(".snake-start");
    const btnDeathRestart = root.querySelector(".snake-death-restart");
    const btnDeathSettings = root.querySelector(".snake-death-settings");
    const elDeathMsg = root.querySelector(".snake-death-msg");
    const selField = root.querySelector(".snake-select-field");
    const selSpeed = root.querySelector(".snake-select-speed");
    const selTheme = root.querySelector(".snake-select-theme");
    const selFood = root.querySelector(".snake-select-food");
    const elScore = root.querySelector(".snake-score");

    if (!canvas || !btnStart || !panelSettings || !panelDeath) return;

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
    let gridW = 15;
    let gridH = 17;

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

    const setView = (v) => {
      if (v === "playing") {
        panelSettings.hidden = true;
        panelDeath.hidden = true;
        root.classList.add("snake-slot--playing");
      } else if (v === "death") {
        panelSettings.hidden = true;
        panelDeath.hidden = false;
        root.classList.remove("snake-slot--playing");
      } else {
        panelSettings.hidden = false;
        panelDeath.hidden = true;
        root.classList.remove("snake-slot--playing");
      }
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
      const gMax = Math.max(gridW, gridH);
      const cell = Math.max(6, Math.floor(maxPx / gMax));
      const pxW = cell * gridW;
      const pxH = cell * gridH;
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
          if (th.chess) {
            ctx.fillStyle = alt ? th.boardA : th.boardB;
          } else {
            ctx.fillStyle = alt ? th.boardA : th.boardB;
          }
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

      const headIdx = snake.length - 1;
      for (let i = 0; i < snake.length; i++) {
        const seg = snake[i];
        const isHead = i === headIdx;
        ctx.fillStyle = isHead ? th.head : th.snake;
        const inset = Math.max(0, Math.floor(cell * 0.08));
        ctx.fillRect(
          seg.x * cell + inset,
          seg.y * cell + inset,
          cell - inset * 2,
          cell - inset * 2,
        );
        if (isHead) {
          _drawHeadFace(ctx, seg, cell, dir, th);
        }
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
      const key = (selField && selField.value) || "medium";
      const dim = FIELD_DIM[key] || FIELD_DIM.medium;
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
      pendingDir = null;
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
      const spd =
        SPEED_MS[(selSpeed && selSpeed.value) || "snake"] || SPEED_MS.snake;
      timer = setInterval(tick, spd);
    };

    btnStart.addEventListener("click", startGame);
    btnDeathRestart.addEventListener("click", startGame);
    btnDeathSettings.addEventListener("click", () => {
      setView("settings");
      draw();
    });

    const _dirFromKey = (key) => {
      if (key === "ArrowUp" || key === "w" || key === "W") return { x: 0, y: -1 };
      if (key === "ArrowDown" || key === "s" || key === "S") return { x: 0, y: 1 };
      if (key === "ArrowLeft" || key === "a" || key === "A") return { x: -1, y: 0 };
      if (key === "ArrowRight" || key === "d" || key === "D") return { x: 1, y: 0 };
      return null;
    };

    const onKey = (e) => {
      if (!running) return;
      const nd = _dirFromKey(e.key);
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

    setView("settings");
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
