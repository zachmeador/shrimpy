import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  SHRIMP_COLOR_HEX,
  brand,
  colorEnabled,
  paintHex,
  shrimp,
} from "../dist/util/style.js";

const ESC = String.fromCharCode(0x1b);

describe("style helpers", () => {
  test("canonical shrimp color is #F88379", () => {
    assert.equal(SHRIMP_COLOR_HEX, "#F88379");
  });

  test("paintHex always wraps text in 24-bit foreground escape", () => {
    const wrapped = paintHex(SHRIMP_COLOR_HEX, "shrimpy");
    assert.equal(wrapped, `${ESC}[38;2;248;131;121mshrimpy${ESC}[0m`);
  });

  test("shrimp/brand return plain text when stdout is not a TTY", () => {
    assert.equal(Boolean(process.stdout.isTTY), false);
    assert.equal(colorEnabled(), false);
    assert.equal(shrimp("shrimpy"), "shrimpy");
    assert.equal(brand(), "shrimpy");
    assert.equal(brand("shrimpy version"), "shrimpy version");
  });

  test("colorEnabled honors NO_COLOR even when forceColor is set", () => {
    assert.equal(
      colorEnabled({ isTTY: true, noColor: true, forceColor: true }),
      false,
    );
  });

  test("colorEnabled honors FORCE_COLOR for non-TTY output", () => {
    assert.equal(
      colorEnabled({ isTTY: false, noColor: false, forceColor: true }),
      true,
    );
    assert.equal(
      colorEnabled({ isTTY: false, noColor: false, forceColor: false }),
      false,
    );
  });
});
