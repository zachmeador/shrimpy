import {
  DynamicBorder,
  keyHint,
  rawKeyHint,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import {
  Container,
  getKeybindings,
  Spacer,
  Text,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import {
  formatSessionAge,
  type NavigableAgentSummary,
  type NavigableSessionInventory,
  type NavigableSessionSummary,
} from "../sessions/inventory.js";

type NavigatorRow =
  | { kind: "agent"; key: string; agent: NavigableAgentSummary }
  | {
    kind: "session";
    key: string;
    agent: NavigableAgentSummary;
    session: NavigableSessionSummary;
    last: boolean;
  };

export class AgentSessionSelectorComponent extends Container {
  private readonly list = new Container();
  private readonly expandedAgents = new Set<string>();
  private visibleRows: NavigatorRow[] = [];
  private selectedIndex = 0;
  private searchQuery: string;
  private _focused = false;

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
  }

  constructor(
    private readonly inventory: NavigableSessionInventory,
    private readonly theme: Theme,
    private readonly maxVisible: number,
    private readonly onSelect: (session: NavigableSessionSummary) => void,
    private readonly onCancel: () => void,
    initialSearch = "",
    private readonly onSelectEmptyAgent: (
      agent: NavigableAgentSummary,
    ) => void = () => {},
  ) {
    super();
    this.searchQuery = initialSearch.trim();
    for (const agent of inventory.agents) this.expandedAgents.add(agent.agentId);

    this.addChild(new Spacer(1));
    this.addChild(new DynamicBorder((text) => theme.fg("border", text)));
    this.addChild(new Text(theme.fg("accent", theme.bold("Agents & Sessions")), 1, 0));
    this.addChild(new Text(theme.fg("muted", [
      rawKeyHint("↑/↓", "move"),
      rawKeyHint("←/→", "parent/child"),
      keyHint("tui.select.confirm", "open/toggle"),
      "type to search",
      keyHint("tui.select.cancel", "cancel"),
    ].join("  ·  ")), 1, 0));
    this.addChild(new SearchLine(() => this.searchQuery, theme));
    this.addChild(new DynamicBorder((text) => theme.fg("border", text)));
    this.addChild(new Spacer(1));
    this.addChild(this.list);
    this.addChild(new Spacer(1));
    this.addChild(new DynamicBorder((text) => theme.fg("border", text)));

    this.applyFilter();
    const currentIndex = this.visibleRows.findIndex((row) =>
      row.kind === "session" && row.session.current
    );
    const currentAgentIndex = this.visibleRows.findIndex((row) =>
      row.kind === "agent" && row.agent.current
    );
    const requestedAgentIndex = this.visibleRows.findIndex((row) =>
      row.kind === "agent" && matches(row.agent.agentId, this.searchQuery)
    );
    this.selectedIndex = currentIndex >= 0
      ? currentIndex
      : currentAgentIndex >= 0
        ? currentAgentIndex
        : Math.max(0, requestedAgentIndex);
    this.updateList();
  }

  getSelectedRow(): NavigatorRow | undefined {
    return this.visibleRows[this.selectedIndex];
  }

  getSearchQuery(): string {
    return this.searchQuery;
  }

  handleInput(data: string): void {
    const keybindings = getKeybindings();
    if (keybindings.matches(data, "tui.select.up")) {
      this.move(-1);
    } else if (keybindings.matches(data, "tui.select.down")) {
      this.move(1);
    } else if (keybindings.matches(data, "tui.editor.cursorLeft")) {
      this.moveLeft();
    } else if (keybindings.matches(data, "tui.editor.cursorRight")) {
      this.moveRight();
    } else if (keybindings.matches(data, "tui.select.confirm")) {
      this.activate();
    } else if (keybindings.matches(data, "tui.select.cancel")) {
      if (this.searchQuery) {
        this.searchQuery = "";
        this.applyFilter();
      } else {
        this.onCancel();
      }
    } else if (keybindings.matches(data, "tui.editor.deleteCharBackward")) {
      if (this.searchQuery) {
        this.searchQuery = this.searchQuery.slice(0, -1);
        this.applyFilter();
      }
    } else if (isSearchText(data)) {
      this.searchQuery += data;
      this.applyFilter();
    }
    this.updateList();
  }

  private move(delta: number): void {
    if (this.visibleRows.length === 0) return;
    this.selectedIndex = (
      this.selectedIndex + delta + this.visibleRows.length
    ) % this.visibleRows.length;
  }

  private moveLeft(): void {
    const row = this.getSelectedRow();
    if (!row) return;
    if (row.kind === "session") {
      this.selectedIndex = this.visibleRows.findIndex((candidate) =>
        candidate.kind === "agent"
        && candidate.agent.agentId === row.agent.agentId
      );
      return;
    }
    if (this.expandedAgents.delete(row.agent.agentId)) this.applyFilter(row.key);
  }

  private moveRight(): void {
    const row = this.getSelectedRow();
    if (!row || row.kind === "session" || row.agent.sessions.length === 0) return;
    if (!this.expandedAgents.has(row.agent.agentId)) {
      this.expandedAgents.add(row.agent.agentId);
      this.applyFilter(row.key);
      return;
    }
    const childIndex = this.visibleRows.findIndex((candidate) =>
      candidate.kind === "session"
      && candidate.agent.agentId === row.agent.agentId
    );
    if (childIndex >= 0) this.selectedIndex = childIndex;
  }

  private activate(): void {
    const row = this.getSelectedRow();
    if (!row) return;
    if (row.kind === "session") {
      this.onSelect(row.session);
      return;
    }
    if (row.agent.sessions.length === 0) {
      this.onSelectEmptyAgent(row.agent);
      return;
    }
    if (this.expandedAgents.has(row.agent.agentId)) {
      this.expandedAgents.delete(row.agent.agentId);
    } else {
      this.expandedAgents.add(row.agent.agentId);
    }
    this.applyFilter(row.key);
  }

  private applyFilter(preferredKey?: string): void {
    const selectedKey = preferredKey ?? this.getSelectedRow()?.key;
    const query = this.searchQuery.trim().toLowerCase();
    const rows: NavigatorRow[] = [];
    for (const agent of this.inventory.agents) {
      const agentMatches = matches(agent.agentId, query);
      const matchingSessions = query
        ? agent.sessions.filter((session) => sessionMatches(session, query))
        : agent.sessions;
      if (query && !agentMatches && matchingSessions.length === 0) continue;

      rows.push({ kind: "agent", key: `agent:${agent.agentId}`, agent });
      const sessions = query
        ? agentMatches ? agent.sessions : matchingSessions
        : this.expandedAgents.has(agent.agentId) ? agent.sessions : [];
      sessions.forEach((session, index) => {
        rows.push({
          kind: "session",
          key: `session:${agent.agentId}:${session.sessionId}`,
          agent,
          session,
          last: index === sessions.length - 1,
        });
      });
    }
    this.visibleRows = rows;
    const preserved = selectedKey
      ? rows.findIndex((row) => row.key === selectedKey)
      : -1;
    this.selectedIndex = preserved >= 0
      ? preserved
      : Math.min(this.selectedIndex, Math.max(0, rows.length - 1));
  }

  private updateList(): void {
    this.list.clear();
    if (this.visibleRows.length === 0) {
      this.list.addChild(new Text(this.theme.fg("muted", "  No matching agents or sessions"), 1, 0));
      return;
    }
    const start = Math.max(
      0,
      Math.min(
        this.selectedIndex - Math.floor(this.maxVisible / 2),
        Math.max(0, this.visibleRows.length - this.maxVisible),
      ),
    );
    const end = Math.min(this.visibleRows.length, start + this.maxVisible);
    for (let index = start; index < end; index += 1) {
      const row = this.visibleRows[index]!;
      this.list.addChild(new NavigatorRowComponent(
        row,
        index === this.selectedIndex,
        this.expandedAgents.has(row.agent.agentId),
        this.theme,
      ));
    }
    if (start > 0 || end < this.visibleRows.length) {
      this.list.addChild(new Text(
        this.theme.fg("muted", `  (${this.selectedIndex + 1}/${this.visibleRows.length})`),
        1,
        0,
      ));
    }
  }
}

class NavigatorRowComponent {
  constructor(
    private readonly row: NavigatorRow,
    private readonly selected: boolean,
    private readonly expanded: boolean,
    private readonly theme: Theme,
  ) {}

  render(width: number): string[] {
    const cursor = this.selected
      ? this.theme.fg("accent", "→ ")
      : "  ";
    const content = this.row.kind === "agent"
      ? this.agentText()
      : this.sessionText();
    return [truncateToWidth(`${cursor}${content}`, Math.max(1, width - 2), "")];
  }

  invalidate(): void {}

  private agentText(): string {
    const disclosure = this.row.agent.sessions.length === 0
      ? "·"
      : this.expanded ? "▾" : "▸";
    const count = this.row.agent.sessions.length;
    const sessionSummary = count === 0
      ? "  no sessions · open local/main"
      : `  ${count} session${count === 1 ? "" : "s"}`;
    const active = this.row.agent.current
      ? `  ${this.theme.fg("accent", "active")}`
      : "";
    return `${this.theme.fg("muted", disclosure)} ${this.theme.bold(this.row.agent.agentId)}${this.theme.fg("dim", sessionSummary)}${active}`;
  }

  private sessionText(): string {
    if (this.row.kind !== "session") return "";
    const branch = this.row.last ? "└─" : "├─";
    const current = this.row.session.current
      ? `${this.theme.fg("accent", "●")} `
      : "  ";
    const title = this.row.session.name
      ?? this.row.session.preview
      ?? this.row.session.sessionId;
    const age = formatSessionAge(
      Math.max(0, Date.now() - this.row.session.updatedAtMs),
    );
    const currentLabel = this.row.session.current ? " · current" : "";
    return `${this.theme.fg("muted", `  ${branch} `)}${current}${this.theme.fg("text", title)}${this.theme.fg("dim", ` · ${this.row.session.sessionId} · ${age} ago${currentLabel}`)}`;
  }
}

class SearchLine {
  constructor(
    private readonly getQuery: () => string,
    private readonly theme: Theme,
  ) {}

  render(width: number): string[] {
    const query = this.getQuery();
    return [truncateToWidth(
      `  ${this.theme.fg("muted", "Type to search:")}${query ? ` ${this.theme.fg("accent", query)}` : ""}`,
      width,
      "",
    )];
  }

  invalidate(): void {}
}

function matches(value: string, query: string): boolean {
  return !query || value.toLowerCase().includes(query.toLowerCase());
}

function sessionMatches(session: NavigableSessionSummary, query: string): boolean {
  return [session.sessionId, session.name, session.preview]
    .filter((value): value is string => Boolean(value))
    .some((value) => matches(value, query));
}

function isSearchText(data: string): boolean {
  return data.length > 0 && ![...data].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 0x7f || (code >= 0x80 && code <= 0x9f);
  });
}
