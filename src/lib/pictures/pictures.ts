/** A picture: its media type, and how many pixels wide and high it shows. */
export type Picture = { mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp"; width: number; height: number };

/**
 * The picture `bytes` are, or undefined when they are none of the four kinds or
 * don't say their size where they should. A JPEG turned on its side by its EXIF
 * orientation, as a phone's photo often is, shows with its width and height
 * swapped, as a browser draws it.
 */
export function pictureOf(bytes: Uint8Array): Picture | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const says = (at: number, text: string): boolean => holds(bytes, at, text);
  const sized = (mediaType: Picture["mediaType"], width: number, height: number): Picture | undefined =>
    width > 0 && height > 0 ? { mediaType, width, height } : undefined;
  try {
    if (says(0, "\x89PNG\r\n\x1a\n") && says(12, "IHDR")) return sized("image/png", view.getUint32(16), view.getUint32(20));
    if (says(0, "GIF87a") || says(0, "GIF89a")) return sized("image/gif", view.getUint16(6, true), view.getUint16(8, true));
    if (says(0, "RIFF") && says(8, "WEBP")) return webp(bytes, view, says);
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return jpeg(bytes, view);
  } catch (error) {
    if (error instanceof RangeError) return undefined;
    throw error;
  }
  return undefined;
}

function webp(bytes: Uint8Array, view: DataView, says: (at: number, text: string) => boolean): Picture | undefined {
  const at = (index: number): number => bytes[index] ?? 0;
  const sized = (width: number, height: number): Picture => ({ mediaType: "image/webp", width, height });
  if (says(12, "VP8 ")) return sized(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
  if (says(12, "VP8L")) {
    return sized(1 + (((at(22) & 0x3f) << 8) | at(21)), 1 + (((at(24) & 0x0f) << 10) | (at(23) << 2) | ((at(22) & 0xc0) >> 6)));
  }
  if (says(12, "VP8X")) return sized(1 + (at(24) | (at(25) << 8) | (at(26) << 16)), 1 + (at(27) | (at(28) << 8) | (at(29) << 16)));
  return undefined;
}

/** A JPEG's size, from its frame header, turned as its EXIF orientation says. */
function jpeg(bytes: Uint8Array, view: DataView): Picture | undefined {
  let orientation = 1;
  let index = 2;
  while (index + 4 <= bytes.length) {
    if (bytes[index] !== 0xff) return undefined;
    const marker = bytes[index + 1] ?? 0;
    if (marker === 0xff) {
      index += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      index += 2;
      continue;
    }
    const length = view.getUint16(index + 2);
    if (marker === 0xe1) orientation = exifOrientation(bytes, view, index + 4, length - 2) ?? orientation;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = view.getUint16(index + 5);
      const width = view.getUint16(index + 7);
      if (width === 0 || height === 0) return undefined;
      const turned = orientation >= 5 && orientation <= 8;
      return { mediaType: "image/jpeg", width: turned ? height : width, height: turned ? width : height };
    }
    index += 2 + length;
  }
  return undefined;
}

/** The orientation an EXIF block at `start` gives, 1 to 8, or undefined when it gives none. */
function exifOrientation(bytes: Uint8Array, view: DataView, start: number, length: number): number | undefined {
  const exif = "Exif\0\0";
  if (length < 14 || !holds(bytes, start, exif)) return undefined;
  const tiff = start + exif.length;
  const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
  const first = tiff + view.getUint32(tiff + 4, little);
  const count = view.getUint16(first, little);
  for (let entry = 0; entry < count; entry += 1) {
    const at = first + 2 + entry * 12;
    if (view.getUint16(at, little) === 0x0112) {
      const value = view.getUint16(at + 8, little);
      return value >= 1 && value <= 8 ? value : undefined;
    }
  }
  return undefined;
}

/** Whether `bytes` hold the Latin-1 `text` at `at`. */
function holds(bytes: Uint8Array, at: number, text: string): boolean {
  if (at + text.length > bytes.length) return false;
  for (let index = 0; index < text.length; index += 1) if (bytes[at + index] !== text.charCodeAt(index)) return false;
  return true;
}
