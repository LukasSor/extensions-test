import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

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
    if (
      ["station", "halt", "stop", "tram_stop", "subway_entrance", "light_rail", "platform"].includes(v)
    ) {
      return "transit_rail";
    }
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

const fetchWikiPreviewByCoordRaw = async (lat, lon) => {
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

const fetchWikiPreviewByCoord = async (lat, lon) => {
  await ensureEnrichmentCacheLoaded();
  const wk = wikiGeoKey(lat, lon);
  const hit = wikiCacheGet(wk);
  if (hit !== undefined) return hit;
  const preview = await fetchWikiPreviewByCoordRaw(lat, lon);
  wikiCacheSet(wk, preview);
  return preview;
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const DATA_DIR = process.env.DEGOOG_DATA_DIR ?? join(process.cwd(), "data");
const CACHE_FILE = join(DATA_DIR, "plugins", "full-map-enrichment-cache.json");

const TTL_MS = {
  nominatim: 14 * 24 * 60 * 60 * 1000,
  tripadvisor: 30 * 24 * 60 * 60 * 1000,
  wiki: 7 * 24 * 60 * 60 * 1000,
  negative: 3 * 24 * 60 * 60 * 1000,
};

const MAX_CACHE_ENTRIES_PER_BUCKET = 2000;

/** @type {{ v: number, nominatim: Record<string, { ext: Record<string, string>|null, ts: number }>, tripadvisor: Record<string, { miss: boolean, patch?: object, ts: number }>, wiki: Record<string, { miss: boolean, title?: string, extract?: string, image?: string, ts: number }> } | null} */
let enrichmentCache = null;
let cacheLoadPromise = null;
let cacheDirty = false;

const emptyEnrichmentCache = () => ({
  v: 3,
  nominatim: {},
  tripadvisor: {},
  wiki: {},
});

const isFresh = (ts, ttlMs) => typeof ts === "number" && Date.now() - ts < ttlMs;

const pruneCacheBucket = (bucket) => {
  const keys = Object.keys(bucket);
  if (keys.length <= MAX_CACHE_ENTRIES_PER_BUCKET) return;
  const ranked = keys
    .map((k) => ({ k, ts: bucket[k]?.ts ?? 0 }))
    .sort((a, b) => a.ts - b.ts);
  const drop = keys.length - MAX_CACHE_ENTRIES_PER_BUCKET;
  for (let i = 0; i < drop; i++) {
    delete bucket[ranked[i].k];
  }
};

const pruneEnrichmentCache = () => {
  if (!enrichmentCache) return;
  pruneCacheBucket(enrichmentCache.nominatim);
  pruneCacheBucket(enrichmentCache.tripadvisor);
  pruneCacheBucket(enrichmentCache.wiki);
};

const ensureEnrichmentCacheLoaded = async () => {
  if (enrichmentCache) return;
  if (cacheLoadPromise) {
    await cacheLoadPromise;
    return;
  }
  cacheLoadPromise = (async () => {
    try {
      const raw = await readFile(CACHE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === "object" &&
        (parsed.v === 2 || parsed.v === 3) &&
        parsed.nominatim &&
        parsed.tripadvisor &&
        parsed.wiki
      ) {
        enrichmentCache = {
          v: 3,
          nominatim: { ...parsed.nominatim },
          tripadvisor: { ...parsed.tripadvisor },
          wiki: { ...parsed.wiki },
        };
      } else {
        enrichmentCache = emptyEnrichmentCache();
      }
    } catch {
      enrichmentCache = emptyEnrichmentCache();
    }
  })();
  await cacheLoadPromise;
};

const flushEnrichmentCache = async () => {
  if (!enrichmentCache || !cacheDirty) return;
  pruneEnrichmentCache();
  const payload = JSON.stringify(enrichmentCache);
  await mkdir(join(DATA_DIR, "plugins"), { recursive: true });
  await writeFile(CACHE_FILE, payload, "utf-8");
  cacheDirty = false;
};

const nominatimCacheGet = (key) => {
  const e = enrichmentCache?.nominatim?.[key];
  if (!e) return undefined;
  if (!isFresh(e.ts, TTL_MS.nominatim)) return undefined;
  return e.ext;
};

const nominatimCacheSet = (key, ext) => {
  if (!enrichmentCache) return;
  enrichmentCache.nominatim[key] = { ext, ts: Date.now() };
  cacheDirty = true;
};

const reviewCacheGet = (bucket, id) => {
  const e = enrichmentCache?.[bucket]?.[id];
  if (!e) return undefined;
  const ttl = e.miss ? TTL_MS.negative : TTL_MS[bucket];
  if (!isFresh(e.ts, ttl)) return undefined;
  return e.miss ? null : e.patch ?? null;
};

const reviewCacheSet = (bucket, id, patch) => {
  if (!enrichmentCache) return;
  const miss = patch == null;
  enrichmentCache[bucket][id] = miss
    ? { miss: true, ts: Date.now() }
    : { miss: false, patch, ts: Date.now() };
  cacheDirty = true;
};

const wikiGeoKey = (lat, lon) => `${lat.toFixed(3)}_${lon.toFixed(3)}`;

const wikiCacheGet = (wk) => {
  const e = enrichmentCache?.wiki?.[wk];
  if (!e) return undefined;
  const ttl = e.miss ? TTL_MS.negative : TTL_MS.wiki;
  if (!isFresh(e.ts, ttl)) return undefined;
  return e.miss
    ? null
    : {
        title: e.title ?? "",
        extract: e.extract ?? "",
        image: e.image ?? "",
      };
};

const wikiCacheSet = (wk, preview) => {
  if (!enrichmentCache) return;
  if (preview == null) {
    enrichmentCache.wiki[wk] = { miss: true, ts: Date.now() };
  } else {
    enrichmentCache.wiki[wk] = {
      miss: false,
      title: preview.title,
      extract: preview.extract,
      image: preview.image,
      ts: Date.now(),
    };
  }
  cacheDirty = true;
};

/** Tripadvisor Content API key (optional); https://www.tripadvisor.com/developers */
let tripadvisorApiKey = "";

const TRIPADVISOR_API = "https://api.content.tripadvisor.com/api/v1/location";

const nominatimOsmIdParam = (osmType, osmId) => {
  const t = safeTrim(osmType).toUpperCase();
  if (!Number.isFinite(osmId)) return "";
  if (t === "N") return `N${osmId}`;
  if (t === "W") return `W${osmId}`;
  if (t === "R") return `R${osmId}`;
  return "";
};

const nominatimRowToPhotonKey = (row) => {
  const raw = String(row?.osm_type || "").toLowerCase();
  const id = Number(row?.osm_id);
  if (!Number.isFinite(id)) return null;
  if (raw === "node") return `N:${id}`;
  if (raw === "way") return `W:${id}`;
  if (raw === "relation") return `R:${id}`;
  return null;
};

const extratagPick = (ext, keys) => {
  if (!ext || typeof ext !== "object") return "";
  for (const k of keys) {
    const v = ext[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
};

const parseStarsFromExtratags = (ext) => {
  if (!ext || typeof ext !== "object") return null;
  const raw = ext.stars ?? ext["stars:note"];
  if (raw == null || raw === "") return null;
  const n = parseFloat(String(raw).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(7, n);
};

const parseFhrsFromExtratags = (ext) => {
  if (!ext || typeof ext !== "object") return null;
  const raw = ext["fhrs:rating"] ?? ext.fhrs_rating ?? ext.fhrs;
  if (raw == null || raw === "") return null;
  const n = parseInt(String(raw).replace(/\D/g, ""), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(5, n);
};

/**
 * One batched Nominatim lookup (extratags) for the current page — fills gaps in
 * phone / website / hours and reads OSM `stars` / UK FHRS scores when present.
 * Cached per OSM id to avoid repeat lookups on pagination / repeated queries.
 * @returns {Map<string, Record<string, string>>}
 */
const fetchNominatimExtratagsMap = async (places) => {
  await ensureEnrichmentCacheLoaded();
  const map = new Map();
  const need = [];
  for (const p of places) {
    const key = `${p.osmType}:${p.osmId}`;
    if (!(safeTrim(p.osmType) && Number.isFinite(p.osmId))) continue;
    const cached = nominatimCacheGet(key);
    if (cached !== undefined) {
      if (cached !== null) map.set(key, cached);
      continue;
    }
    need.push(p);
  }

  const params = need.map((p) => nominatimOsmIdParam(p.osmType, p.osmId)).filter(Boolean);
  if (params.length === 0) return map;

  await sleep(1000);

  const chunks = [];
  for (let i = 0; i < params.length; i += 14) {
    chunks.push(params.slice(i, i + 14));
  }

  for (let ci = 0; ci < chunks.length; ci++) {
    if (ci > 0) await sleep(1100);
    const url = new URL("https://nominatim.openstreetmap.org/lookup");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("extratags", "1");
    url.searchParams.set("addressdetails", "0");
    url.searchParams.set("osm_ids", chunks[ci].join(","));

    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "degoog-full-map-tab/1.0 (https://github.com/fccview/degoog)",
      },
    }).catch(() => null);
    if (!res?.ok) continue;
    const rows = await res.json().catch(() => null);
    if (!Array.isArray(rows)) continue;
    const seen = new Set();
    for (const row of rows) {
      const key = nominatimRowToPhotonKey(row);
      if (!key) continue;
      seen.add(key);
      const ext =
        row.extratags && typeof row.extratags === "object" ? row.extratags : null;
      nominatimCacheSet(key, ext);
      if (ext) map.set(key, ext);
    }
    const chunkSet = new Set(chunks[ci]);
    for (const p of need) {
      const param = nominatimOsmIdParam(p.osmType, p.osmId);
      if (!param || !chunkSet.has(param)) continue;
      const nk = `${p.osmType}:${p.osmId}`;
      if (!seen.has(nk)) nominatimCacheSet(nk, null);
    }
  }
  return map;
};

const mergeExtratagsIntoPlace = (place, ext) => {
  if (!ext) return place;
  const phone = extratagPick(ext, ["phone", "contact:phone", "contact:mobile"]);
  const website = extratagPick(ext, ["contact:website", "website", "url"]);
  const hours = extratagPick(ext, ["opening_hours", "oh"]);
  const stars = parseStarsFromExtratags(ext);
  const fhrs = parseFhrsFromExtratags(ext);

  const next = { ...place };
  if (!next.phone && phone) next.phone = sanitizeText(phone);
  if (!next.website && website) next.website = sanitizeText(website);
  if (!next.openingHours && hours) next.openingHours = sanitizeText(hours);

  if (stars != null) {
    next.osmStars = stars;
    next.osmStarsMax = 5;
  }
  if (fhrs != null) {
    next.osmFoodHygiene = fhrs;
    next.osmFoodHygieneMax = 5;
  }
  return next;
};

const tripadvisorDetailsToReview = (detail, fallbackName) => {
  const d = detail?.data ?? detail;
  if (!d || typeof d !== "object") return null;
  const rating = Number(String(d.rating ?? d.rating_string ?? "").replace(",", "."));
  const numRaw = d.num_reviews ?? d.number_reviews ?? d.review_count ?? d.reviews_count;
  const reviewCount = Number(String(numRaw ?? "").replace(/,/g, ""));
  if (!Number.isFinite(rating) || rating <= 0) return null;
  return {
    reviewRating: rating,
    reviewMax: 5,
    reviewCount: Number.isFinite(reviewCount) && reviewCount >= 0 ? reviewCount : 0,
    reviewUrl: sanitizeText(d.web_url ?? d.website ?? d.url),
    reviewSource: "tripadvisor",
    reviewName: sanitizeText(d.name) || sanitizeText(fallbackName),
  };
};

const fetchTripadvisorLocationDetails = async (locationId, key) => {
  const id = Number(locationId);
  if (!Number.isFinite(id)) return null;
  const url = new URL(`${TRIPADVISOR_API}/${id}/details`);
  url.searchParams.set("key", key);
  url.searchParams.set("language", "en");
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  }).catch(() => null);
  if (!res?.ok) return null;
  return res.json().catch(() => null);
};

const pickBestTripadvisorNearby = (rows, placeName) => {
  const target = safeTrim(placeName).toLowerCase();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const scored = rows.map((r) => {
    const n = safeTrim(r.name).toLowerCase();
    let score = 0;
    if (target && n === target) score = 100;
    else if (target && n && (target.includes(n.slice(0, Math.min(8, n.length))) || n.includes(target.slice(0, Math.min(8, target.length))))) {
      score = 60;
    } else {
      score = 5;
    }
    const dist = parseFloat(String(r.distance ?? "").replace(/[^\d.]/g, ""));
    const d = Number.isFinite(dist) ? dist : 999;
    return { r, score, dist: d };
  });
  scored.sort((a, b) => b.score - a.score || a.dist - b.dist);
  const top = scored[0];
  const r = top?.r;
  const lid = r?.location_id ?? r?.locationId;
  if (r == null || lid == null) return null;
  return { ...r, location_id: lid };
};

/**
 * @returns {Promise<{ review: object | null, cacheable: boolean }>}
 * `cacheable: false` on transport/HTTP failures so we do not burn a negative-cache slot.
 */
const fetchTripadvisorMatchUncached = async (place) => {
  if (!tripadvisorApiKey) return { review: null, cacheable: false };
  const url = new URL(`${TRIPADVISOR_API}/nearby_search`);
  url.searchParams.set("latLong", `${place.lat},${place.lon}`);
  url.searchParams.set("key", tripadvisorApiKey);
  url.searchParams.set("radius", "0.4");
  url.searchParams.set("radiusUnit", "km");
  url.searchParams.set("language", "en");
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  }).catch(() => null);
  if (!res?.ok) return { review: null, cacheable: false };
  const json = await res.json().catch(() => null);
  const rows = Array.isArray(json?.data) ? json.data : [];
  const best = pickBestTripadvisorNearby(rows, place.name);
  if (!best) return { review: null, cacheable: true };
  const details = await fetchTripadvisorLocationDetails(best.location_id, tripadvisorApiKey);
  if (details == null) return { review: null, cacheable: false };
  const review = tripadvisorDetailsToReview(details, best.name || place.name);
  return { review, cacheable: true };
};

