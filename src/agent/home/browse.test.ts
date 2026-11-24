import assert from "node:assert/strict";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test, type TestContext } from "node:test";
import { MAX_TEXT_BYTES } from "../../contracts/agent/index.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import { tempDir } from "../../lib/testing/index.ts";
import { fileAt, folderAt } from "./browse.ts";
import { homePaths } from "./layout.ts";

/*
 * Whoever may watch an agent can look through its home's files and change nothing. No path leads out of the home, and
 * nothing in state/ is listed or read, since it holds the agent's token and keys.
 */

function write(path: string, content: string | Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/** A home with a file in it and a file beside it, with links out of it and into what it keeps. */
function homeWithLinks(t: TestContext) {
  const paths = homePaths(join(tempDir(t, "browse"), "scout"));
  const elsewhere = tempDir(t, "elsewhere");
  write(join(elsewhere, "secret.md"), "Not the home's.\n");
  write(paths.soul, "Be brief.\n");
  write(join(paths.vault, "notes.md"), "# Notes\n");
  write(paths.member, '{"token":"kept"}\n');
  write(join(paths.runtime, "endpoint.json"), "{}\n");
  mkdirSync(paths.context);
  symlinkSync(join(paths.vault, "notes.md"), join(paths.context, "notes.md"));
  symlinkSync(join(elsewhere, "secret.md"), join(paths.vault, "out.md"));
  symlinkSync(elsewhere, join(paths.vault, "away"));
  symlinkSync(paths.member, join(paths.vault, "token.json"));
  symlinkSync(dirname(paths.member), join(paths.vault, "kept"));
  symlinkSync(join(paths.root, "gone.md"), join(paths.vault, "gone.md"));
  return { paths, secret: join(elsewhere, "secret.md") };
}

test("no path leaves the home, by .., from / or through a link, and nothing in state/ is listed or read", async (t) => {
  const { paths, secret } = homeWithLinks(t);

  assert.deepEqual((await folderAt(paths, "")).map(({ name }) => name), ["SOUL.md", "context", "vault"]);
  // A link out of the home or into what it keeps is listed as what it is not, a folder or a file, and never followed.
  assert.deepEqual(await folderAt(paths, "vault"), [
    { name: "away", kind: "other", size: null },
    { name: "gone.md", kind: "other", size: null },
    { name: "kept", kind: "other", size: null },
    { name: "notes.md", kind: "file", size: 8 },
    { name: "out.md", kind: "other", size: null },
    { name: "token.json", kind: "other", size: null },
  ]);
  // A link that stays in the home is followed.
  assert.deepEqual(await fileAt(paths, "context/notes.md"), { kind: "text", text: "# Notes\n" });

  const refusedFiles = [
    relative(paths.root, secret),
    secret,
    "vault/../SOUL.md",
    "vault/out.md",
    "vault/away/secret.md",
    "state/member.json",
    "state/runtime/endpoint.json",
    "vault/token.json",
    "vault/kept/member.json",
    "vault/gone.md",
  ];
  for (const path of refusedFiles) await assert.rejects(fileAt(paths, path), isRefusal, path);
  for (const path of ["/", "..", "state", "./state/runtime", "vault/away", "vault/kept"]) {
    await assert.rejects(folderAt(paths, path), isRefusal, path);
  }
});

test("a file is read as text or as an image, and anything else, or anything too big, is listed and refused", async (t) => {
  const paths = homePaths(join(tempDir(t, "browse"), "scout"));
  // A PNG of one pixel.
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
      "1f15c4890000000d49444154789c63f8cfc0f01f0005000201a1f3c3e90000000049454e44ae426082",
    "hex",
  );
  write(join(paths.vault, "dot.png"), png);
  write(join(paths.vault, "data.bin"), Buffer.from([0x00, 0x01, 0x02, 0xff]));
  write(join(paths.vault, "big.md"), "a".repeat(MAX_TEXT_BYTES + 1));
  write(join(paths.vault, "plan.md"), "# Plan\n\nShip it. 🦐\n");

  assert.deepEqual(await fileAt(paths, "vault/plan.md"), { kind: "text", text: "# Plan\n\nShip it. 🦐\n" });
  assert.deepEqual(await fileAt(paths, "vault/dot.png"), { kind: "image", mediaType: "image/png", data: png.toString("base64") });
  for (const path of ["vault/data.bin", "vault/big.md", "vault"]) await assert.rejects(fileAt(paths, path), isRefusal, path);
  await assert.rejects(folderAt(paths, "vault/plan.md"), isRefusal);
  assert.deepEqual(
    (await folderAt(paths, "vault")).map(({ name, kind }) => [name, kind]),
    [["big.md", "file"], ["data.bin", "file"], ["dot.png", "file"], ["plan.md", "file"]],
  );
});
