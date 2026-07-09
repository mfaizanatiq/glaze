import type { DesignTokens, TokenDocumentation, TypographyToken } from "./types";
import type { ShadowToken } from "./types";

export const DTCG_SPEC_VERSION = "2025.10";

type DtcgLeaf = {
  $type?: string;
  $value?: unknown;
  $description?: string;
};

type DtcgTree = {
  [key: string]: DtcgTree | DtcgLeaf;
};

function isReference(value: string): boolean {
  return value.startsWith("{") && value.endsWith("}");
}

function nestToken(tree: DtcgTree, path: string[], leaf: DtcgLeaf): void {
  let cursor: DtcgTree = tree;

  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    if (!cursor[segment] || !isPlainObject(cursor[segment])) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as DtcgTree;
  }

  cursor[path[path.length - 1]] = leaf;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dtcgColorValue(value: string): string {
  return isReference(value) ? value : value;
}

function dtcgDimensionValue(value: string | number): string | number {
  if (typeof value === "number") return value;
  if (isReference(value)) return value;
  return value;
}

function typographyToDtcg(style: TypographyToken): DtcgLeaf["$value"] {
  return {
    fontFamily: style.fontFamily ?? "Inter",
    fontSize: dtcgDimensionValue(style.fontSize ?? "16px"),
    fontWeight: style.fontWeight ?? 400,
    lineHeight: style.lineHeight ?? 1.5,
    letterSpacing: dtcgDimensionValue(style.letterSpacing ?? "0px"),
  };
}

function shadowToDtcg(shadow: ShadowToken): DtcgLeaf["$value"] {
  return {
    color: dtcgColorValue(shadow.color),
    offsetX: shadow.offsetX,
    offsetY: shadow.offsetY,
    blur: shadow.blur,
    spread: shadow.spread,
    ...(shadow.inset ? { inset: true } : {}),
  };
}

function findDescription(
  tokenKey: string,
  docs: TokenDocumentation[]
): string | undefined {
  return docs.find((doc) => doc.tokenKey === tokenKey)?.description;
}

export function exportDtcgTokens(
  tokens: DesignTokens,
  tokenDocs: TokenDocumentation[]
): string {
  const tree: DtcgTree = {};

  for (const [key, value] of Object.entries(tokens.colors)) {
    nestToken(tree, key.split("."), {
      $type: "color",
      $value: dtcgColorValue(String(value)),
      $description: findDescription(key, tokenDocs),
    });
  }

  for (const [key, value] of Object.entries(tokens.spacing)) {
    nestToken(tree, key.split("."), {
      $type: "dimension",
      $value: dtcgDimensionValue(value),
      $description: findDescription(key, tokenDocs),
    });
  }

  for (const [key, value] of Object.entries(tokens.rounded)) {
    nestToken(tree, key.split("."), {
      $type: "dimension",
      $value: dtcgDimensionValue(value),
      $description: findDescription(key, tokenDocs),
    });
  }

  for (const [key, style] of Object.entries(tokens.typography)) {
    nestToken(tree, key.split("."), {
      $type: "typography",
      $value: typographyToDtcg(style),
      $description: findDescription(key, tokenDocs),
    });
  }

  for (const [key, shadow] of Object.entries(tokens.shadows)) {
    nestToken(tree, key.split("."), {
      $type: "shadow",
      $value: shadowToDtcg(shadow),
      $description: findDescription(key, tokenDocs),
    });
  }

  for (const [componentName, props] of Object.entries(tokens.components)) {
    for (const [prop, value] of Object.entries(props)) {
      const path = ["component", componentName, prop];
      const stringValue = String(value);
      const type = prop.toLowerCase().includes("color") ? "color" : "dimension";
      nestToken(tree, path, {
        $type: type,
        $value: type === "color" ? dtcgColorValue(stringValue) : dtcgDimensionValue(value),
      });
    }
  }

  const document = {
    $description: tokens.description,
    $extensions: {
      "design.md": {
        version: tokens.version ?? "alpha",
        name: tokens.name,
      },
      "com.figma": {
        generator: "glaze",
        dtcg: DTCG_SPEC_VERSION,
      },
    },
    ...tree,
  };

  return `${JSON.stringify(document, null, 2)}\n`;
}
