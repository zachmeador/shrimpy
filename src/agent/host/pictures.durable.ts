import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ImageContent } from "@earendil-works/pi-ai";
import { createNodePhotonImages } from "@earendil-works/pi-durable/images/node";
import { DEFAULT_IMAGE_LIMITS, type ImageProcessor } from "@earendil-works/pi-durable/tools";
import { codeOf } from "../../lib/files/index.ts";
import { pictureOf } from "../../lib/pictures/index.ts";

/** A picture from the home as a model is shown one, or why it can't be: it is gone, can't be read, or isn't a picture the processor takes. */
export type Shown = { image: ImageContent } | { unshown: "gone" | "unreadable" | "unfit" };

/**
 * Pictures as a model is shown them: turned upright, scaled and encoded to fit
 * what every provider takes, by Pi's processor, which works in a thread of its
 * own while it has pictures to do. Pi's `read` uses the same one.
 */
export interface Pictures {
  readonly processor: ImageProcessor;
  /** The picture at `path` in the home. */
  show(path: string): Promise<Shown>;
}

export async function openPictures(home: string): Promise<Pictures> {
  const processor = await createNodePhotonImages();
  return {
    processor,
    async show(path) {
      let bytes: Buffer;
      try {
        bytes = await readFile(join(home, path));
      } catch (error) {
        return { unshown: codeOf(error) === "ENOENT" ? "gone" : "unreadable" };
      }
      const picture = pictureOf(new Uint8Array(bytes));
      const prepared = picture === undefined ? undefined : await processor.prepare(new Uint8Array(bytes), picture.mediaType, DEFAULT_IMAGE_LIMITS);
      if (prepared === undefined) return { unshown: "unfit" };
      return { image: { type: "image", data: prepared.data, mimeType: prepared.mimeType } };
    },
  };
}