const fetchTripadvisorMatch = async (place) => {
  if (!tripadvisorApiKey) return null;
  await ensureEnrichmentCacheLoaded();
  const hit = reviewCacheGet("tripadvisor", place.id);
  if (hit !== undefined) return hit;
  const { review, cacheable } = await fetchTripadvisorMatchUncached(place);
  if (cacheable) reviewCacheSet("tripadvisor", place.id, review);
  return review;
};

const serializePlace = (place) => {
  const token = toBase64Url(place);
  if (!token) return `${MAP_PAYLOAD_PREFIX}${MAP_PAYLOAD_SUFFIX}`;
  /** Token only — do not append address (addresses may contain `]` and break clients). */
  return `${MAP_PAYLOAD_PREFIX}${token}${MAP_PAYLOAD_SUFFIX}`;
};

/** Tripadvisor key; shown under Settings → Engines (same UI as search engines). */
const FULL_MAP_SETTINGS_SCHEMA = [
  {
    key: "tripadvisorApiKey",
    label: "Tripadvisor Content API key",
    type: "password",
    secret: true,
    placeholder: "Optional — ratings & review counts (5000 free calls/mo tier)",
    description:
      "Register at https://www.tripadvisor.com/developers — Content API key. Up to the first 8 results per page: 2 calls each (nearby + details) when not cached, so traveler ratings align with Tripadvisor review counts. Results are cached on disk (~30 days). Follow Tripadvisor display rules in the map panel.",
  },
];

