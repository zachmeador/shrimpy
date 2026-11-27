/** Media types by the extensions a file is most often sent with, in lower case. */
const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  txt: "text/plain",
  log: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  html: "text/html",
  json: "application/json",
  zip: "application/zip",
  gz: "application/gzip",
  tar: "application/x-tar",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  stl: "model/stl",
};

/** The media type a file's name says, by its extension, or `application/octet-stream` when it says none Shrimpy knows. */
export function mediaTypeOf(name: string): string {
  const dot = name.lastIndexOf(".");
  const found = dot <= 0 ? undefined : TYPES[name.slice(dot + 1).toLowerCase()];
  return found ?? "application/octet-stream";
}

/** The extension a file of `mediaType` is most often named with, or undefined for a media type Shrimpy knows no extension of. */
export function extensionOf(mediaType: string): string | undefined {
  return Object.keys(TYPES).find((extension) => TYPES[extension] === mediaType);
}
