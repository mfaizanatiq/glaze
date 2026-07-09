# Glaze — Figma plugin

**Glaze** turns your Figma file into agent-ready design context — variables, styles, components, and guidelines — exported as [`DESIGN.md`](https://github.com/google-labs-code/design.md).

Works with **Cursor**, **Claude**, **Windsurf**, **GitHub Copilot**, and any agent that reads project context files. Place `DESIGN.md` at your repo root alongside `AGENTS.md`.

## Why DESIGN.md?

| File | Who reads it | Purpose |
|---|---|---|
| `README.md` | Humans | What the project is |
| `AGENTS.md` | Coding agents | How to build the project |
| **`DESIGN.md`** | All agents | How the project should look and feel |

DESIGN.md is an [open specification](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md) (not tied to a single tool). Optional [W3C DTCG](https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/) export adds cross-platform `tokens.json` for Style Dictionary and other pipelines.

## What Glaze does

1. **Reads all local Figma variables** across every collection (default mode each)
2. **Includes Figma styles** — text styles as composite typography hyper tokens, paint styles as colors, effect styles as shadows
3. **Session capture** — visit library files, capture published components, merge into export
4. **Optional W3C DTCG export** — appends `tokens.json` (Format Module 2025.10)
5. Maps variables to DESIGN.md token groups with alias resolution
6. Generates YAML front matter + prose with versioning context and Figma descriptions

## Quick start

```bash
npm install
npm run build
```

### Install in Figma

1. Open **Figma Desktop**
2. **Plugins → Development → Import plugin from manifest…**
3. Select `manifest.json`
4. Run **Glaze**

### Use with your agent

1. Export and save as `DESIGN.md` in your project root
2. Add to agent rules or `AGENTS.md`:

   ```markdown
   Before generating or modifying UI, read and follow DESIGN.md for colors, typography, spacing, and components.
   ```

3. Validate:

   ```bash
   npx @google/design.md lint DESIGN.md
   ```

### Export options

| Toggle | What it exports |
|---|---|
| **All collections (default)** | Every variable collection, each using its default mode |
| **Include Figma styles** | Text → `text-style.*` composites; Paint → colors; Effect → shadows |
| **Session components** | Merged lookup tables from cached library files |
| **Include W3C DTCG** | Appends `tokens.json` with `$type` / `$value` per DTCG 2025.10 |
| **Generate prose** | Overview, versioning context, per-token descriptions |

## Variable naming conventions

| Figma path example | Maps to |
|---|---|
| `primary` (in Colors collection) | `colors.primary` |
| `spacing/md` | `spacing.md` |
| `rounded/lg` | `rounded.lg` |
| `typography/body-md/fontSize` | `typography.body-md.fontSize` |
| `button/primary/backgroundColor` | `components.button-primary.backgroundColor` |

## DESIGN.md format

Two layers per the [open spec](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md):

| Layer | Purpose |
|---|---|
| **YAML front matter** | Machine-readable tokens (hex, dimensions, typography) |
| **Markdown body** | Human-readable rationale and application guidance |

### Section order (when present)

Overview → Colors → Typography → Layout → Elevation & Depth → Shapes → Components → Do's and Don'ts

## Development

```bash
npm run watch
npm run typecheck
```

## References

- [DESIGN.md Specification](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md)
- [Open-source repo](https://github.com/google-labs-code/design.md)
- [W3C Design Tokens 2025.10](https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/)
- [Example DESIGN.md](./examples/DESIGN.md)
