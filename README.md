# 🍛 Thali — Daily Food Tracker (PWA)

A mobile-first, futuristic (neon-glass) progressive web app for logging what you eat. Every entry has a **quantity** and a **time**, and goes under **Breakfast, Lunch, Snacks or Dinner**. Food comes first from India: North, South, West and East Indian dishes, plus street food, Indo-Chinese, sweets and drinks.

## Run it

Needs **Node.js 22.13+** (it uses the built-in `node:sqlite`). There are **no npm dependencies** to install.

```bash
npm start            # → http://localhost:5173
```

The first start creates `data/thali.db` and loads **283 built-in foods** into it.

| Script | What it does |
| --- | --- |
| `npm start` | Start the server (`PORT` / `HOST` env vars are optional) |
| `npm run dev` | Start the server and restart it whenever a file changes |
| `npm run seed` | Add any new built-in foods to an existing DB. Your logs and custom foods are never touched |
| `npm run icons` | Rebuild the PWA PNG icons |

## Features

- **Today**: a calorie ring, protein/carbs/fat/fiber bars, a 14-day date strip and four meal cards. Tap an entry to change its quantity, meal or time, or to delete it (with undo).
- **Smart search** with Indian spellings and aliases. For example, *golgappa / puchka* finds Pani Puri, *idly* finds Idli, and *aval* finds Poha. Typos work too (*panner*, *biriyani*). You can filter by region (North, South, West, East, Street, Indo-Chinese…).
- **Quick picks**: with an empty search box you get suggestions for the meal you're logging (poha and idli at breakfast, chai and samosa for snacks…). Foods you log often move to the top.
- **"Add this food"**: if a search finds nothing, one tap saves it as a new food (name, veg/egg/non-veg, cuisine, serving, kcal and optional macros) into SQLite. It is logged right away and shows up in search from then on.
- **Quantity**: step through ½ servings or tap ½ / 1 / 1½ / 2 / 3. Each food has an Indian serving unit (katori, roti, plate, glass…).
- **The meal is picked from the clock** and the time defaults to now. Both can be changed.
- **Insights**: 7-day and 30-day calorie charts against your goal, average kcal and protein, days on target, your streak, macro split, when you eat, and your most-eaten foods.
- **Me**: daily calorie goal with presets, macro targets, an install button and a JSON export.
- **PWA**: installable, works offline with the cached app shell and your last-loaded data, and shows the veg/non-veg marks.

## Structure

```
server.js            Zero-dependency HTTP server: JSON API + static files
db/index.js          SQLite schema, opening and seeding (node:sqlite)
db/seed-data.js      Built-in Indian-first food knowledge base
public/              The PWA: index.html, styles.css, app.js, sw.js, manifest, icons
scripts/             seed + icon generator
data/thali.db        Your database (created on first run)
```

### API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/foods?q=&region=&meal=&limit=` | Ranked search, or meal suggestions when `q` is empty |
| POST | `/api/foods` | Add a custom food `{name, kcal, protein?, carbs?, fat?, fiber?, unit?, grams?, diet?, region?}` |
| GET | `/api/log?day=YYYY-MM-DD` | One day's entries grouped by meal, with totals |
| POST | `/api/entries` | Log a food `{food_id, meal, quantity, time, day}` |
| PATCH / DELETE | `/api/entries/:id` | Edit or remove an entry |
| GET | `/api/summary?end=&days=` | Daily series, meal split, top foods and streak |
| GET / PUT | `/api/settings` | Daily calorie goal |
| GET | `/api/export` | Download everything as JSON |

## Notes

- Nutrition values are rough estimates for typical Indian home and restaurant servings.
- To install it on a phone, the app has to be served over **HTTPS**. Browsers only allow PWAs on `localhost` without HTTPS. Opening `http://<your-LAN-IP>:5173` works for trying it out, but it won't install from there. A tunnel such as `cloudflared` or `ngrok` gives you an HTTPS URL quickly.
- Logging and editing need the server. When you're offline, the app shows your last-loaded data read-only.
