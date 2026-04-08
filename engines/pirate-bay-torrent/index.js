export const outgoingHosts = ["apibay.org", "thepiratebay.org"];
export const type = "torrent";

const PAGE_SIZE = 25;

const _decodeHtml = (s) =>
  String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const _formatBytes = (raw) => {
  const bytes = Number(raw);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export default class PirateBayTorrentEngine {
  name = "The Pirate Bay";
  bangShortcut = "tpb";

  /**
   * apibay.org returns up to ~100 hits per query (no server-side page param).
   * We paginate client-side for the Torrents tab.
   */
  async executeSearch(query, page = 1, _timeFilter, context) {
    const q = (query || "").trim();
    if (!q) return [];

    const url = `https://apibay.org/q.php?q=${encodeURIComponent(q)}&cat=0`;
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

    const rows = Array.isArray(data) ? data : [];
    const filtered = rows.filter(
      (r) =>
        r &&
        r.id &&
        String(r.id) !== "0" &&
        String(r.name || "").toLowerCase() !== "no results returned",
    );

    const start = (Math.max(1, page) - 1) * PAGE_SIZE;
    const slice = filtered.slice(start, start + PAGE_SIZE);

    return slice.map((row) => {
      const hash = String(row.info_hash || "").toLowerCase();
      const title = _decodeHtml(row.name || "");
      const magnet =
        /^[a-f0-9]{40}$/.test(hash) ? `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(title)}` : "";
      const meta = [
        _formatBytes(row.size),
        `S:${row.seeders ?? "?"} L:${row.leechers ?? "?"}`,
        row.username ? `@${row.username}` : "",
        row.status && row.status !== "member" ? row.status : "",
      ]
        .filter(Boolean)
        .join(" · ");

      const snippet = [meta, magnet].filter(Boolean).join("\n");

      return {
        title: title || `Torrent ${row.id}`,
        url: `https://thepiratebay.org/description.php?id=${encodeURIComponent(String(row.id))}`,
        snippet,
        source: this.name,
      };
    });
  }
}
