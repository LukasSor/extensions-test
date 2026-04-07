(function () {
  function parseNum(s) {
    if (typeof s !== "string") return NaN;
    const t = s.trim().replace(",", ".");
    if (t === "" || t === "-" || t === "+") return NaN;
    return Number(t);
  }

  function roundPlaces(n, places) {
    const f = 10 ** places;
    return Math.round(n * f) / f;
  }

  function formatWithComma(n, places) {
    const s = n.toFixed(places);
    return s.replace(".", ",");
  }

  function boot(root) {
    if (root.dataset.rngBooted === "1") return;
    root.dataset.rngBooted = "1";

    const elResult = root.querySelector("[data-rng-result]");
    const elMin = root.querySelector("[data-rng-min]");
    const elMax = root.querySelector("[data-rng-max]");
    const btnDec = root.querySelector("[data-rng-decimals-toggle]");
    const wrapPlaces = root.querySelector("[data-rng-places-wrap]");
    const elPlaces = root.querySelector("[data-rng-places]");
    const btnGen = root.querySelector("[data-rng-generate]");
    if (
      !elResult ||
      !elMin ||
      !elMax ||
      !btnDec ||
      !wrapPlaces ||
      !elPlaces ||
      !btnGen
    ) {
      return;
    }

    const syncDecimalsUi = () => {
      const on = btnDec.getAttribute("aria-checked") === "true";
      wrapPlaces.classList.toggle("is-hidden", !on);
      elMin.step = on ? "any" : "1";
      elMax.step = on ? "any" : "1";
    };

    btnDec.addEventListener("click", () => {
      const on = btnDec.getAttribute("aria-checked") === "true";
      btnDec.setAttribute("aria-checked", on ? "false" : "true");
      syncDecimalsUi();
    });

    syncDecimalsUi();

    const generate = () => {
      const decimals = btnDec.getAttribute("aria-checked") === "true";
      const places = Math.min(
        8,
        Math.max(1, parseInt(elPlaces.value, 10) || 2),
      );

      let min = parseNum(elMin.value);
      let max = parseNum(elMax.value);
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        elResult.textContent = "—";
        return;
      }

      if (min > max) {
        const t = min;
        min = max;
        max = t;
      }

      let value;
      if (!decimals) {
        const a = Math.ceil(min);
        const b = Math.floor(max);
        if (!Number.isFinite(a) || !Number.isFinite(b) || a > b) {
          elResult.textContent = "—";
          return;
        }
        value = a + Math.floor(Math.random() * (b - a + 1));
        elResult.textContent = String(value);
      } else {
        const span = max - min;
        if (span < 0 || !Number.isFinite(span)) {
          elResult.textContent = "—";
          return;
        }
        let r = min + Math.random() * span;
        r = roundPlaces(r, places);
        if (r < min) r = min;
        if (r > max) r = max;
        elResult.textContent = formatWithComma(r, places);
      }
    };

    btnGen.addEventListener("click", generate);
  }

  function scan() {
    document
      .querySelectorAll("[data-rng-root]:not([data-rng-disabled])")
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
