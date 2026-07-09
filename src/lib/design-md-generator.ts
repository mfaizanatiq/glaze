import { indentYaml, toYamlScalar } from "./color-utils";
import { DTCG_SPEC_VERSION, exportDtcgTokens } from "./dtcg-exporter";
import {
  captureComponentsInCurrentFile,
  componentSourceRows,
  mergeSessionComponentsIntoTokens,
} from "./figma-components";
import { extractFigmaStyles, mergeStyleTokens } from "./figma-styles";
import { getSessionComponents, loadSession } from "./session-cache";
import type {
  ComponentSourceRow,
  DesignTokens,
  ExportContext,
  ExportResult,
  GenerateOptions,
  ShadowToken,
  TokenCategory,
  TokenDocumentation,
  TypographyToken,
} from "./types";
import { extractDesignTokens } from "./figma-variables";

export { captureComponentsInCurrentFile };
export {
  captureCurrentFileToSession,
  clearSession,
  getSessionSummaries,
  removeSessionFile,
} from "./session-cache";

export async function generateDesignMd(
  options: GenerateOptions
): Promise<ExportResult> {
  const variableResult = await extractDesignTokens(options);
  const { tokens, warnings, context } = variableResult;

  const variableById = new Map(
    (await figma.variables.getLocalVariablesAsync()).map((variable) => [variable.id, variable])
  );

  const styleResult = await extractFigmaStyles(options, variableById);
  warnings.push(...styleResult.warnings);
  mergeStyleTokens(tokens, styleResult);

  let componentSources: ComponentSourceRow[] = [];
  if (options.includeSessionComponents) {
    const sessionEntries = await getSessionComponents(options.sessionFileKeys);
    const allSessionComponents = sessionEntries.flatMap((item) => item.components);
    mergeSessionComponentsIntoTokens(tokens, allSessionComponents);
    componentSources = componentSourceRows(sessionEntries);
    if (allSessionComponents.length === 0) {
      warnings.push("Session cache is empty — capture components from library files first.");
    }
  }

  const sessionCache = await loadSession();

  context.includeStyles = options.includeStyles;
  context.includeDtcg = options.includeDtcg;
  context.includeSessionComponents = options.includeSessionComponents;
  context.dtcgVersion = DTCG_SPEC_VERSION;
  context.styles = styleResult.counts;
  context.styleSources = styleResult.styleSources;
  context.componentSources = componentSources;
  context.sessionFileCount = Object.keys(sessionCache.files).length;
  context.tokenDocs = [...context.tokenDocs, ...styleResult.tokenDocs].sort((a, b) =>
    a.tokenKey.localeCompare(b.tokenKey)
  );

  tokens.description = buildYamlDescription(options, context);

  const yaml = renderYamlFrontMatter(tokens);
  const body = options.includeProse
    ? renderProseSections(tokens, context)
    : renderMinimalProse(tokens, context);

  let markdown = `${yaml}\n\n${body}\n`;
  let tokensJson: string | undefined;

  if (options.includeDtcg) {
    tokensJson = exportDtcgTokens(tokens, context.tokenDocs);
    markdown += renderDtcgAppendix(tokensJson, context);
  }

  return {
    markdown,
    tokensJson,
    stats: {
      colors: Object.keys(tokens.colors).length,
      typography: Object.keys(tokens.typography).length,
      spacing: Object.keys(tokens.spacing).length,
      rounded: Object.keys(tokens.rounded).length,
      components: Object.keys(tokens.components).length,
      shadows: Object.keys(tokens.shadows).length,
      other: Object.keys(tokens.other).length,
      aliases: context.tokenDocs.filter((doc) => doc.isAlias).length,
      textStyles: styleResult.counts.textStyles,
      paintStyles: styleResult.counts.paintStyles,
      effectStyles: styleResult.counts.effectStyles,
    },
    warnings,
    context,
  };
}

