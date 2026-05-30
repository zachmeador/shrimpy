export type FileKind =
  | "channel"
  | "session"
  | "jsonl"
  | "markdown"
  | "json"
  | "log"
  | "script"
  | "text"
  | "media"
  | "private"
  | "other";

export interface FileLeaf {
  type: "file";
  path: string;
  name: string;
  size: number;
  mtimeMs: number;
  kind: FileKind;
  readable: boolean;
}

export interface DirectoryNode {
  type: "directory";
  path: string;
  name: string;
  fileCount: number;
  children: TreeNode[];
}

export type TreeNode = DirectoryNode | FileLeaf;

export interface Tree {
  root: DirectoryNode;
}

export interface TreeResponse {
  workspace: string;
  tree: Tree;
}

export interface ParseError {
  line: number;
  error: string;
}

interface BaseFileResponse {
  path: string;
  kind: FileKind;
  mode: "jsonl" | "text";
  truncated: boolean;
  totalSize: number;
}

export interface JsonlFileResponse extends BaseFileResponse {
  mode: "jsonl";
  events: unknown[];
  parseErrors: ParseError[];
}

export interface TextFileResponse extends BaseFileResponse {
  mode: "text";
  text: string;
}

export type FileResponse = JsonlFileResponse | TextFileResponse;
