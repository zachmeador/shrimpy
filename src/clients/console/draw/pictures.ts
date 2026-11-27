import { getCapabilities, Image, type ImageProtocol } from "@earendil-works/pi-tui";
import { pictureOf } from "../../../lib/pictures/index.ts";
import { agentNameOf, type ClientState } from "../../state/index.ts";
import type { FileRow, ImageShown, SessionLevel } from "../../view/index.ts";
import { nameFor, openHere } from "./machine.ts";
import type { FileDrawing, ImageDrawing } from "./steps.ts";

interface Box {
  columns: number;
  rows: number;
}

const IN_A_THREAD: Box = { columns: 40, rows: 10 };
const IN_A_VIEW: Box = { columns: 28, rows: 6 };

const KEPT_CHARACTERS = 128 * 1024 * 1024;

interface PictureBytes {
  mediaType: string;
  bytes: Uint8Array;
}

type Kept = { state: "fetching" } | { state: "none" } | { state: "ready"; image: Image; characters: number };

const drawable = (protocol: NonNullable<ImageProtocol>, mediaType: string): boolean =>
  protocol === "kitty" ? mediaType === "image/png" : mediaType.startsWith("image/");

export class Pictures {
  readonly #kept = new Map<string, Kept>();
  readonly #ready: () => void;
  #queue: Promise<void> = Promise.resolve();
  #characters = 0;

  constructor(ready: () => void) {
    this.#ready = ready;
  }

  lines(key: string, box: Box, width: number, fetch: () => Promise<PictureBytes | undefined>, mediaType?: string): string[] | undefined {
    const protocol = getCapabilities().images;
    if (protocol === null || (mediaType !== undefined && !drawable(protocol, mediaType))) return undefined;
    const kept = this.#kept.get(key);
    if (kept === undefined) {
      this.#fetch(key, protocol, box, fetch);
      return undefined;
    }
    if (kept.state !== "ready") return undefined;
    this.#kept.delete(key);
    this.#kept.set(key, kept);
    return kept.image.render(width);
  }

  #fetch(key: string, protocol: NonNullable<ImageProtocol>, box: Box, fetch: () => Promise<PictureBytes | undefined>): void {
    this.#kept.set(key, { state: "fetching" });
    this.#queue = this.#queue.then(() => this.#take(key, protocol, box, fetch)).catch(() => void this.#kept.set(key, { state: "none" }));
  }

  async #take(key: string, protocol: NonNullable<ImageProtocol>, box: Box, fetch: () => Promise<PictureBytes | undefined>): Promise<void> {
    const fetched = await fetch();
    if (fetched === undefined || !drawable(protocol, fetched.mediaType)) {
      this.#kept.set(key, { state: "none" });
      return;
    }
    const data = Buffer.from(fetched.bytes).toString("base64");
    const picture = pictureOf(fetched.bytes);
    const size = picture === undefined ? undefined : { widthPx: picture.width, heightPx: picture.height };
    const image = new Image(data, fetched.mediaType, { fallbackColor: (text) => text }, { maxWidthCells: box.columns, maxHeightCells: box.rows }, size);
    this.#kept.set(key, { state: "ready", image, characters: data.length });
    this.#characters += data.length;
    for (const [other, each] of this.#kept) {
      if (this.#characters <= KEPT_CHARACTERS) break;
      if (each.state !== "ready" || other === key) continue;
      this.#kept.delete(other);
      this.#characters -= each.characters;
    }
    this.#ready();
  }
}

export function fileDrawing(state: ClientState, pictures: Pictures): FileDrawing {
  return {
    picture: (file, width) =>
      pictures.lines(
        `file ${file.attachment.id}`,
        IN_A_THREAD,
        width,
        async () => {
          const fetched = await state.fetchFile(file.attachment);
          return "value" in fetched ? { mediaType: file.attachment.mediaType, bytes: fetched.value } : undefined;
        },
        file.attachment.mediaType,
      ),
    open: (file: FileRow) => {
      void state.fetchFile(file.attachment).then(async (fetched) => {
        if ("problem" in fetched) state.note({ kind: "not-fetched", name: file.attachment.name, agent: undefined, problem: fetched.problem });
        else await openHere(file.attachment.name, fetched.value).catch(() => undefined);
      });
    },
  };
}

export function imageDrawing(state: ClientState, pictures: Pictures, session: SessionLevel, threadId: string | undefined): ImageDrawing {
  const fetch = async (at: NonNullable<ImageShown["at"]>): Promise<PictureBytes | undefined> => {
    const got = await state.sessionImage(session.agent, at.entry, at.index);
    return "value" in got ? { mediaType: got.value.mediaType, bytes: got.value.data } : undefined;
  };
  return {
    lines: (image, width) => {
      const { at } = image;
      if (at === null) return undefined;
      return pictures.lines(`session ${session.agent} ${threadId ?? ""} ${String(at.entry)} ${String(at.index)}`, IN_A_VIEW, width, () => fetch(at));
    },
    open: (image) => {
      const { at } = image;
      if (at === null) return;
      void state.sessionImage(session.agent, at.entry, at.index).then(async (got) => {
        if ("problem" in got) {
          state.note({ kind: "not-fetched", name: undefined, agent: agentNameOf(state.model(), session.agent), problem: got.problem });
        } else await openHere(nameFor("picture", got.value.mediaType), got.value.data).catch(() => undefined);
      });
    },
  };
}
