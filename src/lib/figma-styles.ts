import { floatToDimension, rgbaToHex, slugifyTokenKey } from "./color-utils";
import type {
  DesignTokens,
  GenerateOptions,
  ShadowToken,
  StyleSourceInfo,
  TokenDocumentation,
  TypographyToken,
} from "./types";

const FONT_WEIGHT_MAP: Record<string, number> = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  "extra light": 200,
  ultralight: 200,
  light: 300,
  regular: 400,
  normal: 400,
  book: 400,
  medium: 500,
  semibold: 600,
  "semi bold": 600,
  demibold: 600,
  bold: 700,
  extrabold: 800,
  "extra bold": 800,
  ultrabold: 800,
  black: 900,
  heavy: 900,
};

export interface StyleExtractionResult {
  typography: Record<string, TypographyToken>;
  colors: Record<string, string>;
  shadows: Record<string, ShadowToken>;
  styleSources: StyleSourceInfo[];
  tokenDocs: TokenDocumentation[];
  warnings: string[];
  counts: { textStyles: number; paintStyles: number; effectStyles: number };
}

function styleTokenKey(name: string, prefix: string): string {
  const slug = slugifyTokenKey(name);
  return `${prefix}.${slug}`;
}

function fontWeightFromStyle(styleName: string): number {
  const normalized = styleName.toLowerCase().trim();
  return FONT_WEIGHT_MAP[normalized] ?? 400;
}

function lineHeightValue(lineHeight: LineHeight, fontSize: number): string | number {
  if (lineHeight.unit === "AUTO") {
    return 1.2;
  }

  if (lineHeight.unit === "PERCENT") {
    return Math.round((lineHeight.value / 100) * 1000) / 1000;
  }

  if (fontSize > 0) {
    return Math.round((lineHeight.value / fontSize) * 1000) / 1000;
  }

  return floatToDimension(lineHeight.value);
}

function letterSpacingValue(letterSpacing: LetterSpacing): string {
  if (letterSpacing.unit === "PERCENT") {
    return `${letterSpacing.value}%`;
  }

  return floatToDimension(letterSpacing.value);
}

function variableRefFromAlias(
  alias: VariableAlias | undefined,
  variableById: Map<string, Variable>
): string | undefined {
  if (!alias) return undefined;
  const variable = variableById.get(alias.id);
  if (!variable) return undefined;
  return `{${slugifyTokenKey(variable.name)}}`;
}

