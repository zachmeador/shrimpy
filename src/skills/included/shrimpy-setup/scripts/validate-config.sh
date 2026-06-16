#!/usr/bin/env bash
set -euo pipefail

if [ -n "${SHRIMPY_WORKSPACE:-}" ]; then
  WORKSPACE_ROOT="${SHRIMPY_WORKSPACE}"
elif [ -n "${1:-}" ]; then
  WORKSPACE_ROOT="$1"
else
  WORKSPACE_ROOT="$(pwd)"
fi

node - "${WORKSPACE_ROOT}" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const [workspaceRoot] = process.argv.slice(2);
const errors = [];

function requireFile(filePath, label) {
  if (!fs.existsSync(filePath)) errors.push(`missing ${label}: ${filePath}`);
}

function requireDir(dirPath, label) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    errors.push(`missing ${label}: ${dirPath}`);
  }
}

function readJson(relativePath) {
  const filePath = path.join(workspaceRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    errors.push(`missing ${relativePath}: ${filePath}`);
    return undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (error) {
    errors.push(`invalid JSON in ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

const config = readJson("config/shrimpy.json");
const channels = readJson("config/channels.json");
readJson("agents/shrimpy/watches.json");
readJson("agents/mechanic/watches.json");

requireFile(path.join(workspaceRoot, "profile", "WORKSPACE.md"), "profile/WORKSPACE.md");
requireFile(path.join(workspaceRoot, "profile", "USER.md"), "profile/USER.md");
requireFile(path.join(workspaceRoot, "profile", "SYSTEM.md"), "profile/SYSTEM.md");
requireFile(path.join(workspaceRoot, "agents", "shrimpy", "SOUL.md"), "agents/shrimpy/SOUL.md");
requireFile(path.join(workspaceRoot, "agents", "mechanic", "SOUL.md"), "agents/mechanic/SOUL.md");
requireDir(path.join(workspaceRoot, "agents", "shrimpy", "vault"), "agents/shrimpy/vault");
requireDir(path.join(workspaceRoot, "agents", "mechanic", "vault"), "agents/mechanic/vault");

if (config) {
  const agentIds = Array.isArray(config.agents)
    ? config.agents.map((agent) => agent && agent.id)
    : [];
  if (!agentIds.includes("shrimpy")) errors.push("config/shrimpy.json must include the shrimpy agent");
  if (!agentIds.includes("mechanic")) errors.push("config/shrimpy.json must include the mechanic agent");
}

if (channels) {
  if (!channels.channels?.home?.agents?.shrimpy) errors.push("config/channels.json must include shrimpy in home");
  if (!channels.channels?.home?.agents?.mechanic) errors.push("config/channels.json must include mechanic in home");
  if (!channels.channels?.maintenance?.agents?.shrimpy) errors.push("config/channels.json must include shrimpy in maintenance");
  if (!channels.channels?.maintenance?.agents?.mechanic) errors.push("config/channels.json must include mechanic in maintenance");
}

if (errors.length > 0) {
  console.error("setup validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("setup validation passed");
NODE
