(function () {
  const MIN_SPINS = 4;
  const MAX_SPINS = 7;

  const mod = (n, m) => ((n % m) + m) % m;

  function boot(root) {
    if (root.dataset.coinflipBooted === "1") return;
    root.dataset.coinflipBooted = "1";

    const coin = root.querySelector("[data-coinflip-coin]");
    const resultEl = root.querySelector("[data-coinflip-result-value]");
    const btn = root.querySelector("[data-coinflip-again]");
    if (!coin || !resultEl || !btn) return;

    let rotationDeg = 0;
    let busy = false;

    const isHeadsShowing = () => mod(Math.round(rotationDeg), 360) === 0;

    const setResultText = () => {
      resultEl.textContent = isHeadsShowing() ? "Heads" : "Tails";
    };

    const SPIN_MS = 2350;
    let unlockTimer = null;

    const finishSpin = () => {
      if (unlockTimer != null) {
        clearTimeout(unlockTimer);
        unlockTimer = null;
      }
      busy = false;
      root.classList.remove("coinflip--spinning");
      btn.disabled = false;
      setResultText();
    };

    const spin = () => {
      if (busy) return;
      if (unlockTimer != null) {
        clearTimeout(unlockTimer);
        unlockTimer = null;
      }
      busy = true;
      root.classList.add("coinflip--spinning");
      btn.disabled = true;
      resultEl.textContent = "…";

      const heads = Math.random() < 0.5;
      const spins =
        MIN_SPINS + Math.floor(Math.random() * (MAX_SPINS - MIN_SPINS + 1));
      const fullTurns = spins * 360;
      const targetRem = heads ? 0 : 180;
      const candidate = rotationDeg + fullTurns;
      const adjust = mod(targetRem - mod(candidate, 360), 360);
      rotationDeg = candidate + adjust;

      void coin.offsetWidth;
      coin.style.transform = `rotateY(${rotationDeg}deg)`;
      unlockTimer = window.setTimeout(finishSpin, SPIN_MS + 120);
    };

    const onTransitionEnd = (e) => {
      if (e.target !== coin || e.propertyName !== "transform") return;
      finishSpin();
    };

    coin.addEventListener("transitionend", onTransitionEnd);
    btn.addEventListener("click", () => spin());

    coin.style.transform = "rotateY(0deg)";

    requestAnimationFrame(() => {
      requestAnimationFrame(() => spin());
    });
  }

  function scan() {
    document
      .querySelectorAll("[data-coinflip-root]:not([data-coinflip-disabled])")
      .forEach(boot);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan);
  } else {
    scan();
  }

  const mo = new MutationObserver(() => scan());
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