export async function extractFigmaStyles(
  options: GenerateOptions,
  variableById: Map<string, Variable>
): Promise<StyleExtractionResult> {
  const warnings: string[] = [];
  const typography: Record<string, TypographyToken> = {};
  const colors: Record<string, string> = {};
  const shadows: Record<string, ShadowToken> = {};
  const styleSources: StyleSourceInfo[] = [];
  const tokenDocs: TokenDocumentation[] = [];

  if (!options.includeStyles) {
    return {
      typography,
      colors,
      shadows,
      styleSources,
      tokenDocs,
      warnings,
      counts: { textStyles: 0, paintStyles: 0, effectStyles: 0 },
    };
  }

  const [textStyles, paintStyles, effectStyles] = await Promise.all([
    figma.getLocalTextStylesAsync(),
    figma.getLocalPaintStylesAsync(),
    figma.getLocalEffectStylesAsync(),
  ]);

  for (const style of textStyles) {
    const tokenKey = styleTokenKey(style.name, "text-style");
    const bound = style.boundVariables;

    const typographyToken: TypographyToken = {
      fontFamily:
        variableRefFromAlias(bound?.fontFamily, variableById) ?? style.fontName.family,
      fontSize:
        variableRefFromAlias(bound?.fontSize, variableById) ??
        floatToDimension(style.fontSize),
      fontWeight:
        variableRefFromAlias(bound?.fontWeight, variableById) ??
        fontWeightFromStyle(style.fontName.style),
      lineHeight:
        variableRefFromAlias(bound?.lineHeight, variableById) ??
        lineHeightValue(style.lineHeight, style.fontSize),
      letterSpacing:
        variableRefFromAlias(bound?.letterSpacing, variableById) ??
        letterSpacingValue(style.letterSpacing),
    };

    if (style.textCase !== "ORIGINAL") {
      typographyToken.textCase = style.textCase;
    }

    if (style.textDecoration !== "NONE") {
      typographyToken.textDecoration = style.textDecoration;
    }

    typography[tokenKey] = typographyToken;
    styleSources.push({
      kind: "text",
      figmaName: style.name,
      tokenKey,
      description: style.description?.trim() || undefined,
    });

    tokenDocs.push({
      tokenKey,
      category: "typography",
      variableName: style.name,
      collectionName: "Text styles",
      value: typographyToken.fontSize ?? "",
      description: style.description?.trim() || undefined,
      isAlias: false,
      source: "text-style",
    });
  }

  for (const style of paintStyles) {
    const solid = style.paints.find((paint) => paint.type === "SOLID" && paint.visible !== false);

    if (!solid || solid.type !== "SOLID") {
      warnings.push(`Paint style "${style.name}" has no solid fill — skipped.`);
      continue;
    }

    const tokenKey = styleTokenKey(style.name, "paint-style");
    const color = rgbaToHex(solid.color);
    colors[tokenKey] = color;

    styleSources.push({
      kind: "paint",
      figmaName: style.name,
      tokenKey,
      description: style.description?.trim() || undefined,
    });

    tokenDocs.push({
      tokenKey,
      category: "colors",
      variableName: style.name,
      collectionName: "Paint styles",
      value: color,
      description: style.description?.trim() || undefined,
      isAlias: false,
      source: "paint-style",
    });
  }

  for (const style of effectStyles) {
    const dropShadow = style.effects.find(
      (effect) => effect.type === "DROP_SHADOW" && effect.visible !== false
    );

    if (!dropShadow || dropShadow.type !== "DROP_SHADOW") {
      warnings.push(`Effect style "${style.name}" has no drop shadow — skipped.`);
      continue;
    }

    const tokenKey = styleTokenKey(style.name, "effect-style");
    const shadow: ShadowToken = {
      color: rgbaToHex(dropShadow.color),
      offsetX: floatToDimension(dropShadow.offset.x),
      offsetY: floatToDimension(dropShadow.offset.y),
      blur: floatToDimension(dropShadow.radius),
      spread: floatToDimension(dropShadow.spread ?? 0),
    };

    shadows[tokenKey] = shadow;
    styleSources.push({
      kind: "effect",
      figmaName: style.name,
      tokenKey,
      description: style.description?.trim() || undefined,
    });

    tokenDocs.push({
      tokenKey,
      category: "shadows",
      variableName: style.name,
      collectionName: "Effect styles",
      value: shadow.blur,
      description: style.description?.trim() || undefined,
      isAlias: false,
      source: "effect-style",
    });
  }

  return {
    typography,
    colors,
    shadows,
    styleSources,
    tokenDocs,
    warnings,
    counts: {
      textStyles: textStyles.length,
      paintStyles: paintStyles.length,
      effectStyles: effectStyles.length,
    },
  };
}

export async function getStylePreviewCounts(): Promise<StyleExtractionResult["counts"]> {
  const [textStyles, paintStyles, effectStyles] = await Promise.all([
    figma.getLocalTextStylesAsync(),
    figma.getLocalPaintStylesAsync(),
    figma.getLocalEffectStylesAsync(),
  ]);

  return {
    textStyles: textStyles.length,
    paintStyles: paintStyles.length,
    effectStyles: effectStyles.length,
  };
}

export function mergeStyleTokens(
  tokens: DesignTokens,
  styles: Pick<StyleExtractionResult, "typography" | "colors" | "shadows">
): void {
  Object.assign(tokens.typography, styles.typography);
  Object.assign(tokens.colors, styles.colors);
  Object.assign(tokens.shadows, styles.shadows);
}
