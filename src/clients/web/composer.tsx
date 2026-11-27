/*
 * The input of a thread: what is typed, and the pictures and files that wait
 * to go with it, picked with the paperclip, pasted, or dropped on the thread,
 * each kept for each thread; the commands that can be written there while it
 * starts with a slash, and the models after `/model `, as the views say which
 * fit what is typed before the cursor; and sending.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { FileToSend } from "../../contracts/chat/index.ts";
import { mediaTypeOf } from "../../lib/files/index.ts";
import { pictureOf } from "../../lib/pictures/index.ts";
import { sizeWords } from "../../lib/text/index.ts";
import { type Notice, notAttachable } from "../state/index.ts";
import { type CommandLine, commandsFitting, commandWord, type ModelLine, modelsFitting, modelWord, offersModels } from "../view/index.ts";
import { Glyph } from "./marks.tsx";
import { CONTROLS, takeOff } from "./words.ts";

/** A file that waits to be sent: what goes to chat, and an address to show it by while it waits, for a picture. */
export interface Waiting {
  file: FileToSend;
  shown: string | undefined;
}

/** Whether a file is shown as a picture while it waits: one chat will take for a picture. */
const isPicture = (file: FileToSend): boolean => pictureOf(file.bytes) !== undefined;

export interface ComposerProps {
  /** What is typed for each thread, by its key, so that leaving a thread loses nothing typed in it. */
  drafts: Map<string, string>;
  /** The files that wait to be sent in each thread, by the same key. */
  trays: Map<string, Waiting[]>;
  draftKey: string;
  placeholder: string;
  /** Someone is working in the thread. */
  busy: boolean;
  commands: CommandLine[];
  /** The models of the thread's agent for the list after `/model `, where it has one. */
  models: (() => Promise<ModelLine[] | undefined>) | undefined;
  /** Act on what was written, with the files that wait: false when it stays in the input, as a message that was not sent does. */
  submit: (text: string, files: FileToSend[]) => Promise<boolean>;
  /** Tell the person something, such as that a file was left out. */
  note: (notice: Notice) => void;
  /** The line of keys under the input, where there is one. */
  keys: { key: string; does: string }[] | undefined;
}

/** A choice in the list over the input: what it is called, one line on it, and what is in the input once it is chosen. */
interface Choice {
  name: string;
  line: string;
  written: string;
}