function buildYamlDescription(
  options: GenerateOptions,
  context: ExportContext
): string {
  if (options.description?.trim()) {
    return options.description.trim();
  }

  const collectionSummary = context.collections
    .map((collection) => collection.name)
    .join(", ");

  const modeSummary =
    context.modeStrategy === "named-mode" && context.activeModeName
      ? `Mode "${context.activeModeName}" applied across collections.`
      : "Default mode used for each collection.";

  const styleSummary = context.includeStyles
    ? ` Includes ${context.styles.textStyles} text style(s), ${context.styles.paintStyles} paint style(s), and ${context.styles.effectStyles} effect style(s) as composite tokens.`
    : "";

  const dtcgSummary = context.includeDtcg
    ? ` W3C DTCG ${context.dtcgVersion} tokens.json appendix included.`
    : "";

  return [
    `DESIGN.md design system exported from Figma file "${context.figmaFileName}".`,
    `Synced ${context.collections.length} variable collection(s): ${collectionSummary}.`,
    modeSummary + styleSummary + dtcgSummary,
    `DESIGN.md spec version: ${context.specVersion}.`,
  ].join(" ");
}

function renderYamlFrontMatter(tokens: DesignTokens): string {
  const lines: string[] = ["---"];

  lines.push(`version: ${toYamlScalar(tokens.version ?? "alpha")}`);
  lines.push(`name: ${toYamlScalar(tokens.name)}`);

  if (tokens.description) {
    lines.push(`description: ${toYamlScalar(tokens.description)}`);
  }

  if (Object.keys(tokens.colors).length > 0) {
    lines.push("colors:");
    for (const [key, value] of Object.entries(tokens.colors)) {
      lines.push(`  ${key}: ${toYamlScalar(value)}`);
    }
  }

  if (Object.keys(tokens.typography).length > 0) {
    lines.push("typography:");
    for (const [key, style] of Object.entries(tokens.typography)) {
      lines.push(`  ${key}:`);
      lines.push(indentYaml(renderTypography(style), 4));
    }
  }

  if (Object.keys(tokens.rounded).length > 0) {
    lines.push("rounded:");
    for (const [key, value] of Object.entries(tokens.rounded)) {
      lines.push(`  ${key}: ${toYamlScalar(value)}`);
    }
  }

  if (Object.keys(tokens.spacing).length > 0) {
    lines.push("spacing:");
    for (const [key, value] of Object.entries(tokens.spacing)) {
      lines.push(`  ${key}: ${toYamlScalar(value)}`);
    }
  }

  if (Object.keys(tokens.shadows).length > 0) {
    lines.push("shadows:");
    for (const [name, shadow] of Object.entries(tokens.shadows)) {
      lines.push(`  ${name}:`);
      lines.push(indentYaml(renderShadowYaml(shadow), 4));
    }
  }

  if (Object.keys(tokens.components).length > 0) {
    lines.push("components:");
    for (const [name, component] of Object.entries(tokens.components)) {
      lines.push(`  ${name}:`);
      for (const [prop, value] of Object.entries(component)) {
        lines.push(`    ${prop}: ${toYamlScalar(value)}`);
      }
    }
  }

  lines.push("---");
  return lines.join("\n");
}

function renderTypography(style: TypographyToken): string {
  const order = [
    "fontFamily",
    "fontSize",
    "fontWeight",
    "lineHeight",
    "letterSpacing",
    "textCase",
    "textDecoration",
    "fontFeature",
    "fontVariation",
  ] as const;

  return order
    .filter((key) => style[key] !== undefined)
    .map((key) => `${key}: ${toYamlScalar(style[key]!)}`)
    .join("\n");
}

function renderShadowYaml(shadow: ShadowToken): string {
  const lines = [
    `color: ${toYamlScalar(shadow.color)}`,
    `offsetX: ${toYamlScalar(shadow.offsetX)}`,
    `offsetY: ${toYamlScalar(shadow.offsetY)}`,
    `blur: ${toYamlScalar(shadow.blur)}`,
    `spread: ${toYamlScalar(shadow.spread)}`,
  ];

  if (shadow.inset) {
    lines.push("inset: true");
  }

  return lines.join("\n");
}

