// Adds any missing built-in foods to the database (safe to re-run; never touches custom foods or logs).
import { openDb, seedFoods } from '../db/index.js';

const db = openDb();
const added = seedFoods(db);
const { c } = db.prepare('SELECT COUNT(*) AS c FROM foods').get();
console.log(`Added ${added} new foods. Library now has ${c} foods.`);
db.close();
