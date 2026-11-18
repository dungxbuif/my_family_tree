# Gia Phả — UI handoff package (Heritage Modern v2.0)

**Entry point:** [`DESIGN.md`](./DESIGN.md).

```
DESIGN.md                    Approved visual direction, screens, UX behavior, acceptance criteria
README.md                    Package map
assets/mockups/              4 generated PNG screens (visual references)
assets/icons/                Brand tree, branch, leaf original SVGs
assets/illustrations/        Empty genealogy tree illustration SVG
tokens/design-tokens.json    Design tokens (machine readable)
tokens/theme.css             CSS variables for web
```

## How to use

1. Give `DESIGN.md` to the developer/AI agent as the canonical design brief.
2. Build base theme from `tokens/`; import vector assets as images/components.
3. Use mockup PNGs as canonical visual-regression baselines at the 430×932 content viewport. They may contain illustrative relationships or outdated dates, so copy visual composition—not factual sample data.
4. Implement the data and relationship rules in `DESIGN.md` before reproducing the family tree diagram literally.
5. Complete the "Design QA checklist" in `DESIGN.md` before accepting the UI.

**Locked direction:** forest green + warm ivory + antique gold, gentle cards, family photos, clean multi-generation tree.

This complete handoff package is stored in the repository. `app/globals.css`
mirrors the semantic tokens and maps legacy Tailwind palette aliases onto the
same Heritage Modern values so every existing route receives the new theme.

**Fonts:** the documents suggest Be Vietnam Pro and Noto Serif; font binaries are **not bundled**. Obtain them through their official distributors and review font licenses before embedding.
