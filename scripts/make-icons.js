// Generates the PWA PNG icons (no image libraries needed): a neon "thali" ring with katoris.
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(OUT, { recursive: true });

const STOPS = [[255, 154, 60], [255, 60, 172], [139, 92, 255], [45, 226, 230], [255, 154, 60]];
const BG = [7, 8, 18];
const lerp = (a, b, t) => a + (b - a) * t;
function gradAt(t) {
  const x = t * (STOPS.length - 1), i = Math.min(Math.floor(x), STOPS.length - 2), f = x - i;
  return STOPS[i].map((c, k) => lerp(c, STOPS[i + 1][k], f));
}
const clamp = (v) => Math.max(0, Math.min(1, v));

// Returns [r,g,b] for a point in unit space (0..1), for a given content scale.
function shade(u, v, scale) {
  const dx = u - 0.5, dy = v - 0.5;
  const d = Math.hypot(dx, dy) / scale;
  const ang = (Math.atan2(dy, dx) + Math.PI * 1.5) / (2 * Math.PI) % 1;
  let col = [...BG];
  // soft glow behind the ring
  const glow = Math.exp(-Math.pow((d - 0.33) / 0.09, 2)) * 0.35;
  const g = gradAt(ang);
  col = col.map((c, k) => lerp(c, g[k], glow));
  // main ring (the thali rim)
  const ring = clamp(1 - Math.abs(d - 0.33) / 0.055);
  if (ring > 0) col = col.map((c, k) => lerp(c, g[k], Math.min(1, ring * 1.6)));
  // three katoris (small bowls) inside the plate
  const katoris = [[-0.16, -0.05], [0, -0.155], [0.16, -0.05], [-0.07, 0.13], [0.09, 0.12]];
  for (const [kx, ky] of katoris) {
    const kd = Math.hypot(dx / scale - kx, dy / scale - ky);
    const kr = clamp(1 - Math.abs(kd - 0.062) / 0.02);
    if (kr > 0) {
      const kc = gradAt(((Math.atan2(ky, kx) + Math.PI * 1.5) / (2 * Math.PI)) % 1);
      col = col.map((c, k) => lerp(c, kc[k], kr * 0.95));
    }
  }
  return col;
}

function png(size, scale) {
  const SS = 3; // supersampling
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const c = shade((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size, scale);
        r += c[0]; g += c[1]; b += c[2];
      }
      const o = row + 1 + x * 4, n = SS * SS;
      raw[o] = r / n; raw[o + 1] = g / n; raw[o + 2] = b / n; raw[o + 3] = 255;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const files = [
  ['icon-192.png', 192, 1.15], ['icon-512.png', 512, 1.15],
  ['maskable-512.png', 512, 0.9], ['apple-touch-icon.png', 180, 1.05],
];
for (const [name, size, scale] of files) {
  writeFileSync(path.join(OUT, name), png(size, scale));
  console.log('wrote', name);
}
