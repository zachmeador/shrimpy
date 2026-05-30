import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "../app/project-root.js";

export function stableDocsRoot(): string {
  return join(projectRoot, "docs");
}

function setupTemplatesRoot(): string {
  return join(projectRoot, "src", "setup", "templates");
}

export function loadSetupTemplate(
  templateName: string,
  docsPath = stableDocsRoot(),
): string {
  return readFileSync(join(setupTemplatesRoot(), templateName), "utf-8")
    .replaceAll("{{DOCS_PATH}}", docsPath);
}
