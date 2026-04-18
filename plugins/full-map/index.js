const MAP_PAYLOAD_PREFIX = "[fullmap:";
const MAP_PAYLOAD_SUFFIX = "]";

const safeTrim = (value) => (typeof value === "string" ? value.trim() : "");

const toBase64Url = (obj) => {
  try {
    return Buffer.from(JSON.stringify(obj), "utf-8").toString("base64url");
  } catch {
    return "";
  }
};

const sanitizeText = (value, fallback = "") => {
  const trimmed = safeTrim(value);
  return trimmed || fallback;
};

const toCoord = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const humanizeKind = (feature) => {
  const props = feature?.properties || {};
  const key = sanitizeText(props.osm_key);
  const value = sanitizeText(props.osm_value);
  const raw = value || key;
  if (!raw) return "place";
  return raw.replace(/[_-]/g, " ");
};

/** Photon / Nominatim-style OSM tags (field names vary by build). */
const normalizePhotonOsm = (props) => {
  let k = sanitizeText(props.osm_key ?? props["osm:key"] ?? props.osmKey);
  let v = sanitizeText(props.osm_value ?? props["osm:value"] ?? props.osmValue);
  const t = sanitizeText(props.type);
  if (!k && t.includes("/")) {
    const parts = t.split("/");
    k = sanitizeText(parts[0]).toLowerCase();
    v = sanitizeText(parts.slice(1).join("/")).toLowerCase();
  }
  if (!k && props.class && t) {
    k = sanitizeText(props.class).toLowerCase();
    v = sanitizeText(t).toLowerCase();
  }
  return { osmKey: k, osmValue: v };
};

/** Compact POI bucket for map icons (client maps to emoji / color). */
const pickPoiCategory = (props) => {
  const { osmKey: kRaw, osmValue: vRaw } = normalizePhotonOsm(props);
  const k = kRaw.toLowerCase();
  const v = vRaw.toLowerCase();

  if (k === "amenity") {
    if (
      ["restaurant", "cafe", "fast_food", "food_court", "ice_cream", "biergarten", "street_food"].includes(
        v,
      )
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
    if (["school", "kindergarten", "college", "university", "library"].includes(v)) {
      return "education";
    }
    if (["theatre", "cinema", "arts_centre", "community_centre"].includes(v)) return "culture";
    if (["post_office", "police", "fire_station", "townhall", "courthouse"].includes(v)) {
      return "civic";
    }
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
    if (["station", "halt", "tram_stop", "subway_entrance", "light_rail"].includes(v)) return "transit_rail";
    if (["platform"].includes(v)) return "transit_rail";
  }

  if (k === "highway") {
    if (["bus_stop"].includes(v)) return "transit_bus";
  }

  if (k === "public_transport" || k === "route") {
    return "transit";
  }

  if (k === "aeroway") {
    if (["aerodrome", "terminal", "gate", "helipad"].includes(v)) return "air";
  }

  if (k === "historic") return "historic";

  if (k === "office") return "office";

  if (k === "craft") return "craft";

  if (k === "natural") {
    if (["peak", "volcano", "cliff", "water", "bay", "beach"].includes(v)) return "nature";
  }

  if (k === "boundary" && v === "administrative") return "admin";

  return "place";
};

const buildAddress = (feature) => {
  const props = feature?.properties || {};
  const chunks = [
    sanitizeText(props.street),
    sanitizeText(props.housenumber),
    sanitizeText(props.postcode),
    sanitizeText(props.city || props.county || props.state),
    sanitizeText(props.country),
  ].filter(Boolean);
  return chunks.join(", ");
};

const buildOsmUrl = (osmType, osmId, lat, lon) => {
  const typeChar = safeTrim(osmType).toUpperCase();
  if ((typeChar === "N" || typeChar === "W" || typeChar === "R") && Number.isFinite(osmId)) {
    return `https://www.openstreetmap.org/${typeChar.toLowerCase()}/${osmId}`;
  }
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;
};

const fetchPhotonResults = async (query) => {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "40");
  url.searchParams.set("lang", "en");

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "degoog-full-map-tab/1.0",
    },
  });

  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  const features = Array.isArray(data?.features) ? data.features : [];
  return features;
};

