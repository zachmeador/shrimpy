/*
 * The input of a thread: what is typed, kept for each thread; the commands
 * that can be written there while it starts with a slash, and the models after
 * `/model `, as the views say which fit what is typed before the cursor; and
 * sending.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { type CommandLine, commandsFitting, commandWord, type ModelLine, modelsFitting, modelWord, offersModels } from "../view/index.ts";
import { Glyph } from "./marks.tsx";
import { CONTROLS } from "./words.ts";

export interface ComposerProps {
  /** What is typed for each thread, by its key, so that leaving a thread loses nothing typed in it. */
  drafts: Map<string, string>;
  draftKey: string;
  placeholder: string;
  /** Someone is working in the thread. */
  busy: boolean;
  commands: CommandLine[];
  /** The models of the thread's agent for the list after `/model `, where it has one. */
  models: (() => Promise<ModelLine[] | undefined>) | undefined;
  /** Act on what was written: false when it stays in the input, as a message that was not sent does. */
  submit: (text: string) => Promise<boolean>;
  /** The line of keys under the input, where there is one. */
  keys: { key: string; does: string }[] | undefined;
}

/** A choice in the list over the input: what it is called, one line on it, and what is in the input once it is chosen. */
interface Choice {
  name: string;
  line: string;
  written: string;
}

export function Composer({ drafts, draftKey, placeholder, busy, commands, models, submit, keys }: ComposerProps) {
  const [value, setValue] = useState(() => drafts.get(draftKey) ?? "");
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
    if (text.trim() === "") return;
    type("");
    const sent = await submit(text);
    if (sent) return;
    // What was not sent goes back where it was typed, ahead of anything typed since.
    if (alive.current) setValue((typed) => (typed === "" ? text : `${text}\n${typed}`));
    else drafts.set(draftKey, drafts.has(draftKey) ? `${text}\n${drafts.get(draftKey) ?? ""}` : text);
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
      <div class="composer stepbox" data-busy={String(busy)}>
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
        />
        <button class="send" type="button" aria-label={CONTROLS.send} disabled={value.trim() === ""} onClick={() => void send(value)}>
          <Glyph name="send" />
        </button>
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
