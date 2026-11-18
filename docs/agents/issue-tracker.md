# Issue tracker: Local Markdown

Issues and specs for this repo live as Markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`.
- The spec is `.scratch/<feature-slug>/spec.md`.
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`.
- Triage state is recorded as a `Status:` line near the top of each issue file.
- Comments and conversation history append under a `## Comments` heading.

## Skill operations

- To publish a spec or issue, create the corresponding file under `.scratch/<feature-slug>/`.
- To fetch a ticket, read the referenced file directly.
- A wayfinding map lives at `.scratch/<effort>/map.md`; child tickets live under its `issues/` directory.
- Blocking edges use `Blocked by: NN, NN`; tickets are ready when every blocker is resolved.

