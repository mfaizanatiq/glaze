import { inferCategory } from "./categorize";
import { floatToDimension, rgbaToHex, slugifyTokenKey } from "./color-utils";
import type {
  CapturedComponent,
  CaptureProgress,
  CaptureStats,
  ComponentSourceRow,
  ComponentToken,
} from "./types";

function fileSlug(fileName: string): string {
  return slugifyTokenKey(fileName.replace(/\.fig$/i, ""));
}

function componentTokenKey(fileName: string, componentName: string): string {
  return `${fileSlug(fileName)}.${slugifyTokenKey(componentName)}`;
}

function categoryGroup(category: ReturnType<typeof inferCategory>): string {
  switch (category) {
    case "colors":
      return "colors";
    case "typography":
      return "typography";
    case "rounded":
      return "rounded";
    case "spacing":
      return "spacing";
    default:
      return "other";
  }
}

function isInternalComponentName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.startsWith(".") || trimmed.startsWith("_");
}

function isNodeHidden(node: SceneNode): boolean {
  return "visible" in node && node.visible === false;
}

function isPublishedStatus(status: PublishStatus): boolean {
  return status === "CURRENT" || status === "CHANGED";
}

async function getPublishStatus(
  node: ComponentNode | ComponentSetNode,
  cache: Map<string, PublishStatus>
): Promise<PublishStatus> {
  const cached = cache.get(node.key);
  if (cached) return cached;

  const status = await node.getPublishStatusAsync();
  cache.set(node.key, status);
  return status;
}

function reportProgress(
  onProgress: ((progress: CaptureProgress) => void) | undefined,
  progress: CaptureProgress
): void {
  onProgress?.(progress);
}

function variableRef(
  alias: VariableAlias,
  variableById: Map<string, Variable>
): string | undefined {
  const variable = variableById.get(alias.id);
  if (!variable) return undefined;

  const collection = figma.variables.getVariableCollectionById(variable.variableCollectionId);
  const category = inferCategory(collection?.name ?? "", variable.name, variable.resolvedType);
  const key = slugifyTokenKey(variable.name);
  return `{${categoryGroup(category)}.${key}}`;
}

function paddingFromBounds(node: FrameNode | ComponentNode | InstanceNode): string | undefined {
  const values = [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft];
  if (values.every((value) => value === 0)) return undefined;
  if (values.every((value) => value === values[0])) {
    return floatToDimension(values[0]);
  }
  return floatToDimension(Math.max(...values));
}

function extractTokensFromNode(
  node: SceneNode,
  variableById: Map<string, Variable>,
  textStyleNames: Map<string, string>
): ComponentToken {
  const tokens: ComponentToken = {};

  if ("boundVariables" in node && node.boundVariables) {
    const bound = node.boundVariables;

    if (bound.fills?.[0]) {
      const ref = variableRef(bound.fills[0], variableById);
      if (ref) tokens.backgroundColor = ref;
    }

    if (bound.strokes?.[0]) {
      const ref = variableRef(bound.strokes[0], variableById);
      if (ref) tokens.textColor = ref;
    }

    if (bound.cornerRadius) {
      const ref = variableRef(bound.cornerRadius, variableById);
      if (ref) tokens.rounded = ref;
    }

    for (const field of ["paddingTop", "paddingLeft", "itemSpacing"] as const) {
      const alias = bound[field];
      if (alias) {
        const ref = variableRef(alias, variableById);
        if (ref) tokens.padding = ref;
        break;
      }
    }
  }

  if ("fills" in node && !tokens.backgroundColor) {
    const fill = Array.isArray(node.fills) ? node.fills[0] : null;
    if (fill && fill.type === "SOLID" && fill.visible !== false) {
      tokens.backgroundColor = rgbaToHex(fill.color);
    }
  }

  if ("cornerRadius" in node && typeof node.cornerRadius === "number" && !tokens.rounded) {
    tokens.rounded = floatToDimension(node.cornerRadius);
  }

  if ("paddingTop" in node && !tokens.padding) {
    const padding = paddingFromBounds(node as FrameNode);
    if (padding) tokens.padding = padding;
  }

  if (node.type === "TEXT" && "textStyleId" in node && typeof node.textStyleId === "string") {
    const styleName = textStyleNames.get(node.textStyleId);
    if (styleName) {
      tokens.typography = `{text-style.${slugifyTokenKey(styleName)}}`;
    }
  }

  return tokens;
}

function mergeTokens(target: ComponentToken, source: ComponentToken): void {
  for (const [key, value] of Object.entries(source)) {
    if (target[key] === undefined) {
      target[key] = value;
    }
  }
}

async function buildTextStyleMap(): Promise<Map<string, string>> {
  const styles = await figma.getLocalTextStylesAsync();
  return new Map(styles.map((style) => [style.id, style.name]));
}

async function scanComponentNode(
  component: ComponentNode,
  variableById: Map<string, Variable>,
  textStyleNames: Map<string, string>
): Promise<ComponentToken | null> {
  const tokens = extractTokensFromNode(component, variableById, textStyleNames);

  for (const child of component.findAll((node) => node.type === "TEXT" || "boundVariables" in node)) {
    mergeTokens(tokens, extractTokensFromNode(child, variableById, textStyleNames));
  }

  if (Object.keys(tokens).length === 0) return null;

  return tokens;
}

function buildCapturedComponent(
  component: ComponentNode,
  displayName: string,
  fileName: string,
  tokens: ComponentToken
): CapturedComponent {
  return {
    name: displayName,
    figmaKey: component.key,
    tokenKey: componentTokenKey(fileName, displayName),
    remote: component.remote,
    description: component.description?.trim() || undefined,
    variantProperties: component.variantProperties as Record<string, string> | undefined,
    tokens,
  };
}

