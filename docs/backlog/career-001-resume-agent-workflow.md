# 🦐 CAREER-001: Career Agent Resume Workflow

Status: todo
Priority: P2
Area: Apps
Depends On: [VAULT-001](vault-001-default-workspace-collections.md)

## Why

`docs/musings/app-habitats.md` uses `shrimpy-career` as the motivating example for app-agent habitats, but there is no active backlog item for the concrete workflow: send Shrimpy a job posting URL, have a career agent ingest and store it, then produce a tailored resume as Markdown and PDF from the posting plus the user's career context.

This should start as a mostly prompt/template-driven agent pattern with a small amount of reusable code for document rendering, templates, and predictable file layout. It should prove the app-agent path without creating a separate career runtime.

## Build

- Add an optional `career` app-agent pattern that can be created or recommended by setup/mechanic guidance.
- Seed career-specific agent instructions and skills for:
  - ingesting a job posting URL;
  - saving a timestamped copy of the posting and extraction notes;
  - reading user career context files;
  - drafting a tailored resume;
  - rendering the resume to Markdown and PDF.
- Use a predictable storage layout, likely under the shared vault convention: `vault/career/applications/<YYYY-MM-DD>-<company>-<role>/`.
- For each posting, store at minimum:
  - `posting.md` with source URL, retrieval timestamp, role, company, location, compensation if visible, and normalized posting text;
  - `notes.md` for fit analysis, gaps, and user guidance;
  - `resume.md` for the generated resume;
  - `resume.pdf` for the rendered artifact.
- Add starter career context files for user-owned facts and preferences, such as `career/profile.md`, `career/experience.md`, `career/projects.md`, `career/preferences.md`, and `career/resume-guidance.md`. The exact path can live in `vault/career/` or agent context, but the split should be clear: durable user career facts are user-owned, while agent working notes are agent-owned.
- Add a generic Markdown document rendering CLI before relying on hidden code, for example `shrimpy docs render <input.md> --pdf <output.pdf> --template resume`.
- Ship a small resume template and print stylesheet suitable for Markdown to PDF output.
- Keep the career skill responsible for orchestration: ingest, inspect context, ask for missing guidance when needed, write Markdown, render PDF, and report saved paths.
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
- This can serve as the first serious app-agent example after [APP-001](app-001.md) documents app/config patterns.
- Useful channels may include `career` for user requests and `career-log` for background maintenance, but the first slice can work from direct sessions.
- The renderer should be useful outside career workflows; resume is just the first template.

## Done

- A user can send a job posting URL or posting text to the career agent and get a timestamped application folder.
- The posting is saved with source URL and retrieval timestamp.
- The generated resume exists as both `resume.md` and `resume.pdf`.
- The career agent uses user career context and explicit guidance while refusing to invent unsupported facts.
- The document renderer is reachable through a `shrimpy <command>` CLI path.
- Tests cover storage path generation, renderer CLI behavior, template selection, missing renderer/browser diagnostics, and non-overwrite behavior.
