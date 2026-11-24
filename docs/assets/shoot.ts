/*
 * The README's screenshots, taken from the two mockups: the web client on a
 * desk, three phones, the agent's view and the terminal, each at dusk and by
 * day. `node docs/assets/shoot.ts` writes them beside this file as PNGs at
 * twice their size. It drives the first Chrome, Brave, Chromium or Edge it
 * finds where they are usually installed, or the browser whose path it is
 * given, and needs the network for the mockups' fonts.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

/** A screenshot: the frames it holds, as the mockup writes them, and the element that is shot. */
interface Shot {
  name: string;
  row: string;
  target: string;
}

const fit = (name: string, units: string[]) => `<div class="fit"><div class="fit-in" id="${name}">${units.map((u) => `<div class="unit">${u}</div>`).join("")}</div></div>`;
const frame = (kind: string, route: string, flags = "") => `<div class="${kind} frame" data-kind="${kind}" data-mode="dusk" data-route="${route}"${flags}></div>`;

const MOCKUPS: { file: string; board: string; shots: Shot[] }[] = [
  {
    file: "web-client-mockup.html",
    board: '<div class="board" id="board">',
    shots: [
      { name: "desk", row: fit("desk", [frame("desk", "agent:lighthouse/thread:lh-backup")]), target: "#desk" },
      {
        name: "phones",
        row: fit("phones", [frame("phone", ""), frame("phone", "room:ops/thread:ops-deploy"), frame("phone", "agent:pantry/thread:pa-week")]),
        target: "#phones",
      },
      { name: "agents-view", row: fit("agents-view", [frame("desk", "agent:lighthouse/thread:lh-backup", ' data-turned="1" data-fold="1"')]), target: "#agents-view" },
    ],
  },
  {
    file: "terminal-mockup.html",
    board: '<div class="board">',
    shots: [
      {
        name: "terminal",
        row: '<div class="fit"><div class="unit"><div class="win term" id="terminal" data-cols="150" data-rows="40" data-mode="dusk" data-route="agent:lighthouse/thread:lh-backup"></div></div></div>',
        target: "#terminal",
      },
    ],
  },
];

/** Only the shots' own section shows, with nothing behind the frames. */
const BARE = `
html, body { background: transparent !important; }
body::before { display: none !important; }
.board { padding: 24px !important; max-width: none !important; }
.board > :not(#shots) { display: none !important; }
#shots .frame-cap { display: none !important; }
#shots .fit + .fit { margin-top: 48px; }
`;

const BROWSERS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/brave-browser",
  "/usr/bin/microsoft-edge",
];

const here = fileURLToPath(new URL(".", import.meta.url));
const docs = join(here, "..");
const executablePath = process.argv[2] ?? BROWSERS.find((path) => existsSync(path));
if (executablePath === undefined) {
  console.error("No Chrome, Brave, Chromium or Edge where they are usually installed. Give the path to one: node docs/assets/shoot.ts <browser>");
  process.exit(1);
}

const pages = mkdtempSync(join(tmpdir(), "shrimpy-shots-"));
const browser = await chromium.launch({ executablePath });
try {
  for (const mockup of MOCKUPS) {
    const html = readFileSync(join(docs, mockup.file), "utf8");
    if (!html.includes(mockup.board)) throw new Error(`${mockup.file} has no ${mockup.board} to put the shots in`);
    // A route the mockup has no data for still draws, as an empty thread or list, so each agent, room and thread in one must be a key in the mockup.
    const ids = mockup.shots.flatMap((shot) => [...shot.row.matchAll(/data-route="([^"]*)"/g)].flatMap((route) => route[1]!.split("/").filter(Boolean).map((part) => part.split(":")[1]!)));
    const missing = ids.filter((id) => !new RegExp(`['"]?${id.replace(/[^\w-]/g, "\\$&")}['"]?\\s*:\\s*\\{`).test(html));
    if (missing.length > 0) throw new Error(`${mockup.file} has no ${missing.join(", ")}, which a shot shows`);
    const page = join(pages, mockup.file);
    writeFileSync(page, html.replace(mockup.board, `${mockup.board}\n<section id="shots">${mockup.shots.map((shot) => shot.row).join("\n")}</section>`));

    const context = await browser.newContext({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
    const tab = await context.newPage();
    const errors: string[] = [];
    tab.on("pageerror", (error) => errors.push(error.message));
    await tab.goto(`file://${page}`);
    await tab.evaluate(() => document.fonts.ready);
    await tab.addStyleTag({ content: BARE });
    await tab.waitForTimeout(800);

    for (const mode of ["dusk", "day"]) {
      if (mode === "day") {
        const swapped = await tab.evaluate(() => {
          const swap = document.getElementById("swap");
          swap?.click();
          return swap !== null;
        });
        if (!swapped) throw new Error(`${mockup.file} has no #swap button to turn the frames to day`);
        await tab.waitForTimeout(800);
      }
      if (errors.length > 0) throw new Error(`${mockup.file} failed to draw a frame, likely one whose route or flags it no longer has: ${errors.join("; ")}`);
      for (const shot of mockup.shots) {
        await tab.locator(shot.target).screenshot({ path: join(here, `${shot.name}-${mode}.png`), omitBackground: true, animations: "disabled" });
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  rmSync(pages, { recursive: true, force: true });
}
