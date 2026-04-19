import mod from "../plugins/full-map/index.js";
const fullMapTab = mod.tab ?? mod.default?.tab;
const context = {}; // simulate no server-injected key

console.log("cwd:", process.cwd());

const decode = (snippet) => {
  const m = /\[fullmap:([^\]]+)\]/.exec(snippet ?? "");
  if (!m) return null;
  try { return JSON.parse(Buffer.from(m[1], "base64url").toString("utf-8")); } catch { return null; }
};

const summarize = (r) => {
  const p = decode(r.snippet) ?? {};
  const poi = p.poi || "place";
  const src = p.reviewSource === "tripadvisor" ? "TA" : (p.osmStars != null ? "OSM-stars" : (p.osmFoodHygiene != null ? "OSM-fhrs" : "OSM-only"));
  const rating = p.reviewRating ? ` ${p.reviewRating}⭐(${p.reviewCount ?? "?"})` : "";
  return `  - ${r.title} [${poi}] → ${src}${rating}`;
};

console.log("\n=== Pass 1: cold cache (Vienna restaurants + transport) ===");
const r1 = await fullMapTab.executeSearch("Stephansplatz Vienna", 1, context);
console.log(`results: ${r1.results.length}`);
for (const r of r1.results.slice(0, 10)) console.log(summarize(r));

console.log("\n=== Pass 2: same query, warm cache (should show all cache-hit) ===");
const r2 = await fullMapTab.executeSearch("Stephansplatz Vienna", 1, context);
console.log(`results: ${r2.results.length}`);
for (const r of r2.results.slice(0, 10)) console.log(summarize(r));
