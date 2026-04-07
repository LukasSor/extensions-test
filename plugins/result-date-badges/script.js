// Result dates — client-side badges on web results (all engines share result markup).
(function () {
  "use strict";

  const patterns = [
    {
      regex:
        /\b(\d{4}-\d{1,2}-\d{1,2}T\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\b/,
      parse: (match) => new Date(match[1]),
    },
    {
      regex: /\b(\d{4}-\d{1,2}-\d{1,2})\b/,
      parse: (match) => new Date(match[1]),
    },
    {
      regex: /\b(\d{4}\/\d{1,2}\/\d{1,2})\b/,
      parse: (match) => new Date(match[1].replace(/\//g, "-")),
    },
    {
      regex: /\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/,
      parse: (match) => {
        const a = parseInt(match[1], 10);
        const b = parseInt(match[2], 10);
        const y = parseInt(match[3], 10);
        if (a > 12) return new Date(y, b - 1, a);
        if (b > 12) return new Date(y, a - 1, b);
        return new Date(y, b - 1, a);
      },
    },
    {
      regex:
        /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/i,
      parse: (match) => new Date(match[1]),
    },
    {
      regex:
        /\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})\b/i,
      parse: (match) => new Date(match[1]),
    },
    {
      regex: /\b(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago\b/i,
      parse: (match) => {
        const num = parseInt(match[1], 10);
        const unit = match[2].toLowerCase();
        const d = new Date();
        switch (unit) {
          case "second":
            d.setSeconds(d.getSeconds() - num);
            return d;
          case "minute":
            d.setMinutes(d.getMinutes() - num);
            return d;
          case "hour":
            d.setHours(d.getHours() - num);
            return d;
          case "day":
            d.setDate(d.getDate() - num);
            return d;
          case "week":
            d.setDate(d.getDate() - num * 7);
            return d;
          case "month":
            d.setMonth(d.getMonth() - num);
            return d;
          case "year":
            d.setFullYear(d.getFullYear() - num);
            return d;
          default:
            return null;
        }
      },
    },
    {
      regex: /\b(yesterday)\b/i,
      parse: () => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d;
      },
    },
    {
      regex: /\b(today)\b/i,
      parse: () => new Date(),
    },
  ];

  function formatDate(date) {
    if (!date || isNaN(date.getTime())) return null;

    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
    }
    if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months} month${months > 1 ? "s" : ""} ago`;
    }

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function parseDatetimeAttr(iso) {
    if (!iso || typeof iso !== "string") return null;
    const d = new Date(iso.trim());
    return isNaN(d.getTime()) ? null : d;
  }

  function extractDateFromText(text) {
    if (!text) return null;
    for (const pattern of patterns) {
      const match = text.match(pattern.regex);
      if (match) {
        try {
          const date = pattern.parse(match);
          if (date && !isNaN(date.getTime())) {
            return {
              date,
              formatted: formatDate(date),
              original: match[0],
            };
          }
        } catch {
          /* continue */
        }
      }
    }
    return null;
  }

  /** YYYY/MM/DD or YYYY-MM-DD in path or query (blogs, news, Wikipedia /wiki/2024_foo). */
  function extractDateFromUrl(href) {
    if (!href || typeof href !== "string") return null;
    if (/^(javascript:|#|mailto:)/i.test(href)) return null;
    try {
      const u = new URL(href, document.baseURI);
      const blob = u.pathname + " " + u.search + " " + u.hash;
      const m = blob.match(
        /(?:^|\/)(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:\/|$|[?&#])/,
      );
      if (m) {
        const y = parseInt(m[1], 10);
        const mo = parseInt(m[2], 10);
        const d = parseInt(m[3], 10);
        const date = new Date(y, mo - 1, d);
        if (!isNaN(date.getTime())) {
          return {
            date,
            formatted: formatDate(date),
            original: `${m[1]}-${m[2]}-${m[3]}`,
          };
        }
      }
      const q = u.searchParams;
      for (const key of ["date", "published", "pubdate", "time"]) {
        const v = q.get(key);
        if (v) {
          const d = parseDatetimeAttr(v);
          if (d) {
            return {
              date: d,
              formatted: formatDate(d),
              original: v,
            };
          }
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  function snippetText(resultEl) {
    const parts = [];
    const nodes = resultEl.querySelectorAll(
      ".result-snippet, .result-description, [class*='result-snippet'], [class*='snippet']",
    );
    nodes.forEach((el) => {
      const t = (el.textContent || "").trim();
      if (t) parts.push(t);
    });
    return parts.join(" ");
  }

  function titleText(resultEl) {
    const t = resultEl.querySelector(
      "a.result-title, .result-title, h2 a[href], h3 a[href], .result-heading a",
    );
    return (t && t.textContent) || "";
  }

  function primaryHref(resultEl) {
    const direct = resultEl.querySelector(
      "a.result-title[href], a.result-title[href], .result-title[href], h2 a[href^='http'], h3 a[href^='http']",
    );
    if (direct && direct.href && !/^javascript:/i.test(direct.href)) {
      return direct.href;
    }
    const links = resultEl.querySelectorAll("a[href^='http']");
    for (let i = 0; i < links.length; i++) {
      const h = links[i].href;
      if (h && !/^javascript:/i.test(h)) return h;
    }
    return "";
  }

  function extractDateFromResult(resultEl) {
    const times = resultEl.querySelectorAll("time[datetime]");
    for (const el of times) {
      const d = parseDatetimeAttr(el.getAttribute("datetime"));
      if (d) {
        return {
          date: d,
          formatted: formatDate(d),
          original: el.getAttribute("datetime") || "",
        };
      }
    }

    const snip = snippetText(resultEl);
    const title = titleText(resultEl);
    let info = extractDateFromText(snip) || extractDateFromText(title);
    if (info) return info;

    const href = primaryHref(resultEl);
    return extractDateFromUrl(href);
  }

  function getAgeBucket(date) {
    const diffDays = Math.floor((new Date() - date) / (1000 * 60 * 60 * 24));
    if (diffDays <= 7) return "fresh";
    if (diffDays <= 90) return "recent";
    return "old";
  }

  function injectDateBadge(resultEl, dateInfo) {
    if (resultEl.querySelector(".result-date-badge")) return;

    const badge = document.createElement("span");
    badge.className = "result-date-badge";
    badge.dataset.age = getAgeBucket(dateInfo.date);
    badge.textContent = dateInfo.formatted;
    badge.title = dateInfo.date.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const cite = resultEl.querySelector("cite.result-cite, .result-cite, cite");
    if (cite) {
      cite.after(badge);
      return;
    }
    const urlRow = resultEl.querySelector(
      ".result-url-row, .result-meta-row, [class*='url-row']",
    );
    if (urlRow) {
      urlRow.appendChild(badge);
      return;
    }
    const snippet = resultEl.querySelector(
      ".result-snippet, .result-description, p",
    );
    if (snippet) {
      snippet.insertBefore(badge, snippet.firstChild);
      return;
    }
    resultEl.appendChild(badge);
  }

  function resultNodes() {
    return document.querySelectorAll(
      "#results-list .result-item, #results-main .result-item, .results-list .result-item, main .result-item, .result-item",
    );
  }

  function processResults() {
    resultNodes().forEach((result) => {
      if (result.querySelector(".result-date-badge")) return;

      const dateInfo = extractDateFromResult(result);
      if (dateInfo && dateInfo.formatted) {
        injectDateBadge(result, dateInfo);
      }
    });
  }

  function observerTarget() {
    return (
      document.getElementById("results-list") ||
      document.getElementById("results-main") ||
      document.querySelector(".results-list, [data-results], main") ||
      document.body
    );
  }

  function startObserver() {
    const target = observerTarget();
    let t = null;
    const observer = new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(processResults, 120);
    });
    observer.observe(target, { childList: true, subtree: true });
    processResults();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver);
  } else {
    startObserver();
  }
})();
