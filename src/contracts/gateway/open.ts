import { obj, type Properties } from "@earendil-works/pi-schema";

/**
 * An object read with the fields this release doesn't know ignored, for what
 * crosses between programs outside Chord: the hello and its answer, the
 * requests at the page's door and the push payload. A release of the major
 * may add a field to one, and makes it optional, so that an earlier release
 * still reads it.
 */
export const openObject = <const P extends Properties>(properties: P) => obj(properties, { open: true });