function renderDtcgAppendix(tokensJson: string, context: ExportContext): string {
  return [
    "",
    "## W3C DTCG Export",
    "",
    `This appendix contains a [\`tokens.json\`](https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/) export following the **W3C Design Tokens Format Module ${context.dtcgVersion}**.`,
    "",
    "DTCG tokens use `$type` and `$value` properties and support composite types such as `typography` and `shadow`. Use this file with tools like Style Dictionary, Terrazzo, or `npx @google/design.md export`.",
    "",
    "```json",
    tokensJson.trimEnd(),
    "```",
    "",
  ].join("\n");
}

function renderMinimalProse(tokens: DesignTokens, context: ExportContext): string {
  return [
    `# ${tokens.name}`,
    "",
    "## Overview",
    "",
    renderVersioningContext(context),
    "",
    tokens.description ?? "",
  ].join("\n");
}

function renderProseSections(tokens: DesignTokens, context: ExportContext): string {
  const sections: string[] = [`# ${tokens.name}`, "", "## Overview", ""];

  sections.push(renderVersioningContext(context));
  sections.push("");
  sections.push(
    userDescription(tokens.description) ||
      "Refine this overview to describe brand personality, target audience, and the emotional tone the interface should convey."
  );

  sections.push("", describeColors(tokens, context));
  sections.push("", describeTypography(tokens, context));
  sections.push("", describeLayout(tokens, context));
  sections.push("", describeElevation(tokens, context));
  sections.push("", describeShapes(tokens, context));
  sections.push("", describeComponents(tokens, context));
  sections.push("", describeDosAndDonts(context));

  if (context.includeStyles) {
    sections.push("", describeFigmaStyles(context));
  }

  if (context.includeSessionComponents && context.componentSources.length > 0) {
    sections.push("", describeSessionComponents(context));
  }

  return sections.join("\n");
}

function userDescription(description?: string): string | undefined {
  if (!description) return undefined;
  if (description.startsWith("DESIGN.md design system exported from Figma file")) {
    return undefined;
  }
  return description;
}

function renderVersioningContext(context: ExportContext): string {
  const exportedDate = formatExportDate(context.exportedAt);
  const collectionLines = context.collections
    .map(
      (collection) =>
        `- **${collection.name}** — ${collection.variableCount} variable(s), active mode: \`${collection.activeMode}\``
    )
    .join("\n");

  const modeLine =
    context.modeStrategy === "named-mode" && context.activeModeName
      ? `All collections synced using the **${context.activeModeName}** mode where defined.`
      : "All collections synced using each collection's **default mode**.";

  const styleLine = context.includeStyles
    ? `- **Figma styles:** ${context.styles.textStyles} text, ${context.styles.paintStyles} paint, ${context.styles.effectStyles} effect — exported as composite typography, color, and shadow tokens.`
    : "- **Figma styles:** not included in this export.";

  const dtcgLine = context.includeDtcg
    ? `- **W3C DTCG:** \`tokens.json\` appendix included (Format Module ${context.dtcgVersion}).`
    : "- **W3C DTCG:** not included — enable the toggle in the plugin to append a `tokens.json` export.";

  return [
    "### Format & versioning",
    "",
    "This file follows the open [DESIGN.md specification](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md) — a vendor-neutral design context format readable by any AI agent (Cursor, Claude, Windsurf, Copilot, and others).",
    "",
    `- **DESIGN.md spec version (\`version\` in YAML):** \`${context.specVersion}\` — token schema version, not your product release number.`,
    `- **Exported from Figma:** \`${context.figmaFileName}\``,
    `- **Export date:** ${exportedDate}`,
    `- **Mode strategy:** ${modeLine}`,
    styleLine,
    dtcgLine,
    "",
    "### Agent compatibility",
    "",
    "This file is tool-agnostic. Any agent that reads repository context can use it — including **Cursor**, **Claude Code**, **Windsurf**, **GitHub Copilot**, and custom agent setups. Recommended: keep `DESIGN.md` at the repo root and reference it from `AGENTS.md` or project rules.",
    "",
    "### Collections synced",
    "",
    collectionLines,
    "",
    "YAML tokens are normative values. Prose explains _why_ and _how_ to apply them. Place this file at your repo root alongside `AGENTS.md` so coding agents pick up design rules automatically.",
  ].join("\n");
}

function formatExportDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return iso;
  }
}

function docsForCategory(
  context: ExportContext,
  category: TokenCategory
): TokenDocumentation[] {
  return context.tokenDocs.filter((doc) => doc.category === category);
}

function describeTokenLine(doc: TokenDocumentation): string {
  const label = formatTokenLabel(doc.tokenKey);
  const value = typeof doc.value === "string" ? doc.value : String(doc.value);
  const sourceNote =
    doc.source === "text-style"
      ? " [text style composite]"
      : doc.source === "paint-style"
        ? " [paint style]"
        : doc.source === "effect-style"
          ? " [effect style]"
          : doc.isAlias
            ? " (alias)"
            : "";

  if (doc.description) {
    return `- **${label}** (\`${doc.tokenKey}\`, ${value}${sourceNote}): ${doc.description}`;
  }

  return `- **${label}** (\`${doc.tokenKey}\`, ${value}${sourceNote}): Token from \`${doc.collectionName}\`.`;
}

function describeColors(tokens: DesignTokens, context: ExportContext): string {
  const lines = ["## Colors", "", "Color palette from Figma variables and paint styles.", ""];

  const docs = docsForCategory(context, "colors");
  if (docs.length === 0) {
    lines.push("_No color tokens found._");
    return lines.join("\n");
  }

  for (const doc of docs.slice(0, 24)) {
    lines.push(describeTokenLine(doc));
  }

  if (docs.length > 24) {
    lines.push(`- _…and ${docs.length - 24} more color tokens in the YAML front matter._`);
  }

  return lines.join("\n");
}

function describeTypography(tokens: DesignTokens, context: ExportContext): string {
  const lines = [
    "## Typography",
    "",
    "Typography from Figma variables and **text styles** (composite hyper tokens bundling family, size, weight, line-height, and letter-spacing).",
    "",
  ];

  const entries = Object.entries(tokens.typography);
  if (entries.length === 0) {
    lines.push("_No typography tokens found._");
    return lines.join("\n");
  }

  for (const [name, style] of entries) {
    const doc = context.tokenDocs.find(
      (item) => item.tokenKey === name && item.category === "typography"
    );
    const family = style.fontFamily ?? "system font";
    const size = style.fontSize ?? "inherit";
    const weight = style.fontWeight ?? 400;
    const source =
      doc?.source === "text-style" ? " Composite text style from Figma." : " From variables.";
    const description = doc?.description ? ` ${doc.description}` : source;

    lines.push(
      `- **${name}**: ${family}, weight ${weight}, size ${size}${style.lineHeight ? `, line-height ${style.lineHeight}` : ""}.${description}`
    );
  }

  return lines.join("\n");
}

function describeLayout(tokens: DesignTokens, context: ExportContext): string {
  const lines = ["## Layout", "", "Spacing scale from Figma number variables.", ""];

  const docs = docsForCategory(context, "spacing");
  if (docs.length === 0) {
    lines.push("_No spacing variables found._");
    return lines.join("\n");
  }

  for (const doc of docs.slice(0, 20)) {
    lines.push(describeTokenLine(doc));
  }

  return lines.join("\n");
}