export function Composer({ drafts, trays, draftKey, placeholder, busy, commands, models, submit, note, keys }: ComposerProps) {
  const [value, setValue] = useState(() => drafts.get(draftKey) ?? "");
  const [tray, setTray] = useState<Waiting[]>(() => trays.get(draftKey) ?? []);
  const [dropping, setDropping] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const waitingNow = useRef(tray);
  waitingNow.current = tray;
  // Where the cursor is in what is typed, or undefined at its end.
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [chosen, setChosen] = useState(0);
  const [shut, setShut] = useState(false);
  const [modelLines, setModelLines] = useState<ModelLine[] | undefined>(undefined);
  const area = useRef<HTMLTextAreaElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    // Where there is a pointer to type beside, what is typed goes to the thread just opened. A phone would raise its keyboard.
    if (matchMedia("(pointer: fine)").matches) area.current?.focus();
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (value === "") drafts.delete(draftKey);
    else drafts.set(draftKey, value);
  }, [value, drafts, draftKey]);

  useEffect(() => {
    if (tray.length === 0) trays.delete(draftKey);
    else trays.set(draftKey, tray);
  }, [tray, trays, draftKey]);

  /** Put what was picked, pasted or dropped with what waits, leaving out with a note what a message can't carry. */
  const add = async (files: readonly File[]): Promise<void> => {
    const added: Waiting[] = [];
    for (const each of files) {
      const name = each.name === "" ? "pasted.png" : each.name;
      const waiting = [...waitingNow.current, ...added].map((one) => ({ size: one.file.bytes.byteLength }));
      const refused = notAttachable(waiting, { name, size: each.size });
      if (refused !== undefined) {
        note(refused);
        continue;
      }
      const file = { name, mediaType: each.type === "" ? mediaTypeOf(name) : each.type, bytes: new Uint8Array(await each.arrayBuffer()) };
      added.push({ file, shown: isPicture(file) ? URL.createObjectURL(each) : undefined });
    }
    if (added.length > 0) setTray((before) => [...before, ...added]);
  };

  /** Take a file off what waits. */
  const drop = (gone: Waiting): void => {
    if (gone.shown !== undefined) URL.revokeObjectURL(gone.shown);
    setTray((before) => before.filter((each) => each !== gone));
  };

  useEffect(() => {
    const carriesFiles = (event: DragEvent): boolean => event.dataTransfer?.types.includes("Files") === true;
    const over = (event: DragEvent): void => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      setDropping(true);
    };
    const left = (event: DragEvent): void => {
      if (event.relatedTarget === null) setDropping(false);
    };
    const dropped = (event: DragEvent): void => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      setDropping(false);
      void add([...(event.dataTransfer?.files ?? [])]);
    };
    addEventListener("dragover", over);
    addEventListener("dragleave", left);
    addEventListener("drop", dropped);
    return () => {
      removeEventListener("dragover", over);
      removeEventListener("dragleave", left);
      removeEventListener("drop", dropped);
    };
  });

  // The input grows with what is typed, and an empty one is as tall as the styles make it at the width there is.
  useLayoutEffect(() => {
    const box = area.current;
    if (box === null) return;
    box.style.height = "";
    if (value !== "") box.style.height = `${String(Math.min(132, box.scrollHeight))}px`;
  }, [value]);

  // What is typed before the cursor in the first line is what the list over the input fits.
  const at = cursor ?? value.length;
  const before = value.slice(0, at).includes("\n") ? undefined : value.slice(0, at);
  const word = before === undefined ? undefined : commandWord(before);
  const typedModel = before === undefined || word !== undefined || models === undefined || !offersModels(commands) ? undefined : modelWord(before);
  const asking = typedModel !== undefined;
  useEffect(() => {
    if (!asking || modelLines !== undefined || models === undefined) return;
    void models().then((lines) => {
      if (alive.current) setModelLines(lines ?? []);
    });
  }, [asking, modelLines, models]);

  /** What is in the input once `chosen` takes the place of `typed`, which is before the cursor. */
  const writing = (typed: string, chosen: string): string => `${value.slice(0, at - typed.length)}${chosen}${value.slice(at)}`;
  let choices: Choice[] = [];
  if (word !== undefined) {
    choices = commandsFitting(word, commands).map((each) => ({ name: each.name, line: each.line, written: writing(word, each.name) }));
  } else if (typedModel !== undefined) {
    choices = modelsFitting(typedModel, modelLines ?? []).map((each) => ({ name: each.value, line: each.line, written: writing(typedModel, each.value) }));
  }
  const open = choices.length > 0 && !shut;
  const shown = Math.min(chosen, Math.max(0, choices.length - 1));

  const type = (text: string, where?: number): void => {
    setValue(text);
    setCursor(where);
    setShut(false);
    setChosen(0);
  };
  /** The cursor moved without anything typed. */
  const moved = (): void => setCursor(area.current?.selectionStart);

  const send = async (text: string): Promise<void> => {
    const going = tray;
    if (text.trim() === "" && going.length === 0) return;
    type("");
    setTray([]);
    const sent = await submit(text, going.map((each) => each.file));
    if (sent) {
      for (const each of going) if (each.shown !== undefined) URL.revokeObjectURL(each.shown);
      return;
    }
    // What was not sent goes back where it was typed, ahead of anything typed since.
    if (alive.current) {
      setValue((typed) => (typed === "" ? text : text === "" ? typed : `${text}\n${typed}`));
      setTray((since) => [...going, ...since]);
    } else {
      if (text !== "") drafts.set(draftKey, drafts.has(draftKey) ? `${text}\n${drafts.get(draftKey) ?? ""}` : text);
      trays.set(draftKey, [...going, ...(trays.get(draftKey) ?? [])]);
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const choice = choices[shown];
    if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setChosen((shown + (event.key === "ArrowDown" ? 1 : choices.length - 1)) % choices.length);
    } else if (open && event.key === "Tab" && choice !== undefined) {
      event.preventDefault();
      type(`${choice.written} `);
    } else if (open && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setShut(true);
    } else if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void send(open && choice !== undefined ? choice.written : value);
    }
  };

  return (
    <>
      {open && (
        <ul class="slash stepbox" role="listbox" aria-label={CONTROLS.commands}>
          {choices.map((each, index) => (
            <li
              key={each.name}
              role="option"
              aria-selected={index === shown}
              onMouseDown={(event) => {
                event.preventDefault();
                type(`${each.written} `);
                area.current?.focus();
              }}
            >
              <code>{each.name}</code>
              <span>{each.line}</span>
            </li>
          ))}
        </ul>
      )}
      <div class="composer stepbox" data-busy={String(busy)} data-drop={String(dropping)}>
        {tray.length > 0 && (
          <div class="tray">
            {tray.map((each, at) => (
              <div key={at} class="tray-item">
                {each.shown !== undefined ? (
                  <img class="thumb" src={each.shown} alt={each.file.name} title={`${each.file.name} · ${sizeWords(each.file.bytes.byteLength)}`} />
                ) : (
                  <span class="att stepbox">
                    <Glyph name="doc" />
                    <b>{each.file.name}</b>
                    <span>{sizeWords(each.file.bytes.byteLength)}</span>
                  </span>
                )}
                <button class="drop" type="button" title={CONTROLS.takeOff} aria-label={takeOff(each.file.name)} onClick={() => drop(each)}>
                  <Glyph name="close" />
                </button>
              </div>
            ))}
          </div>
        )}
        <button class="ib clip" type="button" title={CONTROLS.attach} aria-label={CONTROLS.attach} onClick={() => picker.current?.click()}>
          <Glyph name="clip" />
        </button>
        <textarea
          ref={area}
          rows={1}
          value={value}
          placeholder={placeholder}
          aria-label={placeholder}
          onInput={(event) => type(event.currentTarget.value, event.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          onKeyUp={moved}
          onPointerUp={moved}
          onPaste={(event) => {
            const files = [...(event.clipboardData?.files ?? [])];
            if (files.length === 0) return;
            event.preventDefault();
            void add(files);
          }}
        />
        <button class="send" type="button" aria-label={CONTROLS.send} disabled={value.trim() === "" && tray.length === 0} onClick={() => void send(value)}>
          <Glyph name="send" />
        </button>
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            const files = [...(event.currentTarget.files ?? [])];
            event.currentTarget.value = "";
            void add(files);
          }}
        />
      </div>
      {keys !== undefined && (
        <p class="keys">
          {keys.map((each, index) => (
            <span key={each.key}>
              {index > 0 && " · "}
              <b>{each.key}</b> {each.does}
            </span>
          ))}
        </p>
      )}
    </>
  );
}
