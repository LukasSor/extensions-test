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
  /** Rating/photos refresh after 30 days. Most places don't change meaningfully sooner. */
  tripadvisor: 30 * 24 * 60 * 60 * 1000,
  wiki: 7 * 24 * 60 * 60 * 1000,
  negative: 3 * 24 * 60 * 60 * 1000,
  /** Tripadvisor negative cache: places rarely appear post-miss, keep for 21 days to save calls. */
  tripadvisorNegative: 21 * 24 * 60 * 60 * 1000,
};

const MAX_CACHE_ENTRIES_PER_BUCKET = 2000;

/** @type {{ v: number, nominatim: Record<string, { ext: Record<string, string>|null, ts: number }>, tripadvisor: Record<string, { miss: boolean, patch?: object, ts: number }>, wiki: Record<string, { miss: boolean, title?: string, extract?: string, image?: string, ts: number }> } | null} */
let enrichmentCache = null;
let cacheLoadPromise = null;
let cacheDirty = false;

const emptyEnrichmentCache = () => ({
  v: 5,
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
        parsed.v === 5 &&
        parsed.nominatim &&
        parsed.tripadvisor &&
        parsed.wiki
      ) {
        enrichmentCache = {
          v: 5,
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
  const negTtl = bucket === "tripadvisor" ? TTL_MS.tripadvisorNegative : TTL_MS.negative;
  const ttl = e.miss ? negTtl : TTL_MS[bucket];
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

/** Same id the server assigns to engines/full-map-tripadvisor (folder name). */
const FULL_MAP_TA_ENGINE_ID = "engine-full-map-tripadvisor";

const pluginSettingsPath = () =>
  process.env.DEGOOG_PLUGIN_SETTINGS_FILE ??
  join(process.env.DEGOOG_DATA_DIR ?? join(process.cwd(), "data"), "plugin-settings.json");

/** Normalizes values as stored in plugin-settings.json (string, string[], or masked). */
const asPluginStoredString = (v) => {
  if (v == null || v === "__SET__") return "";
  if (typeof v === "string") return safeTrim(v);
  if (Array.isArray(v)) return safeTrim(String(v[0] ?? ""));
  return "";
};

/** Same `plugin-settings.json` as Settings → Engines writes to. */
const readTripadvisorKeyFromSettingsFile = async () => {
  try {
    const raw = await readFile(pluginSettingsPath(), "utf-8");
    const all = JSON.parse(raw);
    const fromEngine = asPluginStoredString(all[FULL_MAP_TA_ENGINE_ID]?.tripadvisorApiKey);
    if (fromEngine) return fromEngine;
    return asPluginStoredString(all["tab-full-map"]?.tripadvisorApiKey);
  } catch {
    return "";
  }
};

/** Emergency fallback: process env / repo `.env` (any of several common var names). */
const TA_ENV_KEYS = [
  "TRIPADVISOR_API_KEY",
  "TRIPADVISOR_CONTENT_API_KEY",
  "FULL_MAP_TRIPADVISOR_API_KEY",
  "TA_API_KEY",
  "TAKEY",
];
const readTripadvisorKeyFromEnvOrDotEnv = async () => {
  let best = "";
  for (const k of TA_ENV_KEYS) {
    const v = asPluginStoredString(process.env[k]);
    if (v.length > best.length) best = v;
  }
  const bases = [process.cwd(), join(process.cwd(), ".."), join(process.cwd(), "..", "..")];
  for (const base of bases) {
    try {
      const raw = await readFile(join(base, ".env"), "utf-8");
      const normalized = raw.replace(/^\uFEFF/, "");
      for (const line of normalized.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const eq = t.indexOf("=");
        if (eq < 0) continue;
        const name = t.slice(0, eq).trim();
        if (!TA_ENV_KEYS.includes(name)) continue;
        const v = asPluginStoredString(t.slice(eq + 1));
        if (v.length > best.length) best = v;
      }
    } catch {
      /* no .env in this base */
    }
  }
  return best;
};

let _keySourceLogged = false;
const _logKeySourceOnce = (source) => {
  if (_keySourceLogged) return;
  _keySourceLogged = true;
  try {
    console.log(`[full-map] Tripadvisor key source: ${source}`);
  } catch {
    /* ignore */
  }
};

/** @param {Record<string, unknown>|undefined} context */
const resolveTripadvisorApiKey = async (context) => {
  const fromRequest = asPluginStoredString(context?.tripadvisorApiKey);
  if (fromRequest) {
    _logKeySourceOnce("request-context (Settings → Engines)");
    return fromRequest;
  }
  const fromFile = await readTripadvisorKeyFromSettingsFile();
  if (fromFile) {
    _logKeySourceOnce("plugin-settings.json");
    return fromFile;
  }
  const fromEnv = await readTripadvisorKeyFromEnvOrDotEnv();
  if (fromEnv) {
    _logKeySourceOnce("env/.env fallback");
    return fromEnv;
  }
  _logKeySourceOnce("NOT FOUND — no key available");
  return "";
};

const TRIPADVISOR_API = "https://api.content.tripadvisor.com/api/v1/location";

const TA_FETCH_HEADERS = {
  Accept: "application/json",
  "User-Agent": "degoog-full-map-tab/1.2 (https://github.com/fccview/degoog)",
};

/** Unwrap Content API envelopes: `{ data: ... }`, nested `data`, or top-level array. */
const unwrapTripadvisorEntity = (body) => {
  if (body == null) return null;
  if (Array.isArray(body)) {
    const first = body[0];
    return first && typeof first === "object" ? first : null;
  }
  let cur = body;
  for (let depth = 0; depth < 6; depth++) {
    if (Array.isArray(cur)) {
      const first = cur[0];
      return first && typeof first === "object" ? first : null;
    }
    if (!cur || typeof cur !== "object") return null;
    if (cur.error) return null;
    if ("data" in cur && cur.data != null) {
      cur = cur.data;
      continue;
    }
    return cur;
  }
  return null;
};

const sumReviewRatingCount = (obj) => {
  if (!obj || typeof obj !== "object") return null;
  let sum = 0;
  for (const v of Object.values(obj)) {
    const n = Number(String(v).replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) sum += n;
  }
  return sum > 0 ? sum : null;
};

const tripadvisorNearbyRows = (json) => {
  const raw = json?.data;
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const cand = raw.locations ?? raw.results ?? raw.items;
    if (Array.isArray(cand)) return cand;
  }
  if (Array.isArray(json?.locations)) return json.locations;
  return [];
};

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
  const d = unwrapTripadvisorEntity(detail);
  if (!d || typeof d !== "object") return null;

  const ratingRaw =
    d.rating ?? d.rating_string ?? d.overall_rating ?? d.bubble_rating ?? d.bubbleRating;
  const rating = Number(String(ratingRaw ?? "").replace(/,/g, "."));
  const numRaw =
    d.num_reviews ??
    d.number_reviews ??
    d.review_count ??
    d.reviews_count ??
    d.numReviews;
  let reviewCount = Number(String(numRaw ?? "").replace(/,/g, ""));
  if (!Number.isFinite(reviewCount) || reviewCount < 0) {
    const fromBreakdown = sumReviewRatingCount(d.review_rating_count);
    reviewCount = fromBreakdown != null ? fromBreakdown : 0;
  }

  if (!Number.isFinite(rating) || rating <= 0) return null;

  const reviewUrl = sanitizeText(
    d.web_url ?? d.website ?? d.url ?? d.write_review ?? d.hotel_booking?.booking_url,
  );
  const reviewImageUrl = sanitizeText(d.rating_image_url ?? d.ratingImageUrl);

  const weekday = Array.isArray(d.hours?.weekday_text)
    ? d.hours.weekday_text.map((s) => sanitizeText(s)).filter(Boolean).slice(0, 7)
    : [];
  const description = sanitizeText(d.description);
  const phone = sanitizeText(d.phone);
  const website = sanitizeText(d.website);
  const addressString = sanitizeText(d.address_obj?.address_string);
  const categoryName = sanitizeText(d.category?.localized_name ?? d.category?.name);
  const rankingString = sanitizeText(d.ranking_data?.ranking_string);
  const priceLevel = sanitizeText(d.price_level);

  return {
    reviewRating: rating,
    reviewMax: 5,
    reviewCount: Number.isFinite(reviewCount) && reviewCount >= 0 ? reviewCount : 0,
    reviewUrl,
    reviewSource: "tripadvisor",
    reviewName: sanitizeText(d.name) || sanitizeText(fallbackName),
    reviewImageUrl,
    /** Rich details merged into place so the detail panel can render them. */
    taDescription: description ? description.slice(0, 700) : "",
    taPhone: phone,
    taWebsite: website,
    taAddress: addressString,
    taCategory: categoryName,
    taRankingString: rankingString,
    taPriceLevel: priceLevel,
    taWeekdayHours: weekday,
    taLocationId: sanitizeText(String(d.location_id ?? d.locationId ?? "")),
  };
};

/** Normalize a photo row to `{ src, caption }` using the largest sensible variant. */
const mapTripadvisorPhoto = (row) => {
  const imgs = row?.images ?? {};
  const url =
    imgs.original?.url ??
    imgs.large?.url ??
    imgs.medium?.url ??
    imgs.small?.url ??
    imgs.thumbnail?.url ??
    "";
  const src = sanitizeText(url);
  if (!src) return null;
  return { src, caption: sanitizeText(row?.caption) };
};

const fetchTripadvisorPhotos = async (locationId, key) => {
  const id = Number(locationId);
  if (!Number.isFinite(id)) return [];
  const url = new URL(`${TRIPADVISOR_API}/${id}/photos`);
  url.searchParams.set("key", key);
  url.searchParams.set("language", "en");
  url.searchParams.set("limit", "6");
  const res = await fetch(url.toString(), { headers: TA_FETCH_HEADERS }).catch(() => null);
  if (!res?.ok) return [];
  const body = await res.json().catch(() => null);
  const rows = Array.isArray(body?.data) ? body.data : [];
  return rows.map(mapTripadvisorPhoto).filter(Boolean).slice(0, 6);
};

/** Normalize a review row to the minimum payload the UI needs. */
const mapTripadvisorReview = (row) => {
  const title = sanitizeText(row?.title);
  const text = sanitizeText(row?.text);
  if (!title && !text) return null;
  return {
    title,
    text: text ? text.slice(0, 480) : "",
    rating: Number(row?.rating) || null,
    ratingImageUrl: sanitizeText(row?.rating_image_url ?? row?.ratingImageUrl),
    date: sanitizeText(row?.published_date ?? row?.publishedDate).slice(0, 10),
    user: sanitizeText(row?.user?.username ?? row?.user?.user_profile?.username),
    url: sanitizeText(row?.url),
  };
};

const fetchTripadvisorReviews = async (locationId, key) => {
  const id = Number(locationId);
  if (!Number.isFinite(id)) return [];
  const url = new URL(`${TRIPADVISOR_API}/${id}/reviews`);
  url.searchParams.set("key", key);
  url.searchParams.set("language", "en");
  url.searchParams.set("limit", "5");
  const res = await fetch(url.toString(), { headers: TA_FETCH_HEADERS }).catch(() => null);
  if (!res?.ok) return [];
  const body = await res.json().catch(() => null);
  const rows = Array.isArray(body?.data) ? body.data : [];
  return rows.map(mapTripadvisorReview).filter(Boolean).slice(0, 5);
};

const fetchTripadvisorLocationDetails = async (locationId, key) => {
  const id = Number(locationId);
  if (!Number.isFinite(id)) return null;
  const url = new URL(`${TRIPADVISOR_API}/${id}/details`);
  url.searchParams.set("key", key);
  url.searchParams.set("language", "en");
  const res = await fetch(url.toString(), {
    headers: TA_FETCH_HEADERS,
  }).catch(() => null);
  if (!res?.ok) return null;
  return res.json().catch(() => null);
};

/**
 * POI categories that typically have useful Tripadvisor listings (reviews, photos, hours).
 * Everything else — parking, fuel, transit stops, services, administrative boundaries —
 * is a near-guaranteed miss so we skip the API call entirely and let OSM data fill the panel.
 */
const TA_ELIGIBLE_POI = new Set([
  "food",
  "drink",
  "lodging",
  "sight",
  "tourism",
  "culture",
  "leisure",
  "sport",
  "park",
  "shop",
  "shop_large",
  "fashion",
  "tech",
  "beauty",
  "historic",
  "nature",
]);

/** OSM keys we consider "tourist-worthy" when `poi` is missing or stale. */
const TA_ELIGIBLE_OSM_KEYS = new Set(["tourism", "leisure", "historic"]);

const shouldTryTripadvisor = (place) => {
  const poi = String(place?.poi || "").trim();
  if (poi && TA_ELIGIBLE_POI.has(poi)) return true;
  if (poi && poi !== "place") return false;
  /** Unknown `poi`: allow if OSM key hints at something touristy, else skip. */
  const osmKey = String(place?.osmKey || "").trim().toLowerCase();
  return TA_ELIGIBLE_OSM_KEYS.has(osmKey);
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
  const lid = r?.location_id ?? r?.locationId ?? r?.locationID;
  if (r == null || lid == null) return null;
  return { ...r, location_id: lid };
};

/**
 * @returns {Promise<{ review: object | null, cacheable: boolean }>}
 * `cacheable: false` on transport/HTTP failures so we do not burn a negative-cache slot.
 */
const fetchTripadvisorMatchUncached = async (place, tripadvisorApiKey) => {
  if (!tripadvisorApiKey) return { review: null, cacheable: false };
  const url = new URL(`${TRIPADVISOR_API}/nearby_search`);
  url.searchParams.set("latLong", `${place.lat},${place.lon}`);
  url.searchParams.set("key", tripadvisorApiKey);
  url.searchParams.set("radius", "2");
  url.searchParams.set("radiusUnit", "km");
  url.searchParams.set("language", "en");
  const res = await fetch(url.toString(), {
    headers: TA_FETCH_HEADERS,
  }).catch(() => null);
  if (!res?.ok) return { review: null, cacheable: false };
  const json = await res.json().catch(() => null);
  const rows = tripadvisorNearbyRows(json);
  const best = pickBestTripadvisorNearby(rows, place.name);
  if (!best) return { review: null, cacheable: true };
  const details = await fetchTripadvisorLocationDetails(
    best.location_id,
    tripadvisorApiKey,
  );
  if (details == null) return { review: null, cacheable: false };
  const review = tripadvisorDetailsToReview(details, best.name || place.name);
  if (!review) return { review: null, cacheable: true };

  /** Photos and reviews are best-effort; the rating panel renders even if either call fails. */
  const [photos, reviewList] = await Promise.all([
    fetchTripadvisorPhotos(best.location_id, tripadvisorApiKey).catch(() => []),
    fetchTripadvisorReviews(best.location_id, tripadvisorApiKey).catch(() => []),
  ]);

  return {
    review: {
      ...review,
      taPhotos: photos,
      taReviews: reviewList,
    },
    cacheable: true,
  };
};

const fetchTripadvisorMatch = async (place, context) => {
  const tripadvisorApiKey = await resolveTripadvisorApiKey(context);
  if (!tripadvisorApiKey) return null;
  await ensureEnrichmentCacheLoaded();
  const hit = reviewCacheGet("tripadvisor", place.id);
  if (hit !== undefined) return hit;
  const { review, cacheable } = await fetchTripadvisorMatchUncached(place, tripadvisorApiKey);
  if (cacheable) reviewCacheSet("tripadvisor", place.id, review);
  return review;
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
  /** Matches plugin engine `type` "maps" so search tabs merge and Tripadvisor settings sit under Engines → Maps. */
  engineType: "maps",
  description:
    "Map tab for place search (Photon / OSM), optional Tripadvisor ratings and Wikipedia context. Tripadvisor key: Settings → Engines → Maps → Full Map (Tripadvisor) → Configure.",
  icon: "map",

  async executeSearch(query, page = 1, context) {
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

    const tripadvisorApiKey = await resolveTripadvisorApiKey(context);
    if (tripadvisorApiKey) {
      /**
       * Cost-control policy:
       *  1. Serve every place that already has a cached TA entry (0 API calls).
       *  2. For cache misses, only call TA for top `FRESH_TA_BUDGET` places that pass the
       *     POI allowlist (skips parking/fuel/transit/admin/etc.).
       *  3. The rest fall through to OSM-only (address/phone/website/stars/fhrs).
       */
      const FRESH_TA_BUDGET = 4;
      await ensureEnrichmentCacheLoaded();

      let cacheHits = 0;
      let cacheMisses = 0;
      let skippedByCategory = 0;
      let scheduledFresh = 0;

      const taById = new Map();
      const freshQueue = [];

      for (const p of pagePlaces) {
        const cached = reviewCacheGet("tripadvisor", p.id);
        if (cached !== undefined) {
          cacheHits += 1;
          if (cached) taById.set(p.id, cached);
          continue;
        }
        if (!shouldTryTripadvisor(p)) {
          skippedByCategory += 1;
          continue;
        }
        if (freshQueue.length < FRESH_TA_BUDGET) {
          freshQueue.push(p);
          scheduledFresh += 1;
        } else {
          cacheMisses += 1;
        }
      }

      if (freshQueue.length > 0) {
        const taRows = await Promise.all(
          freshQueue.map((p) => withTimeout(fetchTripadvisorMatch(p, context), 4500)),
        );
        for (let i = 0; i < freshQueue.length; i++) {
          const patch = taRows[i];
          if (patch) taById.set(freshQueue[i].id, patch);
        }
      }

      pagePlaces = pagePlaces.map((p) => (taById.has(p.id) ? { ...p, ...taById.get(p.id) } : p));

      try {
        console.log(
          `[full-map] Tripadvisor: ${cacheHits} cache-hit, ${scheduledFresh} fresh, ` +
            `${skippedByCategory} skipped (OSM-only), ${cacheMisses} deferred ` +
            `(page=${pagePlaces.length}, budget=${FRESH_TA_BUDGET})`,
        );
      } catch {
        /* ignore */
      }
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
