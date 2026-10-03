import { join } from "node:path";
import {
	Box,
	type Component,
	CombinedAutocompleteProvider,
	Container,
	Editor,
	type EditorTheme,
	getTerminalColorMode,
	isViewportTUI,
	Loader,
	Markdown,
	type MarkdownTheme,
	matchesKey,
	parseColor,
	ProcessTerminal,
	ScrollView,
	Spacer,
	styleText,
	Text,
	type TextStyle,
	type TUI,
	TuiAltScreen,
	TuiMainScreen,
	VStack,
} from "@earendil-works/pi-tui";
import type { ThreadSource } from "./contract.ts";
import { openLocalThread } from "./thread-source.ts";
import { type Item, toItems, toStatus } from "./view-model.ts";

// Theme: pi-tui components take plain style functions, so the console owns its look.
const mode = getTerminalColorMode();
const paint = (style: TextStyle) => (text: string) => styleText(text, style, mode);
const grey = parseColor("#8b93a1");
const c = {
	dim: paint({ fg: grey }),
	thinking: paint({ fg: grey, italic: true }),
	accent: paint({ fg: parseColor("#5ec8e0") }),
	ok: paint({ fg: parseColor("#7bd88f") }),
	warn: paint({ fg: parseColor("#f2c261") }),
	err: paint({ fg: parseColor("#f07178") }),
	bold: paint({ bold: true }),
	userBg: paint({ bg: parseColor("#2b3240") }),
	toolBg: paint({ bg: parseColor("#20252e") }),
};
const markdownTheme: MarkdownTheme = {
	heading: paint({ fg: parseColor("#5ec8e0"), bold: true }),
	link: paint({ fg: parseColor("#82aaff"), underline: true }),
	linkUrl: c.dim,
	code: paint({ fg: parseColor("#f2c261") }),
	codeBlock: paint({ fg: parseColor("#7bd88f") }),
	codeBlockBorder: c.dim,
	quote: paint({ fg: grey, italic: true }),
	quoteBorder: c.dim,
	hr: c.dim,
	listBullet: c.accent,
	bold: paint({ bold: true }),
	italic: paint({ italic: true }),
	strikethrough: paint({ strikethrough: true }),
	underline: paint({ underline: true }),
};
const editorTheme: EditorTheme = {
	borderColor: c.dim,
	selectList: { selectedPrefix: c.accent, selectedText: c.accent, description: c.dim, scrollInfo: c.dim, noMatch: c.warn },
};

/** One drawn item. `update` is called with every newer version of the same item. */
interface Row {
	readonly type: Item["type"];
	readonly component: Component;
	update(item: Item): void;
}

const rowRoot = (body: Component): Container => {
	const root = new Container();
	root.addChild(new Spacer(1));
	root.addChild(body);
	return root;
};

function userRow(): Row {
	const text = new Text("", 0, 0);
	const box = new Box(1, 0, c.userBg);
	box.addChild(text);
	return { type: "user", component: rowRoot(box), update: (item) => item.type === "user" && text.setText(item.text) };
}

function markerRow(): Row {
	const text = new Text("", 1, 0);
	return { type: "marker", component: rowRoot(text), update: (item) => item.type === "marker" && text.setText(c.dim(`── ${item.text} ──`)) };
}

function assistantRow(expanded: () => boolean): Row {
	const root = new Container();
	const thinking = new Text("", 1, 0);
	const body = new Markdown("", 1, 0, markdownTheme);
	const note = new Text("", 1, 0);
	return {
		type: "assistant",
		component: root,
		update(item) {
			if (item.type !== "assistant") return;
			root.clear();
			root.addChild(new Spacer(1));
			if (item.thinking !== "") {
				const lines = item.thinking.trim().split("\n");
				const shown = expanded() ? lines : lines.slice(-2);
				thinking.setText(c.thinking(`thinking${lines.length > shown.length ? ` (${lines.length - shown.length} earlier lines hidden)` : ""}: ${shown.join(" ")}`));
				root.addChild(thinking);
			}
			if (item.text !== "") {
				body.setText(item.text);
				root.addChild(body);
			}
			if (item.stopReason === "aborted") {
				note.setText(c.warn("(answer interrupted)"));
				root.addChild(note);
			}
		},
	};
}

const toolLabel = (item: Extract<Item, { type: "tool" }>): string => {
	let command = item.args;
	try {
		const parsed = JSON.parse(item.args) as { command?: unknown };
		if (item.name === "bash" && typeof parsed.command === "string") command = `$ ${parsed.command}`;
	} catch {}
	return `${command.length > 110 ? `${command.slice(0, 107)}...` : command}`;
};

function toolRow(expanded: () => boolean): Row {
	const header = new Text("", 0, 0);
	const output = new Text("", 0, 0);
	const box = new Box(1, 0, c.toolBg);
	const root = rowRoot(box);
	return {
		type: "tool",
		component: root,
		update(item) {
			if (item.type !== "tool") return;
			const status = {
				pending: c.dim("○ queued"),
				running: c.warn("● running"),
				done: c.ok("✓ done"),
				error: c.err("✗ failed"),
				interrupted: c.err("⚠ interrupted, not rerun"),
			}[item.status];
			header.setText(`${c.bold(item.name)} ${c.dim(toolLabel(item))}  ${status}`);
			box.clear();
			box.addChild(header);
			const lines = item.output.replace(/\n+$/, "").split("\n").filter((line, index) => index > 0 || line !== "");
			const shown = lines.slice(expanded() ? -200 : -6);
			const hidden = lines.length - shown.length;
			const notes = item.notes.map((note) => c.dim(`· ${note}`));
			if (shown.length === 0 && notes.length === 0) return;
			output.setText([...(hidden > 0 ? [c.dim(`… ${hidden} earlier lines (ctrl+o to expand)`)] : []), ...shown, ...notes].join("\n"));
			box.addChild(output);
		},
	};
}

