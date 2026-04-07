// Result dates — client-side badges on every web result (all engines share .result-item markup).
(function () {
  "use strict";

  const patterns = [
    {
      regex: /\b(\d{4}-\d{1,2}-\d{1,2})\b/,
      parse: (match) => new Date(match[1]),
    },
    {
      regex: /\b(\d{4}\/\d{1,2}\/\d{1,2})\b/,
      parse: (match) => new Date(match[1].replace(/\//g, "-")),
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
    if (isNaN(d.getTime())) return null;
    return d;
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
          /* next */
        }
      }
    }
    return null;
  }

  function snippetEls(root) {
    return root.querySelectorAll(
      ".result-snippet, .result-description, p.result-snippet",
    );
  }

  function extractDateFromResult(resultEl) {
    const times = resultEl.querySelectorAll("time[datetime]");
    for (const t of times) {
      const d = parseDatetimeAttr(t.getAttribute("datetime"));
      if (d) {
        return {
          date: d,
          formatted: formatDate(d),
          original: t.getAttribute("datetime") || "",
        };
      }
    }

    let text = "";
    for (const el of snippetEls(resultEl)) {
      text += (el.textContent || "") + " ";
    }
    let dateInfo = extractDateFromText(text.trim());
    if (dateInfo) return dateInfo;

    const title = resultEl.querySelector(
      ".result-title, a.result-title, h3 a, .result-heading a",
    );
    if (title) {
      dateInfo = extractDateFromText(title.textContent || "");
    }
    return dateInfo;
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

    const cite = resultEl.querySelector(".result-cite, cite.result-cite");
    if (cite) {
      cite.after(badge);
      return;
    }

    const urlRow = resultEl.querySelector(".result-url-row");
    if (urlRow) {
      urlRow.appendChild(badge);
      return;
    }

    const snippet = resultEl.querySelector(".result-snippet, .result-description");
    if (snippet) {
      snippet.insertBefore(badge, snippet.firstChild);
    }
  }

  function processResults() {
    const results = document.querySelectorAll(
      ".result-item, article.result-item, [data-result-item]",
    );

    results.forEach((result) => {
      if (result.dataset.dateProcessed === "true") return;
      result.dataset.dateProcessed = "true";

      const dateInfo = extractDateFromResult(result);
      if (dateInfo && dateInfo.formatted) {
        injectDateBadge(result, dateInfo);
      }
    });
  }

  function findObserverRoot() {
    return (
      document.getElementById("results-list") ||
      document.querySelector(".results-list, [data-results-list], main") ||
      document.body
    );
  }

  function startObserver() {
    const target = findObserverRoot();
    let debounceTimer = null;

    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(processResults, 150);
    });

    observer.observe(target, {
      childList: true,
      subtree: true,
    });

    processResults();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver);
  } else {
    startObserver();
  }
})();
