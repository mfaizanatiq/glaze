import { inferCategory } from "./categorize";
import { floatToDimension, rgbaToHex, slugifyTokenKey } from "./color-utils";
import type {
  CapturedComponent,
  CaptureProgress,
  CaptureStats,
  ComponentLink,
  ComponentPropDefinition,
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
  variableById: Map<string, Variable>,
  collectionNameById: Map<string, string>
): string | undefined {
  const variable = variableById.get(alias.id);
  if (!variable) return undefined;

  const collectionName = collectionNameById.get(variable.variableCollectionId) ?? "";
  const category = inferCategory(collectionName, variable.name, variable.resolvedType);
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
  collectionNameById: Map<string, string>,
  textStyleNames: Map<string, string>
): ComponentToken {
  const tokens: ComponentToken = {};

  if ("boundVariables" in node && node.boundVariables) {
    const bound = node.boundVariables;

    if (bound.fills?.[0]) {
      const ref = variableRef(bound.fills[0], variableById, collectionNameById);
      if (ref) tokens.backgroundColor = ref;
    }

    if (bound.strokes?.[0]) {
      const ref = variableRef(bound.strokes[0], variableById, collectionNameById);
      if (ref) tokens.textColor = ref;
    }

    if (bound.cornerRadius) {
      const ref = variableRef(bound.cornerRadius, variableById, collectionNameById);
      if (ref) tokens.rounded = ref;
    }

    for (const field of ["paddingTop", "paddingLeft", "itemSpacing"] as const) {
      const alias = bound[field];
      if (alias) {
        const ref = variableRef(alias, variableById, collectionNameById);
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

function scanComponentNode(
  component: ComponentNode,
  variableById: Map<string, Variable>,
  collectionNameById: Map<string, string>,
  textStyleNames: Map<string, string>
): ComponentToken {
  const tokens = extractTokensFromNode(
    component,
    variableById,
    collectionNameById,
    textStyleNames
  );

  for (const child of component.findAll((node) => node.type === "TEXT" || "boundVariables" in node)) {
    mergeTokens(
      tokens,
      extractTokensFromNode(child, variableById, collectionNameById, textStyleNames)
    );
  }

  return tokens;
}

function extractPropertyDefinitions(
  node: ComponentNode | ComponentSetNode
): ComponentPropDefinition[] {
  const defs = node.componentPropertyDefinitions;
  if (!defs) return [];

  return Object.entries(defs).map(([rawName, definition]) => {
    const cleanName = rawName.replace(/#[^#]+$/, "").trim();
    const hashDescription = rawName.includes("#")
      ? rawName.split("#").slice(1).join("#").trim()
      : undefined;

    const prop: ComponentPropDefinition = {
      name: cleanName || rawName,
      type: definition.type,
    };

    if (definition.defaultValue !== undefined && definition.defaultValue !== null) {
      if (
        typeof definition.defaultValue === "string" ||
        typeof definition.defaultValue === "boolean" ||
        typeof definition.defaultValue === "number"
      ) {
        prop.defaultValue = definition.defaultValue;
      } else {
        prop.defaultValue = String(definition.defaultValue);
      }
    }

    if ("variantOptions" in definition && Array.isArray(definition.variantOptions)) {
      prop.options = definition.variantOptions.map(String);
    }

    if (hashDescription) {
      prop.description = hashDescription;
    }

    return prop;
  });
}

function documentationLinksFromNode(
  node: ComponentNode | ComponentSetNode
): string[] | undefined {
  const links = node.documentationLinks;
  if (!links || links.length === 0) return undefined;
  const urls = links.map((link) => link.uri).filter(Boolean);
  return urls.length > 0 ? urls : undefined;
}

function looksLikeCodeConnect(name: string, url: string): boolean {
  const haystack = `${name} ${url}`.toLowerCase();
  if (
    haystack.includes("code connect") ||
    haystack.includes("code-connect") ||
    haystack.includes("codeconnect")
  ) {
    return true;
  }

  if (
    /github\.com|gitlab\.com|bitbucket\.org|dev\.azure\.com|raw\.githubusercontent\.com/.test(
      haystack
    )
  ) {
    return true;
  }

  if (/\.(tsx?|jsx?|vue|svelte|swift|kt|java|dart|cs|figma\.(ts|js|tsx))($|\?)/i.test(url)) {
    return true;
  }

  if (/(storybook|chromatic|codesandbox|stackblitz|codespaces)/i.test(haystack)) {
    return true;
  }

  return false;
}

function buildFigmaUrl(nodeId: string): string | undefined {
  const fileKey = figma.fileKey;
  if (!fileKey) return undefined;
  const nodeParam = nodeId.replace(":", "-");
  return `https://www.figma.com/design/${fileKey}?node-id=${encodeURIComponent(nodeParam)}`;
}

async function collectComponentLinks(
  nodes: Array<ComponentNode | ComponentSetNode>
): Promise<{
  documentationLinks?: string[];
  codeConnectLinks?: ComponentLink[];
  devResources?: ComponentLink[];
}> {
  const documentationUrls = new Set<string>();
  const codeConnect = new Map<string, ComponentLink>();
  const otherDev = new Map<string, ComponentLink>();

  for (const node of nodes) {
    for (const url of documentationLinksFromNode(node) ?? []) {
      documentationUrls.add(url);
      if (looksLikeCodeConnect("Documentation", url)) {
        codeConnect.set(url, {
          name: "Documentation",
          url,
          kind: "code-connect",
        });
      }
    }

    try {
      const resources = await node.getDevResourcesAsync();
      for (const resource of resources) {
        const link: ComponentLink = {
          name: resource.name || resource.url,
          url: resource.url,
          kind: looksLikeCodeConnect(resource.name || "", resource.url)
            ? "code-connect"
            : "dev-resource",
        };
        if (link.kind === "code-connect") {
          codeConnect.set(link.url, link);
        } else {
          otherDev.set(link.url, link);
        }
      }
    } catch {
      // Older runtimes or permission edge cases — continue without resources.
    }
  }

  // Documentation URLs that aren't already treated as Code Connect stay as documentation.
  for (const url of documentationUrls) {
    if (!codeConnect.has(url) && !otherDev.has(url)) {
      // leave in documentationLinks only
    }
  }

  return {
    documentationLinks:
      documentationUrls.size > 0 ? [...documentationUrls] : undefined,
    codeConnectLinks: codeConnect.size > 0 ? [...codeConnect.values()] : undefined,
    devResources: otherDev.size > 0 ? [...otherDev.values()] : undefined,
  };
}

async function buildCapturedComponent(
  component: ComponentNode,
  displayName: string,
  fileName: string,
  tokens: ComponentToken,
  publishNode: ComponentNode | ComponentSetNode
): Promise<CapturedComponent> {
  const propertySource =
    publishNode.type === "COMPONENT_SET" ? publishNode : component;
  const description =
    publishNode.description?.trim() ||
    component.description?.trim() ||
    undefined;

  const nodesToScan =
    publishNode.type === "COMPONENT_SET"
      ? [publishNode, component]
      : [component];
  const links = await collectComponentLinks(nodesToScan);

  return {
    name: displayName,
    nodeId: component.id,
    componentSetNodeId:
      publishNode.type === "COMPONENT_SET" ? publishNode.id : undefined,
    figmaKey: component.key,
    componentSetKey:
      publishNode.type === "COMPONENT_SET" ? publishNode.key : undefined,
    tokenKey: componentTokenKey(fileName, displayName),
    remote: component.remote,
    description,
    figmaUrl: buildFigmaUrl(
      publishNode.type === "COMPONENT_SET" ? publishNode.id : component.id
    ),
    documentationLinks: links.documentationLinks,
    codeConnectLinks: links.codeConnectLinks,
    devResources: links.devResources,
    variantProperties:
      (component.variantProperties as Record<string, string> | null) ?? undefined,
    propertyDefinitions: extractPropertyDefinitions(propertySource),
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

  if (skippedParts.length > 0) {
    warnings.push(`Skipped ${skippedParts.join(", ")}.`);
  }

  if (stats.captured === 0) {
    warnings.push("No published components found in this file.");
  } else if (stats.skippedNoTokens > 0) {
    warnings.push(
      `${stats.skippedNoTokens} component(s) had no token bindings — still captured with props/metadata.`
    );
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

  const [variables, collections] = await Promise.all([
    figma.variables.getLocalVariablesAsync(),
    figma.variables.getLocalVariableCollectionsAsync(),
  ]);
  const variableById = new Map(variables.map((variable) => [variable.id, variable]));
  const collectionNameById = new Map(
    collections.map((collection) => [collection.id, collection.name])
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

    if (seenKeys.has(candidate.publishNode.key)) continue;

    const publishStatus = await getPublishStatus(candidate.publishNode, publishStatusCache);
    if (!isPublishedStatus(publishStatus)) {
      stats.skippedUnpublished += 1;
      continue;
    }

    seenKeys.add(candidate.publishNode.key);

    const tokens = scanComponentNode(
      candidate.component,
      variableById,
      collectionNameById,
      textStyleNames
    );

    if (Object.keys(tokens).length === 0) {
      stats.skippedNoTokens += 1;
    }

    components.push(
      await buildCapturedComponent(
        candidate.component,
        candidate.displayName,
        fileName,
        tokens,
        candidate.publishNode
      )
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
    const merged: ComponentToken = { ...component.tokens };

    if (component.description) {
      merged.description = component.description;
    }
    if (component.nodeId) {
      merged.nodeId = component.nodeId;
    }
    if (component.componentSetNodeId) {
      merged.componentSetNodeId = component.componentSetNodeId;
    }
    if (component.figmaKey) {
      merged.figmaKey = component.figmaKey;
    }
    if (component.figmaUrl) {
      merged.figmaUrl = component.figmaUrl;
    }
    if (component.codeConnectLinks && component.codeConnectLinks.length > 0) {
      merged.codeConnect = component.codeConnectLinks
        .map((link) => `${link.name}: ${link.url}`)
        .join(" | ");
      component.codeConnectLinks.forEach((link, index) => {
        merged[`codeConnect.${index + 1}.name`] = link.name;
        merged[`codeConnect.${index + 1}.url`] = link.url;
      });
    }
    if (component.documentationLinks && component.documentationLinks.length > 0) {
      merged.documentationLinks = component.documentationLinks.join(" | ");
    }
    if (component.devResources && component.devResources.length > 0) {
      merged.devResources = component.devResources
        .map((link) => `${link.name}: ${link.url}`)
        .join(" | ");
    }
    if (component.propertyDefinitions && component.propertyDefinitions.length > 0) {
      for (const prop of component.propertyDefinitions) {
        const key = `prop.${slugifyTokenKey(prop.name)}`;
        if (prop.defaultValue !== undefined) {
          merged[key] =
            typeof prop.defaultValue === "boolean"
              ? prop.defaultValue
                ? "true"
                : "false"
              : prop.defaultValue;
        }
        if (prop.options && prop.options.length > 0) {
          merged[`${key}.options`] = prop.options.join(" | ");
        }
        if (prop.description) {
          merged[`${key}.description`] = prop.description;
        }
        merged[`${key}.type`] = prop.type;
      }
    }
    if (component.variantProperties) {
      for (const [variantKey, variantValue] of Object.entries(component.variantProperties)) {
        merged[`variant.${slugifyTokenKey(variantKey)}`] = variantValue;
      }
    }

    tokens.components[component.tokenKey] = merged;
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
      nodeId: component.nodeId,
      remote: component.remote,
      tokenCount: Object.keys(component.tokens).length,
      propCount: component.propertyDefinitions?.length ?? 0,
      description: component.description,
    }))
  );
}
