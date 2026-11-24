// SQLite access layer — uses Node's built-in `node:sqlite` (no native deps).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { SEED_FOODS } from './seed-data.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS foods (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  aliases     TEXT    NOT NULL DEFAULT '',
  region      TEXT    NOT NULL DEFAULT 'Other',
  category    TEXT    NOT NULL DEFAULT 'Other',
  unit        TEXT    NOT NULL DEFAULT '1 serving',
  grams       REAL    NOT NULL DEFAULT 100,
  kcal        REAL    NOT NULL DEFAULT 0,
  protein     REAL    NOT NULL DEFAULT 0,
  carbs       REAL    NOT NULL DEFAULT 0,
  fat         REAL    NOT NULL DEFAULT 0,
  fiber       REAL    NOT NULL DEFAULT 0,
  diet        TEXT    NOT NULL DEFAULT 'veg' CHECK (diet IN ('veg','egg','nonveg')),
  meals       TEXT    NOT NULL DEFAULT 'BLSD',
  rank        INTEGER NOT NULL DEFAULT 1000,
  is_custom   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_foods_name ON foods (lower(name));

CREATE TABLE IF NOT EXISTS entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  food_id     INTEGER NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  day         TEXT    NOT NULL,               -- YYYY-MM-DD (user's local date)
  meal        TEXT    NOT NULL CHECK (meal IN ('breakfast','lunch','snacks','dinner')),
  quantity    REAL    NOT NULL DEFAULT 1,     -- number of servings
  time        TEXT    NOT NULL DEFAULT '12:00', -- HH:MM
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_entries_day ON entries (day);
CREATE INDEX IF NOT EXISTS idx_entries_food ON entries (food_id);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const DIET = { 0: 'veg', 1: 'egg', 2: 'nonveg' };

/** Insert any seed foods that are missing (matched case-insensitively by name). */
export function seedFoods(db) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO foods
      (name, aliases, region, category, unit, grams, kcal, protein, carbs, fat, fiber, diet, meals, rank, is_custom)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`);
  let added = 0;
  db.exec('BEGIN');
  try {
    SEED_FOODS.forEach((f, i) => {
      const [name, aliases, region, category, unit, grams, kcal, p, c, fat, fib, diet, meals] = f;
      const r = insert.run(name, aliases, region, category, unit, grams, kcal, p, c, fat, fib, DIET[diet], meals, i + 1);
      added += Number(r.changes);
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return added;
}

export function openDb(file = path.resolve('data/thali.db')) {
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM foods WHERE is_custom = 0').get();
  if (c === 0) {
    const n = seedFoods(db);
    console.log(`[db] seeded ${n} foods`);
  }
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('goal_kcal', '2000')").run();
  return db;
}
