# 🦐 SKILL-001: Web Fetch Action Skill Patterns

Status: todo
Priority: P2
Area: Skills
Depends On: [BROWSER-001](browser-001-default-browser-tool.md), [VAULT-001](vault-001-default-workspace-collections.md)

## Why

Some user requests are not just "research this" but "go do the repeatable web thing." Examples include finding a book by title, checking whether a document is available from a known source, pulling metadata from a public page, or using a small script/API call to fetch an allowed artifact.

Shrimpy should support these as ordinary skills: prompt guidance plus optional scripts/resources that explain which sites, APIs, `curl` calls, browser steps, or Python helpers to use. The goal is inspectable, reusable action recipes, not a hidden web automation brain.

## Build

- Define a pattern for action-oriented web skills under workspace or agent skill directories.
- Each skill should describe:
  - the user's natural request shape;
  - allowed sources and preferred order;
  - when to use browser automation, `curl`, an API, or a script;
  - what metadata to store;
  - where resulting files or notes should land in the shared vault;
  - what to report back to the user.
- Add a representative "book lookup/acquisition" skill example. For a request like `need this book <title>`, the skill should find lawful options such as library records, bookstore links, publisher pages, public-domain copies, or user-configured sources, then store a compact note under `vault/books/` or a request-specific research packet.
- Let skills include small scripts when a site/API has stable mechanics, but keep scripts optional and inspectable.
- Use [BROWSER-001](browser-001-default-browser-tool.md) for dynamic pages when available and plain HTTP/API/script paths when they are enough.
- Add a storage handoff to [VAULT-002](vault-002-main-agent-capture-research.md): action skills should write source metadata, timestamps, and output paths in the same capture style.
- Include guidance for asking the user before using paid services, accounts, credentials, or large downloads.

## Boundaries

- Do not build a general autonomous web agent for this item. Skills are explicit recipes around normal Shrimpy tools.
- Do not bypass paywalls, DRM, authentication, robots restrictions, license terms, or access controls.
- Do not download copyrighted books or other protected files from unauthorized sources. Prefer lawful sources, purchase/library options, public-domain files, or user-provided access.
- Do not store credentials or session cookies in skill output or vault notes.
- Do not make browser automation mandatory for base Shrimpy install.

## Done

- There is documented guidance for creating web-fetch action skills.
- At least one book-oriented example skill shows how to turn a natural request into lawful source lookup, metadata capture, and saved vault notes.
- Skills can choose between browser, `curl`, API calls, and scripts without hiding the mechanics from the user.
- Outputs follow the shared-vault capture conventions.
- Tests cover any seeded skill templates or helper scripts that ship with the repo.
