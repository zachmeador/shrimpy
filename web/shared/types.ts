export type NodeKind =
  | "overview"
  | "agent"
  | "channel"
  | "session"
  | "watch"
  | "runtime"
  | "jsonl"
  | "markdown"
  | "json"
  | "log"
  | "script"
  | "text"
  | "media"
  | "private"
  | "other";

export interface TreeLeaf {
  type: "file";
  id: string;
  name: string;
  size: number;
  mtimeMs: number;
  kind: NodeKind;
  readable: boolean;
  hint?: string;
}

export interface DirectoryNode {
  type: "directory";
  id: string;
  name: string;
  fileCount: number;
  children: TreeNode[];
  synthetic?: boolean;
}

export type TreeNode = DirectoryNode | TreeLeaf;

export interface Tree {
  root: DirectoryNode;
}

export interface TreeResponse {
  workspace: string;
  revision: string;
  tree: Tree;
}

export interface ParseError {
  line: number;
  error: string;
}

export interface NodeMetadata {
  label: string;
  value: string;
}

interface BaseNodeResponse {
  id: string;
  label: string;
  kind: NodeKind;
  metadata: NodeMetadata[];
  revision: string;
  sourcePath?: string;
  mtimeMs?: number;
}

export interface JsonlNodeResponse extends BaseNodeResponse {
  mode: "jsonl";
  events: unknown[];
  parseErrors: ParseError[];
  truncated: boolean;
  totalSize: number;
  cursor: number;
  anchor: string;
  replace: boolean;
}

export interface TextNodeResponse extends BaseNodeResponse {
  mode: "text";
  text: string;
  truncated: boolean;
  totalSize: number;
}

export interface OverviewRow {
  label: string;
  value: string;
  tone?: "normal" | "good" | "warn" | "bad" | "dim";
}

export interface OverviewSection {
  title: string;
  rows: OverviewRow[];
}

export interface OverviewNodeResponse extends BaseNodeResponse {
  mode: "overview";
  sections: OverviewSection[];
}

export type NodeResponse =
  | JsonlNodeResponse
  | TextNodeResponse
  | OverviewNodeResponse;

export interface ChangeEvent {
  revision: string;
  paths: string[];
}
