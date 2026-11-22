import { crc32, deflateSync } from "node:zlib";
import { on, widthOf } from "../look/index.ts";

/** A color written as `#rrggbb`, as its three bytes. */
function bytesOf(color: string): [number, number, number] {
  const value = Number.parseInt(color.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** One chunk of a PNG: its length, its type, its data and the check of both. */
function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, check]);
}

/**
 * The page's icon, `size` pixels square: the bitmap `rows`, `#` for on, in
 * `ink` on `ground`, with a sixth of the size clear around it, as a PNG.
 */
export function icon(rows: readonly string[], size: number, ground: string, ink: string): Buffer {
  const width = widthOf(rows);
  const cell = Math.floor((size * 2) / 3 / Math.max(width, rows.length));
  const left = Math.floor((size - cell * width) / 2);
  const top = Math.floor((size - cell * rows.length) / 2);
  const [paper, mark] = [bytesOf(ground), bytesOf(ink)];
  const lines = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const start = y * (size * 3 + 1);
    // Each line starts with how it is filtered: not at all.
    lines[start] = 0;
    for (let x = 0; x < size; x++) {
      lines.set(on(rows, Math.floor((x - left) / cell), Math.floor((y - top) / cell)) ? mark : paper, start + 1 + x * 3);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  // Eight bits to a channel, red, green and blue, compressed and filtered the one way PNG has, not interlaced.
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(lines)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