export async function runTui(options: { home: string; attach: boolean; alt: boolean }): Promise<number> {
	// Harness reports must not print over the screen; they become a notice once the screen exists.
	let report: (error: unknown) => void = () => {};
	const source: ThreadSource = options.attach
		? await (await import("./remote-node.ts")).attachUnix(options.home)
		: await openLocalThread(options.home, (error) => report(error));

	const terminal = new ProcessTerminal();
	const tui: TUI = options.alt ? new TuiAltScreen(terminal) : new TuiMainScreen(terminal);
	const chat = new Container();
	const status = new Container();
	const queue = new Container();
	const notice = new Text("", 1, 0);
	const editor = new Editor(tui, editorTheme, { paddingX: 1 });
	const footer = new Text("", 1, 0);

	report = (error) => {
		notice.setText(c.warn(`harness: ${error instanceof Error ? error.message : String(error)}`));
		tui.requestRender();
	};
	let expanded = false;
	const isExpanded = () => expanded;
	const rows: Row[] = [];
	let loader: Loader | undefined;
	let busy = false;

	const makeRow = (type: Item["type"]): Row =>
		type === "user" ? userRow() : type === "assistant" ? assistantRow(isExpanded) : type === "tool" ? toolRow(isExpanded) : markerRow();

	const apply = (): void => {
		const view = source.view;
		const items = toItems(view);
		items.forEach((item, index) => {
			if (rows[index]?.type !== item.type) {
				rows.length = index;
				chat.clear();
				for (const row of rows) chat.addChild(row.component);
				const row = makeRow(item.type);
				rows.push(row);
				chat.addChild(row.component);
			}
			rows[index]!.update(item);
		});
		if (rows.length > items.length) {
			rows.length = items.length;
			chat.clear();
			for (const row of rows) chat.addChild(row.component);
		}

		const state = toStatus(view);
		busy = state.busy;
		if (state.busy && loader === undefined) {
			loader = new Loader(tui, c.accent, c.dim, state.label);
			status.addChild(new Spacer(1));
			status.addChild(loader);
			loader.start();
		} else if (state.busy) loader?.setMessage(`${state.label}  (esc to stop)`);
		else if (loader !== undefined) {
			loader.stop();
			loader = undefined;
			status.clear();
		}
		queue.clear();
		for (const line of state.queued) queue.addChild(new Text(c.dim(`queued ${line}`), 1, 0));
		editor.borderColor = state.busy ? c.warn : c.dim;
		footer.setText(c.dim(`${state.model} · ${state.usage} · enter send · /steer text · esc stop · ctrl+o expand · ctrl+c quit`));
		tui.requestRender();
	};

	const fail = (text: string) => (error: unknown) => {
		// The editor clears itself on submit, so a failed send has to put the draft back.
		editor.setText(text);
		notice.setText(c.err(`not sent: ${error instanceof Error ? error.message : String(error)}`));
		tui.requestRender();
	};
	editor.onSubmit = (text) => {
		if (text === "") return;
		notice.setText("");
		editor.addToHistory(text);
		const steer = text.startsWith("/steer ");
		void source.send(steer ? text.slice(7) : text, steer ? "steer" : busy ? "followUp" : "steer").catch(fail(text));
	};

	let finish: () => void = () => {};
	const done = new Promise<void>((resolve) => (finish = resolve));
	tui.addInputListener((data) => {
		if (matchesKey(data, "ctrl+c") || matchesKey(data, "ctrl+d")) {
			finish();
			return { consume: true };
		}
		if (matchesKey(data, "escape") && busy) {
			void source.abort().catch(fail(""));
			return { consume: true };
		}
		if (matchesKey(data, "ctrl+o")) {
			expanded = !expanded;
			apply();
			return { consume: true };
		}
		return undefined;
	});

	if (options.alt && isViewportTUI(tui)) {
		for (const component of [chat, status, queue, notice, editor, footer]) tui.addChild(component);
		const dock = new VStack(
			[status, queue, notice, editor, footer].map((component) => ({ component, shrink: 1, minSize: component === editor ? 3 : 0 })),
		);
		tui.setLayoutRoot(
			new VStack([
				{ component: new ScrollView(chat, { follow: "end", primary: true, overscroll: "chain" }), basis: 0, grow: 1, shrink: 1, minSize: 1 },
				{ component: dock, basis: "auto", grow: 0, shrink: 1, minSize: 1 },
			]),
		);
	} else {
		for (const component of [chat, status, queue, notice, editor, footer]) tui.addChild(component);
	}
	tui.setFocus(editor);
	// Public provider: slash commands plus file paths. It reads a local directory, so an attached client needs its own provider that asks the agent.
	editor.setAutocompleteProvider(new CombinedAutocompleteProvider([{ name: "steer", description: "send now, even while the agent works", argumentHint: "text" }], join(options.home, "work")));
	tui.terminal.setTitle("shrimpy spike");
	source.onDisconnect?.((reason) => {
		notice.setText(c.err(`disconnected from the agent${reason ? `: ${reason.message}` : ""}. Messages cannot be sent; ctrl+c quits.`));
		tui.requestRender();
	});
	tui.start();
	const unsubscribe = source.subscribe(apply);
	await done;
	unsubscribe();
	loader?.stop();
	const columns = tui.terminal.columns;
	// Fullscreen exit prints the layout unbounded, where the transcript entry (basis 0) has no height. Print the transcript instead.
	tui.stop({ preserveScreen: options.alt });
	if (options.alt) process.stdout.write(`${chat.render(columns).join("\n")}\n`);
	await source.close();
	return 0;
}
