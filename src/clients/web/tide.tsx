/*
 * The tide over the list of agents: water that drifts, and a lantern for each
 * agent, lit while it works, drawn on the stitch and redrawn twice a second.
 */
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { type Mode, WOOLS } from "../look/index.ts";
import type { Row } from "../view/index.ts";
import { bayer, STITCH } from "./stitches.ts";

/** A count that goes up twice a second while the page is on show and motion is welcome. */
function useTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const still = matchMedia("(prefers-reduced-motion: reduce)");
    const timer = setInterval(() => {
      if (!still.matches && !document.hidden) setTick((n) => n + 1);
    }, 500);
    return () => clearInterval(timer);
  }, []);
  return tick;
}

/** One lantern: lit while its agent works, and dim while the agent isn't running. */
interface Lantern {
  row: Row;
  lit: boolean;
  running: boolean;
}

function draw(canvas: HTMLCanvasElement, width: number, height: number, lanterns: Lantern[], mode: Mode, tick: number): void {
  const dpr = Math.max(1, Math.round(window.devicePixelRatio));
  const px = STITCH * dpr;
  const W = Math.ceil(width / STITCH);
  const H = Math.ceil(height / STITCH);
  if (canvas.width !== W * px || canvas.height !== H * px) {
    canvas.width = W * px;
    canvas.height = H * px;
  }
  const g = canvas.getContext("2d");
  if (g === null) return;
  g.clearRect(0, 0, canvas.width, canvas.height);
  const put = (x: number, y: number, color: string, alpha = 1): void => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.fillRect(x * px, y * px, px, px);
  };
  const wool = WOOLS[mode];
  const lit = wool.pigments.ochre.mark;
  const core = wool.pigments.sand.mark;
  const hz = H - 15;
  for (let row = 0, y = hz + 2; y < H; row++, y += 2) {
    const depth = (y - hz) / (H - hz);
    const drift = Math.floor(tick / 2) * (row % 2 ? 1 : -1);
    const period = 9 + ((row * 5) % 7);
    const dash = 2 + Math.round(depth * (period - 5));
    for (let x = 0; x < W; x++) {
      const u = (((x + drift + row * 7) % period) + period) % period;
      if (u < dash) put(x, y, depth > 0.55 ? wool.tide2 : wool.tide);
    }
  }
  for (let x = 0; x < W; x += 2) put(x, hz, wool.tide2);

  lanterns.forEach((lantern, i) => {
    const cx = lanternX(W, lanterns.length, i);
    const body = lantern.lit ? lit : wool.line2;
    const alpha = lantern.running ? 1 : 0.45;
    if (lantern.lit) {
      const reach = [4.4, 5.4, 4.9][tick % 3] ?? 5;
      for (let dy = -6; dy <= 0; dy++) {
        for (let dx = -6; dx <= 6; dx++) {
          const dist = Math.hypot(dx, dy + 2);
          if (dist < reach && bayer(cx + dx, hz - 2 + dy) < (1 - dist / reach) * 0.7) put(cx + dx, hz - 2 + dy, lit, 0.42);
        }
      }
      for (let k = 2; k <= 12; k += 2) {
        const sway = (k / 2 + tick) % 3 === 0 ? 1 : 0;
        for (let dx = -1; dx <= (k < 8 ? 1 : 0); dx++) put(cx + dx + sway, hz + k, lit, 1 - k * 0.055);
      }
    }
    put(cx, hz - 4, body, alpha);
    for (let dy = -3; dy <= -1; dy++) for (let dx = -1; dx <= 1; dx++) put(cx + dx, hz + dy, body, alpha);
    if (lantern.lit) put(cx, hz - 2, core);
  });
}

/** Where the `i`th of `count` lanterns stands, in stitches from the left, the last near the right edge. */
const lanternX = (width: number, count: number, i: number): number => width - 10 - (count - 1 - i) * 11;

export function Tide({ lanterns, mode, choose, children }: { lanterns: Lantern[]; mode: Mode; choose: (row: Row) => void; children: ComponentChildren }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const tick = useTick();

  useEffect(() => {
    const element = box.current;
    if (element === null) return;
    const seen = new ResizeObserver(() => setSize({ width: element.clientWidth, height: element.clientHeight }));
    seen.observe(element);
    return () => seen.disconnect();
  }, []);

  useEffect(() => {
    if (canvas.current !== null && size.width > 0) draw(canvas.current, size.width, size.height, lanterns, mode, tick);
  });

  const W = Math.ceil(size.width / STITCH);
  const hz = Math.ceil(size.height / STITCH) - 15;
  return (
    <div class="tide" ref={box}>
      <canvas ref={canvas} aria-hidden="true" />
      {children}
      {size.width > 0 &&
        lanterns.map((lantern, i) => (
          <button
            key={lantern.row.id}
            class="lantern"
            type="button"
            style={{ left: `${String(lanternX(W, lanterns.length, i) * STITCH - 8)}px`, top: `${String((hz - 5) * STITCH - 4)}px` }}
            title={`${lantern.row.label} · ${lantern.row.detail}`}
            aria-label={`${lantern.row.label} · ${lantern.row.detail}`}
            onClick={() => choose(lantern.row)}
          />
        ))}
    </div>
  );
}
