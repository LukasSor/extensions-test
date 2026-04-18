(function () {
  const TAB_TYPE = "tab:full-map";
  const PAYLOAD_PREFIX = "[fullmap:";
  const PAYLOAD_SUFFIX = "]";
  const LEAFLET_CSS_ID = "full-map-leaflet-css";
  const LEAFLET_SRC = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
  const LEAFLET_CSS_SRC = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

  let leafletPromise = null;
  let activeView = null;
  const setFullMapMode = (enabled) => {
    document.body.classList.toggle("full-map-mode", enabled);
    const layout = document.getElementById("results-layout");
    const main = document.getElementById("results-main");
    const list = document.getElementById("results-list");
    const sidebar = document.getElementById("sidebar-col");
    if (layout) layout.classList.toggle("full-map-layout", enabled);
    if (main) main.classList.toggle("full-map-main", enabled);
    if (list) list.classList.toggle("full-map-list", enabled);
    if (sidebar) sidebar.classList.toggle("full-map-sidebar-hidden", enabled);
  };

  const esc = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const POI_STYLES = {
    food: { emoji: "🍽", bg: "#ea580c" },
    drink: { emoji: "🍺", bg: "#9333ea" },
    grocery: { emoji: "🛒", bg: "#16a34a" },
    shop: { emoji: "🛍", bg: "#db2777" },
    shop_large: { emoji: "🏬", bg: "#be185d" },
    fashion: { emoji: "👕", bg: "#ec4899" },
    tech: { emoji: "💻", bg: "#6366f1" },
    vehicle_shop: { emoji: "🔧", bg: "#475569" },
    beauty: { emoji: "💇", bg: "#f472b6" },
    lodging: { emoji: "🏨", bg: "#0d9488" },
    sight: { emoji: "🎭", bg: "#7c3aed" },
    tourism: { emoji: "📷", bg: "#8b5cf6" },
    info: { emoji: "ℹ️", bg: "#64748b" },
    park: { emoji: "🌳", bg: "#15803d" },
    sport: { emoji: "⚽", bg: "#22c55e" },
    leisure: { emoji: "🎯", bg: "#14b8a6" },
    transit_rail: { emoji: "🚉", bg: "#2563eb" },
    transit_bus: { emoji: "🚌", bg: "#1d4ed8" },
    transit: { emoji: "🚏", bg: "#1e40af" },
    air: { emoji: "✈️", bg: "#0369a1" },
    fuel: { emoji: "⛽", bg: "#b45309" },
    parking: { emoji: "🅿️", bg: "#57534e" },
    health: { emoji: "💊", bg: "#dc2626" },
    medical: { emoji: "🏥", bg: "#b91c1c" },
    money: { emoji: "🏧", bg: "#0f766e" },
    education: { emoji: "🎓", bg: "#4f46e5" },
    worship: { emoji: "⛪", bg: "#6d28d9" },
    culture: { emoji: "🎬", bg: "#a21caf" },
    civic: { emoji: "🏛", bg: "#334155" },
    service: { emoji: "🚻", bg: "#78716c" },
    historic: { emoji: "🏛️", bg: "#92400e" },
    office: { emoji: "🏢", bg: "#475569" },
    craft: { emoji: "🔨", bg: "#78716c" },
    nature: { emoji: "🏔", bg: "#0f766e" },
    admin: { emoji: "📍", bg: "#64748b" },
    place: { emoji: "📍", bg: "#2563eb" },
  };

  const styleForPoi = (poi) => POI_STYLES[poi] || POI_STYLES.place;

  const makeMarkerIcon = (Leaflet, poi, active) => {
    const st = styleForPoi(poi);
    const size = active ? 40 : 34;
    const emoji = st.emoji;
    const bg = st.bg;
    return Leaflet.divIcon({
      className: "fm-marker-wrap",
      html: `<div class="fm-marker-pin${active ? " is-active" : ""}" style="--fm-pin-bg:${bg}"><span class="fm-marker-emoji">${emoji}</span></div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -Math.round(size / 2 + 2)],
    });
  };

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
        poi: String(payload.poi || "place"),
        osmKey: String(payload.osmKey || ""),
        osmValue: String(payload.osmValue || ""),
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
      ? `<img class="fm-info-image" src="${esc(place.image)}" alt="" loading="lazy">`
      : "";
    const summary = place.wikiSummary
      ? `<p class="fm-info-summary">${esc(place.wikiSummary)}</p>`
      : `<p class="fm-info-summary">No rich description available for this place yet.</p>`;
    const osmTag =
      place.osmKey && place.osmValue
        ? `<li><strong>OSM tag:</strong> <code>${esc(place.osmKey)}</code>=<code>${esc(place.osmValue)}</code></li>`
        : "";
    const details = [
      place.address ? `<li><strong>Address:</strong> ${esc(place.address)}</li>` : "",
      place.city ? `<li><strong>City:</strong> ${esc(place.city)}</li>` : "",
      place.country ? `<li><strong>Country:</strong> ${esc(place.country)}</li>` : "",
      place.kind ? `<li><strong>Category:</strong> ${esc(place.kind)}</li>` : "",
      osmTag,
      place.phone ? `<li><strong>Phone:</strong> ${esc(place.phone)}</li>` : "",
      place.openingHours ? `<li><strong>Opening:</strong> ${esc(place.openingHours)}</li>` : "",
      place.website
        ? `<li><strong>Website:</strong> <a href="${esc(place.website)}" target="_blank" rel="noopener">${esc(place.website)}</a></li>`
        : "",
    ]
      .filter(Boolean)
      .join("");

    const pseudoReviews = place.wikiTitle
      ? `<div class="fm-reviews"><h4>Background</h4><p>Source article: ${esc(place.wikiTitle)}</p></div>`
      : `<div class="fm-reviews"><h4>Reviews</h4><p>No public review feed is connected yet.</p></div>`;

    return `
      ${image}
      <div class="fm-info-body">
        <h3>${esc(place.name)}</h3>
        ${summary}
        <ul class="fm-info-meta">${details}</ul>
        ${pseudoReviews}
        <a class="fm-open-link" href="${esc(place.sourceUrl)}" target="_blank" rel="noopener">Open in OpenStreetMap</a>
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
      .map((place, idx) => {
        const ico = styleForPoi(place.poi).emoji;
        return `
      <button type="button" class="fm-result" data-fm-index="${idx}">
        <span class="fm-result-ico" aria-hidden="true">${ico}</span>
        <span class="fm-result-text">
          <span class="fm-result-title">${esc(place.name)}</span>
          <span class="fm-result-sub">${esc(place.address || place.city || place.country || place.kind)}</span>
        </span>
      </button>`;
      })
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
          <div class="fm-map-wrap">
            <div class="fm-map-toolbar" role="toolbar" aria-label="Map type">
              <div class="fm-map-toolbar-title">Map</div>
              <div class="fm-perspective-btns" role="radiogroup" aria-label="Base map">
                <button type="button" class="fm-perspective-btn is-active" data-fm-perspective="standard">Standard</button>
                <button type="button" class="fm-perspective-btn" data-fm-perspective="satellite">Satellite</button>
                <button type="button" class="fm-perspective-btn" data-fm-perspective="terrain">Terrain</button>
              </div>
              <label class="fm-labels-toggle">
                <input type="checkbox" data-fm-labels checked />
                <span>Labels</span>
              </label>
            </div>
            <div class="fm-map" aria-label="Map view"></div>
          </div>
          <div class="fm-info"><p>Select a result or marker to see details.</p></div>
        </section>
      </section>
    `;

    const root = container.querySelector(".full-map-root");
    const mapEl = container.querySelector(".fm-map-wrap .fm-map");
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

    const map = L.map(mapEl, { zoomControl: true, preferCanvas: true });

    const CARTO_LIGHT = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
    const CARTO_DARK = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
    const cartoOpts = {
      maxZoom: 19,
      subdomains: "abcd",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    };

    const ESRI_IMAGERY = {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      maxZoom: 19,
      attribution:
        "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
    };

    const OPEN_TOPO = {
      url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      maxZoom: 17,
      subdomains: "abc",
      attribution:
        'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    };

    const ESRI_LABELS = {
      url: "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      maxZoom: 19,
      opacity: 0.92,
      attribution: "Labels &copy; Esri",
    };

    const schemeIsDark = () => {
      const t = document.documentElement.getAttribute("data-theme");
      if (t === "dark") return true;
      if (t === "light") return false;
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    };

    let perspective = "standard";
    let labelsOn = true;
    let baseTileLayer = null;
    let labelsTileLayer = null;

    const removeTileStack = () => {
      if (labelsTileLayer) {
        map.removeLayer(labelsTileLayer);
        labelsTileLayer = null;
      }
      if (baseTileLayer) {
        map.removeLayer(baseTileLayer);
        baseTileLayer = null;
      }
    };

    const applyMapTiles = () => {
      removeTileStack();

      if (perspective === "standard") {
        const dark = schemeIsDark();
        baseTileLayer = L.tileLayer(dark ? CARTO_DARK : CARTO_LIGHT, cartoOpts).addTo(map);
        return;
      }

      if (perspective === "satellite") {
        baseTileLayer = L.tileLayer(ESRI_IMAGERY.url, {
          maxZoom: ESRI_IMAGERY.maxZoom,
          attribution: ESRI_IMAGERY.attribution,
        }).addTo(map);
      } else {
        baseTileLayer = L.tileLayer(OPEN_TOPO.url, {
          maxZoom: OPEN_TOPO.maxZoom,
          subdomains: OPEN_TOPO.subdomains,
          attribution: OPEN_TOPO.attribution,
        }).addTo(map);
      }

      if (labelsOn) {
        labelsTileLayer = L.tileLayer(ESRI_LABELS.url, {
          maxZoom: ESRI_LABELS.maxZoom,
          opacity: ESRI_LABELS.opacity,
          attribution: ESRI_LABELS.attribution,
        }).addTo(map);
      }
    };
    applyMapTiles();

    const markers = [];
    let selectedIndex = -1;

    const refreshMarkerIcons = () => {
      markers.forEach((m, markerIdx) => {
        const place = places[markerIdx];
        if (!place) return;
        const active = markerIdx === selectedIndex;
        m.setIcon(makeMarkerIcon(L, place.poi, active));
      });
    };

    const syncPerspectiveUi = () => {
      const wrap = container.querySelector(".fm-map-wrap");
      if (!wrap) return;
      wrap.querySelectorAll("[data-fm-perspective]").forEach((btn) => {
        const id = btn.getAttribute("data-fm-perspective");
        btn.classList.toggle("is-active", id === perspective);
        btn.setAttribute("aria-pressed", id === perspective ? "true" : "false");
      });
      const labelsInput = wrap.querySelector("[data-fm-labels]");
      const labelsWrap = wrap.querySelector(".fm-labels-toggle");
      if (labelsInput && labelsWrap) {
        const std = perspective === "standard";
        labelsWrap.classList.toggle("is-disabled", std);
        labelsInput.disabled = std;
        if (!std) {
          labelsInput.checked = labelsOn;
          labelsInput.indeterminate = false;
        }
      }
    };
    syncPerspectiveUi();

    const onAppearanceChange = () => {
      applyMapTiles();
      refreshMarkerIcons();
      map.invalidateSize();
    };

    const toolbar = container.querySelector(".fm-map-toolbar");
    if (toolbar) {
      toolbar.querySelectorAll("[data-fm-perspective]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const next = btn.getAttribute("data-fm-perspective");
          if (!next || next === perspective) return;
          perspective = next;
          syncPerspectiveUi();
          applyMapTiles();
          if (perspective === "terrain" && map.getZoom() > 17) map.setZoom(17);
          map.invalidateSize();
        });
      });
      const labelsInput = toolbar.querySelector("[data-fm-labels]");
      if (labelsInput) {
        labelsInput.addEventListener("change", () => {
          labelsOn = labelsInput.checked;
          applyMapTiles();
          map.invalidateSize();
        });
      }
    }

    const schemeMq = window.matchMedia("(prefers-color-scheme: dark)");
    schemeMq.addEventListener("change", onAppearanceChange);

    const schemeObserver = new MutationObserver(onAppearanceChange);
    schemeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    let visibleIndexes = places.map((_, idx) => idx);
    const focusForIndexes = (indexes) => {
      if (indexes.length === 0) return;
      if (indexes.length === 1) {
        const p = places[indexes[0]];
        map.setView([p.lat, p.lon], 15, { animate: true });
        return;
      }
      let minLat = 90;
      let maxLat = -90;
      let minLon = 180;
      let maxLon = -180;
      indexes.forEach((idx) => {
        const p = places[idx];
        minLat = Math.min(minLat, p.lat);
        maxLat = Math.max(maxLat, p.lat);
        minLon = Math.min(minLon, p.lon);
        maxLon = Math.max(maxLon, p.lon);
      });
      const latSpan = maxLat - minLat;
      const lonSpan = maxLon - minLon;
      if (latSpan > 35 || lonSpan > 70) {
        const p = places[indexes[0]];
        map.setView([p.lat, p.lon], 13, { animate: true });
        return;
      }
      const bounds = L.latLngBounds(indexes.map((idx) => [places[idx].lat, places[idx].lon]));
      map.fitBounds(bounds.pad(0.24), { animate: true, maxZoom: 15 });
    };

    const selectPlace = (idx, pan = true) => {
      if (idx < 0 || idx >= places.length) return;
      selectedIndex = idx;
      const place = places[idx];
      const marker = markers[idx];

      resultsEl.querySelectorAll(".fm-result").forEach((el) => {
        const match = Number(el.getAttribute("data-fm-index")) === idx;
        el.classList.toggle("is-active", match);
      });

      refreshMarkerIcons();

      infoEl.innerHTML = buildInfoHtml(place);
      marker.bindPopup(`<strong>${esc(place.name)}</strong><br>${esc(place.address || place.kind)}`);
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

      focusForIndexes(visibleIndexes);
      if (!visibleIndexes.includes(selectedIndex) && visibleIndexes.length > 0) {
        selectPlace(visibleIndexes[0], false);
      }
    };

    places.forEach((place, idx) => {
      const marker = L.marker([place.lat, place.lon], {
        icon: makeMarkerIcon(L, place.poi, false),
        title: place.name,
      }).addTo(map);
      marker.on("click", () => selectPlace(idx, true));
      markers.push(marker);
    });

    if (markers.length > 0) {
      focusForIndexes(visibleIndexes);
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
    setTimeout(onResize, 80);
    requestAnimationFrame(() => requestAnimationFrame(onResize));

    activeView = {
      teardown() {
        schemeMq.removeEventListener("change", onAppearanceChange);
        schemeObserver.disconnect();
        window.removeEventListener("resize", onResize);
        map.remove();
        setFullMapMode(false);
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
      setFullMapMode(false);
      return;
    }

    const container = document.getElementById("results-list");
    if (!container) return;
    if (container.querySelector(".full-map-root")) return;
    setFullMapMode(true);

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
