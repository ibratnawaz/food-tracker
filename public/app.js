// Thali — client. Vanilla ES modules, no build step.

// ───────────────────────── utils ─────────────────────────
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const fmt = (n) => Math.round(n).toLocaleString('en-IN');
const r1 = (n) => Math.round(n * 10) / 10;
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const haptic = (ms = 8) => navigator.vibrate?.(ms);

function isoDay(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
const today = () => isoDay();
function shiftDay(day, n) {
  const d = new Date(day + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return isoDay(d);
}
function dayTitle(day) {
  if (day === today()) return 'Today';
  if (day === shiftDay(today(), -1)) return 'Yesterday';
  return new Date(day + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
const nowHM = () => new Date().toTimeString().slice(0, 5);
function fmtTime(hm) {
  const [h, m] = hm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
const FRACTIONS = { 0.5: '½', 0.25: '¼', 0.75: '¾' };
function fmtQty(q) {
  const whole = Math.floor(q), frac = r1(q - whole);
  if (FRACTIONS[frac]) return (whole || '') + FRACTIONS[frac];
  return String(r1(q));
}
function highlight(text, q) {
  if (!q) return esc(text);
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return esc(text);
  return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
}

// ───────────────────────── constants ─────────────────────────
const ICON = {
  breakfast: '<path d="M3 18h18M6 18a6 6 0 0 1 12 0M12 6V3M4.9 9.9 3.5 8.5M19.1 9.9l1.4-1.4M8 21h8"/>',
  lunch: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
  snacks: '<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9zM17 11h1.5a2.5 2.5 0 0 1 0 5H17M8 3.5v2.5M12 3.5v2.5"/>',
  dinner: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
};
const MEALS = [
  { key: 'breakfast', label: 'Breakfast', window: '6 – 10 AM', time: '08:30' },
  { key: 'lunch', label: 'Lunch', window: '12 – 3 PM', time: '13:30' },
  { key: 'snacks', label: 'Snacks', window: '4 – 7 PM', time: '17:30' },
  { key: 'dinner', label: 'Dinner', window: '7 – 10 PM', time: '20:30' },
];
const MEAL = Object.fromEntries(MEALS.map((m) => [m.key, m]));
const REGION_CHIPS = [
  ['All', 'All'], ['North Indian', 'North'], ['South Indian', 'South'], ['West Indian', 'West'], ['East Indian', 'East'],
  ['Street Food', 'Street'], ['Indo-Chinese', 'Indo-Chinese'], ['Snacks', 'Snacks'], ['Sweets', 'Sweets'],
  ['Beverages', 'Drinks'], ['Basics', 'Basics'], ['Global', 'Global'], ['My Foods', 'My Foods'],
];
const DIETS = [['veg', 'Veg'], ['egg', 'Egg'], ['nonveg', 'Non-veg']];
const MACROS = [
  ['protein', 'Protein', 'var(--c-protein)'], ['carbs', 'Carbs', 'var(--c-carbs)'],
  ['fat', 'Fat', 'var(--c-fat)'], ['fiber', 'Fiber', 'var(--c-fiber)'],
];
const SVG_PLUS = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';
const SVG_BACK = '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>';
const SVG_X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const SVG_SEARCH = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

function mealForNow() {
  const h = new Date().getHours();
  if (h >= 4 && h < 11) return 'breakfast';
  if (h >= 11 && h < 16) return 'lunch';
  if (h >= 16 && h < 19) return 'snacks';
  return 'dinner';
}
function targets(goal) {
  return { kcal: goal, protein: Math.round((goal * 0.2) / 4), carbs: Math.round((goal * 0.5) / 4), fat: Math.round((goal * 0.3) / 9), fiber: 30 };
}

// ───────────────────────── api ─────────────────────────
async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error(navigator.onLine ? 'Can’t reach the server' : 'You’re offline — changes need a connection');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ───────────────────────── state ─────────────────────────
const state = {
  day: today(),
  log: null,
  goal: 2000,
  strip: new Map(), // day → kcal for the date strip
  streak: 0,
  meta: null,
  insightsDays: 7,
  lib: { q: '', region: 'All' },
};

// ───────────────────────── toast ─────────────────────────
let toastTimer;
function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  if (action) $('button', el).onclick = () => { el.classList.remove('show'); action.run(); };
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 4500 : 2600);
}

// ───────────────────────── router ─────────────────────────
const view = $('#view');
const topbar = $('.topbar');
const routes = { today: renderToday, library: renderLibrary, insights: renderInsights, settings: renderSettings };
function currentTab() { return (location.hash.replace('#/', '') || 'today').split('?')[0]; }
async function route() {
  const tab = routes[currentTab()] ? currentTab() : 'today';
  $$('.dock-btn').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  view.style.animation = 'none'; void view.offsetWidth; view.style.animation = '';
  await routes[tab]();
}
window.addEventListener('hashchange', () => { window.scrollTo(0, 0); route(); });

// ───────────────────────── TODAY ─────────────────────────
async function loadDay() {
  const [log, sum] = await Promise.all([
    api(`/api/log?day=${state.day}`),
    api(`/api/summary?end=${today()}&days=14`),
  ]);
  state.log = log;
  state.goal = log.goal;
  state.strip = new Map(sum.series.map((d) => [d.day, d.kcal]));
  state.streak = sum.streak;
  updateStreak();
}

function updateStreak() {
  const pill = $('#streakPill');
  pill.hidden = state.streak < 1;
  pill.textContent = `🔥 ${state.streak} day${state.streak === 1 ? '' : 's'}`;
}

async function renderToday() {
  if (!state.log || state.log.day !== state.day) view.innerHTML = skeletonToday();
  try { await loadDay(); } catch (e) { view.innerHTML = errorBlock(e); return; }
  paintToday();
}

function skeletonToday() {
  return `<div class="skel" style="height:34px;width:140px;margin:14px 0"></div>
    <div class="skel" style="height:72px;margin-bottom:12px"></div>
    <div class="skel" style="height:184px;border-radius:22px"></div>
    ${'<div class="skel" style="height:72px;border-radius:22px;margin-top:12px"></div>'.repeat(4)}`;
}
function errorBlock(e) {
  return `<div class="empty"><div class="glyph">🛰️</div>${esc(e.message)}<br><br><button class="chip on" onclick="location.reload()">Retry</button></div>`;
}

function paintToday() {
  const { totals, meals } = state.log;
  const t = targets(state.goal);
  const left = state.goal - totals.kcal;
  const pct = Math.min(totals.kcal / state.goal, 1);
  const C = 2 * Math.PI * 62;

  const days = [];
  for (let i = 13; i >= 0; i--) days.push(shiftDay(today(), -i));
  if (!days.includes(state.day)) days.unshift(state.day);

  view.innerHTML = `
    <div class="datebar">
      <h1>${esc(dayTitle(state.day))}</h1>
      ${state.day !== today() ? '<button data-act="goto-today">Back to today →</button>' : `<span class="label">${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>`}
    </div>
    <div class="days" id="days">
      ${days.map((d) => {
        const dt = new Date(d + 'T12:00:00');
        const k = state.strip.get(d) || 0;
        return `<button class="day ${d === state.day ? 'on' : ''}" data-day="${d}" aria-label="${dt.toDateString()}">
          <small>${dt.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 3)}</small><b>${dt.getDate()}</b>
          <span class="dot"><i style="width:${Math.min(100, (k / state.goal) * 100)}%"></i></span></button>`;
      }).join('')}
    </div>

    <section class="hero glass">
      <div class="ring ${left < 0 ? 'over' : ''}">
        <svg viewBox="0 0 148 148" aria-hidden="true">
          <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#ff9a3c"/><stop offset=".55" stop-color="#ff3cac"/><stop offset="1" stop-color="#8b5cff"/>
          </linearGradient></defs>
          <circle class="ticks" cx="74" cy="74" r="72" fill="none" stroke-width="2" stroke-dasharray="1 5.3"/>
          <circle class="track" cx="74" cy="74" r="62" fill="none" stroke-width="12"/>
          <circle class="prog" cx="74" cy="74" r="62" fill="none" stroke="url(#rg)" stroke-width="12" stroke-linecap="round"
            stroke-dasharray="${C}" stroke-dashoffset="${C}" data-target="${C * (1 - pct)}"/>
        </svg>
        <div class="ring-center">
          <b class="num" data-count="${Math.abs(left)}">0</b>
          <small>${left < 0 ? 'kcal over' : 'kcal left'}</small>
        </div>
      </div>
      <div class="hero-stats">
        <div class="hero-eaten"><b class="num">${fmt(totals.kcal)}</b> / <span class="num">${fmt(state.goal)}</span> kcal eaten</div>
        ${MACROS.map(([k, label, color]) => `
          <div class="macro">
            <div class="macro-top"><span>${label}</span><b class="num">${fmt(totals[k])}<em> / ${t[k]}g</em></b></div>
            <div class="bar"><i style="color:${color};background:${color}" data-w="${Math.min(100, (totals[k] / t[k]) * 100)}"></i></div>
          </div>`).join('')}
      </div>
    </section>

    <div class="meals">
      ${MEALS.map((m) => mealCard(m, meals[m.key])).join('')}
    </div>`;

  // Animate in
  requestAnimationFrame(() => {
    const prog = $('.prog', view);
    prog.style.strokeDashoffset = prog.dataset.target;
    $$('.bar i', view).forEach((b) => (b.style.width = b.dataset.w + '%'));
    countUp($('[data-count]', view));
    $('#days').scrollLeft = 9999;
    $('.day.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  });
}

function countUp(el) {
  const to = Number(el.dataset.count);
  const start = performance.now();
  const step = (t) => {
    const p = Math.min((t - start) / 800, 1);
    el.textContent = fmt(to * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function mealCard(m, data) {
  return `
    <section class="meal glass m-${m.key}">
      <div class="meal-head">
        <div class="meal-ico"><svg viewBox="0 0 24 24">${ICON[m.key]}</svg></div>
        <div class="meal-title"><h3>${m.label}</h3><p>${data.items.length ? `${data.items.length} item${data.items.length > 1 ? 's' : ''}` : m.window}</p></div>
        <div class="meal-kcal num">${fmt(data.kcal)}<small>KCAL</small></div>
        <button class="add-btn" data-act="add" data-meal="${m.key}" aria-label="Add to ${m.label}">${SVG_PLUS}</button>
      </div>
      ${data.items.length ? `<ul class="items">${data.items.map(itemRow).join('')}</ul>` : `<p class="meal-empty">Nothing logged yet</p>`}
    </section>`;
}
function itemRow(e) {
  return `<li><button class="item" data-entry="${e.id}">
    <span class="diet ${e.food.diet}" title="${e.food.diet}"></span>
    <span class="item-main"><div class="item-name">${esc(e.food.name)}</div>
      <div class="item-meta">${fmtQty(e.quantity)} × ${esc(e.food.unit)} · ${fmtTime(e.time)}</div></span>
    <span class="item-kcal num">${fmt(e.kcal)}</span></button></li>`;
}

view.addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-act],[data-day],[data-entry]');
  if (!t) return;
  if (t.dataset.day) { state.day = t.dataset.day; haptic(); renderToday(); return; }
  if (t.dataset.entry) {
    const entry = Object.values(state.log.meals).flatMap((m) => m.items).find((e) => e.id === Number(t.dataset.entry));
    if (entry) openEdit(entry);
    return;
  }
  const act = t.dataset.act;
  if (act === 'goto-today') { state.day = today(); renderToday(); }
  if (act === 'add') openAdd({ meal: t.dataset.meal });
});

// ───────────────────────── SHEET ─────────────────────────
const sheet = $('#sheet'), backdrop = $('#backdrop'), body = $('#sheetBody');
let S = null; // sheet state
let lastFocus = null;

function openSheet() {
  lastFocus = document.activeElement;
  sheet.hidden = false; backdrop.hidden = false;
  sheet.classList.remove('closing');
  sheet.style.transform = '';
  document.body.style.overflow = 'hidden';
}
function closeSheet() {
  if (sheet.hidden) return;
  sheet.classList.add('closing');
  setTimeout(() => {
    sheet.hidden = true; backdrop.hidden = true; sheet.classList.remove('closing');
    body.innerHTML = ''; S = null; document.body.style.overflow = '';
    lastFocus?.focus?.();
  }, 200);
}
backdrop.addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

// Drag the grip down to dismiss.
(() => {
  const grip = $('#grip');
  let y0 = null, dy = 0;
  grip.addEventListener('pointerdown', (e) => { y0 = e.clientY; dy = 0; grip.setPointerCapture(e.pointerId); sheet.style.transition = 'none'; });
  grip.addEventListener('pointermove', (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.clientY - y0);
    sheet.style.transform = `translate(-50%, ${dy}px)`;
  });
  const end = () => {
    if (y0 === null) return;
    y0 = null; sheet.style.transition = '';
    if (dy > 110) closeSheet(); else sheet.style.transform = '';
  };
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
})();

function segMeal(active) {
  return `<div class="seg" role="radiogroup" aria-label="Meal">${MEALS.map((m) =>
    `<button type="button" class="m-${m.key} ${m.key === active ? 'on' : ''}" data-meal="${m.key}" role="radio" aria-checked="${m.key === active}">${m.label}</button>`).join('')}</div>`;
}

// Open the add flow. Optional: meal, food (skip search), name (prefill custom form).
function openAdd({ meal, food } = {}) {
  S = { mode: 'search', meal: meal || (state.day === today() ? mealForNow() : 'lunch'), q: '', region: 'All', results: [], food: null, qty: 1, time: null };
  openSheet();
  if (food) { S.food = food; S.mode = 'detail'; paintDetail(); }
  else paintSearch();
}
function openEdit(entry) {
  S = { mode: 'edit', entry, meal: entry.meal, qty: entry.quantity, time: entry.time,
    food: { ...entry.food, kcal: entry.kcal / entry.quantity, protein: entry.protein / entry.quantity, carbs: entry.carbs / entry.quantity, fat: entry.fat / entry.quantity, fiber: entry.fiber / entry.quantity } };
  openSheet();
  paintDetail();
}
function openCustom(name = '') {
  S = S || { meal: mealForNow(), qty: 1 };
  S.mode = 'custom';
  S.draft = { name, region: 'North Indian', unit: '1 katori', grams: '', kcal: '', protein: '', carbs: '', fat: '', fiber: '', diet: 'veg' };
  if (sheet.hidden) { S.fromLibrary = true; openSheet(); }
  paintCustom();
}

// ── search step ──
function paintSearch() {
  body.innerHTML = `
    <div class="sheet-top"><h2>Add food</h2><button class="icon-btn" data-x="close" aria-label="Close">${SVG_X}</button></div>
    ${segMeal(S.meal)}
    <div class="search">${SVG_SEARCH}
      <input id="q" type="search" inputmode="search" autocomplete="off" enterkeyhint="search" placeholder="Search dosa, poha, rajma, chai…" value="${esc(S.q)}" aria-label="Search foods" />
      <button class="clear" data-x="clear" aria-label="Clear" ${S.q ? '' : 'hidden'}>${SVG_X}</button>
    </div>
    <div class="chips" id="regions">${REGION_CHIPS.map(([v, l]) => `<button class="chip ${v === S.region ? 'on' : ''}" data-region="${esc(v)}">${esc(l)}</button>`).join('')}</div>
    <div id="results"><div class="skel" style="height:300px;margin-top:8px"></div></div>`;
  const q = $('#q');
  q.addEventListener('input', () => { S.q = q.value; $('[data-x="clear"]').hidden = !S.q; searchDebounced(); });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const first = $('.result', body); if (first) first.click(); else if (S.q.trim()) openCustom(S.q.trim()); }
  });
  setTimeout(() => q.focus({ preventScroll: true }), 280);
  runSearch();
}

let searchSeq = 0;
async function runSearch() {
  if (!S || S.mode !== 'search') return;
  const seq = ++searchSeq;
  const params = new URLSearchParams({ q: S.q.trim(), region: S.region, meal: S.meal, limit: S.q.trim() ? 40 : 24 });
  try {
    const foods = await api(`/api/foods?${params}`);
    if (seq !== searchSeq || !S || S.mode !== 'search') return;
    S.results = foods;
    paintResults();
  } catch (e) { $('#results').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}
const searchDebounced = debounce(runSearch, 140);

function foodRow(f, q = '') {
  const kcal = fmt(f.kcal);
  return `<li><button class="result" data-food="${f.id}">
    <span class="diet ${f.diet}"></span>
    <span class="result-main">
      <div class="result-name">${highlight(f.name, q)}${f.custom ? '<span class="tag-mine">MINE</span>' : ''}</div>
      <div class="result-meta">${esc(f.unit)} · ${esc(f.region)}${f.uses ? ` · logged ${f.uses}×` : ''}</div>
    </span>
    <span class="result-kcal num">${kcal}<small>kcal</small></span></button></li>`;
}

function paintResults() {
  const q = S.q.trim();
  const list = S.results;
  const addNew = (prominent) => `
    <button class="add-new" data-x="new" ${prominent ? 'style="border-style:solid"' : ''}>
      <span class="plus">+</span>
      <span><b>Add “${esc(q)}” as a new food</b><span>Not in the list? Save it to your library once, log it anytime.</span></span>
    </button>`;
  let html = '';
  if (!q) html += `<div class="label section-label">${S.region === 'All' ? `Quick picks · ${MEAL[S.meal].label}` : esc(S.region)}</div>`;
  if (list.length) html += `<ul class="results">${list.map((f) => foodRow(f, q)).join('')}</ul>`;
  else if (q) html += `<div class="empty"><div class="glyph">🍽️</div>No match for “${esc(q)}”${S.region !== 'All' ? ` in ${esc(S.region)}` : ''}.</div>`;
  else html += `<div class="empty"><div class="glyph">🥘</div>No foods here yet.</div>`;
  if (q) html += addNew(!list.length);
  $('#results').innerHTML = html;
}

// ── detail / edit step ──
function paintDetail() {
  const f = S.food;
  const editing = S.mode === 'edit';
  S.time = S.time || (state.day === today() ? nowHM() : MEAL[S.meal].time);
  body.innerHTML = `
    <div class="sheet-top">
      ${editing || !S.results?.length ? '' : `<button class="icon-btn" data-x="back" aria-label="Back to search">${SVG_BACK}</button>`}
      <h2>${editing ? 'Edit entry' : ''}</h2>
      <button class="icon-btn" data-x="close" aria-label="Close">${SVG_X}</button>
    </div>
    <div class="food-hero">
      <div class="tags"><span class="diet ${f.diet}"></span>${esc(f.region || '')}</div>
      <h2>${esc(f.name)}</h2>
      <div class="per">per ${esc(f.unit)}${f.grams ? ` · ~${fmt(f.grams)} g` : ''} · ${fmt(f.kcal)} kcal</div>
      <div class="big-kcal num" id="dk">0</div><small>KCAL</small>
    </div>
    <div class="stepper">
      <button type="button" data-x="minus" aria-label="Less">−</button>
      <div class="qty"><b class="num" id="dq"></b><span>× ${esc(f.unit)}</span></div>
      <button type="button" data-x="plus" aria-label="More">+</button>
    </div>
    <div class="qchips">${[0.5, 1, 1.5, 2, 3].map((v) => `<button class="chip" data-q="${v}">${fmtQty(v)}</button>`).join('')}</div>
    <div class="macros4" id="dm"></div>
    <div class="row2">
      <div class="field"><span>Meal</span>${segMeal(S.meal)}</div>
    </div>
    <div class="row2">
      <label class="field"><span>Time</span><input class="input" type="time" id="dt" value="${S.time}" /></label>
      <span class="day-chip">📅 ${esc(dayTitle(editing ? S.entry.day : state.day))}</span>
    </div>
    <button class="cta" id="dcta"></button>
    ${editing ? '<button class="ghost danger" data-x="delete">Remove from log</button>' : ''}`;
  $('#dt').addEventListener('change', (e) => { S.time = e.target.value || S.time; });
  updateDetail();
}
function updateDetail() {
  const f = S.food, q = S.qty;
  $('#dq').textContent = fmtQty(q);
  $('#dk').textContent = fmt(f.kcal * q);
  $$('[data-q]', body).forEach((c) => c.classList.toggle('on', Number(c.dataset.q) === q));
  $('#dm').innerHTML = MACROS.map(([k, l, c]) => `<div class="m4" style="color:${c}"><b class="num" style="color:var(--text)">${r1(f[k] * q)}g</b><span>${l}</span><i></i></div>`).join('');
  $('#dcta').textContent = S.mode === 'edit' ? `Save · ${fmt(f.kcal * q)} kcal` : `Add to ${MEAL[S.meal].label} · ${fmt(f.kcal * q)} kcal`;
}

// ── custom food step ──
function paintCustom() {
  const d = S.draft;
  const regions = REGION_CHIPS.filter(([v]) => v !== 'All' && v !== 'My Foods');
  body.innerHTML = `
    <div class="sheet-top">
      ${S.fromLibrary ? '' : `<button class="icon-btn" data-x="back" aria-label="Back to search">${SVG_BACK}</button>`}
      <h2>New food</h2>
      <button class="icon-btn" data-x="close" aria-label="Close">${SVG_X}</button>
    </div>
    <form class="form" id="cf" novalidate>
      <label class="field"><span>Food name</span><input class="input" name="name" required maxlength="60" value="${esc(d.name)}" placeholder="e.g. Amma’s Rasam Rice" /></label>
      <div class="field"><span>Type</span><div class="diet-pick">${DIETS.map(([v, l]) =>
        `<button type="button" class="${v === d.diet ? 'on' : ''}" data-diet="${v}" style="color:var(--${v})"><span class="diet ${v}"></span><span style="color:var(--text)">${l}</span></button>`).join('')}</div></div>
      <div class="field"><span>Cuisine</span><div class="chips" style="margin-bottom:0">${regions.map(([v, l]) =>
        `<button type="button" class="chip ${v === d.region ? 'on' : ''}" data-cregion="${esc(v)}">${esc(l)}</button>`).join('')}</div></div>
      <div class="grid2">
        <label class="field"><span>Serving</span><input class="input" name="unit" maxlength="30" value="${esc(d.unit)}" placeholder="1 katori" list="units" /></label>
        <label class="field"><span>Weight (g)</span><input class="input" name="grams" type="number" inputmode="decimal" min="0" value="${esc(d.grams)}" placeholder="150" /></label>
      </div>
      <datalist id="units">${['1 katori', '1 bowl', '1 plate', '1 piece', '1 roti', '1 glass', '1 cup', '1 tbsp', '1 tsp', '100 g'].map((u) => `<option value="${u}">`).join('')}</datalist>
      <label class="field"><span>Calories per serving (kcal)</span><input class="input" name="kcal" type="number" inputmode="decimal" min="0" required value="${esc(d.kcal)}" placeholder="250" /></label>
      <div class="grid2">
        <label class="field"><span>Protein (g)</span><input class="input" name="protein" type="number" inputmode="decimal" min="0" value="${esc(d.protein)}" placeholder="0" /></label>
        <label class="field"><span>Carbs (g)</span><input class="input" name="carbs" type="number" inputmode="decimal" min="0" value="${esc(d.carbs)}" placeholder="0" /></label>
        <label class="field"><span>Fat (g)</span><input class="input" name="fat" type="number" inputmode="decimal" min="0" value="${esc(d.fat)}" placeholder="0" /></label>
        <label class="field"><span>Fiber (g)</span><input class="input" name="fiber" type="number" inputmode="decimal" min="0" value="${esc(d.fiber)}" placeholder="0" /></label>
      </div>
      <p class="hint">Only name and calories are required. Saved foods appear under “My Foods” and in search.</p>
      <button class="cta" type="submit">Save food${S.fromLibrary ? '' : ' & continue'}</button>
    </form>`;
  const form = $('#cf');
  form.addEventListener('input', (e) => { if (e.target.name) d[e.target.name] = e.target.value; });
  form.addEventListener('submit', saveCustom);
  if (!d.name) $('[name=name]', form).focus(); else $('[name=kcal]', form).focus();
}

async function saveCustom(e) {
  e.preventDefault();
  const d = S.draft;
  if ((d.name || '').trim().length < 2) return toast('Give the food a name');
  if (d.kcal === '' || Number(d.kcal) < 0) return toast('Enter calories per serving');
  const btn = $('#cf .cta'); btn.disabled = true;
  try {
    const food = await api('/api/foods', { method: 'POST', body: { ...d, name: d.name.trim() } });
    haptic(15);
    toast(`Saved “${food.name}” to your library`);
    state.meta = null;
    if (S.fromLibrary) { closeSheet(); if (currentTab() === 'library') renderLibrary(); return; }
    S.food = food; S.mode = 'detail'; S.qty = 1; S.results = [food];
    paintDetail();
  } catch (err) { toast(err.message); btn.disabled = false; }
}

// ── sheet events ──
body.addEventListener('click', async (ev) => {
  const t = ev.target.closest('button');
  if (!t || !S) return;
  if (t.dataset.meal) {
    S.meal = t.dataset.meal;
    $$('.seg button', body).forEach((b) => { const on = b.dataset.meal === S.meal; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    if (S.mode === 'search') { if (!S.q.trim()) runSearch(); }
    else if (S.mode !== 'custom') { if (S.mode !== 'edit' && state.day !== today()) { S.time = MEAL[S.meal].time; $('#dt').value = S.time; } updateDetail(); }
    return;
  }
  if (t.dataset.region) {
    S.region = t.dataset.region;
    $$('#regions .chip').forEach((c) => c.classList.toggle('on', c === t));
    runSearch(); return;
  }
  if (t.dataset.food) {
    S.food = S.results.find((f) => f.id === Number(t.dataset.food));
    S.mode = 'detail'; S.qty = 1; S.time = null; haptic();
    paintDetail(); return;
  }
  if (t.dataset.q) { S.qty = Number(t.dataset.q); updateDetail(); return; }
  if (t.dataset.diet) { S.draft.diet = t.dataset.diet; $$('[data-diet]', body).forEach((b) => b.classList.toggle('on', b === t)); return; }
  if (t.dataset.cregion) { S.draft.region = t.dataset.cregion; $$('[data-cregion]', body).forEach((b) => b.classList.toggle('on', b === t)); return; }
  if (t.id === 'dcta') return submitDetail(t);

  switch (t.dataset.x) {
    case 'close': return closeSheet();
    case 'clear': S.q = ''; $('#q').value = ''; t.hidden = true; $('#q').focus(); return runSearch();
    case 'back': S.mode = 'search'; return paintSearch();
    case 'new': return openCustom(S.q.trim());
    case 'minus': S.qty = Math.max(0.5, r1(S.qty - 0.5)); haptic(4); return updateDetail();
    case 'plus': S.qty = Math.min(20, r1(S.qty + 0.5)); haptic(4); return updateDetail();
    case 'delete': return deleteEntry(S.entry);
  }
});

async function submitDetail(btn) {
  btn.disabled = true;
  const time = $('#dt').value || S.time;
  try {
    if (S.mode === 'edit') {
      state.log = await api(`/api/entries/${S.entry.id}`, { method: 'PATCH', body: { quantity: S.qty, meal: S.meal, time } });
      toast('Entry updated');
    } else {
      const before = new Set(allEntries().map((e) => e.id));
      const { food, meal, qty } = S;
      state.log = await api('/api/entries', { method: 'POST', body: { food_id: food.id, meal, quantity: qty, time, day: state.day } });
      const added = allEntries().find((e) => !before.has(e.id));
      haptic(18);
      toast(`${food.name} → ${MEAL[meal].label} · ${fmt(food.kcal * qty)} kcal`, added && {
        label: 'Undo', run: async () => { state.log = await api(`/api/entries/${added.id}`, { method: 'DELETE' }); afterLogChange(); },
      });
    }
    closeSheet();
    afterLogChange();
  } catch (e) { toast(e.message); btn.disabled = false; }
}
async function deleteEntry(entry) {
  try {
    state.log = await api(`/api/entries/${entry.id}`, { method: 'DELETE' });
    closeSheet(); afterLogChange(); haptic(12);
    toast(`Removed ${entry.food.name}`, {
      label: 'Undo',
      run: async () => {
        state.log = await api('/api/entries', { method: 'POST', body: { food_id: entry.food.id, meal: entry.meal, quantity: entry.quantity, time: entry.time, day: entry.day } });
        afterLogChange();
      },
    });
  } catch (e) { toast(e.message); }
}
function allEntries() { return state.log ? Object.values(state.log.meals).flatMap((m) => m.items) : []; }
function afterLogChange() {
  if (currentTab() === 'today') renderToday();
  else location.hash = '#/today';
}

$('#fab').addEventListener('click', () => { haptic(); openAdd(); });

// ───────────────────────── LIBRARY ─────────────────────────
async function renderLibrary() {
  if (!state.meta) state.meta = await api('/api/meta').catch(() => null);
  view.innerHTML = `
    <h1 class="view-title">Food Library</h1>
    <p class="view-sub">${state.meta ? `${fmt(state.meta.foods)} foods · ${state.meta.custom} added by you` : 'Indian-first food database'}</p>
    <div class="lib-sticky">
    <div class="lib-top">
      <div class="search">${SVG_SEARCH}<input id="lq" type="search" placeholder="Search the library" value="${esc(state.lib.q)}" aria-label="Search library" autocomplete="off"/></div>
      <button class="icon-btn" style="width:50px;height:50px;border-radius:16px" data-act="new-food" aria-label="Add a new food">${SVG_PLUS}</button>
    </div>
    <div class="chips lib-chips" id="lregions">${REGION_CHIPS.map(([v, l]) => `<button class="chip ${v === state.lib.region ? 'on' : ''}" data-lregion="${esc(v)}">${esc(l)}</button>`).join('')}</div>
    <div class="lib-count" id="lcount"></div>
    </div>
    <ul class="results lib-list" id="llist"><div class="skel" style="height:420px"></div></ul>`;
  const lq = $('#lq');
  lq.addEventListener('input', debounce(() => { state.lib.q = lq.value; loadLibrary(); }, 140));
  $('#lregions').addEventListener('click', (e) => {
    const c = e.target.closest('[data-lregion]'); if (!c) return;
    state.lib.region = c.dataset.lregion;
    $$('#lregions .chip').forEach((x) => x.classList.toggle('on', x === c));
    loadLibrary();
  });
  loadLibrary();
  syncTopbar();
}
let libFoods = [];
let libSeq = 0;
async function loadLibrary() {
  const seq = ++libSeq;
  const q = state.lib.q.trim();
  const foods = await api(`/api/foods?${new URLSearchParams({ q, region: state.lib.region, limit: 500 })}`).catch(() => null);
  if (seq !== libSeq || !$('#llist')) return;
  if (!foods) { $('#llist').innerHTML = errorBlock(new Error('Couldn’t load foods')); return; }
  libFoods = foods;
  const sticky = $('.lib-sticky');
  if (sticky?.classList.contains('stuck')) {
    const sub = $('.view-sub', view);
    window.scrollTo(0, sub.getBoundingClientRect().bottom + window.scrollY + 16 - topbar.offsetHeight);
  }
  if (!q) foods.sort((a, b) => a.name.localeCompare(b.name));
  $('#lcount').textContent = `${foods.length} ${foods.length === 1 ? 'food' : 'foods'}`;
  $('#llist').innerHTML = foods.map((f) => foodRow(f, q)).join('') + (q ? `
    <button class="add-new" data-act="new-food"><span class="plus">+</span>
      <span><b>Add “${esc(q)}” as a new food</b><span>Save it to your library</span></span></button>` : '')
    + (!foods.length && !q ? '<div class="empty"><div class="glyph">🥣</div>No foods here yet — tap + to add your own.</div>' : '');
}
view.addEventListener('click', (ev) => {
  if (currentTab() !== 'library') return;
  const t = ev.target.closest('[data-food],[data-act="new-food"]');
  if (!t) return;
  if (t.dataset.act === 'new-food') { S = null; openCustom(state.lib.q.trim()); return; }
  const food = libFoods.find((f) => f.id === Number(t.dataset.food));
  if (food) openAdd({ food });
});

// ───────────────────────── INSIGHTS ─────────────────────────
async function renderInsights() {
  view.innerHTML = `<h1 class="view-title">Insights</h1><p class="view-sub">How your plate is trending</p>
    <div class="skel" style="height:240px;border-radius:22px"></div>`;
  let s;
  try { s = await api(`/api/summary?end=${today()}&days=${state.insightsDays}`); } catch (e) { view.innerHTML = errorBlock(e); return; }
  state.streak = s.streak; updateStreak();
  const logged = s.series.filter((d) => d.kcal > 0);
  const n = logged.length || 1;
  const avg = (k) => logged.reduce((a, d) => a + d[k], 0) / n;
  const onTarget = logged.filter((d) => d.kcal >= s.goal * 0.85 && d.kcal <= s.goal * 1.05).length;
  const P = avg('protein') * 4, Cb = avg('carbs') * 4, F = avg('fat') * 9, tot = P + Cb + F || 1;
  const mealTot = Object.values(s.mealSplit).reduce((a, b) => a + b, 0) || 1;
  const MEAL_COL = { breakfast: '#ffb347', lunch: '#2de2e6', snacks: '#ff3cac', dinner: '#8b5cff' };

  view.innerHTML = `
    <h1 class="view-title">Insights</h1>
    <p class="view-sub">How your plate is trending</p>
    <div class="tabs2">${[7, 30].map((d) => `<button class="${d === state.insightsDays ? 'on' : ''}" data-range="${d}">${d} days</button>`).join('')}</div>

    <section class="card glass">
      <div class="card-head"><h3>Calories</h3><span>Goal ${fmt(s.goal)} kcal</span></div>
      ${barChart(s.series, s.goal)}
    </section>

    <div class="tiles">
      <div class="tile glass"><span class="label">Avg / day</span><b class="num">${logged.length ? fmt(avg('kcal')) : '—'} <small>kcal</small></b></div>
      <div class="tile glass"><span class="label">Avg protein</span><b class="num">${logged.length ? fmt(avg('protein')) : '—'} <small>g</small></b></div>
      <div class="tile glass"><span class="label">On target</span><b class="num">${onTarget}<small> / ${logged.length} days</small></b></div>
      <div class="tile glass"><span class="label">Streak</span><b class="num">${s.streak} <small>${s.streak === 1 ? 'day' : 'days'} 🔥</small></b></div>
    </div>

    <section class="card glass">
      <div class="card-head"><h3>Macro split</h3><span>avg of logged days</span></div>
      ${logged.length ? `
      <div class="stack"><i style="width:${(P / tot) * 100}%;background:var(--c-protein)"></i><i style="width:${(Cb / tot) * 100}%;background:var(--c-carbs)"></i><i style="width:${(F / tot) * 100}%;background:var(--c-fat)"></i></div>
      <div class="legend">
        <div><i style="background:var(--c-protein)"></i>Protein<b class="num">${Math.round((P / tot) * 100)}%</b></div>
        <div><i style="background:var(--c-carbs)"></i>Carbs<b class="num">${Math.round((Cb / tot) * 100)}%</b></div>
        <div><i style="background:var(--c-fat)"></i>Fat<b class="num">${Math.round((F / tot) * 100)}%</b></div>
      </div>` : '<div class="empty" style="padding:6px">Log a few meals to see this.</div>'}
    </section>

    <section class="card glass">
      <div class="card-head"><h3>When you eat</h3><span>share of calories</span></div>
      ${logged.length ? `
      <div class="stack">${MEALS.map((m) => `<i style="width:${(s.mealSplit[m.key] / mealTot) * 100}%;background:${MEAL_COL[m.key]}"></i>`).join('')}</div>
      <div class="legend" style="grid-template-columns:repeat(4,1fr)">${MEALS.map((m) =>
        `<div><i style="background:${MEAL_COL[m.key]}"></i>${m.label}<b class="num">${Math.round((s.mealSplit[m.key] / mealTot) * 100)}%</b></div>`).join('')}</div>`
      : '<div class="empty" style="padding:6px">Nothing logged in this range.</div>'}
    </section>

    <section class="card glass">
      <div class="card-head"><h3>Most eaten</h3><span>${state.insightsDays} days</span></div>
      ${s.top.length ? `<ol class="top-list">${s.top.map((t, i) => `
        <li><span class="rank">${i + 1}</span><span class="diet ${t.diet}"></span><span class="name">${esc(t.name)}</span>
        <span class="meta num">${t.times}× · ${fmt(t.kcal)} kcal</span></li>`).join('')}</ol>`
      : '<div class="empty" style="padding:6px">Your favourites will show up here.</div>'}
    </section>`;
}
view.addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-range]');
  if (!t) return;
  state.insightsDays = Number(t.dataset.range);
  renderInsights();
});

function barChart(series, goal) {
  const W = 340, H = 190, padL = 4, padB = 22, padT = 14;
  const max = Math.max(goal * 1.25, ...series.map((d) => d.kcal));
  const n = series.length, slot = (W - padL) / n, bw = Math.max(4, Math.min(28, slot * 0.58));
  const y = (v) => padT + (H - padT - padB) * (1 - v / max);
  const gy = y(goal);
  const every = n > 10 ? 5 : 1;
  const bars = series.map((d, i) => {
    const x = padL + i * slot + (slot - bw) / 2;
    const h = Math.max(d.kcal ? 3 : 2, H - padB - y(d.kcal));
    const isToday = d.day === today();
    const over = d.kcal > goal * 1.05;
    const dt = new Date(d.day + 'T12:00:00');
    const label = n > 10 ? dt.getDate() : dt.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2);
    return `<rect class="bar-r" x="${x}" y="${H - padB - h}" width="${bw}" height="${h}" rx="${Math.min(6, bw / 2)}"
        fill="${d.kcal ? (over ? 'url(#cgOver)' : 'url(#cg)') : 'rgba(255,255,255,.08)'}" ${isToday ? 'stroke="#fff" stroke-opacity=".6"' : ''}>
        <title>${dt.toDateString()}: ${fmt(d.kcal)} kcal</title></rect>
      ${(i % every === 0 || i === n - 1) ? `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" ${isToday ? 'style="fill:var(--text)"' : ''}>${label}</text>` : ''}`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Calories per day">
    <defs>
      <linearGradient id="cg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#8b5cff"/><stop offset=".6" stop-color="#ff3cac"/><stop offset="1" stop-color="#ff9a3c"/></linearGradient>
      <linearGradient id="cgOver" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff3cac"/><stop offset="1" stop-color="#ff4d6d"/></linearGradient>
    </defs>
    ${bars}
    <line class="goal-line" x1="0" x2="${W}" y1="${gy}" y2="${gy}"/>
    <text x="${W}" y="${gy - 5}" text-anchor="end" style="fill:var(--cyan)">goal</text>
  </svg>`;
}

// ───────────────────────── SETTINGS ─────────────────────────
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; if (currentTab() === 'settings') renderSettings(); });
window.addEventListener('appinstalled', () => { deferredInstall = null; toast('Thali installed 🎉'); });
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

async function renderSettings() {
  try { state.goal = (await api('/api/settings')).goal_kcal; } catch { /* keep cached */ }
  if (!state.meta) state.meta = await api('/api/meta').catch(() => null);
  const paint = () => {
    const t = targets(state.goal);
    $('#gnum').innerHTML = `${fmt(state.goal)} <small>kcal / day</small>`;
    const r = $('#goal'); r.style.setProperty('--fill', `${((state.goal - 1200) / (4000 - 1200)) * 100}%`);
    $('#gmac').innerHTML = MACROS.map(([k, l, c]) => `<div class="m4" style="color:${c}"><b class="num" style="color:var(--text)">${t[k]}g</b><span>${l}</span><i></i></div>`).join('');
    $$('[data-preset]').forEach((b) => b.classList.toggle('on', Number(b.dataset.preset) === state.goal));
  };
  view.innerHTML = `
    <h1 class="view-title">Me</h1>
    <p class="view-sub">Goals, app and data</p>
    <section class="card glass">
      <div class="label">Daily calorie goal</div>
      <div class="goal-num num" id="gnum"></div>
      <input type="range" id="goal" min="1200" max="4000" step="50" value="${state.goal}" aria-label="Daily calorie goal" />
      <div class="presets">${[[1500, 'Lose'], [2000, 'Maintain'], [2500, 'Active'], [3000, 'Gain']].map(([v, l]) =>
        `<button class="chip" data-preset="${v}">${l} · ${fmt(v)}</button>`).join('')}</div>
      <div class="label" style="margin-top:18px">Daily targets (20 / 50 / 30 split)</div>
      <div class="macros4" id="gmac" style="margin:10px 0 0"></div>
    </section>
    <section class="card glass" style="padding:4px 14px">
      <button class="list-row" data-act="install">
        <span class="ico">📲</span><span><b>${isStandalone() ? 'Installed' : 'Install Thali'}</b>
        <span>${isStandalone() ? 'Running as an app' : deferredInstall ? 'Add to your home screen — works offline' : isIOS() ? 'Share → Add to Home Screen' : 'Use your browser menu → Install app'}</span></span><span class="go">›</span>
      </button>
      <a class="list-row" href="#/library"><span class="ico">🥘</span><span><b>Food library</b>
        <span>${state.meta ? `${fmt(state.meta.foods)} foods · ${state.meta.custom} yours` : 'Browse all foods'}</span></span><span class="go">›</span></a>
      <a class="list-row" href="/api/export" download><span class="ico">⬇️</span><span><b>Export my data</b><span>Your log and custom foods as JSON</span></span><span class="go">›</span></a>
    </section>
    <p class="fineprint">Nutrition values are approximate, based on typical Indian home and restaurant servings.<br>Your data lives in a local SQLite database on the server you run.</p>`;
  paint();
  const save = debounce(async () => {
    try { state.goal = (await api('/api/settings', { method: 'PUT', body: { goal_kcal: state.goal } })).goal_kcal; toast('Goal saved'); }
    catch (e) { toast(e.message); }
  }, 450);
  $('#goal').addEventListener('input', (e) => { state.goal = Number(e.target.value); paint(); save(); });
  view.querySelector('.presets').addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset]'); if (!b) return;
    state.goal = Number(b.dataset.preset); $('#goal').value = state.goal; paint(); save();
  });
  view.querySelector('[data-act="install"]').addEventListener('click', async () => {
    if (isStandalone()) return toast('Already installed');
    if (deferredInstall) { deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; renderSettings(); }
    else toast(isIOS() ? 'Tap Share, then “Add to Home Screen”' : 'Open the browser menu and choose “Install app”');
  });
}

// ───────────────────────── boot ─────────────────────────
// Divider under the sticky header once content scrolls beneath it.
function syncTopbar() {
  const h = topbar.offsetHeight;
  document.documentElement.style.setProperty('--topbar-h', h + 'px');
  const sticky = $('.lib-sticky');
  const stuck = !!sticky && window.scrollY > 4 && sticky.getBoundingClientRect().top <= h + 1;
  sticky?.classList.toggle('stuck', stuck);
  topbar.classList.toggle('scrolled', window.scrollY > 4 && !stuck);
}
window.addEventListener('scroll', syncTopbar, { passive: true });
window.addEventListener('resize', syncTopbar);
syncTopbar();

function syncOnline() { $('#offlinePill').hidden = navigator.onLine; }
window.addEventListener('online', () => { syncOnline(); toast('Back online'); route(); });
window.addEventListener('offline', syncOnline);
syncOnline();

// Roll over to the new day if the app stays open past midnight.
let lastToday = today();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && today() !== lastToday) {
    if (state.day === lastToday) state.day = today();
    lastToday = today();
    route();
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

if (!location.hash) history.replaceState(null, '', '#/today');
route();
