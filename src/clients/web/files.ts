/*
 * Where the gateway serves the page's files, as the page and the side of it
 * that bundles them both name them.
 */

export const SCRIPT = "/page.js";
export const STYLES = "/page.css";
export const MANIFEST = "/manifest.webmanifest";
/** The service worker, at the top so that it looks after every address of the page. */
export const WORKER = "/sw.js";
/** Where the faces' files are: the page's own, so that it asks no server but its gateway for anything. */
export const FONTS = "/fonts";
/** The page's icon at the sizes a home screen asks for: a phone's, and a browser's two. */
export const ICONS = { touch: { path: "/apple-touch-icon.png", size: 180 }, small: { path: "/icon-192.png", size: 192 }, large: { path: "/icon-512.png", size: 512 } };
