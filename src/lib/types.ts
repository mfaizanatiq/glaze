export type TokenCategory =
  | "colors"
  | "typography"
  | "spacing"
  | "rounded"
  | "components"
  | "shadows"
  | "other";

export interface TypographyToken {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: number | string;
  lineHeight?: string | number;
  letterSpacing?: string;
  fontFeature?: string;
  fontVariation?: string;
  textCase?: string;
  textDecoration?: string;
}

export interface ShadowToken {
  color: string;
  offsetX: string;
  offsetY: string;
  blur: string;
  spread: string;
  inset?: boolean;
}

export interface ComponentToken {
  [property: string]: string | number;
}

export interface CapturedComponent {
  name: string;
  figmaKey: string;
  tokenKey: string;
  remote: boolean;
  description?: string;
  variantProperties?: Record<string, string>;
  tokens: ComponentToken;
}

export interface DesignTokens {
  version?: string;
  name: string;
  description?: string;
  colors: Record<string, string>;
  typography: Record<string, TypographyToken>;
  rounded: Record<string, string>;
  spacing: Record<string, string | number>;
  components: Record<string, ComponentToken>;
  shadows: Record<string, ShadowToken>;
  other: Record<string, string | number>;
}

export interface StyleSourceInfo {
  kind: "text" | "paint" | "effect";
  figmaName: string;
  tokenKey: string;
  description?: string;
}

export interface TokenDocumentation {
  tokenKey: string;
  category: TokenCategory;
  variableName: string;
  collectionName: string;
  value: string | number;
  description?: string;
  isAlias: boolean;
  source?: "variable" | "text-style" | "paint-style" | "effect-style";
}

export interface CollectionExportInfo {
  name: string;
  variableCount: number;
  modes: string[];
  activeMode: string;
}

export interface SessionFileEntry {
  fileKey: string;
  fileName: string;
  capturedAt: string;
  componentCount: number;
  components: CapturedComponent[];
}

export interface SessionCache {
  version: 1;
  updatedAt: string;
  files: Record<string, SessionFileEntry>;
}

export interface SessionSummary {
  fileKey: string;
  fileName: string;
  capturedAt: string;
  componentCount: number;
  isCurrentFile: boolean;
}

export interface StyleExportInfo {
  textStyles: number;
  paintStyles: number;
  effectStyles: number;
}

export interface ComponentSourceRow {
  name: string;
  fileName: string;
  tokenKey: string;
  remote: boolean;
  tokenCount: number;
}

export interface ExportContext {
  specVersion: string;
  figmaFileName: string;
  exportedAt: string;
  modeStrategy: "all-collections-default" | "named-mode";
  activeModeName?: string;
  collections: CollectionExportInfo[];
  styles: StyleExportInfo;
  styleSources: StyleSourceInfo[];
  tokenDocs: TokenDocumentation[];
  componentSources: ComponentSourceRow[];
  sessionFileCount: number;
  includeStyles: boolean;
  includeDtcg: boolean;
  includeSessionComponents: boolean;
  dtcgVersion: string;
}

export interface VariableMeta {
  id: string;
  name: string;
  description: string;
  collectionName: string;
  category: TokenCategory;
  tokenKey: string;
  resolvedType: VariableResolvedDataType;
}

export interface CaptureProgress {
  phase: "loading-pages" | "preparing" | "filtering" | "scanning" | "done";
  message: string;
  current?: number;
  total?: number;
}

export interface CaptureStats {
  captured: number;
  skippedUnpublished: number;
  skippedHidden: number;
  skippedInternal: number;
  skippedNoTokens: number;
}

export interface GenerateOptions {
  name: string;
  description?: string;
  includeProse: boolean;
  includeStyles: boolean;
  includeDtcg: boolean;
  includeSessionComponents: boolean;
  sessionFileKeys?: string[];
  modeName?: string;
  modeId?: string;
}

export interface ExportResult {
  markdown: string;
  tokensJson?: string;
  stats: {
    colors: number;
    typography: number;
    spacing: number;
    rounded: number;
    components: number;
    shadows: number;
    other: number;
    aliases: number;
    textStyles: number;
    paintStyles: number;
    effectStyles: number;
  };
  warnings: string[];
  context: ExportContext;
}