function describeElevation(tokens: DesignTokens, context: ExportContext): string {
  const shadowDocs = docsForCategory(context, "shadows");

  if (shadowDocs.length === 0) {
    return [
      "## Elevation & Depth",
      "",
      "Describe how visual hierarchy is conveyed — shadows, tonal layers, or flat borders.",
      "",
      "_No effect styles exported. Enable Figma styles in the plugin to sync shadow composites._",
    ].join("\n");
  }

  const lines = [
    "## Elevation & Depth",
    "",
    "Shadow composites synced from Figma effect styles.",
    "",
  ];

  for (const doc of shadowDocs) {
    lines.push(describeTokenLine(doc));
  }

  return lines.join("\n");
}

function describeShapes(tokens: DesignTokens, context: ExportContext): string {
  const lines = ["## Shapes", "", "Corner radius tokens from Figma variables.", ""];

  const docs = docsForCategory(context, "rounded");
  if (docs.length === 0) {
    lines.push("_No radius variables found._");
    return lines.join("\n");
  }

  for (const doc of docs) {
    lines.push(describeTokenLine(doc));
  }

  return lines.join("\n");
}

function describeComponents(tokens: DesignTokens, context: ExportContext): string {
  const lines = ["## Components", ""];

  const entries = Object.entries(tokens.components);
  if (entries.length === 0) {
    lines.push("_No component tokens found._");
    return lines.join("\n");
  }

  for (const [name, props] of entries) {
    lines.push(`### ${formatComponentTitle(name)}`);
    lines.push("");
    for (const [prop, value] of Object.entries(props)) {
      lines.push(`- **${prop}**: ${value}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function describeSessionComponents(context: ExportContext): string {
  const lines = [
    "## Component sourcing",
    "",
    "Lookup tables captured from library files in your session cache. Token references point to values in the **current file** export.",
    "",
    "| Component | Source file | Token key | Bindings |",
    "|---|---|---|---|",
  ];

  for (const row of context.componentSources) {
    lines.push(
      `| ${row.name} | ${row.fileName} | \`${row.tokenKey}\` | ${row.tokenCount} |`
    );
  }

  return lines.join("\n");
}

function describeFigmaStyles(context: ExportContext): string {
  if (context.styleSources.length === 0) {
    return [
      "## Figma Styles",
      "",
      "_No local text, paint, or effect styles found in this file._",
    ].join("\n");
  }

  const lines = [
    "## Figma Styles",
    "",
    "Composite tokens derived from Figma local styles. Text styles map to `typography` hyper tokens; paint styles to `colors`; effect styles to `shadows`.",
    "",
  ];

  for (const source of context.styleSources) {
    const kindLabel =
      source.kind === "text"
        ? "Text style"
        : source.kind === "paint"
          ? "Paint style"
          : "Effect style";
    const note = source.description ? ` — ${source.description}` : "";
    lines.push(`- **${kindLabel}:** \`${source.figmaName}\` → token \`${source.tokenKey}\`${note}`);
  }

  return lines.join("\n");
}

function describeDosAndDonts(context: ExportContext): string {
  return [
    "## Do's and Don'ts",
    "",
    "- Do place `DESIGN.md` at the repo root next to `AGENTS.md` / `README.md` for agent discovery",
    "- Do reference this file in agent instructions: _\"Follow DESIGN.md for all UI work\"_",
    "- Do use text style composites (`text-style.*`) for full typographic roles instead of mixing partial variable tokens",
    "- Do keep `version: alpha` until you intentionally migrate to a newer DESIGN.md spec",
    "- Do re-export when variables or styles change, then run `npx @google/design.md lint DESIGN.md`",
    context.includeDtcg
      ? "- Do use the DTCG `tokens.json` appendix with Style Dictionary or other W3C-compatible tooling"
      : "- Do enable W3C DTCG export when you need `tokens.json` for cross-tool pipelines",
    "- Don't hardcode hex values when a token or style composite exists",
    "- Do maintain WCAG AA contrast ratios (4.5:1 for normal text)",
  ].join("\n");
}

function formatTokenLabel(tokenKey: string): string {
  return tokenKey
    .split(/[.-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatComponentTitle(name: string): string {
  return formatTokenLabel(name);
}
