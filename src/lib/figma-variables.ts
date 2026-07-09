import {
  buildTokenKey,
  componentNameFromVariable,
  componentPropertyFromName,
  inferCategory,
  typographyFieldFromName,
} from "./categorize";
import { floatToDimension, rgbaToHex } from "./color-utils";
import { getStylePreviewCounts } from "./figma-styles";
import type {
  CollectionExportInfo,
  DesignTokens,
  ExportContext,
  GenerateOptions,
  TokenCategory,
  TokenDocumentation,
  VariableMeta,
} from "./types";

const DESIGN_MD_SPEC_VERSION = "alpha";

interface CollectionInfo {
  id: string;
  name: string;
  defaultModeId: string;
  modes: { modeId: string; name: string }[];
}

function isVariableAlias(
  value: VariableValue | undefined
): value is VariableAlias {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "VARIABLE_ALIAS"
  );
}

function categoryToTokenGroup(category: TokenCategory): string {
  switch (category) {
    case "colors":
      return "colors";
    case "typography":
      return "typography";
    case "rounded":
      return "rounded";
    case "spacing":
      return "spacing";
    case "components":
      return "components";
    default:
      return "other";
  }
}

function modeNameForId(collection: CollectionInfo, modeId: string): string {
  return collection.modes.find((mode) => mode.modeId === modeId)?.name ?? "Default";
}

function buildModeMap(
  collections: CollectionInfo[],
  options: GenerateOptions
): { modeByCollection: Map<string, string>; strategy: ExportContext["modeStrategy"]; activeModeName?: string } {
  const modeByCollection = new Map<string, string>();

  let selectedModeName: string | undefined = options.modeName;

  if (!selectedModeName && options.modeId) {
    for (const collection of collections) {
      const match = collection.modes.find((mode) => mode.modeId === options.modeId);
      if (match) {
        selectedModeName = match.name;
        break;
      }
    }
  }

  if (selectedModeName) {
    for (const collection of collections) {
      const match = collection.modes.find((mode) => mode.name === selectedModeName);
      modeByCollection.set(collection.id, match?.modeId ?? collection.defaultModeId);
    }

    return {
      modeByCollection,
      strategy: "named-mode",
      activeModeName: selectedModeName,
    };
  }

  for (const collection of collections) {
    modeByCollection.set(collection.id, collection.defaultModeId);
  }

  return {
    modeByCollection,
    strategy: "all-collections-default",
  };
}

function createResolverFrame(modeByCollection: Map<string, string>): FrameNode {
  const frame = figma.createFrame();
  frame.name = "__design_md_resolver__";
  frame.visible = false;
  frame.resize(1, 1);
  frame.locked = true;

  for (const [collectionId, modeId] of modeByCollection) {
    const collection = figma.variables.getVariableCollectionById(collectionId);
    if (collection) {
      frame.setExplicitVariableModeForCollection(collection, modeId);
    }
  }

  return frame;
}

