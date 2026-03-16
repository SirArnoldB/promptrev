#!/usr/bin/env node
/**
 * Generates packages/vscode/icons/rev.png (128×128)
 * Pure Node.js — no external dependencies.
 *
 * Design: indigo→violet gradient rounded square,
 *         bold ">" prompt chevron, 4-pointed sparkle star.
 */

const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

const W = 128, H = 128;

// ── CRC32 ─────────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── PNG builder ───────────────────────────────────────────────────────────────
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t   = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crcBuf]);
}

function buildPNG(pixels) {
  const raw = Buffer.alloc(H * (1 + W * 4));
  let pos = 0;
  for (let y = 0; y < H; y++) {
    raw[pos++] = 0; // filter: None
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      raw[pos++] = pixels[i]; raw[pos++] = pixels[i+1];
      raw[pos++] = pixels[i+2]; raw[pos++] = pixels[i+3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; // bit depth 8, colour type RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Pixel buffer ─────────────────────────────────────────────────────────────
const pixels = new Uint8Array(W * H * 4);

function setPixel(x, y, r, g, b, a = 255) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 4;
  const sa = a / 255, da = pixels[i+3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa < 0.001) return;
  pixels[i]   = Math.round((r * sa + pixels[i]   * da * (1 - sa)) / oa);
  pixels[i+1] = Math.round((g * sa + pixels[i+1] * da * (1 - sa)) / oa);
  pixels[i+2] = Math.round((b * sa + pixels[i+2] * da * (1 - sa)) / oa);
  pixels[i+3] = Math.round(oa * 255);
}

function lerp(a, b, t) { return a + (b - a) * t; }

// ── Background: indigo (#4F46E5) → violet (#7C3AED), diagonal gradient ────────
const C1 = [79, 70, 229], C2 = [124, 58, 237];
const RADIUS = 22;

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    // Signed-distance to rounded-rect edge
    const rx = Math.max(RADIUS - x, 0, x - (W - 1 - RADIUS));
    const ry = Math.max(RADIUS - y, 0, y - (H - 1 - RADIUS));
    const dist = Math.sqrt(rx * rx + ry * ry) - RADIUS;
    if (dist > 1) continue;
    const alpha = dist < 0 ? 255 : Math.round((1 - dist) * 255);

    // Diagonal gradient (top-left = C1, bottom-right = C2)
    const t = (x / W * 0.5) + (y / H * 0.5);
    const r = Math.round(lerp(C1[0], C2[0], t));
    const g = Math.round(lerp(C1[1], C2[1], t));
    const b = Math.round(lerp(C1[2], C2[2], t));
    setPixel(x, y, r, g, b, alpha);
  }
}

// Subtle top-centre highlight (makes bg feel dimensional)
for (let y = 0; y < 50; y++) {
  for (let x = 14; x < W - 14; x++) {
    const dx = (x - W / 2) / 50, dy = y / 50;
    const d  = Math.sqrt(dx * dx + dy * dy);
    const a  = Math.max(0, Math.round((1 - d) * 30));
    setPixel(x, y, 255, 255, 255, a);
  }
}

// ── Thick anti-aliased line ───────────────────────────────────────────────────
function drawLine(x1, y1, x2, y2, r, g, b, thick, alpha = 255) {
  const dx = x2 - x1, dy = y2 - y1;
  const steps = Math.ceil(Math.sqrt(dx * dx + dy * dy) * 2);
  const half = thick / 2;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const px = x1 + dx * t, py = y1 + dy * t;
    const ir = Math.ceil(half);
    for (let oy = -ir; oy <= ir; oy++) {
      for (let ox = -ir; ox <= ir; ox++) {
        const d = Math.sqrt(ox * ox + oy * oy);
        if (d > half + 1) continue;
        const a = d > half - 1
          ? Math.round((1 - (d - (half - 1))) * alpha)
          : alpha;
        if (a > 0) setPixel(px + ox, py + oy, r, g, b, a);
      }
    }
  }
}

// ── Prompt chevron ">" — bold, centred slightly left ─────────────────────────
// Tip at (72, 64), arms reaching back-left to (44, 38) and (44, 90)
const TIP_X = 74, TIP_Y = 64;
const ARM_X = 42, ARM_TOP = 36, ARM_BOT = 92;
const THICK = 11;

drawLine(ARM_X, ARM_TOP, TIP_X, TIP_Y, 255, 255, 255, THICK, 240);
drawLine(ARM_X, ARM_BOT, TIP_X, TIP_Y, 255, 255, 255, THICK, 240);

// Subtle second chevron behind it (depth effect)
drawLine(ARM_X - 18, ARM_TOP + 8, TIP_X - 18, TIP_Y, 255, 255, 255, 7, 80);
drawLine(ARM_X - 18, ARM_BOT - 8, TIP_X - 18, TIP_Y, 255, 255, 255, 7, 80);

// ── 4-pointed sparkle star (upper-right) ─────────────────────────────────────
function fillPolygon(pts, r, g, b, a) {
  const ys = pts.map(p => p[1]);
  const minY = Math.floor(Math.min(...ys)), maxY = Math.ceil(Math.max(...ys));
  for (let py = minY; py <= maxY; py++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= py && by > py) || (by <= py && ay > py))
        xs.push(ax + (py - ay) / (by - ay) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let j = 0; j + 1 < xs.length; j += 2)
      for (let px = Math.floor(xs[j]); px <= Math.ceil(xs[j + 1]); px++)
        setPixel(px, py, r, g, b, a);
  }
}

function drawStar(cx, cy, r1, r2, rot, r, g, b, a) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const angle = rot + i * Math.PI / 4;
    const radius = i % 2 === 0 ? r1 : r2;
    pts.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  fillPolygon(pts, r, g, b, a);
}

// Main sparkle — upper right
drawStar(91, 34, 15, 5, -Math.PI / 4, 255, 255, 255, 245);
// Tiny accent sparkle below
drawStar(104, 54, 5, 2, -Math.PI / 4, 255, 255, 255, 170);

// ── Write PNG ─────────────────────────────────────────────────────────────────
const outPath = path.resolve(__dirname, '..', 'packages', 'vscode', 'icons', 'rev.png');
fs.writeFileSync(outPath, buildPNG(pixels));
console.log(`Icon written → ${outPath}`);