const fetchWikiPreviewByCoord = async (lat, lon) => {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "geosearch",
    ggscoord: `${lat}|${lon}`,
    ggsradius: "1200",
    ggslimit: "1",
    prop: "pageimages|extracts",
    exintro: "1",
    explaintext: "1",
    exsentences: "3",
    pithumbsize: "680",
    pilimit: "1",
    origin: "*",
  });

  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "degoog-full-map-tab/1.0",
    },
  }).catch(() => null);

  if (!res || !res.ok) return null;
  const data = await res.json().catch(() => null);
  const pages = data?.query?.pages;
  if (!pages || typeof pages !== "object") return null;
  const firstPage = Object.values(pages)[0];
  if (!firstPage || typeof firstPage !== "object") return null;
  const title = sanitizeText(firstPage.title);
  const extract = sanitizeText(firstPage.extract);
  const image = sanitizeText(firstPage.thumbnail?.source);

  if (!title && !extract && !image) return null;
  return {
    title,
    extract,
    image,
  };
};

const withTimeout = async (promise, ms = 2600) => {
  let timeoutId = null;
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(null), ms);
  });
  const result = await Promise.race([promise, timeout]).catch(() => null);
  if (timeoutId != null) clearTimeout(timeoutId);
  return result;
};

const serializePlace = (place) => {
  const token = toBase64Url(place);
  if (!token) return `${MAP_PAYLOAD_PREFIX}${MAP_PAYLOAD_SUFFIX}`;
  /** Token only — do not append address (addresses may contain `]` and break clients). */
  return `${MAP_PAYLOAD_PREFIX}${token}${MAP_PAYLOAD_SUFFIX}`;
};

const fullMapTab = {
  id: "full-map",
  name: "Full Map",
  icon: "map",

  async executeSearch(query, page = 1) {
    const q = safeTrim(query);
    if (!q) return { results: [], totalPages: 1 };

    const perPage = 30;
    const curPage = Number.isFinite(page) ? Math.max(1, Math.min(10, Math.floor(page))) : 1;
    const features = await withTimeout(fetchPhotonResults(q), 3800);
    if (!Array.isArray(features) || features.length === 0) {
      return { results: [], totalPages: 1 };
    }

    const dedupe = new Set();
    const parsed = [];
    for (const feature of features) {
      const coords = Array.isArray(feature?.geometry?.coordinates) ? feature.geometry.coordinates : [];
      const lon = toCoord(coords[0]);
      const lat = toCoord(coords[1]);
      if (lat == null || lon == null) continue;

      const props = feature?.properties || {};
      const name = sanitizeText(props.name);
      if (!name) continue;

      const osmId = Number(props.osm_id);
      const osmType = sanitizeText(props.osm_type).toUpperCase();
      const key = `${osmType}:${Number.isFinite(osmId) ? osmId : `${lat.toFixed(6)},${lon.toFixed(6)}`}`;
      if (dedupe.has(key)) continue;
      dedupe.add(key);

      const address = buildAddress(feature);
      const city = sanitizeText(props.city || props.county || props.state);
      const country = sanitizeText(props.country);
      const kind = humanizeKind(feature);
      const url = buildOsmUrl(osmType, osmId, lat, lon);
      const { osmKey: normKey, osmValue: normVal } = normalizePhotonOsm(props);
      const poi = pickPoiCategory(props);
      parsed.push({
        id: key,
        name,
        lat,
        lon,
        address,
        kind,
        poi,
        osmKey: normKey,
        osmValue: normVal,
        city,
        country,
        osmType,
        osmId: Number.isFinite(osmId) ? osmId : null,
        sourceUrl: url,
        website: sanitizeText(props.website),
        phone: sanitizeText(props.phone),
        openingHours: sanitizeText(props.opening_hours),
      });
    }

    const totalPages = Math.max(1, Math.ceil(parsed.length / perPage));
    const start = (curPage - 1) * perPage;
    const pagePlaces = parsed.slice(start, start + perPage);

    const enriched = await Promise.all(
      pagePlaces.map(async (place, index) => {
        if (index > 10) return place;
        const wiki = await withTimeout(fetchWikiPreviewByCoord(place.lat, place.lon), 2200);
        if (!wiki) return place;
        return {
          ...place,
          wikiTitle: sanitizeText(wiki.title),
          wikiSummary: sanitizeText(wiki.extract),
          image: sanitizeText(wiki.image),
        };
      }),
    );

    const results = enriched.map((place) => ({
      title: place.name,
      url: place.sourceUrl,
      snippet: serializePlace(place),
      source: "Full Map",
      thumbnail: place.image || undefined,
    }));

    return { results, totalPages };
  },
};

export const tab = fullMapTab;
export default { tab: fullMapTab };
