import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initTheme,
  ToolExecutionComponent,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import compactToolsExtension from "../extensions/compact-tools.ts";

test("compact built-in tool rows render Pi result output when expanded", () => {
  initTheme("dark", false);
  const readTool = registerCompactTools().get("read");
  assert.ok(readTool);

  const component = new ToolExecutionComponent(
    "read",
    "call-read",
    { path: "README.md" },
    {},
    readTool,
    { requestRender(): void {} } as never,
    process.cwd(),
  );
  component.markExecutionStarted();
  component.setArgsComplete();
  component.updateResult({
    content: [{ type: "text", text: "first line\nsecond line" }],
    details: undefined,
    isError: false,
  });

  const collapsed = stripAnsi(component.render(120).join("\n"));
  assert.match(collapsed, /ok read README\.md/);
  assert.doesNotMatch(collapsed, /first line/);

  component.setExpanded(true);
  const expanded = stripAnsi(component.render(120).join("\n"));
  assert.match(expanded, /ok read README\.md/);
  assert.match(expanded, /first line/);
  assert.match(expanded, /second line/);
});

test("compact write rows render written content when expanded", () => {
  initTheme("dark", false);
  const writeTool = registerCompactTools().get("write");
  assert.ok(writeTool);

  const content = "first line\nsecond line\nthird line";
  const component = new ToolExecutionComponent(
    "write",
    "call-write",
    { path: "notes.txt", content },
    {},
    writeTool,
    { requestRender(): void {} } as never,
    process.cwd(),
  );
  component.markExecutionStarted();
  component.setArgsComplete();
  component.updateResult({
    content: [{ type: "text", text: "Successfully wrote 33 bytes to notes.txt" }],
    details: undefined,
    isError: false,
  });

  const collapsed = stripAnsi(component.render(120).join("\n"));
  assert.match(collapsed, /ok write notes\.txt \(3 lines\)/);
  assert.doesNotMatch(collapsed, /first line/);

  component.setExpanded(true);
  const expanded = stripAnsi(component.render(120).join("\n"));
  assert.match(expanded, /write notes\.txt/);
  assert.match(expanded, /first line/);
  assert.match(expanded, /second line/);
  assert.match(expanded, /third line/);
  assert.doesNotMatch(expanded, /Successfully wrote/);
});

function registerCompactTools(): Map<string, ToolDefinition> {
  const tools = new Map<string, ToolDefinition>();
  compactToolsExtension({
    registerTool(tool: ToolDefinition): void {
      tools.set(tool.name, tool);
    },
  } as never);
  return tools;
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/gu, "");
}
