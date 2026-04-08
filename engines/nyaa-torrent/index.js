export const outgoingHosts = ["nyaa.si"];
export const type = "torrent";

const _decodeXml = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

function _extractTag(block, tag, namespace) {
  const prefix = namespace ? `${namespace}:` : "";
  const re = new RegExp(`<${prefix}${tag}[^>]*>([\\s\\S]*?)<\\/${prefix}${tag}>`, "i");
  const m = block.match(re);
  if (!m) return "";
  let inner = m[1].trim();
  if (inner.startsWith("<![CDATA[")) {
    inner = inner.slice(9).replace(/\]\]>\s*$/, "").trim();
  }
  return inner;
}

function _parseRssItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const titleRaw = _extractTag(block, "title");
    const guid = _extractTag(block, "guid");
    const link = _extractTag(block, "link");
    const pubDate = _extractTag(block, "pubDate");
    const seeders = _extractTag(block, "seeders", "nyaa");
    const leechers = _extractTag(block, "leechers", "nyaa");
    const size = _extractTag(block, "size", "nyaa");
    const category = _extractTag(block, "category", "nyaa");
    const infoHash = _extractTag(block, "infoHash", "nyaa");
    const trusted = _extractTag(block, "trusted", "nyaa");
    const remake = _extractTag(block, "remake", "nyaa");

    const title = _decodeXml(titleRaw);
    let pageUrl = guid.trim() || link.trim();
    if (!title || !pageUrl) continue;
    if (!pageUrl.startsWith("http")) pageUrl = `https://nyaa.si${pageUrl}`;

    const flags = [];
    if (trusted === "Yes") flags.push("trusted");
    if (remake === "Yes") flags.push("remake");

    const meta = [
      category,
      size,
      seeders !== "" ? `S:${seeders} L:${leechers || "0"}` : "",
      pubDate,
      flags.length ? flags.join(", ") : "",
    ]
      .filter(Boolean)
      .join(" · ");

    let snippet = meta;
    if (infoHash) {
      snippet = snippet
        ? `${snippet}\nmagnet:?xt=urn:btih:${infoHash}`
        : `magnet:?xt=urn:btih:${infoHash}`;
    }

    items.push({
      title,
      url: pageUrl,
      snippet,
      source: "Nyaa",
    });
  }
  return items;
}

export default class NyaaTorrentEngine {
  name = "Nyaa";
  bangShortcut = "nyaa";

  /**
   * Nyaa’s RSS feed returns one page (~75 items); extra pages are not supported via RSS.
   */
  async executeSearch(query, page = 1, _timeFilter, context) {
    if (page > 1) return [];
    const q = (query || "").trim();
    if (!q) return [];

    const params = new URLSearchParams({
      page: "rss",
      c: "0_0",
      f: "0",
      q,
    });
    const url = `https://nyaa.si/?${params.toString()}`;
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; degoog/1.0)",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });

    if (!response.ok) return [];
    const xml = await response.text();
    return _parseRssItems(xml);
  }
}