function buildCaptureWarnings(stats: CaptureStats): string[] {
  const warnings: string[] = [];
  const skippedParts: string[] = [];

  if (stats.skippedUnpublished > 0) {
    skippedParts.push(`${stats.skippedUnpublished} unpublished`);
  }
  if (stats.skippedHidden > 0) {
    skippedParts.push(`${stats.skippedHidden} hidden`);
  }
  if (stats.skippedInternal > 0) {
    skippedParts.push(`${stats.skippedInternal} internal (. or _)`);
  }
  if (stats.skippedNoTokens > 0) {
    skippedParts.push(`${stats.skippedNoTokens} without token bindings`);
  }

  if (skippedParts.length > 0) {
    warnings.push(`Skipped ${skippedParts.join(", ")}.`);
  }

  if (stats.captured === 0) {
    warnings.push("No published components with token bindings found in this file.");
  }

  return warnings;
}

export async function captureComponentsInCurrentFile(
  onProgress?: (progress: CaptureProgress) => void
): Promise<{
  components: CapturedComponent[];
  warnings: string[];
  stats: CaptureStats;
}> {
  const stats: CaptureStats = {
    captured: 0,
    skippedUnpublished: 0,
    skippedHidden: 0,
    skippedInternal: 0,
    skippedNoTokens: 0,
  };
  const fileName = figma.root.name;
  const publishStatusCache = new Map<string, PublishStatus>();
  const seenKeys = new Set<string>();

  reportProgress(onProgress, {
    phase: "loading-pages",
    message: "Loading all pages…",
  });

  await figma.loadAllPagesAsync();

  reportProgress(onProgress, {
    phase: "preparing",
    message: "Preparing variables and styles…",
  });

  const variableById = new Map(
    (await figma.variables.getLocalVariablesAsync()).map((variable) => [variable.id, variable])
  );
  const textStyleNames = await buildTextStyleMap();
  const components: CapturedComponent[] = [];

  reportProgress(onProgress, {
    phase: "filtering",
    message: "Finding published components…",
  });

  const componentSets = figma.root.findAllWithCriteria({
    types: ["COMPONENT_SET"],
  });
  const standaloneComponents = figma.root.findAllWithCriteria({
    types: ["COMPONENT"],
  });

  const candidates: Array<{
    component: ComponentNode;
    displayName: string;
    publishNode: ComponentNode | ComponentSetNode;
  }> = [];

  for (const componentSet of componentSets) {
    if (componentSet.removed || isInternalComponentName(componentSet.name)) {
      stats.skippedInternal += 1;
      continue;
    }

    const variant = componentSet.defaultVariant;
    if (!variant || variant.removed || isNodeHidden(variant)) {
      if (variant && isNodeHidden(variant)) stats.skippedHidden += 1;
      continue;
    }

    candidates.push({
      component: variant,
      displayName: componentSet.name,
      publishNode: componentSet,
    });
  }

  for (const component of standaloneComponents) {
    if (component.parent?.type === "COMPONENT_SET") continue;
    if (component.removed || isInternalComponentName(component.name)) {
      stats.skippedInternal += 1;
      continue;
    }

    if (isNodeHidden(component)) {
      stats.skippedHidden += 1;
      continue;
    }

    candidates.push({
      component,
      displayName: component.name,
      publishNode: component,
    });
  }

  const total = candidates.length;

  reportProgress(onProgress, {
    phase: "scanning",
    message: `Scanning ${total} component${total === 1 ? "" : "s"}…`,
    current: 0,
    total,
  });

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];

    if (seenKeys.has(candidate.component.key)) continue;

    const publishStatus = await getPublishStatus(candidate.publishNode, publishStatusCache);
    if (!isPublishedStatus(publishStatus)) {
      stats.skippedUnpublished += 1;
      continue;
    }

    seenKeys.add(candidate.component.key);

    const tokens = await scanComponentNode(
      candidate.component,
      variableById,
      textStyleNames
    );

    if (!tokens) {
      stats.skippedNoTokens += 1;
      continue;
    }

    components.push(
      buildCapturedComponent(candidate.component, candidate.displayName, fileName, tokens)
    );
    stats.captured += 1;

    if (index % 3 === 0 || index === candidates.length - 1) {
      reportProgress(onProgress, {
        phase: "scanning",
        message: `Scanning ${candidate.displayName}`,
        current: index + 1,
        total,
      });
    }
  }

  components.sort((a, b) => a.name.localeCompare(b.name));

  reportProgress(onProgress, {
    phase: "done",
    message: `Captured ${stats.captured} published component${stats.captured === 1 ? "" : "s"}`,
    current: total,
    total,
  });

  return {
    components,
    warnings: buildCaptureWarnings(stats),
    stats,
  };
}

export function mergeSessionComponentsIntoTokens(
  tokens: { components: Record<string, ComponentToken> },
  sessionComponents: CapturedComponent[]
): void {
  for (const component of sessionComponents) {
    tokens.components[component.tokenKey] = { ...component.tokens };
  }
}

export function componentSourceRows(
  entries: { entry: { fileName: string }; components: CapturedComponent[] }[]
): ComponentSourceRow[] {
  return entries.flatMap(({ entry, components }) =>
    components.map((component) => ({
      name: component.name,
      fileName: entry.fileName,
      tokenKey: component.tokenKey,
      remote: component.remote,
      tokenCount: Object.keys(component.tokens).length,
    }))
  );
}
