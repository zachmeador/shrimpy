// Fails when a file imports something its side of the boundary must not know about.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = ["src", "web", "scripts"].flatMap((dir) => readdirSync(join(root, dir)).filter((name) => /\.(ts|mjs)$/.test(name)).map((name) => `${dir}/${name}`));
const importsOf = (file) => [...readFileSync(join(root, file), "utf8").matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)].map((match) => match[1]);

// Clients show a thread. They know the contract and nothing about the engine or the server.
const clients = ["src/contract.ts", "src/remote.ts", "src/remote-node.ts", "src/tui.ts", "web/page.ts"];
const serverOnly = /^@earendil-works\/pi-(durable|ai)(\/|$)|\/(host|session-view|thread-source|serve|faux-script|owner-lock)\.ts$/;
// The browser bundle additionally has no Node.
const browser = ["src/contract.ts", "src/remote.ts", "web/page.ts"];
const nodeOnly = /^node:|\/unix$|^ws$|\/remote-node\.ts$/;
// Pi packages are used through their documented entry points.
const piTuiInternals = /^@earendil-works\/pi-tui\/.+/;

const problems = [];
for (const file of files) {
	for (const specifier of importsOf(file)) {
		if (clients.includes(file) && serverOnly.test(specifier)) problems.push(`${file}: a client must not import ${specifier}`);
		if (browser.includes(file) && nodeOnly.test(specifier)) problems.push(`${file}: browser code must not import ${specifier}`);
		if (piTuiInternals.test(specifier)) problems.push(`${file}: deep import into pi-tui: ${specifier}`);
	}
}
for (const file of [...clients, ...browser]) if (!files.includes(file)) problems.push(`boundary list names a missing file: ${file}`);

if (problems.length > 0) {
	console.error(problems.join("\n"));
	process.exit(1);
}
console.log(`boundaries ok (${files.length} files; ${relative(process.cwd(), root) || "."})`);