function convertResolvedValue(resolved: {
  value: VariableValue;
  resolvedType: VariableResolvedDataType;
}): string | number | undefined {
  const { value, resolvedType } = resolved;

  if (resolvedType === "COLOR" && typeof value === "object" && value !== null && "r" in value) {
    return rgbaToHex(value as RGBA);
  }

  if (resolvedType === "FLOAT" && typeof value === "number") {
    return floatToDimension(value);
  }

  if (resolvedType === "STRING" && typeof value === "string") {
    return value;
  }

  if (resolvedType === "BOOLEAN" && typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return undefined;
}

function resolveVariable(
  variable: Variable,
  collection: CollectionInfo,
  modeId: string,
  variableById: Map<string, Variable>,
  collectionById: Map<string, CollectionInfo>,
  keyRegistry: Map<string, string>,
  resolverFrame: FrameNode,
  aliasCount: { value: number }
): { value: string | number | undefined; isAlias: boolean } {
  const rawValue = variable.valuesByMode[modeId];

  if (isVariableAlias(rawValue)) {
    aliasCount.value += 1;
    const target = variableById.get(rawValue.id);
    if (target) {
      const targetCollection = collectionById.get(target.variableCollectionId);
      const targetCategory = inferCategory(
        targetCollection?.name ?? "",
        target.name,
        target.resolvedType
      );
      const targetKey = keyRegistry.get(target.id) ?? buildTokenKey(target.name, targetCategory);
      return {
        value: `{${categoryToTokenGroup(targetCategory)}.${targetKey}}`,
        isAlias: true,
      };
    }
  }

  try {
    const consumerValue = variable.resolveForConsumer(resolverFrame);
    const value = convertResolvedValue(consumerValue);
    if (value !== undefined) {
      return { value, isAlias: false };
    }
  } catch {
    // fall through
  }

  if (rawValue !== undefined && !isVariableAlias(rawValue)) {
    const fallback = convertResolvedValue({
      value: rawValue,
      resolvedType: variable.resolvedType,
    });
    if (fallback !== undefined) {
      return { value: fallback, isAlias: false };
    }
  }

  return { value: undefined, isAlias: false };
}

export async function extractDesignTokens(
  options: GenerateOptions
): Promise<{
  tokens: DesignTokens;
  meta: VariableMeta[];
  warnings: string[];
  context: ExportContext;
}> {
  const warnings: string[] = [];
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const variables = await figma.variables.getLocalVariablesAsync();

  const collectionById = new Map<string, CollectionInfo>(
    collections.map((collection) => [
      collection.id,
      {
        id: collection.id,
        name: collection.name,
        defaultModeId: collection.defaultModeId,
        modes: collection.modes.map((mode) => ({
          modeId: mode.modeId,
          name: mode.name,
        })),
      },
    ])
  );

  const variableById = new Map(variables.map((variable) => [variable.id, variable]));
  const { modeByCollection, strategy, activeModeName } = buildModeMap(
    [...collectionById.values()],
    options
  );
  const resolverFrame = createResolverFrame(modeByCollection);
  const aliasCount = { value: 0 };
  const tokenDocs: TokenDocumentation[] = [];

  const tokens: DesignTokens = {
    version: DESIGN_MD_SPEC_VERSION,
    name: options.name,
    description: options.description,
    colors: {},
    typography: {},
    rounded: {},
    spacing: {},
    components: {},
    shadows: {},
    other: {},
  };

  const meta: VariableMeta[] = [];
  const keyRegistry = new Map<string, string>();
  const collectionCounts = new Map<string, number>();

  for (const variable of variables) {
    const collection = collectionById.get(variable.variableCollectionId);
    if (!collection) {
      warnings.push(`Skipped "${variable.name}" — collection not found.`);
      continue;
    }

    collectionCounts.set(collection.name, (collectionCounts.get(collection.name) ?? 0) + 1);

    const category = inferCategory(
      collection.name,
      variable.name,
      variable.resolvedType
    );
    const tokenKey = buildTokenKey(variable.name, category);
    keyRegistry.set(variable.id, tokenKey);

    meta.push({
      id: variable.id,
      name: variable.name,
      description: variable.description?.trim() ?? "",
      collectionName: collection.name,
      category,
      tokenKey,
      resolvedType: variable.resolvedType,
    });
  }

  for (const variable of variables) {
    const collection = collectionById.get(variable.variableCollectionId);
    if (!collection) continue;

    const modeId = modeByCollection.get(collection.id);
    if (!modeId) {
      warnings.push(`Could not resolve value for "${variable.name}" — no mode selected.`);
      continue;
    }

    const category = inferCategory(
      collection.name,
      variable.name,
      variable.resolvedType
    );
    const tokenKey = buildTokenKey(variable.name, category);

    const { value: resolved, isAlias } = resolveVariable(
      variable,
      collection,
      modeId,
      variableById,
      collectionById,
      keyRegistry,
      resolverFrame,
      aliasCount
    );

    if (resolved === undefined) {
      warnings.push(`Could not resolve value for "${variable.name}".`);
      continue;
    }

    applyToken(tokens, category, tokenKey, variable.name, resolved, warnings);

    tokenDocs.push({
      tokenKey,
      category,
      variableName: variable.name,
      collectionName: collection.name,
      value: resolved,
      description: variable.description?.trim() || undefined,
      isAlias,
      source: "variable",
    });
  }

  resolverFrame.remove();

  if (aliasCount.value > 0) {
    warnings.unshift(`Mapped ${aliasCount.value} alias variable(s) to token references.`);
  }

  const exportCollections: CollectionExportInfo[] = [...collectionById.values()].map(
    (collection) => {
      const activeModeId = modeByCollection.get(collection.id) ?? collection.defaultModeId;
      return {
        name: collection.name,
        variableCount: collectionCounts.get(collection.name) ?? 0,
        modes: collection.modes.map((mode) => mode.name),
        activeMode: modeNameForId(collection, activeModeId),
      };
    }
  );

  sortTokenGroups(tokens);

  const context: ExportContext = {
    specVersion: DESIGN_MD_SPEC_VERSION,
    figmaFileName: figma.root.name,
    exportedAt: new Date().toISOString(),
    modeStrategy: strategy,
    activeModeName,
    collections: exportCollections,
    styles: { textStyles: 0, paintStyles: 0, effectStyles: 0 },
    styleSources: [],
    tokenDocs: tokenDocs.sort((a, b) => a.tokenKey.localeCompare(b.tokenKey)),
    componentSources: [],
    sessionFileCount: 0,
    includeStyles: false,
    includeDtcg: false,
    includeSessionComponents: false,
    dtcgVersion: "2025.10",
  };

  return { tokens, meta, warnings, context };
}

function applyToken(
  tokens: DesignTokens,
  category: TokenCategory,
  tokenKey: string,
  variableName: string,
  value: string | number,
  warnings: string[]
): void {
  switch (category) {
    case "colors":
      tokens.colors[tokenKey] = String(value);
      break;

    case "spacing":
      tokens.spacing[tokenKey] = value;
      break;

    case "rounded":
      tokens.rounded[tokenKey] = String(value);
      break;

    case "typography": {
      const field = typographyFieldFromName(variableName);
      if (!field) {
        tokens.other[tokenKey] = value;
        warnings.push(
          `Typography variable "${variableName}" could not be mapped to a typography field.`
        );
        break;
      }

      const styleKey = buildTokenKey(
        variableName.split("/").slice(0, -1).join("/") || tokenKey,
        "typography"
      );

      if (!tokens.typography[styleKey]) {
        tokens.typography[styleKey] = {};
      }

      const style = tokens.typography[styleKey];
      if (field === "fontWeight") {
        style.fontWeight =
          typeof value === "number" ? value : Number.parseInt(String(value), 10) || value;
      } else if (field === "lineHeight") {
        style.lineHeight = value;
      } else {
        (style as Record<string, string | number>)[field] = value;
      }
      break;
    }

    case "components": {
      const componentName = componentNameFromVariable(variableName);
      const property = componentPropertyFromName(variableName);

      if (!property) {
        tokens.other[`${componentName}.${tokenKey}`] = value;
        warnings.push(
          `Component variable "${variableName}" mapped to other tokens — unknown property name.`
        );
        break;
      }

      if (!tokens.components[componentName]) {
        tokens.components[componentName] = {};
      }

      tokens.components[componentName][property] = value;
      break;
    }

    default:
      tokens.other[tokenKey] = value;
  }
}

function sortTokenGroups(tokens: DesignTokens): void {
  tokens.colors = sortRecord(tokens.colors);
  tokens.typography = sortRecord(tokens.typography);
  tokens.rounded = sortRecord(tokens.rounded);
  tokens.spacing = sortRecord(tokens.spacing);
  tokens.components = sortRecord(tokens.components);
  tokens.shadows = sortRecord(tokens.shadows);
  tokens.other = sortRecord(tokens.other);
}

function sortRecord<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => a.localeCompare(b))
  ) as T;
}

export async function getExportPreview(): Promise<{
  collections: CollectionExportInfo[];
  modeNames: string[];
  styles: { textStyles: number; paintStyles: number; effectStyles: number };
}> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const variables = await figma.variables.getLocalVariablesAsync();
  const styleCounts = await getStylePreviewCounts();

  const counts = new Map<string, number>();
  for (const variable of variables) {
    const collection = collections.find((item) => item.id === variable.variableCollectionId);
    if (!collection) continue;
    counts.set(collection.name, (counts.get(collection.name) ?? 0) + 1);
  }

  const collectionInfos: CollectionExportInfo[] = collections.map((collection) => ({
    name: collection.name,
    variableCount: counts.get(collection.name) ?? 0,
    modes: collection.modes.map((mode) => mode.name),
    activeMode:
      collection.modes.find((mode) => mode.modeId === collection.defaultModeId)?.name ?? "Default",
  }));

  const modeNames = new Set<string>();
  for (const collection of collections) {
    for (const mode of collection.modes) {
      modeNames.add(mode.name);
    }
  }

  return {
    collections: collectionInfos,
    modeNames: [...modeNames].sort((a, b) => a.localeCompare(b)),
    styles: styleCounts,
  };
}
