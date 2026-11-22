/*
 * An agent's work, step by step, as the views give it: in a block beside a
 * thread while the agent works there, and in the agent's view of a session.
 */
import type { AgentWork, InFull, Step } from "../view/index.ts";
import { thinkingShown, toolCallsShown } from "../view/index.ts";
import type { GlyphName } from "./glyphs.ts";
import { Glyph, Lamp, Sigil } from "./marks.tsx";
import { Prose } from "./prose.tsx";

/** The mark before a tool call that is not running, by how it stands. A running call has a lit lamp. */
const MARKS: Record<Exclude<Extract<Step, { kind: "tool" }>["state"], "running">, GlyphName> = {
  pending: "wait",
  done: "done",
  error: "fail",
  interrupted: "bang",
};

function StepItem({ step }: { step: Step }) {
  switch (step.kind) {
    case "shown":
      return (
        <li class="step shown">
          <span class="lbl">{step.label}</span>
          {step.earlier !== undefined && <span class="lbl"> · {step.earlier}</span>}
          <pre>{step.text}</pre>
          {step.images.map((image, at) => (
            <span key={at} class="lbl">
              {image}
            </span>
          ))}
        </li>
      );
    case "thinking":
      return (
        <li class={`step thinking${step.whole ? "" : " brief"}`}>
          {step.earlier !== undefined && `${step.earlier} · `}
          {step.label}: {step.text}
        </li>
      );
    case "text":
      return (
        <li class="step said">
          {step.earlier !== undefined && <p class="step note">{step.earlier}</p>}
          <Prose text={step.text} breaks streaming={step.streaming} />
          {step.note !== undefined && <p class="step note">{step.note}</p>}
        </li>
      );
    case "tool":
      return (
        <li class={`step tool ${step.state}${step.whole ? " whole" : ""}`}>
          <span class="mk">{step.state === "running" ? <Lamp /> : <Glyph name={MARKS[step.state]} />}</span>
          <span class="st">{step.status}</span>
          <b>{step.name}</b>
          <span class="call">{step.call}</span>
          {step.earlier !== undefined && <span class="more">{step.earlier}</span>}
          {step.output.length > 0 && <pre class="out">{step.output.join("\n")}</pre>}
          {[...step.images, ...step.notes].map((line, at) => (
            <span key={at} class="more">
              {line}
            </span>
          ))}
        </li>
      );
    case "marker":
      return <li class="step marker">-- {step.text} --</li>;
  }
}

export function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol class="steps">
      {steps.map((step, at) => (
        <StepItem key={at} step={step} />
      ))}
    </ol>
  );
}

interface WorkProps {
  work: AgentWork;
  /** Its agent's name and sigil head it, as they do where more than one agent can work. */
  named: boolean;
  inFull: InFull;
  toggle: (which: keyof InFull) => void;
}

/** One agent's work beside a thread, open. */
export function WorkBlock({ work, named, inFull, toggle }: WorkProps) {
  return (
    <section class={`work pg-${work.look.pigment}`} data-stale={String(work.stale)}>
      <header class="work-head">
        {named && <Sigil look={work.look} size="s12" />}
        {named && <b class="who">{work.name}</b>}
        <span class="grow" />
        <button class="lk" type="button" onClick={() => toggle("toolCalls")}>
          {toolCallsShown(inFull.toolCalls)}
        </button>
        <button class="lk" type="button" onClick={() => toggle("thinking")}>
          {thinkingShown(inFull.thinking)}
        </button>
      </header>
      {work.work.earlier !== undefined && <p class="step note">{work.work.earlier}</p>}
      <Steps steps={work.work.steps} />
    </section>
  );
}

/** One agent's work beside a thread, shut to a line while another's is open: what it is doing, and its latest call. */
export function WorkRow({ work, open }: { work: AgentWork; open: () => void }) {
  const last = work.work.steps.findLast((step) => step.kind === "tool");
  return (
    <button class={`work-row pg-${work.look.pigment}`} type="button" onClick={open}>
      <Sigil look={work.look} size="s12" />
      <b>{work.name}</b>
      <span class="doing">{work.doing}</span>
      <span class="call">{last?.kind === "tool" ? last.call : ""}</span>
    </button>
  );
}
