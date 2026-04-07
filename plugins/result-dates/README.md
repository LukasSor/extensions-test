# Result dates

Slot plugin for [Degoog](https://github.com/fccview/degoog). It adds a small **date badge** next to each **web** search result when a date can be inferred — works for **every engine** that uses the normal result list markup (same as the rest of the UI).

## Why it might miss a result

- The snippet and title contain **no** parseable date and the **URL** does not include a `YYYY/MM/DD` (or similar) segment.
- The page structure is **not** based on `.result-item` (rare custom layouts).

## Why it might have failed completely before

Degoog loads slots with:

`mod.slot ?? mod.slotPlugin ?? mod.default?.slot`

So **`export default slot`** (default export = the slot object) **does not register**: there is no `default.slot` property. This pack uses **`export const slot`** and **`export default { slot }`**.

## What is parsed

| Source | Examples |
|--------|----------|
| `<time datetime="…">` | ISO strings |
| Snippet / title text | `2024-03-15`, `Mar 4, 2024`, `3 days ago`, … |
| Result URL path/query | `/2024/03/15/…`, `?date=…`, `?published=…` |

## Settings

- **Enabled** — toggle in **Settings → Plugins** for this slot (stored like other plugins).

## Files

| File | Role |
|------|------|
| `index.js` | Slot definition (`at-a-glance`, empty HTML; loads assets) |
| `script.js` | Injects `.result-date-badge` into results |
| `style.css` | Badge look (theme variables) |
| `template.html` | Optional; can stay empty |

## Position

Uses **`at-a-glance`** so the main results render immediately; date logic runs in the client script and does not block search.
