export const outgoingHosts = ["duckduckgo.com"];
export const type = "images";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64; rv:134.0) Gecko/20100101 Firefox/134.0",
];

const _getRandomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

const _extractVqd = (html) => {
  const match = html.match(/vqd=['"]([^'"]+)['"]/);
  return match ? match[1] : null;
};

export default class DuckDuckGoImagesEngine {
  name = "DuckDuckGo Images";
  bangShortcut = "ddgi";
  safeSearch = "off";
  hideAiImages = "show";
  settingsSchema = [
    {
      key: "safeSearch",
      label: "Safe Search",
      type: "select",
      options: ["off", "on"],
      description: "Filter explicit content from image results.",
    },
    {
      key: "hideAiImages",
      label: "AI Images",
      type: "select",
      options: ["show", "hide"],
      description: "Hide AI-generated images from results using DuckDuckGo's built-in filter.",
    },
  ];

  configure(settings) {
    if (typeof settings.safeSearch === "string") {
      this.safeSearch = settings.safeSearch;
    }
    if (typeof settings.hideAiImages === "string") {
      this.hideAiImages = settings.hideAiImages;
    }
  }

  async executeSearch(query, page = 1, _timeFilter, context) {
    const doFetch = context?.fetch ?? fetch;
    const ua = _getRandomUserAgent();
    const headers = {
      "User-Agent": ua,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": context?.buildAcceptLanguage?.() ?? "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
    };

    const initRes = await doFetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
      { headers },
    );
    const initHtml = await initRes.text();
    const vqd = _extractVqd(initHtml);
    if (!vqd) return [];

    const offset = (page - 1) * 100;
    const params = new URLSearchParams({
      q: query,
      vqd,
      p: this.safeSearch === "on" ? "1" : "-1",
      s: String(offset),
      u: "bing",
      f: ",,,,,",
      l: context?.lang ? `${context.lang}-${context.lang}` : "us-en",
      o: "json",
      ...(this.hideAiImages === "hide" ? { kbj: "1" } : {}),
    });

    const res = await doFetch(
      `https://duckduckgo.com/i.js?${params.toString()}`,
      {
        headers: {
          ...headers,
          Accept: "application/json, text/javascript, */*; q=0.01",
          Referer: "https://duckduckgo.com/",
          "X-Requested-With": "XMLHttpRequest",
        },
      },
    );

    if (!res.ok) return [];

    const data = await res.json();
    const items = data?.results ?? [];

    return items.map((item) => ({
      title: item.title ?? "",
      url: item.url ?? "",
      snippet: item.title ?? "",
      source: this.name,
      thumbnail: item.thumbnail ?? "",
      imageUrl: item.image ?? item.thumbnail ?? "",
    })).filter((r) => r.url && r.thumbnail);
  }
}
