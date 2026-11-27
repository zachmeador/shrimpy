/*
 * The pictures and files that came with a message, as a thread shows them, a
 * picture opened whole, the pictures of the agent's view, and where the page
 * reads their bytes, once each for as long as it is open.
 */
import { createContext } from "preact";
import { useContext, useEffect, useState } from "preact/hooks";
import type { Attachment } from "../../contracts/chat/index.ts";
import type { ClientState } from "../state/index.ts";
import type { FileRow, ImageShown } from "../view/index.ts";
import { Glyph } from "./marks.tsx";
import { CONTROLS, openPicture, saveFile } from "./words.ts";

/** Where the page reads a file's bytes: an address for each, made once, or undefined when it can't be read. */
export interface FileSource {
  file(attachment: Attachment): Promise<string | undefined>;
  picture(agent: string, entry: number, index: number): Promise<string | undefined>;
}

export const Files = createContext<FileSource | undefined>(undefined);

export function fileSource(state: ClientState): FileSource {
  const made = new Map<string, Promise<string | undefined>>();
  const once = (key: string, read: () => Promise<Blob | undefined>): Promise<string | undefined> => {
    const known = made.get(key);
    if (known !== undefined) return known;
    const reading = read().then((blob) => {
      if (blob === undefined) made.delete(key);
      return blob === undefined ? undefined : URL.createObjectURL(blob);
    });
    made.set(key, reading);
    return reading;
  };
  return {
    file: (attachment) =>
      once(attachment.id, async () => {
        const fetched = await state.fetchFile(attachment);
        return "value" in fetched ? new Blob([fetched.value as Uint8Array<ArrayBuffer>], { type: attachment.mediaType }) : undefined;
      }),
    picture: (agent, entry, index) =>
      once(`${agent} ${String(entry)} ${String(index)}`, async () => {
        const fetched = await state.sessionImage(agent, entry, index);
        return "value" in fetched ? new Blob([fetched.value.data as Uint8Array<ArrayBuffer>], { type: fetched.value.mediaType }) : undefined;
      }),
  };
}

/** The address of what `read` reads, by `key`, once it has: undefined while it reads, and null when it couldn't. */
function useAddress(key: string | undefined, read: (source: FileSource) => Promise<string | undefined>): string | null | undefined {
  const source = useContext(Files);
  const [address, setAddress] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (source === undefined || key === undefined) return;
    let current = true;
    void read(source).then((found) => {
      if (current) setAddress(found ?? null);
    });
    return () => {
      current = false;
    };
  }, [source, key]);
  return address;
}

/** Save a file the page has an address for, under its name. */
function save(address: string, name: string): void {
  const link = document.createElement("a");
  link.href = address;
  link.download = name;
  link.click();
}

/** A picture as a thread draws it: its bytes once read, laid out by its size before then, and its name when it can't be read. */
function Picture({ row }: { row: FileRow }) {
  const address = useAddress(row.attachment.id, (source) => source.file(row.attachment));
  const { width, height } = row.attachment;
  if (address === null) return <span class="gone">{row.name}</span>;
  if (address === undefined) return <span class="gone" style={width !== null && height !== null ? { aspectRatio: `${width} / ${height}` } : undefined} />;
  return <img src={address} alt={row.name} width={width ?? undefined} height={height ?? undefined} />;
}

/** The pictures of a message: one in its own shape, several side by side as squares. A tap opens one whole. */
export function Pictures({ pictures, open }: { pictures: FileRow[]; open: (row: FileRow) => void }) {
  if (pictures.length === 0) return null;
  return (
    <div class={`pics${pictures.length === 1 ? " one" : ""}`} style={{ "--n": String(Math.min(3, pictures.length)) }}>
      {pictures.map((row) => (
        <button key={row.attachment.id} class="pic" type="button" title={`${row.name} · ${row.size}`} aria-label={openPicture(row.name)} onClick={() => open(row)}>
          <Picture row={row} />
        </button>
      ))}
    </div>
  );
}

/** A file of a message: its name and size, and a tap saves it. */
function FileCard({ row }: { row: FileRow }) {
  const source = useContext(Files);
  return (
    <button
      class="att stepbox"
      type="button"
      title={saveFile(row.name)}
      onClick={() =>
        void source?.file(row.attachment).then((address) => {
          if (address !== undefined) save(address, row.name);
        })
      }
    >
      <Glyph name="doc" />
      <b>{row.name}</b>
      <span>{row.size}</span>
    </button>
  );
}

export function FileCards({ files }: { files: FileRow[] }) {
  if (files.length === 0) return null;
  return (
    <div class="atts">
      {files.map((row) => (
        <FileCard key={row.attachment.id} row={row} />
      ))}
    </div>
  );
}

/** A picture opened whole, over the thread, with its name and size, a way to save it, and Esc or the cross to close it. */
export function Viewer({ row, close }: { row: FileRow; close: () => void }) {
  const address = useAddress(row.attachment.id, (source) => source.file(row.attachment));
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close();
    };
    addEventListener("keydown", onKey, true);
    return () => removeEventListener("keydown", onKey, true);
  }, [close]);
  return (
    <div class="viewer" role="dialog" aria-label={row.name}>
      <header class="head">
        <div class="titles">
          <h1>{row.name}</h1>
          <p class="sub">{row.size}</p>
        </div>
        <button class="ib" type="button" title={CONTROLS.save} aria-label={saveFile(row.name)} disabled={typeof address !== "string"} onClick={() => typeof address === "string" && save(address, row.name)}>
          <Glyph name="down" />
        </button>
        <button class="ib" type="button" title={CONTROLS.closePicture} aria-label={CONTROLS.closePicture} onClick={close}>
          <Glyph name="close" />
        </button>
      </header>
      <div class="stage">{typeof address === "string" ? <img src={address} alt={row.name} /> : <span class="gone">{row.name}</span>}</div>
    </div>
  );
}

/** A picture the agent's view names, as the model was shown it, or what it says in its place. */
function SessionPicture({ agent, image }: { agent: string; image: ImageShown }) {
  const { at } = image;
  const address = useAddress(at === null ? undefined : `${agent} ${String(at.entry)} ${String(at.index)}`, (source) =>
    at === null ? Promise.resolve(undefined) : source.picture(agent, at.entry, at.index),
  );
  if (typeof address !== "string") return <span class="lbl">{image.words}</span>;
  return (
    <span class="pic">
      <img src={address} alt={image.words} />
    </span>
  );
}

/** The images a step of the agent's view names: each picture, or Pi's line where the model took none. */
export function StepImages({ agent, images }: { agent: string; images: ImageShown[] }) {
  if (images.length === 0) return null;
  const shown = images.filter((image) => image.omitted === undefined);
  return (
    <div class="with">
      {images.map((image, at) =>
        image.omitted === undefined ? null : (
          <span key={at} class="omitted">
            {image.omitted}
          </span>
        ),
      )}
      {shown.length > 0 && (
        <div class={`pics${shown.length === 1 ? " one" : ""}`} style={{ "--n": String(Math.min(3, shown.length)) }}>
          {shown.map((image, at) => (
            <SessionPicture key={at} agent={agent} image={image} />
          ))}
        </div>
      )}
    </div>
  );
}
