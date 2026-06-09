#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -n "${SHRIMPY_WORKSPACE:-}" ]; then
  WORKSPACE_ROOT="${SHRIMPY_WORKSPACE}"
elif [ -f "config/shrimpy.json" ]; then
  WORKSPACE_ROOT="$(pwd)"
elif [ -f "${SCRIPT_DIR}/../../../../../config/shrimpy.json" ]; then
  WORKSPACE_ROOT="$(cd "${SCRIPT_DIR}/../../../../.." && pwd)"
else
  WORKSPACE_ROOT="$(pwd)"
fi

CONFIG_PATH="${WORKSPACE_ROOT}/config/shrimpy.json"
CHANNELS_PATH="${WORKSPACE_ROOT}/config/channels.json"
WATCHES_PATH="${WORKSPACE_ROOT}/agents/shrimpy/watches.json"

node - "${WORKSPACE_ROOT}" "${CONFIG_PATH}" "${CHANNELS_PATH}" "${WATCHES_PATH}" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const [workspaceRoot, configPath, channelsPath, watchesPath] = process.argv.slice(2);
const errors = [];

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    errors.push(`missing ${label}: ${filePath}`);
    return undefined;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`invalid JSON in ${label}: ${message}`);
    return undefined;
  }
}

function requireFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    errors.push(`missing ${label}: ${filePath}`);
  }
}

function requireDir(dirPath, label) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    errors.push(`missing ${label}: ${dirPath}`);
  }
}

const config = readJson(configPath, "config/shrimpy.json");
const channels = readJson(channelsPath, "config/channels.json");
const watches = readJson(watchesPath, "agents/shrimpy/watches.json");

requireFile(path.join(workspaceRoot, "profile", "WORKSPACE.md"), "profile/WORKSPACE.md");
requireFile(path.join(workspaceRoot, "profile", "USER.md"), "profile/USER.md");
requireFile(path.join(workspaceRoot, "profile", "SYSTEM.md"), "profile/SYSTEM.md");
requireDir(path.join(workspaceRoot, "vault"), "vault");
requireDir(path.join(workspaceRoot, "projects"), "projects");
requireFile(path.join(workspaceRoot, "agents", "shrimpy", "SOUL.md"), "agents/shrimpy/SOUL.md");
requireDir(path.join(workspaceRoot, "agents", "shrimpy", "context"), "agents/shrimpy/context");
requireFile(path.join(workspaceRoot, "agents", "mechanic", "SOUL.md"), "agents/mechanic/SOUL.md");
requireDir(path.join(workspaceRoot, "agents", "mechanic", "context"), "agents/mechanic/context");
requireDir(path.join(workspaceRoot, "agents", "shrimpy", "vault"), "agents/shrimpy/vault");

if (config) {
  if (!Array.isArray(config.agents) || config.agents.length === 0) {
    errors.push("config/shrimpy.json must define at least one agent");
  } else {
    if (!config.agents.some((agent) => agent && agent.id === "shrimpy")) {
      errors.push("config/shrimpy.json must include the shrimpy agent");
    }
    if (!config.agents.some((agent) => agent && agent.id === "mechanic")) {
      errors.push("config/shrimpy.json must include the mechanic agent");
    }
  }
  for (const agent of config.agents ?? []) {
    if (Array.isArray(agent?.tools) && agent.tools.includes("memory")) {
      errors.push(`agent ${agent.id || "(unknown)"} must not use the removed memory daemon tool`);
    }
  }

  if (!config.context || !Array.isArray(config.context.sources)) {
    errors.push("config/shrimpy.json must define context.sources");
  } else {
    for (const required of [
      "workspace:profile/WORKSPACE.md",
      "workspace:profile/SYSTEM.md",
      "agent:SOUL.md",
      "workspace:profile/USER.md",
      "agent:context/",
    ]) {
      if (!config.context.sources.includes(required)) {
        errors.push(`context.sources must include ${required}`);
      }
    }
  }

  if (!config.watchClock || typeof config.watchClock.tickIntervalMs !== "number") {
    errors.push("config/shrimpy.json must define watchClock.tickIntervalMs");
  }
  if (!config.watchClock || typeof config.watchClock.defaultTimezone !== "string") {
    errors.push("config/shrimpy.json must define watchClock.defaultTimezone");
  }
}

if (channels) {
  const homeAgents = channels.channels?.home?.agents;
  if (!homeAgents || typeof homeAgents !== "object" || Array.isArray(homeAgents) || !homeAgents.shrimpy || !homeAgents.mechanic) {
    errors.push("config/channels.json must keep shrimpy and mechanic in home");
  }
  const maintenanceAgents = channels.channels?.maintenance?.agents;
  if (!maintenanceAgents || typeof maintenanceAgents !== "object" || Array.isArray(maintenanceAgents) || !maintenanceAgents.shrimpy || !maintenanceAgents.mechanic) {
    errors.push("config/channels.json must keep shrimpy and mechanic in maintenance");
  }
}

if (watches) {
  if (!Array.isArray(watches) || watches.length === 0) {
    errors.push("agents/shrimpy/watches.json must define at least one watch");
  } else {
    for (const required of [
      "memory-management",
      "journal-daily",
      "journal-compact",
    ]) {
      if (!watches.some((watch) => watch && watch.id === required)) {
        errors.push(`agents/shrimpy/watches.json must include ${required}`);
      }
    }
    for (const watch of watches) {
      if (watch?.trigger?.kind !== "time") {
        errors.push(`watch ${watch?.id || "(unknown)"} must use trigger.kind = "time"`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error("setup validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("setup validation passed");
NODE
