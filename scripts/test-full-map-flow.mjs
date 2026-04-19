import mod from "../plugins/full-map/index.js";
const fullMapTab = mod.tab ?? mod.default?.tab;
const context = {}; // simulate no server-injected key

console.log("cwd:", process.cwd());

const result = await fullMapTab.executeSearch("Burger King Wels", 1, context);
console.log("results:", result.results.length);
const decode = (snippet) => {
  const m = /\[fullmap:([^\]]+)\]/.exec(snippet ?? "");
  if (!m) return null;
  try { return JSON.parse(Buffer.from(m[1], "base64url").toString("utf-8")); } catch { return null; }
};
for (const r of result.results.slice(0, 5)) {
  const p = decode(r.snippet) ?? {};
  console.log("-", r.title, "| rating:", p.reviewRating, "count:", p.reviewCount, "src:", p.reviewSource, "img:", p.reviewImageUrl ? "yes" : "no");
}