const fullMapTab = {
  id: "full-map",
  name: "Full Map",
  description:
    "Map tab for place search (Photon / OSM), optional Tripadvisor ratings and Wikipedia context. Tripadvisor key: Settings → Engines → Full Map → Configure.",
  icon: "map",
  settingsSchema: FULL_MAP_SETTINGS_SCHEMA,
  configure(settings) {
    tripadvisorApiKey = safeTrim(settings?.tripadvisorApiKey);
  },

  async executeSearch(query, page = 1) {
    const q = safeTrim(query);
    if (!q) return { results: [], totalPages: 1 };

    await ensureEnrichmentCacheLoaded();

    try {
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
    let pagePlaces = parsed.slice(start, start + perPage);

    const extraMap = await withTimeout(fetchNominatimExtratagsMap(pagePlaces), 6200);
    pagePlaces = pagePlaces.map((p) => {
      const ext = extraMap.get(`${p.osmType}:${p.osmId}`);
      return mergeExtratagsIntoPlace(p, ext);
    });

    if (tripadvisorApiKey) {
      const taSlice = pagePlaces.slice(0, 8);
      const taRows = await Promise.all(
        taSlice.map((p) => withTimeout(fetchTripadvisorMatch(p), 4500)),
      );
      const taById = new Map();
      for (let i = 0; i < taSlice.length; i++) {
        const patch = taRows[i];
        if (patch) taById.set(taSlice[i].id, patch);
      }
      pagePlaces = pagePlaces.map((p) => (taById.has(p.id) ? { ...p, ...taById.get(p.id) } : p));
    }

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
    } finally {
      await flushEnrichmentCache();
    }
  },
};

export default { tab: fullMapTab };
