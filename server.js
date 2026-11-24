// Thali — zero-dependency Node server: static PWA + JSON API over SQLite (node:sqlite).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db/index.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 5173;
const HOST = process.env.HOST || '0.0.0.0';
const db = openDb(path.join(ROOT, 'data', 'thali.db'));

const MEALS = ['breakfast', 'lunch', 'snacks', 'dinner'];
const MEAL_CODE = { breakfast: 'B', lunch: 'L', snacks: 'S', dinner: 'D' };
const REGIONS = ['North Indian', 'South Indian', 'West Indian', 'East Indian', 'Street Food', 'Indo-Chinese',
  'Snacks', 'Sweets', 'Beverages', 'Basics', 'Global', 'My Foods'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// ───────────────────────── helpers ─────────────────────────
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => new HttpError(400, msg);

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(json);
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 64 * 1024) throw new HttpError(413, 'Body too large');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw bad('Invalid JSON'); }
}

const num = (v, { min = 0, max = 1e5, def } = {}) => {
  if ((v === undefined || v === null || v === '') && def !== undefined) return def;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw bad(`Invalid number: ${v}`);
  return Math.round(n * 10) / 10;
};
const str = (v, max = 80) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function localToday() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function addDays(day, n) {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function publicFood(f) {
  return {
    id: f.id, name: f.name, aliases: f.aliases, region: f.is_custom ? 'My Foods' : f.region, category: f.category,
    unit: f.unit, grams: f.grams, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber,
    diet: f.diet, meals: f.meals, custom: !!f.is_custom, uses: f.uses ?? 0,
  };
}

// ───────────────────────── search ─────────────────────────
// Trigram similarity for typo-tolerance ("panner" → paneer, "biriyani" → biryani).
function trigrams(s) {
  const t = new Set();
  const p = `  ${s} `;
  for (let i = 0; i < p.length - 2; i++) t.add(p.slice(i, i + 3));
  return t;
}
function trigramSim(a, b) {
  const A = trigrams(a), B = trigrams(b);
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter || 1);
}
function levenshtein(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}
// 0..1 — best of edit-distance and trigram overlap, against the whole phrase and each word.
function similarity(q, phrase) {
  let best = trigramSim(q, phrase) >= 0.45 ? trigramSim(q, phrase) : 0;
  for (const w of [phrase, ...phrase.split(' ')]) {
    if (!w) continue;
    const lev = 1 - levenshtein(q, w) / Math.max(q.length, w.length);
    if (lev >= 0.7) best = Math.max(best, lev);
  }
  return best;
}

// Curated "quick picks" per meal for the empty search state (Indian-first).
const SUGGEST = {
  breakfast: ['Poha', 'Idli', 'Masala Dosa', 'Aloo Paratha', 'Upma', 'Masala Chai', 'Besan Chilla', 'Medu Vada', 'Thepla', 'Boiled Egg', 'Masala Omelette', 'Filter Coffee', 'Oats Porridge', 'Banana'],
  lunch: ['Roti / Chapati', 'Steamed Rice', 'Dal Tadka', 'Rajma Chawal', 'Sambar', 'Curd Rice', 'Chicken Biryani', 'Paneer Butter Masala', 'Veg Thali', 'South Indian Meals', 'Chole', 'Aloo Gobi', 'Dahi', 'Green Salad'],
  snacks: ['Masala Chai', 'Samosa', 'Pani Puri', 'Dhokla', 'Roasted Makhana', 'Vada Pav', 'Bhel Puri', 'Onion Pakoda', 'Sprouts Salad', 'Filter Coffee', 'Roasted Chana', 'Veg Momos', 'Glucose Biscuits', 'Banana'],
  dinner: ['Roti / Chapati', 'Dal Tadka', 'Khichdi', 'Palak Paneer', 'Steamed Rice', 'Chicken Curry', 'Mix Veg Curry', 'Curd Rice', 'Rasam', 'Plain Dosa', 'Idli', 'Bhindi Masala', 'Dahi', 'Kheer'],
};

const ALL_FOODS_SQL = `
  SELECT f.*, (SELECT COUNT(*) FROM entries e WHERE e.food_id = f.id) AS uses
  FROM foods f`;

