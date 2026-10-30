// Draws the flame icon at each manifest size and writes dependency-free PNGs to public/icons/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) raw.set(pixel(x, y), y * (size * 4 + 1) + 1 + x * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Teardrop flame: a circle with a tapering, slightly curled tip.
function flame(x, y, cx, cy, r, tipY) {
  if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) return true;
  if (y > cy || y < tipY) return false;
  const t = (cy - y) / (cy - tipY);
  const mid = cx + 0.05 * Math.sin(t * Math.PI) - 0.02 * t;
  return Math.abs(x - mid) <= r * Math.pow(1 - t, 0.75);
}
function roundedRect(x, y, m, rad) {
  const qx = Math.max(Math.abs(x - 0.5) - (0.5 - m - rad), 0);
  const qy = Math.max(Math.abs(y - 0.5) - (0.5 - m - rad), 0);
  return qx * qx + qy * qy <= rad * rad;
}
function color(x, y) {
  if (flame(x, y, 0.5, 0.7, 0.13, 0.42)) return [255, 200, 0];
  if (flame(x, y, 0.5, 0.63, 0.25, 0.12)) return [255, 255, 255];
  if (roundedRect(x, y, 0.03, 0.22)) return [255, 150, 0];
  return null;
}

mkdirSync('public/icons', { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const SS = 4;
  const buf = png(size, (px, py) => {
    let r = 0, g = 0, b = 0, a = 0;
    for (let i = 0; i < SS; i++)
      for (let j = 0; j < SS; j++) {
        const c = color((px + (i + 0.5) / SS) / size, (py + (j + 0.5) / SS) / size);
        if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
      }
    return a ? [r / a, g / a, b / a, (a / (SS * SS)) * 255].map(Math.round) : [0, 0, 0, 0];
  });
  writeFileSync(`public/icons/icon${size}.png`, buf);
}
