(function () {
  const TAB_TYPE = "tab:full-map";
  const PAYLOAD_PREFIX = "[fullmap:";
  const PAYLOAD_SUFFIX = "]";
  const LEAFLET_CSS_ID = "full-map-leaflet-css";
  const LEAFLET_SRC = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
  const LEAFLET_CSS_SRC = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  const FA_CSS_ID = "full-map-fontawesome-css";
  /** Font Awesome 6 Free (all + webfonts); same CDN family as Leaflet unpkg. */
  const FA_CSS_HREF = "https://unpkg.com/@fortawesome/fontawesome-free@6.5.2/css/all.min.css";

  let leafletPromise = null;
  let fontAwesomePromise = null;
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

  /** `icon`: Font Awesome 6 solid class suffix (e.g. fa-utensils). `fallback`: emoji if FA CSS fails. */
  const POI_STYLES = {
    food: { icon: "fa-utensils", fallback: "🍽", bg: "#ea580c" },
    drink: { icon: "fa-mug-saucer", fallback: "🍺", bg: "#9333ea" },
    grocery: { icon: "fa-basket-shopping", fallback: "🛒", bg: "#16a34a" },
    shop: { icon: "fa-bag-shopping", fallback: "🛍", bg: "#db2777" },
    shop_large: { icon: "fa-store", fallback: "🏬", bg: "#be185d" },
    fashion: { icon: "fa-shirt", fallback: "👕", bg: "#ec4899" },
    tech: { icon: "fa-laptop", fallback: "💻", bg: "#6366f1" },
    vehicle_shop: { icon: "fa-screwdriver-wrench", fallback: "🔧", bg: "#475569" },
    beauty: { icon: "fa-spa", fallback: "💇", bg: "#f472b6" },
    lodging: { icon: "fa-hotel", fallback: "🏨", bg: "#0d9488" },
    sight: { icon: "fa-binoculars", fallback: "🎭", bg: "#7c3aed" },
    tourism: { icon: "fa-camera", fallback: "📷", bg: "#8b5cf6" },
    info: { icon: "fa-circle-info", fallback: "ℹ️", bg: "#64748b" },
    park: { icon: "fa-tree", fallback: "🌳", bg: "#15803d" },
    sport: { icon: "fa-futbol", fallback: "⚽", bg: "#22c55e" },
    leisure: { icon: "fa-dice", fallback: "🎯", bg: "#14b8a6" },
    transit_rail: { icon: "fa-train-subway", fallback: "🚉", bg: "#2563eb" },
    transit_bus: { icon: "fa-bus", fallback: "🚌", bg: "#1d4ed8" },
    transit: { icon: "fa-route", fallback: "🚏", bg: "#1e40af" },
    air: { icon: "fa-plane-departure", fallback: "✈️", bg: "#0369a1" },
    fuel: { icon: "fa-gas-pump", fallback: "⛽", bg: "#b45309" },
    parking: { icon: "fa-square-parking", fallback: "🅿️", bg: "#57534e" },
    health: { icon: "fa-pills", fallback: "💊", bg: "#dc2626" },
    medical: { icon: "fa-hospital", fallback: "🏥", bg: "#b91c1c" },
    money: { icon: "fa-building-columns", fallback: "🏧", bg: "#0f766e" },
    education: { icon: "fa-graduation-cap", fallback: "🎓", bg: "#4f46e5" },
    worship: { icon: "fa-place-of-worship", fallback: "⛪", bg: "#6d28d9" },
    culture: { icon: "fa-masks-theater", fallback: "🎬", bg: "#a21caf" },
    civic: { icon: "fa-landmark-flag", fallback: "🏛", bg: "#334155" },
    service: { icon: "fa-restroom", fallback: "🚻", bg: "#78716c" },
    historic: { icon: "fa-landmark", fallback: "🏛️", bg: "#92400e" },
    office: { icon: "fa-building", fallback: "🏢", bg: "#475569" },
    craft: { icon: "fa-hammer", fallback: "🔨", bg: "#78716c" },
    nature: { icon: "fa-mountain-sun", fallback: "🏔", bg: "#0f766e" },
    admin: { icon: "fa-map-location-dot", fallback: "📍", bg: "#64748b" },
    place: { icon: "fa-location-dot", fallback: "📍", bg: "#2563eb" },
  };

  const styleForPoi = (poi) => POI_STYLES[poi] || POI_STYLES.place;

  const ensureFontAwesome = () => {
    if (document.getElementById(FA_CSS_ID)?.dataset.loaded === "1") {
      return Promise.resolve(true);
    }
    if (fontAwesomePromise) return fontAwesomePromise;

    fontAwesomePromise = new Promise((resolve) => {
      let link = document.getElementById(FA_CSS_ID);
      const ok = () => {
        if (link) link.dataset.loaded = "1";
        resolve(true);
      };
      const bad = () => {
        fontAwesomePromise = null;
        const failed = document.getElementById(FA_CSS_ID);
        if (failed) failed.remove();
        resolve(false);
      };

      if (!link) {
        link = document.createElement("link");
        link.id = FA_CSS_ID;
        link.rel = "stylesheet";
        link.href = FA_CSS_HREF;
        link.onload = ok;
        link.onerror = bad;
        document.head.appendChild(link);
      } else {
        if (link.sheet || link.dataset.loaded === "1") {
          link.dataset.loaded = "1";
          resolve(true);
          return;
        }
        link.onload = ok;
        link.onerror = bad;
      }
    });
    return fontAwesomePromise;
  };

  const makeMarkerIcon = (Leaflet, poi, active, useFa) => {
    const st = styleForPoi(poi);
    const size = active ? 40 : 34;
    const bg = st.bg;
    const inner = useFa
      ? `<i class="fa-solid ${st.icon} fm-marker-fa" aria-hidden="true"></i>`
      : `<span class="fm-marker-emoji">${st.fallback}</span>`;
    return Leaflet.divIcon({
      className: "fm-marker-wrap",
      html: `<div class="fm-marker-pin${active ? " is-active" : ""}" style="--fm-pin-bg:${bg}">${inner}</div>`,
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
      const bin = atob(padded);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 0xff;
      const json = new TextDecoder("utf-8").decode(bytes);
      return JSON.parse(json);
    } catch {
      return null;
    }
  };

  /** Same rules as server `pickPoiCategory` (fallback if `poi` missing or stale). */
  const derivePoiFromOsm = (osmKeyRaw, osmValueRaw) => {
    const k = String(osmKeyRaw || "").trim().toLowerCase();
    const v = String(osmValueRaw || "").trim().toLowerCase();
    if (!k && !v) return "place";

    if (k === "amenity") {
      if (
        ["restaurant", "cafe", "fast_food", "food_court", "ice_cream", "biergarten", "street_food"].includes(v)
      ) {
        return "food";
      }
      if (["bar", "pub", "nightclub"].includes(v)) return "drink";
      if (["pharmacy"].includes(v)) return "health";
      if (["hospital", "clinic", "doctors", "dentist", "veterinary"].includes(v)) return "medical";
      if (["bank", "atm", "bureau_de_change"].includes(v)) return "money";
      if (["fuel", "charging_station"].includes(v)) return "fuel";
      if (["parking", "parking_space", "bicycle_parking"].includes(v)) return "parking";
      if (["place_of_worship"].includes(v)) return "worship";
      if (["school", "kindergarten", "college", "university", "library"].includes(v)) return "education";
      if (["theatre", "cinema", "arts_centre", "community_centre"].includes(v)) return "culture";
      if (["post_office", "police", "fire_station", "townhall", "courthouse"].includes(v)) return "civic";
      if (["toilets", "shower", "drinking_water", "shelter"].includes(v)) return "service";
    }
    if (k === "shop") {
      if (["supermarket", "greengrocer", "bakery", "butcher", "convenience", "alcohol", "beverages"].includes(v)) {
        return "grocery";
      }
      if (["mall", "department_store", "general"].includes(v)) return "shop_large";
      if (["clothes", "shoes", "jewelry", "bag", "boutique"].includes(v)) return "fashion";
      if (["electronics", "computer", "mobile_phone", "hifi"].includes(v)) return "tech";
      if (["car", "car_parts", "bicycle", "motorcycle"].includes(v)) return "vehicle_shop";
      if (["hairdresser", "beauty", "cosmetics"].includes(v)) return "beauty";
      return "shop";
    }
    if (k === "tourism") {
      if (["hotel", "motel", "guest_house", "hostel", "chalet", "apartment"].includes(v)) return "lodging";
      if (["museum", "gallery", "artwork", "attraction", "viewpoint"].includes(v)) return "sight";
      if (["information", "map"].includes(v)) return "info";
      return "tourism";
    }
    if (k === "leisure") {
      if (["park", "garden", "nature_reserve"].includes(v)) return "park";
      if (["playground", "pitch", "sports_centre", "stadium", "swimming_pool", "fitness_centre"].includes(v)) {
        return "sport";
      }
      return "leisure";
    }
    if (k === "railway") {
      if (
        ["station", "halt", "stop", "tram_stop", "subway_entrance", "light_rail", "platform"].includes(v)
      ) {
        return "transit_rail";
      }
    }
    if (k === "highway" && v === "bus_stop") return "transit_bus";
    if (k === "public_transport" || k === "route") return "transit";
    if (k === "aeroway" && ["aerodrome", "terminal", "gate", "helipad"].includes(v)) return "air";
    if (k === "historic") return "historic";
    if (k === "office") return "office";
    if (k === "craft") return "craft";
    if (k === "natural" && ["peak", "volcano", "cliff", "water", "bay", "beach"].includes(v)) return "nature";
    if (k === "boundary" && v === "administrative") return "admin";
    return "place";
  };

  /**
   * When Photon omits OSM tags in the payload, `kind` still mirrors `humanizeKind`
   * on the server (OSM value/key with _/- → spaces). Map common phrases to POI buckets.
   */
  const derivePoiFromKind = (kindRaw) => {
    const s = String(kindRaw || "")
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");
    if (!s) return "place";

    const has = (...words) => words.some((w) => s === w || s.includes(w));

    if (
      has(
        "fast food",
        "food court",
        "ice cream",
        "biergarten",
        "street food",
        "restaurant",
        "cafe",
        "coffee",
      )
    ) {
      return "food";
    }
    if (has("bar", "pub", "nightclub")) return "drink";
    if (/\b(pharmacy|chemist)\b/.test(s)) return "health";
    if (/\b(hospital|clinic|doctors|dentist|veterinary)\b/.test(s)) return "medical";
    if (/\b(bank|atm|bureau de change)\b/.test(s)) return "money";
    if (has("fuel", "charging station")) return "fuel";
    if (has("parking", "bicycle parking")) return "parking";
    if (has("place of worship", "mosque", "synagogue")) return "worship";
    if (has("school", "kindergarten", "college", "university", "library")) return "education";
    if (has("theatre", "theater", "cinema", "arts centre", "community centre")) return "culture";
    if (has("post office", "police", "fire station", "townhall", "town hall", "courthouse")) {
      return "civic";
    }
    if (has("toilets", "toilet", "shower", "drinking water", "shelter")) return "service";

    if (
      has(
        "supermarket",
        "greengrocer",
        "bakery",
        "butcher",
        "convenience",
        "alcohol",
        "beverages",
      )
    ) {
      return "grocery";
    }
    if (has("mall", "department store")) return "shop_large";
    if (has("clothes", "shoes", "jewelry", "jewellery", "boutique")) return "fashion";
    if (has("electronics", "computer", "mobile phone", "hifi", "hi fi")) return "tech";
    if (/\b(car parts|bicycle|motorcycle)\b/.test(s) || /\bcar\b/.test(s)) return "vehicle_shop";
    if (has("hairdresser", "beauty", "cosmetics")) return "beauty";
    if (/\b(shop|store|boutique)\b/.test(s) && !/\bworkshop\b/.test(s)) return "shop";

    if (has("hotel", "motel", "guest house", "hostel", "chalet")) return "lodging";
    if (has("museum", "gallery", "artwork", "attraction", "viewpoint")) return "sight";
    if (has("information", "map")) return "info";
    if (has("tourism")) return "tourism";

    if (has("nature reserve")) return "park";
    if (has("park", "garden")) return "park";
    if (has("playground", "sports centre", "sports center", "stadium", "swimming pool", "fitness centre")) {
      return "sport";
    }
    if (has("leisure")) return "leisure";

    if (has("station", "tram stop", "subway", "light rail", "railway")) return "transit_rail";
    if (has("bus stop")) return "transit_bus";
    if (has("aerodrome", "airport", "helipad")) return "air";
    if (has("historic")) return "historic";
    if (has("office")) return "office";
    if (has("craft")) return "craft";
    if (has("peak", "volcano", "cliff", "beach")) return "nature";
    if (has("administrative", "boundary")) return "admin";

    return "place";
  };

  const resolvePoi = (payload) => {
    const osmKey = String(payload.osmKey ?? payload.osm_key ?? "").trim();
    const osmValue = String(payload.osmValue ?? payload.osm_value ?? "").trim();
    const kindStr = String(payload.kind ?? "").trim();
    const fromOsm = osmKey && osmValue ? derivePoiFromOsm(osmKey, osmValue) : "place";
    const fromKind = kindStr ? derivePoiFromKind(kindStr) : "place";
    const fromPayload = String(payload.poi ?? "").trim();

    if (fromOsm !== "place") return fromOsm;
    if (fromPayload && fromPayload !== "place") return fromPayload;
    if (fromKind !== "place") return fromKind;
    return "place";
  };

  const finiteOr = (n, fallback = null) => {
    const x = Number(n);
    return Number.isFinite(x) ? x : fallback;
  };

  /**
   * Defense-in-depth against Wikipedia's geosearch attaching a nearby but
   * unrelated article to a place (e.g. "Wels Hauptbahnhof" sticking onto a
   * Wok & Box across the street). Server applies the same check; this one
   * also filters stale cached payloads issued before the server restart.
   */
  const _normalizeForMatch = (value) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const isWikiRelevantToPlace = (wikiTitle, placeName) => {
    const wt = _normalizeForMatch(wikiTitle);
    const pn = _normalizeForMatch(placeName);
    if (!wt || !pn) return false;
    if (wt === pn) return true;
    if (wt.includes(pn) || pn.includes(wt)) return true;
    const wTokens = new Set(wt.split(" ").filter((t) => t.length >= 4));
    const pTokens = pn.split(" ").filter((t) => t.length >= 4);
    const shared = pTokens.filter((t) => wTokens.has(t));
    if (shared.length >= 2) return true;
    if (shared.length === 1 && shared[0].length >= 6) return true;
    return false;
  };

  /** Route remote images through degoog proxy (Wikipedia / Tripadvisor CDNs, mixed content). */
  const proxiedImageSrc = (url) => {
    const u = String(url || "").trim();
    if (!u) return "";
    if (u.startsWith("/api/proxy/image")) return u;
    if (u.startsWith("http://") || u.startsWith("https://")) {
      return `/api/proxy/image?url=${encodeURIComponent(u)}`;
    }
    return u;
  };

  const parsePayloadFromSnippet = (snippet) => {
    const text = (snippet || "").trim();
    const m = text.match(/^\[fullmap:\s*([A-Za-z0-9_-]+=*)\s*\]/i);
    if (!m) return null;
    const token = m[1];
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
      const osmKey = String(payload.osmKey ?? payload.osm_key ?? "").trim();
      const osmValue = String(payload.osmValue ?? payload.osm_value ?? "").trim();
      const poi = resolvePoi(payload);
      const placeName = String(payload.name || titleEl.textContent || "Place");
      const rawWikiTitle = String(payload.wikiTitle || "");
      const wikiOk = rawWikiTitle && isWikiRelevantToPlace(rawWikiTitle, placeName);
      places.push({
        id: String(payload.id || `${lat},${lon}`),
        name: placeName,
        lat,
        lon,
        address: String(payload.address || ""),
        kind: String(payload.kind || "place"),
        poi,
        osmKey,
        osmValue,
        city: String(payload.city || ""),
        country: String(payload.country || ""),
        sourceUrl: String(payload.sourceUrl || titleEl.getAttribute("href") || "#"),
        website: String(payload.website || ""),
        phone: String(payload.phone || ""),
        openingHours: String(payload.openingHours || ""),
        wikiTitle: wikiOk ? rawWikiTitle : "",
        wikiSummary: wikiOk ? String(payload.wikiSummary || "") : "",
        image: wikiOk ? String(payload.image || "") : "",
        reviewRating: finiteOr(payload.reviewRating, null),
        reviewMax: finiteOr(payload.reviewMax, 5) ?? 5,
        reviewCount: finiteOr(payload.reviewCount, null),
        reviewUrl: String(payload.reviewUrl || ""),
        reviewImageUrl: String(payload.reviewImageUrl || ""),
        reviewSource: String(payload.reviewSource || ""),
        reviewName: String(payload.reviewName || ""),
        osmStars: finiteOr(payload.osmStars, null),
        osmStarsMax: finiteOr(payload.osmStarsMax, 5) ?? 5,
        osmFoodHygiene: finiteOr(payload.osmFoodHygiene, null),
        osmFoodHygieneMax: finiteOr(payload.osmFoodHygieneMax, 5) ?? 5,
        taDescription: String(payload.taDescription || ""),
        taPhone: String(payload.taPhone || ""),
        taWebsite: String(payload.taWebsite || ""),
        taAddress: String(payload.taAddress || ""),
        taCategory: String(payload.taCategory || ""),
        taRankingString: String(payload.taRankingString || ""),
        taPriceLevel: String(payload.taPriceLevel || ""),
        taWeekdayHours: Array.isArray(payload.taWeekdayHours) ? payload.taWeekdayHours.slice(0, 7) : [],
        taPhotos: Array.isArray(payload.taPhotos)
          ? payload.taPhotos
              .filter((p) => p && typeof p.src === "string")
              .map((p) => ({ src: String(p.src), caption: String(p.caption || "") }))
              .slice(0, 6)
          : [],
        taReviews: Array.isArray(payload.taReviews)
          ? payload.taReviews
              .filter((r) => r && (r.title || r.text))
              .map((r) => ({
                title: String(r.title || ""),
                text: String(r.text || ""),
                rating: finiteOr(r.rating, null),
                ratingImageUrl: String(r.ratingImageUrl || ""),
                date: String(r.date || ""),
                user: String(r.user || ""),
                url: String(r.url || ""),
              }))
              .slice(0, 5)
          : [],
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

  /** Render `n` solid + `m` empty bubble dots using SVG (deterministic, theme-safe). */
  const renderBubbleDots = (rating, max = 5) => {
    const r = Math.max(0, Math.min(Number(max) || 5, Number(rating) || 0));
    const full = Math.floor(r);
    const half = r - full >= 0.5 ? 1 : 0;
    const empty = Math.max(0, Math.floor(Number(max) || 5) - full - half);
    const dot = (kind) => {
      if (kind === "full") {
        return '<span class="fm-dot fm-dot--full" aria-hidden="true"></span>';
      }
      if (kind === "half") {
        return '<span class="fm-dot fm-dot--half" aria-hidden="true"></span>';
      }
      return '<span class="fm-dot fm-dot--empty" aria-hidden="true"></span>';
    };
    return (
      `<span class="fm-dots" role="img" aria-label="${esc(r.toFixed(1) + " of " + max)}">` +
      dot("full").repeat(full) +
      (half ? dot("half") : "") +
      dot("empty").repeat(empty) +
      "</span>"
    );
  };

  const formatReviewDate = (raw) => {
    const s = String(raw || "").trim();
    if (!s) return "";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  };

  const renderTripadvisorHeader = (place) => {
    const rating = finiteOr(place.reviewRating, null);
    if (rating == null || place.reviewSource !== "tripadvisor") return "";
    const count = finiteOr(place.reviewCount, null);
    const countStr = count != null && count > 0 ? ` (${count.toLocaleString()})` : "";
    const inner =
      `<i class="fa-solid fa-star fm-ta-star" aria-hidden="true"></i>` +
      `<span class="fm-ta-label">Tripadvisor${esc(countStr)}</span>` +
      renderBubbleDots(rating, place.reviewMax || 5);
    if (place.reviewUrl) {
      return `<a class="fm-ta-header" href="${esc(place.reviewUrl)}" target="_blank" rel="noopener">${inner}</a>`;
    }
    return `<div class="fm-ta-header">${inner}</div>`;
  };

  const renderHoursBlock = (place) => {
    const rows = Array.isArray(place.taWeekdayHours) ? place.taWeekdayHours : [];
    const osmHours = String(place.openingHours || "").trim();
    if (rows.length === 0 && !osmHours) return "";
    const todayIdx = (new Date().getDay() + 6) % 7; // 0 = Monday-ish for weekday_text
    const todayRow = rows[todayIdx] || rows[0] || osmHours;
    if (rows.length === 0) {
      return `<div class="fm-row fm-row-hours"><i class="fa-regular fa-clock fm-row-ico" aria-hidden="true"></i><div class="fm-row-body"><div class="fm-row-line">${esc(osmHours)}</div></div></div>`;
    }
    const list = rows
      .map((line, i) => {
        const parts = String(line).split(/:\s*/);
        const day = parts.shift() || "";
        const rest = parts.join(": ");
        return `<li class="${i === todayIdx ? "is-today" : ""}"><span class="fm-hours-day">${esc(day)}</span><span class="fm-hours-time">${esc(rest)}</span></li>`;
      })
      .join("");
    return `
      <details class="fm-row fm-row-hours fm-hours-wrap">
        <summary>
          <i class="fa-regular fa-clock fm-row-ico" aria-hidden="true"></i>
          <div class="fm-row-body">
            <div class="fm-row-line"><span class="fm-hours-label">Opening hours</span> <span class="fm-row-sub">${esc(String(todayRow).replace(/^[A-Za-z]+:\s*/, ""))}</span></div>
          </div>
          <i class="fa-solid fa-chevron-down fm-row-chev" aria-hidden="true"></i>
        </summary>
        <ul class="fm-hours-list">${list}</ul>
      </details>
    `;
  };

  const renderGallery = (place) => {
    const photos = Array.isArray(place.taPhotos) ? place.taPhotos : [];
    /** Prefer TA photos (about this place) over the wiki thumbnail, which may
     *  come from an unrelated nearby article that still slipped through. */
    const hero = photos[0]?.src || place.image;
    if (!hero && photos.length === 0) return "";
    const heroSrc = hero ? proxiedImageSrc(hero) : "";
    const tiles = photos
      .slice(hero && photos[0]?.src === hero ? 1 : 0, 5)
      .map((p) => {
        const src = proxiedImageSrc(p.src);
        const alt = p.caption || "";
        const href = p.src;
        return `<a class="fm-gallery-tile" href="${esc(href)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(src)}" alt="${esc(alt)}"></a>`;
      })
      .join("");
    return `
      <div class="fm-gallery">
        ${heroSrc ? `<a class="fm-gallery-hero" href="${esc(hero)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(heroSrc)}" alt="${esc(place.name)}"></a>` : ""}
        ${tiles ? `<div class="fm-gallery-tiles">${tiles}</div>` : ""}
      </div>
    `;
  };

  const renderInfoRows = (place) => {
    const rows = [];
    const address = place.taAddress || place.address;
    if (address) {
      rows.push(
        `<div class="fm-row"><i class="fa-solid fa-location-dot fm-row-ico" aria-hidden="true"></i><div class="fm-row-body"><div class="fm-row-line">${esc(address)}</div></div></div>`,
      );
      const dirUrl = `https://www.openstreetmap.org/directions?to=${encodeURIComponent(place.lat + "," + place.lon)}`;
      rows.push(
        `<a class="fm-row fm-row-link" href="${esc(dirUrl)}" target="_blank" rel="noopener"><i class="fa-solid fa-diamond-turn-right fm-row-ico" aria-hidden="true"></i><div class="fm-row-body"><div class="fm-row-line">Directions</div></div></a>`,
      );
    }
    const website = place.taWebsite || place.website;
    if (website) {
      const display = website.replace(/^https?:\/\//i, "").replace(/\/$/, "");
      rows.push(
        `<a class="fm-row fm-row-link" href="${esc(website)}" target="_blank" rel="noopener"><i class="fa-solid fa-globe fm-row-ico" aria-hidden="true"></i><div class="fm-row-body"><div class="fm-row-line">${esc(display)}</div></div></a>`,
      );
    }
    const phone = place.taPhone || place.phone;
    if (phone) {
      const tel = phone.replace(/[^0-9+]/g, "");
      rows.push(
        `<a class="fm-row fm-row-link" href="tel:${esc(tel)}"><i class="fa-solid fa-phone fm-row-ico" aria-hidden="true"></i><div class="fm-row-body"><div class="fm-row-line">${esc(phone)}</div></div></a>`,
      );
    }
    return rows.join("");
  };

  const renderDescription = (place) => {
    const text = place.taDescription || place.wikiSummary;
    if (!text) return "";
    return `
      <section class="fm-section">
        <h4 class="fm-section-title">Description</h4>
        <p class="fm-section-body">${esc(text)}</p>
      </section>
    `;
  };

  const renderReviews = (place) => {
    const reviews = Array.isArray(place.taReviews) ? place.taReviews : [];
    if (reviews.length === 0) return "";
    const items = reviews
      .map((r) => {
        const bubbles = r.rating != null ? renderBubbleDots(r.rating, 5) : "";
        const score = r.rating != null ? Number(r.rating).toFixed(1) : "";
        const date = formatReviewDate(r.date);
        const head = [bubbles, score ? `<span class="fm-review-score">${esc(score)}</span>` : "", date ? `<span class="fm-review-date">${esc(date)}</span>` : ""]
          .filter(Boolean)
          .join(" <span class=\"fm-review-sep\">·</span> ");
        const body = r.text
          ? `<p class="fm-review-body">${esc(r.text)}${r.url ? ` <a class="fm-review-more" href="${esc(r.url)}" target="_blank" rel="noopener">Read more</a>` : ""}</p>`
          : "";
        return `
          <article class="fm-review">
            ${r.title ? `<h5 class="fm-review-title">${esc(r.title)}</h5>` : ""}
            <div class="fm-review-meta">${head}</div>
            ${body}
          </article>`;
      })
      .join("");
    const footer = place.reviewUrl
      ? `<p class="fm-reviews-footer">View more reviews on <a href="${esc(place.reviewUrl)}" target="_blank" rel="noopener">Tripadvisor</a></p>`
      : "";
    return `
      <section class="fm-section">
        <h4 class="fm-section-title">Reviews</h4>
        <div class="fm-reviews-list">${items}</div>
        ${footer}
      </section>
    `;
  };

  /** Fallback when Tripadvisor is absent: OSM stars or UK FHRS, keeps older behavior. */
  const renderOsmRating = (place) => {
    const osmStars = finiteOr(place.osmStars, null);
    const osmStarsMax = finiteOr(place.osmStarsMax, 5) || 5;
    if (osmStars != null) {
      const fill = Math.min(100, Math.max(0, (osmStars / osmStarsMax) * 100));
      return `<div class="fm-rating fm-rating--osm">
          <div class="fm-rating-head">Lodging class (from OpenStreetMap <code>stars</code>)</div>
          <div class="fm-rating-head"><span class="fm-rating-score">${esc(String(osmStars))}</span><span class="fm-rating-out">/${esc(String(osmStarsMax))}</span> stars</div>
          <div class="fm-star-track" aria-hidden="true"><div class="fm-star-fill" style="width:${fill}%"></div></div>
        </div>`;
    }
    const fhrs = finiteOr(place.osmFoodHygiene, null);
    const fhrsMax = finiteOr(place.osmFoodHygieneMax, 5) || 5;
    if (fhrs != null) {
      const fill = Math.min(100, Math.max(0, (fhrs / fhrsMax) * 100));
      return `<div class="fm-rating fm-rating--osm">
          <div class="fm-rating-head">Food hygiene (from OSM <code>fhrs:rating</code>, UK)</div>
          <div class="fm-rating-head"><span class="fm-rating-score">${esc(String(fhrs))}</span><span class="fm-rating-out">/${esc(String(fhrsMax))}</span></div>
          <div class="fm-star-track fm-star-track--fhrs" aria-hidden="true"><div class="fm-star-fill fm-star-fill--fhrs" style="width:${fill}%"></div></div>
        </div>`;
    }
    return "";
  };

  const buildInfoHtml = (place) => {
    const taHeader = renderTripadvisorHeader(place);
    const hoursBlock = renderHoursBlock(place);
    const gallery = renderGallery(place);
    const infoRows = renderInfoRows(place);
    const description = renderDescription(place);
    const reviewsSection = renderReviews(place);

    const osmFallback =
      !taHeader && place.reviewSource !== "tripadvisor" ? renderOsmRating(place) : "";

    const missingKeyHint =
      !taHeader && !place.taReviews?.length && !place.taPhotos?.length
        ? `<p class="fm-ta-empty">No Tripadvisor data for this place. Add a <strong>Tripadvisor Content</strong> API key under <strong>Settings → Engines → Maps → Full Map (Tripadvisor)</strong>.</p>`
        : "";

    const osmLink = `<a class="fm-open-link" href="${esc(place.sourceUrl)}" target="_blank" rel="noopener">Open in OpenStreetMap</a>`;

    return `
      <div class="fm-detail">
        <header class="fm-detail-head">
          <h3 class="fm-detail-title">${esc(place.name)}</h3>
          ${taHeader}
        </header>
        ${hoursBlock}
        ${gallery}
        <div class="fm-rows">${infoRows}</div>
        ${description}
        ${osmFallback}
        ${reviewsSection}
        ${missingKeyHint}
        <div class="fm-detail-footer">${osmLink}</div>
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
    const [L, faOk] = await Promise.all([
      ensureLeaflet().catch(() => null),
      ensureFontAwesome().catch(() => false),
    ]);
    const useFaIcons = faOk === true;

    if (!L) {
      container.innerHTML =
        '<section class="full-map-root"><p class="fm-error">Map library failed to load.</p></section>';
      return;
    }

    const listItems = places
      .map((place, idx) => {
        const st = styleForPoi(place.poi);
        const ico = useFaIcons
          ? `<span class="fm-result-ico fm-result-ico--fa" style="--fm-ico:${st.bg}" aria-hidden="true"><i class="fa-solid ${st.icon}"></i></span>`
          : `<span class="fm-result-ico" aria-hidden="true">${st.fallback}</span>`;
        return `
      <button type="button" class="fm-result" data-fm-index="${idx}">
        ${ico}
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
        m.setIcon(makeMarkerIcon(L, place.poi, active, useFaIcons));
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
        icon: makeMarkerIcon(L, place.poi, false, useFaIcons),
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
