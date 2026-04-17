(function () {
  const TAB_TYPE = "tab:full-map";
  const PAYLOAD_PREFIX = "[fullmap:";
  const PAYLOAD_SUFFIX = "]";
  const LEAFLET_CSS_ID = "full-map-leaflet-css";
  const LEAFLET_SRC = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
  const LEAFLET_CSS_SRC = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

  let leafletPromise = null;
  let activeView = null;

  const isFullMapActive = () =>
    !!document.querySelector(`.results-tab.active[data-type="${TAB_TYPE}"]`);

  const decodeBase64UrlJson = (raw) => {
    if (!raw) return null;
    try {
      const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
      const padLength = (4 - (normalized.length % 4)) % 4;
      const padded = normalized + "=".repeat(padLength);
      const json = atob(padded);
      return JSON.parse(json);
    } catch {
      return null;
    }
  };

  const parsePayloadFromSnippet = (snippet) => {
    const text = (snippet || "").trim();
    if (!text.startsWith(PAYLOAD_PREFIX)) return null;
    const end = text.indexOf(PAYLOAD_SUFFIX, PAYLOAD_PREFIX.length);
    if (end <= PAYLOAD_PREFIX.length) return null;
    const token = text.slice(PAYLOAD_PREFIX.length, end);
    const payload = decodeBase64UrlJson(token);
    return payload && typeof payload === "object" ? payload : null;
  };

  const parseResults = (container) => {
    const cards = Array.from(container.querySelectorAll(".result-item"));
    const places = [];
    for (const card of cards) {
      const titleEl = card.querySelector(".result-title");
      const snippetEl = card.querySelector(".result-snippet");
      if (!titleEl || !snippetEl) continue;
      const payload = parsePayloadFromSnippet(snippetEl.textContent || "");
      if (!payload) continue;
      const lat = Number(payload.lat);
      const lon = Number(payload.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      places.push({
        id: String(payload.id || `${lat},${lon}`),
        name: String(payload.name || titleEl.textContent || "Place"),
        lat,
        lon,
        address: String(payload.address || ""),
        kind: String(payload.kind || "place"),
        city: String(payload.city || ""),
        country: String(payload.country || ""),
        sourceUrl: String(payload.sourceUrl || titleEl.getAttribute("href") || "#"),
        website: String(payload.website || ""),
        phone: String(payload.phone || ""),
        openingHours: String(payload.openingHours || ""),
        wikiTitle: String(payload.wikiTitle || ""),
        wikiSummary: String(payload.wikiSummary || ""),
        image: String(payload.image || ""),
      });
    }
    return places;
  };

  const ensureLeaflet = async () => {
    if (window.L) return window.L;
    if (leafletPromise) return leafletPromise;

    leafletPromise = new Promise((resolve, reject) => {
      if (!document.getElementById(LEAFLET_CSS_ID)) {
        const css = document.createElement("link");
        css.id = LEAFLET_CSS_ID;
        css.rel = "stylesheet";
        css.href = LEAFLET_CSS_SRC;
        document.head.appendChild(css);
      }

      const existing = document.querySelector(`script[src="${LEAFLET_SRC}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve(window.L), { once: true });
        existing.addEventListener("error", () => reject(new Error("Failed to load Leaflet")), {
          once: true,
        });
        return;
      }

      const script = document.createElement("script");
      script.src = LEAFLET_SRC;
      script.async = true;
      script.onload = () => resolve(window.L);
      script.onerror = () => reject(new Error("Failed to load Leaflet"));
      document.head.appendChild(script);
    });

    return leafletPromise;
  };

  const buildInfoHtml = (place) => {
    const image = place.image
      ? `<img class="fm-info-image" src="${place.image}" alt="" loading="lazy">`
      : "";
    const summary = place.wikiSummary
      ? `<p class="fm-info-summary">${place.wikiSummary}</p>`
      : `<p class="fm-info-summary">No rich description available for this place yet.</p>`;
    const details = [
      place.address ? `<li><strong>Address:</strong> ${place.address}</li>` : "",
      place.city ? `<li><strong>City:</strong> ${place.city}</li>` : "",
      place.country ? `<li><strong>Country:</strong> ${place.country}</li>` : "",
      place.kind ? `<li><strong>Category:</strong> ${place.kind}</li>` : "",
      place.phone ? `<li><strong>Phone:</strong> ${place.phone}</li>` : "",
      place.openingHours ? `<li><strong>Opening:</strong> ${place.openingHours}</li>` : "",
      place.website
        ? `<li><strong>Website:</strong> <a href="${place.website}" target="_blank" rel="noopener">${place.website}</a></li>`
        : "",
    ]
      .filter(Boolean)
      .join("");

    const pseudoReviews = place.wikiTitle
      ? `<div class="fm-reviews"><h4>Background</h4><p>Source article: ${place.wikiTitle}</p></div>`
      : `<div class="fm-reviews"><h4>Reviews</h4><p>No public review feed is connected yet.</p></div>`;

    return `
      ${image}
      <div class="fm-info-body">
        <h3>${place.name}</h3>
        ${summary}
        <ul class="fm-info-meta">${details}</ul>
        ${pseudoReviews}
        <a class="fm-open-link" href="${place.sourceUrl}" target="_blank" rel="noopener">Open in OpenStreetMap</a>
      </div>
    `;
  };

  const destroyActiveView = () => {
    if (!activeView) return;
    try {
      activeView.teardown();
    } catch {}
    activeView = null;
  };

  const renderMapLayout = async (container, places) => {
    const listItems = places
      .map(
        (place, idx) => `
      <button type="button" class="fm-result" data-fm-index="${idx}">
        <div class="fm-result-title">${place.name}</div>
        <div class="fm-result-sub">${place.address || place.city || place.country || place.kind}</div>
      </button>
    `,
      )
      .join("");

    container.innerHTML = `
      <section class="full-map-root">
        <aside class="full-map-left">
          <div class="fm-search-row">
            <input class="fm-search-input" type="search" placeholder="Search places in this result set" />
            <button type="button" class="fm-search-button">Search</button>
          </div>
          <div class="fm-results">${listItems}</div>
        </aside>
        <section class="full-map-right">
          <div class="fm-map" aria-label="OpenStreetMap view"></div>
          <div class="fm-info"><p>Select a result or marker to see details.</p></div>
        </section>
      </section>
    `;

    const root = container.querySelector(".full-map-root");
    const mapEl = container.querySelector(".fm-map");
    const infoEl = container.querySelector(".fm-info");
    const resultsEl = container.querySelector(".fm-results");
    const filterInput = container.querySelector(".fm-search-input");
    const searchBtn = container.querySelector(".fm-search-button");
    if (!root || !mapEl || !infoEl || !resultsEl || !filterInput || !searchBtn) return;

    const L = await ensureLeaflet().catch(() => null);
    if (!L) {
      mapEl.innerHTML = '<p class="fm-error">Map library failed to load.</p>';
      return;
    }

    const map = L.map(mapEl, { zoomControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const markers = [];
    let selectedIndex = -1;
    let visibleIndexes = places.map((_, idx) => idx);

    const selectPlace = (idx, pan = true) => {
      if (idx < 0 || idx >= places.length) return;
      selectedIndex = idx;
      const place = places[idx];
      const marker = markers[idx];

      resultsEl.querySelectorAll(".fm-result").forEach((el) => {
        const match = Number(el.getAttribute("data-fm-index")) === idx;
        el.classList.toggle("is-active", match);
      });

      markers.forEach((m, markerIdx) => {
        const active = markerIdx === idx;
        m.setStyle({
          radius: active ? 10 : 7,
          weight: active ? 3 : 2,
          fillOpacity: active ? 0.95 : 0.72,
        });
      });

      infoEl.innerHTML = buildInfoHtml(place);
      marker.bindPopup(`<strong>${place.name}</strong><br>${place.address || place.kind}`);
      marker.openPopup();
      if (pan) {
        map.setView([place.lat, place.lon], Math.max(map.getZoom(), 14), {
          animate: true,
        });
      }
    };

    const applyFilter = () => {
      const q = String(filterInput.value || "").trim().toLowerCase();
      visibleIndexes = [];
      resultsEl.querySelectorAll(".fm-result").forEach((el) => {
        const idx = Number(el.getAttribute("data-fm-index"));
        const place = places[idx];
        const haystack = [place.name, place.address, place.city, place.country, place.kind]
          .join(" ")
          .toLowerCase();
        const visible = !q || haystack.includes(q);
        el.hidden = !visible;
        if (visible) visibleIndexes.push(idx);
      });

      markers.forEach((marker, idx) => {
        const visible = visibleIndexes.includes(idx);
        if (visible && !map.hasLayer(marker)) marker.addTo(map);
        if (!visible && map.hasLayer(marker)) marker.remove();
      });

      if (visibleIndexes.length > 0) {
        const bounds = L.latLngBounds(visibleIndexes.map((idx) => [places[idx].lat, places[idx].lon]));
        map.fitBounds(bounds.pad(0.2));
      }
      if (!visibleIndexes.includes(selectedIndex) && visibleIndexes.length > 0) {
        selectPlace(visibleIndexes[0], false);
      }
    };

    places.forEach((place, idx) => {
      const marker = L.circleMarker([place.lat, place.lon], {
        radius: 7,
        color: "#1f6feb",
        fillColor: "#2f81f7",
        fillOpacity: 0.72,
        weight: 2,
      }).addTo(map);
      marker.on("click", () => selectPlace(idx, true));
      markers.push(marker);
    });

    if (markers.length > 0) {
      const bounds = L.latLngBounds(places.map((p) => [p.lat, p.lon]));
      map.fitBounds(bounds.pad(0.2));
      selectPlace(0, false);
    }

    resultsEl.querySelectorAll(".fm-result").forEach((el) => {
      el.addEventListener("click", () => {
        const idx = Number(el.getAttribute("data-fm-index"));
        selectPlace(idx, true);
      });
    });

    filterInput.addEventListener("input", applyFilter);
    searchBtn.addEventListener("click", () => {
      const next = String(filterInput.value || "").trim();
      if (!next) return;
      const params = new URLSearchParams(window.location.search);
      params.set("q", next);
      params.set("type", TAB_TYPE);
      params.delete("page");
      window.location.href = `/search?${params.toString()}`;
    });
    filterInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      searchBtn.click();
    });

    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    setTimeout(onResize, 120);

    activeView = {
      teardown() {
        window.removeEventListener("resize", onResize);
        map.remove();
      },
    };
  };

  const getSignature = (places) =>
    `${places.length}:${places
      .slice(0, 10)
      .map((p) => p.id)
      .join("|")}`;

  let lastSignature = "";
  const maybeRender = async () => {
    if (!isFullMapActive()) {
      lastSignature = "";
      destroyActiveView();
      return;
    }

    const container = document.getElementById("results-list");
    if (!container) return;
    if (container.querySelector(".full-map-root")) return;

    const places = parseResults(container);
    if (places.length === 0) return;

    const sig = getSignature(places);
    if (sig === lastSignature) return;
    lastSignature = sig;
    destroyActiveView();
    await renderMapLayout(container, places);
  };

  const scheduleRender = () => {
    queueMicrotask(() => {
      void maybeRender();
    });
  };

  const observer = new MutationObserver(() => scheduleRender());
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });

  document.addEventListener("click", () => scheduleRender(), true);
  window.addEventListener("popstate", scheduleRender);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleRender, { once: true });
  } else {
    scheduleRender();
  }
})();
