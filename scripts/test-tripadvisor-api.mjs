/**
 * One-shot Tripadvisor Content API check (nearby_search near Paris).
 * Reads the key only from degoog `plugin-settings.json` (same as Settings → Engines → Maps).
 * Does not print your API key.
 *
 * Usage (point at the data dir that contains plugin-settings.json):
 *   DEGOOG_DATA_DIR=/path/to/data node extensions-test/scripts/test-tripadvisor-api.mjs
 *   DEGOOG_PLUGIN_SETTINGS_FILE=/path/to/plugin-settings.json node extensions-test/scripts/test-tripadvisor-api.mjs
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ENGINE_ID = "engine-full-map-tripadvisor";

function asString(v) {
  if (v == null || v === "__SET__") return "";
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) return String(v[0] ?? "").trim();
  return "";
}

async function loadKey() {
  const settingsPath =
    process.env.DEGOOG_PLUGIN_SETTINGS_FILE ??
    join(process.env.DEGOOG_DATA_DIR ?? join(process.cwd(), "data"), "plugin-settings.json");

  try {
    const raw = await readFile(settingsPath, "utf-8");
    const all = JSON.parse(raw);
    return asString(all[ENGINE_ID]?.tripadvisorApiKey);
  } catch {
    return "";
  }
}

function nearbyRows(body) {
  const raw = body?.data;
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const cand = raw.locations ?? raw.results ?? raw.items;
    if (Array.isArray(cand)) return cand;
  }
  return [];
}

const key = await loadKey();
if (!key) {
  console.error(
    "No key in plugin-settings.json for engine-full-map-tripadvisor.\n" +
      "Save it in degoog: Settings → Engines → Maps → Full Map (Tripadvisor) → Configure,\n" +
      "then run with DEGOOG_DATA_DIR or DEGOOG_PLUGIN_SETTINGS_FILE pointing at that data directory.",
  );
  process.exit(2);
}

const url = new URL("https://api.content.tripadvisor.com/api/v1/location/nearby_search");
url.searchParams.set("latLong", "48.8566,2.3522");
url.searchParams.set("key", key);
url.searchParams.set("radius", "2");
url.searchParams.set("radiusUnit", "km");
url.searchParams.set("language", "en");

const res = await fetch(url.toString(), {
  headers: {
    Accept: "application/json",
    "User-Agent": "degoog-extensions-tripadvisor-test/1",
  },
});

let body;
try {
  body = await res.json();
} catch {
  body = {};
}

console.log("HTTP status:", res.status);
if (!res.ok) {
  console.log("Response (truncated):", JSON.stringify(body).slice(0, 600));
  process.exit(1);
}

const rows = nearbyRows(body);
console.log("Locations in ~2km of Paris center:", rows.length);
if (rows[0]) {
  console.log("Sample:", {
    name: rows[0].name,
    location_id: rows[0].location_id ?? rows[0].locationId,
    distance: rows[0].distance,
  });
}

if (rows.length === 0) {
  console.log("Empty data array — key accepted but no POIs in radius (unusual for Paris).");
  process.exit(3);
}

console.log("OK: API key is accepted and nearby_search returned results.");
process.exit(0);
