export const outgoingHosts = ["solidtorrents.to"];
export const type = "torrent";

const _formatBytes = (bytes) => {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(n) / Math.log(k)));
  return `${parseFloat((n / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export default class SolidTorrentsEngine {
  name = "SolidTorrents";
  bangShortcut = "solid";

  async executeSearch(query, page = 1, _timeFilter, context) {
    const q = (query || "").trim();
    if (!q) return [];

    const p = Math.max(1, page);
    const url = `https://solidtorrents.to/api/v1/search?q=${encodeURIComponent(q)}&page=${p}`;
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; degoog/1.0)",
        Accept: "application/json",
      },
    });

    if (!response.ok) return [];
    let data;
    try {
      data = await response.json();
    } catch {
      return [];
    }

    if (!data?.success || !Array.isArray(data.results)) return [];

    return data.results.map((row) => {
      const title = String(row.title || "");
      const hash = String(row.infohash || "").toLowerCase();
      const magnet =
        /^[a-f0-9]{40}$/.test(hash) ? `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(title)}` : "";

      const meta = [
        _formatBytes(row.size),
        `S:${row.seeders ?? "?"} L:${row.leechers ?? "?"}`,
        row.verified ? "verified" : "",
      ]
        .filter(Boolean)
        .join(" · ");

      const snippet = [meta, magnet].filter(Boolean).join("\n");

      return {
        title: title || "Torrent",
        url: magnet || `https://solidtorrents.to/search?q=${encodeURIComponent(q)}`,
        snippet,
        source: this.name,
      };
    });
  }
}
