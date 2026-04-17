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
  return `${MAP_PAYLOAD_PREFIX}${token}${MAP_PAYLOAD_SUFFIX}${place.address || place.kind}`;
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
      parsed.push({
        id: key,
        name,
        lat,
        lon,
        address,
        kind,
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
