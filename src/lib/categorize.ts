import type { TokenCategory } from "./types";
import { slugifyTokenKey } from "./color-utils";

const COLOR_HINTS = ["color", "colour", "palette", "semantic", "theme"];
const SPACING_HINTS = ["spacing", "space", "gap", "margin", "padding", "size"];
const ROUNDED_HINTS = ["radius", "rounded", "corner", "border"];
const TYPO_HINTS = ["typography", "type", "font", "text"];
const COMPONENT_HINTS = ["component", "button", "input", "card", "chip", "badge"];

const TYPO_FIELDS = new Set([
  "fontfamily",
  "font-family",
  "family",
  "fontsize",
  "font-size",
  "fontweight",
  "font-weight",
  "lineheight",
  "line-height",
  "letterspacing",
  "letter-spacing",
  "fontfeature",
  "font-feature",
  "fontvariation",
  "font-variation",
]);

const TYPO_FIELD_MAP: Record<string, string> = {
  fontfamily: "fontFamily",
  "font-family": "fontFamily",
  family: "fontFamily",
  fontsize: "fontSize",
  "font-size": "fontSize",
  size: "fontSize",
  fontweight: "fontWeight",
  "font-weight": "fontWeight",
  weight: "fontWeight",
  lineheight: "lineHeight",
  "line-height": "lineHeight",
  letterspacing: "letterSpacing",
  "letter-spacing": "letterSpacing",
  fontfeature: "fontFeature",
  "font-feature": "fontFeature",
  fontvariation: "fontVariation",
  "font-variation": "fontVariation",
};

export function inferCategory(
  collectionName: string,
  variableName: string,
  resolvedType: VariableResolvedDataType
): TokenCategory {
  const haystack = `${collectionName} ${variableName}`.toLowerCase();

  if (resolvedType === "COLOR") {
    if (COMPONENT_HINTS.some((hint) => haystack.includes(hint))) {
      return "components";
    }
    return "colors";
  }

  if (resolvedType === "STRING") {
    if (TYPO_HINTS.some((hint) => haystack.includes(hint))) {
      return "typography";
    }
    return "other";
  }

  if (resolvedType === "FLOAT") {
    if (ROUNDED_HINTS.some((hint) => haystack.includes(hint))) {
      return "rounded";
    }
    if (SPACING_HINTS.some((hint) => haystack.includes(hint))) {
      return "spacing";
    }
    if (COMPONENT_HINTS.some((hint) => haystack.includes(hint))) {
      return "components";
    }
    if (COLOR_HINTS.some((hint) => haystack.includes(hint))) {
      return "colors";
    }
    return "spacing";
  }

  return "other";
}

export function buildTokenKey(variableName: string, category: TokenCategory): string {
  const parts = variableName.split("/").map((part) => part.trim());
  const normalized = parts.map((part) => slugifyTokenKey(part));

  if (category === "typography" && normalized.length > 1) {
    const last = normalized[normalized.length - 1];
    if (TYPO_FIELDS.has(last.replace(/_/g, "-"))) {
      return normalized.slice(0, -1).join(".");
    }
  }

  if (category === "components" && normalized.length > 1) {
    return normalized.join(".");
  }

  return normalized.join(".");
}

export function typographyFieldFromName(variableName: string): {
  field: string;
  /** When true, keep the full token path (e.g. base/type/family/primary). */
  useFullPath: boolean;
} | null {
  const parts = variableName.split("/").map((part) => part.trim().toLowerCase());
  const leaf = (parts[parts.length - 1] ?? "").replace(/_/g, "-");

  if (TYPO_FIELD_MAP[leaf]) {
    return { field: TYPO_FIELD_MAP[leaf], useFullPath: false };
  }

  // Paths like base/type/family/primary — parent segment names the field.
  for (let index = parts.length - 2; index >= 0; index -= 1) {
    const segment = parts[index].replace(/_/g, "-");
    if (TYPO_FIELD_MAP[segment]) {
      return { field: TYPO_FIELD_MAP[segment], useFullPath: true };
    }
  }

  return null;
}

export function componentPropertyFromName(variableName: string): string | null {
  const leaf = variableName.split("/").pop()?.toLowerCase() ?? "";
  const normalized = leaf.replace(/_/g, "-");

  const map: Record<string, string> = {
    background: "backgroundColor",
    backgroundcolor: "backgroundColor",
    "background-color": "backgroundColor",
    text: "textColor",
    textcolor: "textColor",
    "text-color": "textColor",
    color: "textColor",
    typography: "typography",
    rounded: "rounded",
    radius: "rounded",
    padding: "padding",
    size: "size",
    height: "height",
    width: "width",
  };

  return map[normalized] ?? null;
}

export function componentNameFromVariable(variableName: string): string {
  const parts = variableName.split("/").map((part) => slugifyTokenKey(part));
  if (parts.length <= 1) {
    return parts[0] ?? "component";
  }

  const leaf = parts[parts.length - 1];
  if (
    TYPO_FIELDS.has(leaf.replace(/_/g, "-")) ||
    [
      "backgroundcolor",
      "textcolor",
      "rounded",
      "padding",
      "size",
      "height",
      "width",
      "typography",
    ].includes(leaf.replace(/_/g, "-"))
  ) {
    return parts.slice(0, -1).join("-");
  }

  return parts.join("-");
}