function scoreFood(f, q, tokens) {
  const name = norm(f.name);
  const aliases = f.aliases ? norm(f.aliases.replace(/,/g, ' , ')).split(' , ').map((a) => a.trim()) : [];
  const hay = `${name} ${aliases.join(' ')} ${norm(f.category)} ${norm(f.region)}`;
  if (!tokens.every((t) => hay.includes(t))) return 0;

  let s = 10;
  if (name === q) s = 100;
  else if (aliases.includes(q)) s = 90;
  else if (name.startsWith(q)) s = 80;
  else if (aliases.some((a) => a.startsWith(q))) s = 65;
  else if (name.split(' ').some((w) => w.startsWith(tokens[0]))) s = 55;
  else if (name.includes(q)) s = 45;
  else if (aliases.some((a) => a.includes(q))) s = 35;
  s += Math.min(f.uses, 20) * 1.5;           // foods you log often float up
  s += f.is_custom ? 4 : 0;
  s -= f.region === 'Global' ? 6 : 0;          // Indian-first
  s -= f.rank / 1000;                           // stable tie-break by seed order
  return s;
}

function searchFoods({ q = '', region = '', meal = '', limit = 40 }) {
  const query = norm(q);
  const rows = db.prepare(ALL_FOODS_SQL).all();
  const byRegion = (f) => !region || region === 'All' ||
    (region === 'My Foods' ? f.is_custom : (f.region === region && !f.is_custom));
  const pool = rows.filter(byRegion);

  if (!query) {
    // Suggestions: your frequently logged foods, then curated picks for this meal, then anything that suits the meal.
    const code = MEAL_CODE[meal];
    const picks = SUGGEST[meal] || [];
    return pool
      .map((f) => {
        const pick = picks.indexOf(f.name);
        const s = (f.uses ? 10000 + f.uses * 10 : 0) + (pick >= 0 ? 5000 - pick * 10 : 0)
          + (code && f.meals.includes(code) ? 1000 : 0) - f.rank / 1000;
        return { f, s };
      })
      .sort((a, b) => b.s - a.s)
      .slice(0, limit)
      .map(({ f }) => publicFood(f));
  }

  const tokens = query.split(' ');
  let scored = pool.map((f) => ({ f, s: scoreFood(f, query, tokens) })).filter((x) => x.s > 0);

  if (scored.length < 5 && query.length >= 3) {
    // Fuzzy fallback for spelling variants.
    const seen = new Set(scored.map((x) => x.f.id));
    for (const f of pool) {
      if (seen.has(f.id)) continue;
      const cands = [norm(f.name), ...norm(f.aliases.replace(/,/g, ' , ')).split(' , ')];
      const best = Math.max(...cands.map((c) => similarity(query, c.trim())));
      if (best > 0) scored.push({ f, s: best * 30 + Math.min(f.uses, 20) - f.rank / 1000 });
    }
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map(({ f }) => publicFood(f));
}

// ───────────────────────── entries ─────────────────────────
const ENTRY_SQL = `
  SELECT e.id, e.day, e.meal, e.quantity, e.time, f.id AS food_id, f.name, f.unit, f.diet, f.region, f.is_custom,
         f.kcal, f.protein, f.carbs, f.fat, f.fiber
  FROM entries e JOIN foods f ON f.id = e.food_id`;

function shapeEntry(r) {
  const q = r.quantity;
  const r1 = (x) => Math.round(x * q * 10) / 10;
  return {
    id: r.id, day: r.day, meal: r.meal, quantity: q, time: r.time,
    food: { id: r.food_id, name: r.name, unit: r.unit, diet: r.diet, region: r.is_custom ? 'My Foods' : r.region },
    kcal: Math.round(r.kcal * q), protein: r1(r.protein), carbs: r1(r.carbs), fat: r1(r.fat), fiber: r1(r.fiber),
  };
}

function dayLog(day) {
  const entries = db.prepare(`${ENTRY_SQL} WHERE e.day = ? ORDER BY e.time, e.id`).all(day).map(shapeEntry);
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  const meals = Object.fromEntries(MEALS.map((m) => [m, { kcal: 0, items: [] }]));
  for (const e of entries) {
    for (const k of Object.keys(totals)) totals[k] += e[k];
    meals[e.meal].kcal += e.kcal;
    meals[e.meal].items.push(e);
  }
  for (const k of Object.keys(totals)) totals[k] = Math.round(totals[k] * 10) / 10;
  return { day, totals, meals, goal: getGoal() };
}

function getGoal() {
  return Number(db.prepare("SELECT value FROM settings WHERE key = 'goal_kcal'").get()?.value || 2000);
}

function summary(end, days) {
  const start = addDays(end, -(days - 1));
  const rows = db.prepare(`
    SELECT e.day, e.meal, SUM(f.kcal * e.quantity) AS kcal, SUM(f.protein * e.quantity) AS protein,
           SUM(f.carbs * e.quantity) AS carbs, SUM(f.fat * e.quantity) AS fat, SUM(f.fiber * e.quantity) AS fiber
    FROM entries e JOIN foods f ON f.id = e.food_id
    WHERE e.day BETWEEN ? AND ? GROUP BY e.day, e.meal`).all(start, end);

  const byDay = new Map();
  for (let i = 0; i < days; i++) byDay.set(addDays(start, i), { day: addDays(start, i), kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
  const mealSplit = Object.fromEntries(MEALS.map((m) => [m, 0]));
  for (const r of rows) {
    const d = byDay.get(r.day);
    for (const k of ['kcal', 'protein', 'carbs', 'fat', 'fiber']) d[k] += r[k];
    mealSplit[r.meal] += r.kcal;
  }
  const series = [...byDay.values()].map((d) => ({
    ...d, kcal: Math.round(d.kcal), protein: Math.round(d.protein), carbs: Math.round(d.carbs), fat: Math.round(d.fat), fiber: Math.round(d.fiber),
  }));
  const top = db.prepare(`
    SELECT f.name, f.diet, COUNT(*) AS times, ROUND(SUM(f.kcal * e.quantity)) AS kcal
    FROM entries e JOIN foods f ON f.id = e.food_id
    WHERE e.day BETWEEN ? AND ? GROUP BY f.id ORDER BY times DESC, kcal DESC LIMIT 5`).all(start, end);

  // Streak: consecutive days ending at `end` (or the day before, if today is still empty) with at least one entry.
  const logged = new Set(db.prepare('SELECT DISTINCT day FROM entries WHERE day <= ?').all(end).map((r) => r.day));
  let streak = 0;
  let cursor = logged.has(end) ? end : addDays(end, -1);
  while (logged.has(cursor)) { streak++; cursor = addDays(cursor, -1); }

  return { start, end, goal: getGoal(), series, mealSplit: Object.fromEntries(Object.entries(mealSplit).map(([k, v]) => [k, Math.round(v)])), top, streak };
}

// ───────────────────────── routes ─────────────────────────
async function api(req, res, url) {
  const { pathname, searchParams: qs } = url;
  const m = req.method;

  if (m === 'GET' && pathname === '/api/meta') {
    const { c } = db.prepare('SELECT COUNT(*) AS c FROM foods').get();
    const { custom } = db.prepare('SELECT COUNT(*) AS custom FROM foods WHERE is_custom = 1').get();
    return send(res, 200, { foods: c, custom, regions: REGIONS, meals: MEALS });
  }

  if (m === 'GET' && pathname === '/api/foods') {
    const limit = Math.min(num(qs.get('limit'), { min: 1, max: 500, def: 40 }), 500);
    return send(res, 200, searchFoods({ q: str(qs.get('q'), 60), region: str(qs.get('region'), 30), meal: qs.get('meal') || '', limit }));
  }

  if (m === 'POST' && pathname === '/api/foods') {
    const b = await readJson(req);
    const name = str(b.name, 60);
    if (name.length < 2) throw bad('Food name is required');
    const diet = ['veg', 'egg', 'nonveg'].includes(b.diet) ? b.diet : 'veg';
    const region = REGIONS.includes(b.region) && b.region !== 'My Foods' ? b.region : 'North Indian';
    const exists = db.prepare('SELECT id FROM foods WHERE lower(name) = lower(?)').get(name);
    if (exists) throw new HttpError(409, `"${name}" already exists in the library`);
    const r = db.prepare(`
      INSERT INTO foods (name, aliases, region, category, unit, grams, kcal, protein, carbs, fat, fiber, diet, meals, rank, is_custom)
      VALUES (?, ?, ?, 'Custom', ?, ?, ?, ?, ?, ?, ?, ?, 'BLSD', 0, 1)`).run(
      name, str(b.aliases, 120), region, str(b.unit, 30) || '1 serving', num(b.grams, { max: 5000, def: 0 }),
      num(b.kcal, { max: 5000 }), num(b.protein, { max: 500, def: 0 }), num(b.carbs, { max: 1000, def: 0 }),
      num(b.fat, { max: 500, def: 0 }), num(b.fiber, { max: 200, def: 0 }), diet);
    const food = db.prepare(`${ALL_FOODS_SQL} WHERE f.id = ?`).get(Number(r.lastInsertRowid));
    return send(res, 201, publicFood(food));
  }

  if (m === 'GET' && pathname === '/api/log') {
    const day = qs.get('day') || localToday();
    if (!DAY_RE.test(day)) throw bad('Invalid day');
    return send(res, 200, dayLog(day));
  }

  if (m === 'POST' && pathname === '/api/entries') {
    const b = await readJson(req);
    const day = b.day || localToday();
    if (!DAY_RE.test(day)) throw bad('Invalid day');
    if (!MEALS.includes(b.meal)) throw bad('Invalid meal');
    const time = TIME_RE.test(b.time) ? b.time : '12:00';
    const food = db.prepare('SELECT id FROM foods WHERE id = ?').get(Number(b.food_id));
    if (!food) throw new HttpError(404, 'Food not found');
    const qty = num(b.quantity, { min: 0.1, max: 50, def: 1 });
    db.prepare('INSERT INTO entries (food_id, day, meal, quantity, time) VALUES (?, ?, ?, ?, ?)').run(food.id, day, b.meal, qty, time);
    return send(res, 201, dayLog(day));
  }

  const entryMatch = pathname.match(/^\/api\/entries\/(\d+)$/);
  if (entryMatch) {
    const id = Number(entryMatch[1]);
    const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(id);
    if (!row) throw new HttpError(404, 'Entry not found');
    if (m === 'DELETE') {
      db.prepare('DELETE FROM entries WHERE id = ?').run(id);
      return send(res, 200, dayLog(row.day));
    }
    if (m === 'PATCH') {
      const b = await readJson(req);
      const meal = b.meal === undefined ? row.meal : b.meal;
      if (!MEALS.includes(meal)) throw bad('Invalid meal');
      const time = b.time === undefined ? row.time : b.time;
      if (!TIME_RE.test(time)) throw bad('Invalid time');
      const qty = b.quantity === undefined ? row.quantity : num(b.quantity, { min: 0.1, max: 50 });
      db.prepare('UPDATE entries SET meal = ?, time = ?, quantity = ? WHERE id = ?').run(meal, time, qty, id);
      return send(res, 200, dayLog(row.day));
    }
  }

  if (m === 'GET' && pathname === '/api/summary') {
    const end = qs.get('end') || localToday();
    if (!DAY_RE.test(end)) throw bad('Invalid end day');
    const days = num(qs.get('days'), { min: 1, max: 90, def: 7 });
    return send(res, 200, summary(end, Math.round(days)));
  }

  if (pathname === '/api/settings') {
    if (m === 'PUT') {
      const b = await readJson(req);
      const goal = Math.round(num(b.goal_kcal, { min: 800, max: 6000 }));
      db.prepare("INSERT INTO settings (key, value) VALUES ('goal_kcal', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(goal));
    }
    if (m === 'GET' || m === 'PUT') return send(res, 200, { goal_kcal: getGoal() });
  }

  if (m === 'GET' && pathname === '/api/export') {
    const entries = db.prepare(`${ENTRY_SQL} ORDER BY e.day, e.time`).all().map(shapeEntry);
    const custom = db.prepare(`${ALL_FOODS_SQL} WHERE f.is_custom = 1`).all().map(publicFood);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="thali-export-${localToday()}.json"`,
    });
    return res.end(JSON.stringify({ exported_at: new Date().toISOString(), goal_kcal: getGoal(), custom_foods: custom, entries }, null, 2));
  }

  throw new HttpError(404, 'Not found');
}

// ───────────────────────── static ─────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

async function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  try {
    const body = await readFile(file);
    const ext = path.extname(file);
    const noCache = !rel.startsWith('/icons/');
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': noCache ? 'no-cache' : 'public, max-age=3600',
      ...(rel === '/sw.js' ? { 'Service-Worker-Allowed': '/' } : {}),
    });
    res.end(body);
  } catch {
    // SPA fallback for client-side routes; real asset misses get a 404.
    if (path.extname(rel)) { res.writeHead(404); return res.end('Not found'); }
    const body = await readFile(path.join(PUBLIC, 'index.html'));
    res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
    res.end(body);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
    return await serveStatic(req, res, url);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) send(res, status, { error: status === 500 ? 'Something went wrong' : e.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  🍛 Thali is running →  http://localhost:${PORT}\n`);
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(); db.close(); process.exit(0); });
