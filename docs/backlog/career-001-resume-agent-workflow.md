# 🦐 CAREER-001: Career Agent Resume Workflow

Status: todo
Priority: P2
Area: Apps
Depends On: none

## Why

`docs/musings/app-habitats.md` uses `shrimpy-career` as the motivating example for app-agent habitats, but there is no active backlog item for the concrete workflow: send Shrimpy a job posting URL, have a career agent ingest and store it, then produce a tailored resume as Markdown and PDF from the posting plus the user's career context.

This should start as a mostly prompt/template-driven agent pattern with a small amount of reusable code for document rendering, templates, and predictable file layout. The local `career` agent is good enough to use as the pattern: a normal Shrimpy agent with a user-owned career corpus in its vault, agent-owned operating notes in `context/`, focused Markdown skills, one folder per opportunity, and a local Markdown-to-PDF renderer skill that can later graduate to a shared CLI command. It should prove the app-agent path without creating a separate career runtime.

## Build

- Add an optional `career` app-agent pattern that can be created or recommended by setup/mechanic guidance.
- Seed `agents/career/SOUL.md` with a scoped career-agent identity: maintain the career corpus, save source material before analysis, ask for missing facts, preserve artifacts, and keep external actions behind explicit user approval.
- Seed lightweight agent-owned operating notes under `agents/career/context/` only when there is real context worth always loading. Use `workspace-map.md` for the file layout and `memory.md` for current prototype notes that do not belong in durable user career facts.
- Seed focused career skills instead of one large workflow skill:
  - `career-profile-maintenance` for maintaining durable user facts and preferences;
  - `application-intake` for job posting capture and opportunity folder creation;
  - `application-materials` for resumes and cover letters;
  - `application-tracking` for `status.md`, pipeline reviews, and the applications index;
  - `resume-pdf` for converting an application folder's `resume.md` into `resume.pdf`.
- Use the proven storage layout under the career agent's vault: `agents/career/vault/career/`.
- Store durable user career source files at the top of that corpus:
  - `README.md` for layout and ground rules;
  - `profile.md` for current target roles, headline, location/remote preferences, and profile links if the user wants them there;
  - `experience.md` for employment history, responsibilities, achievements, tools, evidence, and uncertainties;
  - `projects.md` for project inventory, stack, outcomes, links, and resume-safe bullets;
  - `preferences.md` for job-search preferences, constraints, dealbreakers, compensation preferences if the user chooses to record them, and industry preferences;
  - `resume-guidance.md` for voice, formatting, tailoring rules, bullets to favor/avoid, and claims that need careful handling;
  - `questions.md` for missing facts, unresolved dates, metrics to confirm, and decisions the user still needs to make;
  - `sources/` for user-provided source extracts when useful.
- Use one opportunity folder per posting: `agents/career/vault/career/applications/<YYYY-MM-DD>-<company-slug>-<role-slug>/`.
- For each posting, store at minimum:
  - `posting.md` with source URL, retrieval timestamp, role, company, location, compensation if visible, and normalized posting text;
  - `notes.md` for fit analysis, gaps, and user guidance;
  - `status.md` for current state, important dates, next action, contacts if the user wants to record them, source links, and a short event log;
  - `resume.md` for the generated resume;
  - `resume.pdf` for the rendered artifact.
- Treat `cover-letter.md`, `interview-prep.md`, and numbered draft revisions such as `resume-v2.md` as optional artifacts.
- Include `agents/career/vault/career/applications/README.md` as a lightweight active/recent index and `agents/career/vault/career/applications/_template/` with starter `posting.md`, `notes.md`, `status.md`, `resume.md`, `cover-letter.md`, and `interview-prep.md`.
- Add an inspectable `shrimpy <command>` path for Markdown-to-PDF rendering before relying on hidden code. The current local pattern uses a skill-owned renderer with MarkdownIt, Puppeteer, plain CSS styles, `--style`, `--debug-html`, and no overwrite unless `--force`; preserve those semantics when promoting it.
- Ship a small resume template and print stylesheet suitable for Markdown to PDF output. Keep page size and margins in CSS so template styles stay inspectable.
- Keep the career skills responsible for orchestration: ingest, inspect context, ask for missing guidance when needed, write Markdown, render PDF, and report saved paths.
- Use whatever URL ingestion capability is available for robust posting capture. Before that exists, the workflow can accept pasted posting text or a manually saved posting file.
- Add light agent guidance to commit kept career artifacts in the vault repo when the user says they want to preserve a version.

## Boundaries

- Do not fabricate credentials, employers, dates, degrees, projects, metrics, clearances, publications, or tools. Missing facts belong in `notes.md` or a question to the user, not in the resume.
- Do not auto-apply to jobs, submit forms, message recruiters, or upload resumes as part of this item.
- Do not add a separate app runtime. Career is a normal Shrimpy agent/app pattern using channels, skills, files, and CLI commands.
- Do not make browser automation or PDF rendering mandatory for base Shrimpy install. Diagnose missing optional capabilities and keep the pasted-text path usable.
- Do not store credentials, logged-in job-board cookies, or private browser state in career files.
- Do not make generated resumes overwrite prior artifacts without preserving or clearly naming versions.

## Notes

- Related musing: [../musings/app-habitats.md](../musings/app-habitats.md).
- This can serve as the first serious app-agent example now that `shrimpy-search` establishes all-agent search-before-invent guidance and focused skills own workflow actions.
- Useful channels may include `career` for user requests and `career-log` for background maintenance, but the first slice can work from direct sessions.
- The renderer should be useful outside career workflows; resume is just the first template.
- The live local career agent pattern works as an implementation sketch, but the shipped version should avoid embedding user-specific names or career facts in tracked templates.

## Done

- A user can send a job posting URL or posting text to the career agent and get a timestamped application folder.
- The posting is saved with source URL and retrieval timestamp.
- The application folder includes `posting.md`, `notes.md`, and `status.md`, with optional material drafts kept in predictable filenames.
- The career corpus includes top-level profile, experience, projects, preferences, resume guidance, questions, sources, applications index, and application template files.
- The generated resume exists as both `resume.md` and `resume.pdf`.
- The career agent uses user career context and explicit guidance while refusing to invent unsupported facts.
- The document renderer is reachable through a `shrimpy <command>` CLI path.
- Tests cover storage path generation, application template creation, renderer CLI behavior, template/style selection, missing renderer/browser diagnostics, and non-overwrite behavior.
