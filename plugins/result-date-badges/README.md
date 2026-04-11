# Result date badges

Slot plugin for [Degoog](https://github.com/fccview/degoog). Adds a small **date badge** next to each **web** result when a date can be inferred (snippet, title, `<time>`, or URL). Works for **every engine** that uses the normal `.result-item` list.

---

## If the Store says it cannot install

### 1. “A plugin named … already exists”

Degoog copies the **last segment** of the path into `data/plugins/<name>/`. If **`data/plugins/result-date-badges`** already exists, remove or rename it first:

- **Settings → Store** → uninstall **Result date badges**, or  
- On the server, delete the folder **`data/plugins/result-date-badges`** (and remove its entry from `data/repos.json` / installed list if the UI gets out of sync).

If you previously tried **`result-dates`**, delete **`data/plugins/result-dates`** as well so you are not mixing two plugins.

### 2. “Item not listed in package.json”

The repo’s root **`package.json`** must contain an entry with **`path": "plugins/result-date-badges"`** exactly (and that folder must exist in the repo).

### 3. “Item path not found in repository”

**Refresh** the Store repo after you push changes. The server clone must include the `plugins/result-date-badges` directory.

### 4. Repo URL

Use a **git** HTTPS URL, e.g. `https://github.com/you/your-fork.git`, not a local disk path.

---

## Exports (required for Degoog)

The loader uses:

`mod.slot ?? mod.slotPlugin ?? mod.default?.slot`

This plugin provides **`export const slot`** (and **`export const slotPlugin`**, **`export default { slot }`**).  
Using **`export default slot`** alone **does not work** — `default.slot` would be undefined.

---

## What is parsed

| Source | Examples |
|--------|----------|
| `<time datetime="…">` | ISO strings |
| Snippet / title | `2024-03-15`, `Mar 4, 2024`, `3 days ago`, … |
| URL path / query | `/2024/03/15/…`, `?date=…`, `?published=…` |

---

## Settings

There is **no** per-plugin “Enabled” toggle: when the slot is installed, badges run on web results. To turn them off, **uninstall** the plugin from the Store (or disable the slot in Degoog if your build exposes that).

---

## Files

| File | Role |
|------|------|
| `index.js` | Slot (`at-a-glance`, empty HTML; loads CSS/JS) |
| `script.js` | Injects `.result-date-badge` |
| `style.css` | Badge styling |
| `template.html` | May be empty |

---

## After installing

Run a normal **web** search. Badges appear only when a date is found in snippet/title/URL/time. No visible “at a glance” panel is expected; the slot exists so **`script.js`** is loaded on the results page.

---

## Acknowledgements

The **original idea and first version** of this plugin — parsing dates from result snippets and showing them as badges on Degoog-style result cards — come from **deadrecipe**’s **Result Dates** plugin (`result-dates` in community extension packs). This fork renames the package, fixes Degoog’s slot export expectations, broadens parsing (URLs, `<time>`, more selectors), and adds install documentation. Thanks to **deadrecipe** for the initial design and implementation.

- Original author profile: [github.com/deadrecipe](https://github.com/deadrecipe)
