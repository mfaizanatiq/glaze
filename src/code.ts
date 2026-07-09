import {
  captureComponentsInCurrentFile,
  captureCurrentFileToSession,
  clearSession,
  generateDesignMd,
  getSessionSummaries,
  removeSessionFile,
} from "./lib/design-md-generator";
import { loadSession, sessionComponentCount } from "./lib/session-cache";
import { getExportPreview } from "./lib/figma-variables";
import type { SessionSummary } from "./lib/types";

figma.skipInvisibleInstanceChildren = true;
figma.showUI(__html__, { width: 360, height: 580, themeColors: true });

type UiMessage =
  | { type: "init" }
  | {
      type: "export";
      name: string;
      description?: string;
      includeProse: boolean;
      includeStyles: boolean;
      includeDtcg: boolean;
      includeSessionComponents: boolean;
      modeName?: string;
    }
  | { type: "get-session" }
  | { type: "capture-session" }
  | { type: "remove-session-file"; fileKey: string }
  | { type: "clear-session" };

type PluginMessage =
  | {
      type: "init-result";
      fileName: string;
      collections: {
        name: string;
        variableCount: number;
        modes: string[];
        activeMode: string;
      }[];
      modeNames: string[];
      styles: {
        textStyles: number;
        paintStyles: number;
        effectStyles: number;
      };
      session: SessionSummary[];
      sessionComponentCount: number;
    }
  | {
      type: "session-result";
      session: SessionSummary[];
      sessionComponentCount: number;
      message?: string;
      warnings?: string[];
      stats?: {
        captured: number;
        skippedUnpublished: number;
        skippedHidden: number;
        skippedInternal: number;
        skippedNoTokens: number;
      };
    }
  | {
      type: "capture-progress";
      phase: "loading-pages" | "preparing" | "filtering" | "scanning" | "done";
      message: string;
      current?: number;
      total?: number;
    }
  | {
      type: "export-result";
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
    }
  | { type: "error"; message: string };

async function sessionPayload(): Promise<{
  session: SessionSummary[];
  sessionComponentCount: number;
}> {
  const cache = await loadSession();
  const session = await getSessionSummaries(figma.fileKey ?? undefined);
  return {
    session,
    sessionComponentCount: sessionComponentCount(cache),
  };
}

figma.ui.onmessage = async (msg: UiMessage) => {
  try {
    if (msg.type === "init") {
      const preview = await getExportPreview();
      const { session, sessionComponentCount: componentCount } = await sessionPayload();
      const response: PluginMessage = {
        type: "init-result",
        fileName: figma.root.name,
        collections: preview.collections,
        modeNames: preview.modeNames,
        styles: preview.styles,
        session,
        sessionComponentCount: componentCount,
      };
      figma.ui.postMessage(response);
      return;
    }

    if (msg.type === "get-session") {
      const { session, sessionComponentCount: componentCount } = await sessionPayload();
      figma.ui.postMessage({
        type: "session-result",
        session,
        sessionComponentCount: componentCount,
      } satisfies PluginMessage);
      return;
    }

    if (msg.type === "capture-session") {
      const { components, warnings, stats } = await captureComponentsInCurrentFile((progress) => {
        figma.ui.postMessage({
          type: "capture-progress",
          ...progress,
        } satisfies PluginMessage);
      });
      const entry = await captureCurrentFileToSession(components);
      const { session, sessionComponentCount: componentCount } = await sessionPayload();
      figma.ui.postMessage({
        type: "session-result",
        session,
        sessionComponentCount: componentCount,
        message: `Captured ${entry.componentCount} published component${entry.componentCount === 1 ? "" : "s"} from ${entry.fileName}`,
        warnings: warnings.length > 0 ? warnings : undefined,
        stats,
      } satisfies PluginMessage);
      return;
    }

    if (msg.type === "remove-session-file") {
      await removeSessionFile(msg.fileKey);
      const { session, sessionComponentCount: componentCount } = await sessionPayload();
      figma.ui.postMessage({
        type: "session-result",
        session,
        sessionComponentCount: componentCount,
        message: "Removed file from session",
      } satisfies PluginMessage);
      return;
    }

    if (msg.type === "clear-session") {
      await clearSession();
      figma.ui.postMessage({
        type: "session-result",
        session: [],
        sessionComponentCount: 0,
        message: "Session cleared",
      } satisfies PluginMessage);
      return;
    }

    if (msg.type === "export") {
      const result = await generateDesignMd({
        name: msg.name || figma.root.name,
        description: msg.description,
        includeProse: msg.includeProse,
        includeStyles: msg.includeStyles,
        includeDtcg: msg.includeDtcg,
        includeSessionComponents: msg.includeSessionComponents,
        modeName: msg.modeName || undefined,
      });

      const response: PluginMessage = {
        type: "export-result",
        markdown: result.markdown,
        tokensJson: result.tokensJson,
        stats: result.stats,
        warnings: result.warnings,
      };
      figma.ui.postMessage(response);
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    figma.ui.postMessage({ type: "error", message } satisfies PluginMessage);
  }
};
