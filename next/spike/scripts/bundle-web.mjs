#!/usr/bin/env node
/**
 * Bundle web/page.ts for the browser and check what actually went in.
 * Fails if the bundle contains a Node built-in, esbuild, ws, or pi-durable's runtime.
 */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const root = new URL("../", import.meta.url).pathname;
mkdirSync(`${root}web/dist`, { recursive: true });

const common = { entryPoints: [`${root}web/page.ts`], bundle: true, platform: "browser", format: "esm", target: "es2022", metafile: true, logLevel: "warning" };
const dev = await build({ ...common, outfile: `${root}web/dist/page.js` });
const min = await build({ ...common, minify: true, write: false, outfile: "page.min.js" });

const packageOf = (path) => {
	const match = path.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//g);
	if (!match) return "(spike source)";
	return match.at(-1).replace("node_modules/", "").replace(/\/$/, "");
};
const output = Object.values(dev.metafile.outputs)[0];
const bytesByPackage = new Map();
for (const [path, info] of Object.entries(output.inputs)) {
	const name = packageOf(path);
	bytesByPackage.set(name, (bytesByPackage.get(name) ?? 0) + info.bytesInOutput);
}
const inputs = Object.keys(dev.metafile.inputs);
const minified = min.outputFiles[0].contents;
const pad = (value, width) => String(value).padStart(width);

console.log(`entry          web/page.ts  (platform=browser, format=esm)`);
console.log(`bundle         ${readFileSync(`${root}web/dist/page.js`).length} bytes  (minified ${minified.length}, gzip ${gzipSync(minified).length})`);
console.log(`input modules  ${inputs.length}`);
console.log("by package (bytes in the unminified output):");
for (const [name, bytes] of [...bytesByPackage].sort((a, b) => b[1] - a[1])) console.log(`  ${pad(bytes, 8)}  ${name}`);

const external = Object.values(dev.metafile.inputs).flatMap((input) => input.imports.filter((entry) => entry.external).map((entry) => entry.path));
const bundled = new Set([...bytesByPackage.keys()]);
const forbidden = [...bundled].filter((name) => name === "esbuild" || name.startsWith("@esbuild/") || name === "ws" || name === "@earendil-works/pi-durable" || name === "@earendil-works/pi-server" || name === "@earendil-works/pi-ai");
const nodeInputs = inputs.filter((path) => path.startsWith("node:") || /^(fs|path|net|os|crypto|child_process)$/.test(path));
const source = readFileSync(`${root}web/dist/page.js`, "utf8");
const nodeRefs = ["node:", "require(\"fs\")", "process.binding", "from \"esbuild\"", "esbuild-wasm"].filter((needle) => source.includes(needle));

console.log(`\nexternal imports left in the bundle:    ${external.length === 0 ? "none" : external.join(", ")}`);
console.log(`node: built-in modules bundled:         ${nodeInputs.length === 0 ? "none" : nodeInputs.join(", ")}`);
console.log(`esbuild / @esbuild/* bundled:           ${[...bundled].some((name) => name === "esbuild" || name.startsWith("@esbuild/")) ? "YES" : "no"}`);
console.log(`forbidden packages bundled:             ${forbidden.length === 0 ? "none" : forbidden.join(", ")}`);
console.log(`node-only strings in the output:        ${nodeRefs.length === 0 ? "none" : nodeRefs.join(", ")}`);
writeFileSync(`${root}web/dist/meta.json`, JSON.stringify(dev.metafile));
assert.equal(external.length, 0, "unresolved externals");
assert.equal(nodeInputs.length, 0, "node built-ins bundled");
assert.equal(forbidden.length, 0, "forbidden packages bundled");
assert.equal(nodeRefs.length, 0, "node-only strings in output");
console.log("PASS: browser-only bundle");

// Negative control: the Node-only subpaths should not bundle for a browser, which shows the checks above can fail.
console.log("\nnegative controls (entries that import a Node-only subpath):");
for (const specifier of ["@earendil-works/chord/bundler", "@earendil-works/chord/node", "@earendil-works/pi-client/unix"]) {
	try {
		const result = await build({ stdin: { contents: `import ${JSON.stringify(specifier)};`, resolveDir: root, loader: "js" }, bundle: true, platform: "browser", write: false, metafile: true, logLevel: "silent" });
		const names = new Set(Object.keys(result.metafile.inputs).map(packageOf));
		console.log(`  ${specifier}: bundled, and pulled in ${[...names].filter((name) => name === "esbuild" || name.startsWith("@esbuild/")).join(", ") || "no esbuild"}`);
	} catch (error) {
		const text = error.errors?.map((entry) => entry.text).slice(0, 2).join(" | ") ?? String(error);
		console.log(`  ${specifier}: FAILS to bundle for a browser (${text})`);
	}
}
