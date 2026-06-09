import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../app/project-root.js";

export function stableAppRoot(): string {
  return projectRoot;
}

export function stableDocsRoot(): string {
  return join(stableAppRoot(), "docs");
}

export function stableSourceRoot(): string {
  return join(stableAppRoot(), "src");
}

function setupTemplatesRoot(): string {
  return join(projectRoot, "src", "setup", "templates");
}

export function loadSetupTemplate(
  templateName: string,
  docsPath = stableDocsRoot(),
): string {
  return readFileSync(join(setupTemplatesRoot(), templateName), "utf-8")
    .replaceAll("{{APP_PATH}}", stableAppRoot())
    .replaceAll("{{SOURCE_PATH}}", stableSourceRoot())
    .replaceAll("{{DOCS_PATH}}", docsPath);
}
