import type { CapturedComponent, SessionCache, SessionFileEntry, SessionSummary } from "./types";

export type { CapturedComponent, SessionFileEntry, SessionSummary, SessionCache };

const STORAGE_KEY = "glaze-session-v1";

function emptyCache(): SessionCache {
  return { version: 1, updatedAt: new Date().toISOString(), files: {} };
}

export async function loadSession(): Promise<SessionCache> {
  const stored = await figma.clientStorage.getAsync(STORAGE_KEY);
  if (!stored || typeof stored !== "object") {
    return emptyCache();
  }

  const cache = stored as SessionCache;
  if (cache.version !== 1 || !cache.files) {
    return emptyCache();
  }

  return cache;
}

export async function saveSession(cache: SessionCache): Promise<void> {
  cache.updatedAt = new Date().toISOString();
  await figma.clientStorage.setAsync(STORAGE_KEY, cache);
}

export async function getSessionSummaries(currentFileKey?: string): Promise<SessionSummary[]> {
  const cache = await loadSession();
  return Object.values(cache.files)
    .map((entry) => ({
      fileKey: entry.fileKey,
      fileName: entry.fileName,
      capturedAt: entry.capturedAt,
      componentCount: entry.componentCount,
      isCurrentFile: entry.fileKey === currentFileKey,
    }))
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

export async function captureCurrentFileToSession(
  components: CapturedComponent[]
): Promise<SessionFileEntry> {
  const fileKey = figma.fileKey ?? `local-${figma.root.name}`;
  const entry: SessionFileEntry = {
    fileKey,
    fileName: figma.root.name,
    capturedAt: new Date().toISOString(),
    componentCount: components.length,
    components,
  };

  const cache = await loadSession();
  cache.files[fileKey] = entry;
  await saveSession(cache);
  return entry;
}

export async function removeSessionFile(fileKey: string): Promise<void> {
  const cache = await loadSession();
  delete cache.files[fileKey];
  await saveSession(cache);
}

export async function clearSession(): Promise<void> {
  await saveSession(emptyCache());
}

export async function getSessionComponents(
  fileKeys?: string[]
): Promise<{ entry: SessionFileEntry; components: CapturedComponent[] }[]> {
  const cache = await loadSession();
  const entries = Object.values(cache.files);

  const filtered =
    fileKeys && fileKeys.length > 0
      ? entries.filter((entry) => fileKeys.includes(entry.fileKey))
      : entries;

  return filtered.map((entry) => ({ entry, components: entry.components }));
}

export function sessionComponentCount(cache: SessionCache): number {
  return Object.values(cache.files).reduce((sum, file) => sum + file.componentCount, 0);
}
