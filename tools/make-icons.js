/**
 * Генерация иконок PWA без внешних зависимостей (чистый PNG-энкодер).
 * Запуск: node tools/make-icons.js
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const OUT = join(import.meta.dirname ?? '.', '..', 'icons');
const SS = 3; // суперсэмплинг

const BG = [79, 70, 229];
const CARD = [255, 255, 255];
const GLYPH = [79, 70, 229];

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function insideRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len = vx * vx + vy * vy;
  let t = len === 0 ? 0 : (wx * vx + wy * vy) / len;
  t = Math.max(0, Math.min(1, t));
  const dx = px - (ax + t * vx);
  const dy = py - (ay + t * vy);
  return Math.hypot(dx, dy);
}

/** Рисует иконку в квадрат size x size (уже с суперсэмплингом), возвращает RGBA. */
function render(size, { rounded, cardScale, glyph }) {
  const S = size * SS;
  const canvas = Buffer.alloc(S * S * 4);

  const bgR = rounded ? S * 0.22 : 0;
  const cx0 = S * (cardScale ? 0.235 : 0.235);
  const cx1 = S * 0.765;
  const cy0 = S * 0.255;
  const cy1 = S * 0.745;
  const cardRadius = S * 0.075 * (cardScale ? 1 : 1);

  const scale = cardScale ?? 1;
  const w = S * 0.052 * scale;
  const pts = [
    [0.345, 0.385],
    [0.415, 0.615],
    [0.5, 0.455],
    [0.585, 0.615],
    [0.655, 0.385],
  ].map(([x, y]) => [S * x, S * y]);

  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const i = (y * S + x) * 4;
      let color = null;

      const inBg = rounded ? insideRoundRect(x, y, 0, 0, S - 1, S - 1, bgR) : true;
      if (inBg) color = BG;

      if (insideRoundRect(x, y, cx0, cy0, cx1, cy1, cardRadius)) color = CARD;

      if (glyph) {
        let best = Infinity;
        for (let p = 0; p < pts.length - 1; p += 1) {
          best = Math.min(best, distToSegment(x, y, ...pts[p], ...pts[p + 1]));
        }
        if (best <= w) color = GLYPH;
      }

      if (color) {
        canvas[i] = color[0];
        canvas[i + 1] = color[1];
        canvas[i + 2] = color[2];
        canvas[i + 3] = 255;
      }
    }
  }

  // даунсэмплинг
  const outBuf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let dy = 0; dy < SS; dy += 1) {
        for (let dx = 0; dx < SS; dx += 1) {
          const i = ((y * SS + dy) * S + (x * SS + dx)) * 4;
          const alpha = canvas[i + 3] / 255;
          r += canvas[i] * alpha;
          g += canvas[i + 1] * alpha;
          b += canvas[i + 2] * alpha;
          a += alpha;
        }
      }
      const n = SS * SS;
      const o = (y * size + x) * 4;
      outBuf[o] = a ? Math.round(r / a) : 0;
      outBuf[o + 1] = a ? Math.round(g / a) : 0;
      outBuf[o + 2] = a ? Math.round(b / a) : 0;
      outBuf[o + 3] = Math.round((a / n) * 255);
    }
  }

  return outBuf;
}

mkdirSync(OUT, { recursive: true });

const targets = [
  { file: 'icon-192.png', size: 192, opts: { rounded: true, glyph: true } },
  { file: 'icon-512.png', size: 512, opts: { rounded: true, glyph: true } },
  { file: 'icon-maskable-512.png', size: 512, opts: { rounded: false, glyph: true, cardScale: 0.86 } },
];

for (const target of targets) {
  const png = encodePng(target.size, target.size, render(target.size, target.opts));
  writeFileSync(join(OUT, target.file), png);
  console.log('готово:', join(OUT, target.file), png.length, 'байт');
}

void dirname;
