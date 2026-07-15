type CollectionInfo = {
  id: string;
  name: string;
  variableCount: number;
  modes: string[];
  activeMode: string;
};

type StyleCounts = {
  textStyles: number;
  paintStyles: number;
  effectStyles: number;
};

type SessionInfo = {
  fileKey: string;
  fileName: string;
  capturedAt: string;
  componentCount: number;
  isCurrentFile: boolean;
};

type PluginMessage =
  | {
      type: "init-result";
      fileName: string;
      collections: CollectionInfo[];
      modeNames: string[];
      styles: StyleCounts;
      session: SessionInfo[];
      sessionComponentCount: number;
    }
  | {
      type: "session-result";
      session: SessionInfo[];
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
      stats: Record<string, number>;
      warnings: string[];
    }
  | { type: "error"; message: string };

const form = document.getElementById("form") as HTMLFormElement;
const fileNameEl = document.getElementById("fileName") as HTMLParagraphElement;
const varCountEl = document.getElementById("varCount") as HTMLElement;
const styleCountEl = document.getElementById("styleCount") as HTMLElement;
const sessionCountEl = document.getElementById("sessionCount") as HTMLElement;
const nameInput = document.getElementById("name") as HTMLInputElement;
const descriptionInput = document.getElementById("description") as HTMLTextAreaElement;
const modeSelect = document.getElementById("mode") as HTMLSelectElement;
const modeHint = document.getElementById("modeHint") as HTMLParagraphElement;
const collectionsToggle = document.getElementById("collectionsToggle") as HTMLButtonElement;
const collectionsSummary = document.getElementById("collectionsSummary") as HTMLSpanElement;
const collectionsList = document.getElementById("collectionsList") as HTMLUListElement;
const includeStylesInput = document.getElementById("includeStyles") as HTMLInputElement;
const includeDtcgInput = document.getElementById("includeDtcg") as HTMLInputElement;
const includeProseInput = document.getElementById("includeProse") as HTMLInputElement;
const includeSessionInput = document.getElementById("includeSession") as HTMLInputElement;
const exportBtn = document.getElementById("exportBtn") as HTMLButtonElement;
const captureBtn = document.getElementById("captureBtn") as HTMLButtonElement;
const copyBtn = document.getElementById("copyBtn") as HTMLButtonElement;
const copyTokensBtn = document.getElementById("copyTokensBtn") as HTMLButtonElement;
const downloadBtn = document.getElementById("downloadBtn") as HTMLButtonElement;
const exportMenuBtn = document.getElementById("exportMenuBtn") as HTMLButtonElement;
const exportPopover = document.getElementById("exportPopover") as HTMLDivElement;
const menuDownloadMd = document.getElementById("menuDownloadMd") as HTMLButtonElement;
const menuDownloadJson = document.getElementById("menuDownloadJson") as HTMLButtonElement;
const packageStatusTitle = document.getElementById("packageStatusTitle") as HTMLElement;
const packageStatusDetail = document.getElementById("packageStatusDetail") as HTMLElement;
const signalsSummary = document.getElementById("signalsSummary") as HTMLElement;
const actionFeedback = document.getElementById("actionFeedback") as HTMLDivElement;
const setupView = document.getElementById("setupView") as HTMLElement;
const sessionView = document.getElementById("sessionView") as HTMLElement;
const resultView = document.getElementById("resultView") as HTMLElement;
const footer = document.getElementById("footer") as HTMLElement;
const backBtn = document.getElementById("backBtn") as HTMLButtonElement;
const statsEl = document.getElementById("stats") as HTMLDivElement;
const preview = document.getElementById("preview") as HTMLPreElement;
const previewMeta = document.getElementById("previewMeta") as HTMLSpanElement;
const warningsEl = document.getElementById("warnings") as HTMLDetailsElement;
const warningsSummary = document.getElementById("warningsSummary") as HTMLElement;
const warningsList = document.getElementById("warningsList") as HTMLUListElement;
const helpBtn = document.getElementById("helpBtn") as HTMLButtonElement;
const helpSheet = document.getElementById("helpSheet") as HTMLDivElement;
const closeHelpBtn = document.getElementById("closeHelpBtn") as HTMLButtonElement;
const tabExport = document.getElementById("tabExport") as HTMLButtonElement;
const tabSession = document.getElementById("tabSession") as HTMLButtonElement;
const sessionList = document.getElementById("sessionList") as HTMLUListElement;
const sessionEmpty = document.getElementById("sessionEmpty") as HTMLParagraphElement;
const sessionToast = document.getElementById("sessionToast") as HTMLDivElement;
const refreshSessionBtn = document.getElementById("refreshSessionBtn") as HTMLButtonElement;
const clearSessionBtn = document.getElementById("clearSessionBtn") as HTMLButtonElement;
const captureProgress = document.getElementById("captureProgress") as HTMLDivElement;
const captureProgressLabel = document.getElementById("captureProgressLabel") as HTMLDivElement;
const captureProgressBar = document.getElementById("captureProgressBar") as HTMLDivElement;
const captureProgressDetail = document.getElementById("captureProgressDetail") as HTMLDivElement;

let latestMarkdown = "";
let latestTokensJson = "";
let latestPackageName = "design-system";
let collectionsOpen = false;
let availableCollections: CollectionInfo[] = [];
let selectedCollectionIds = new Set<string>();
let activeTab: "export" | "session" = "export";
let sessionData: SessionInfo[] = [];
let menuOpen = false;
let feedbackTimer = 0;

parent.postMessage({ pluginMessage: { type: "init" } }, "*");

window.onmessage = (event: MessageEvent) => {
  const msg = event.data.pluginMessage as PluginMessage | undefined;
  if (!msg) return;

  if (msg.type === "init-result") {
    fileNameEl.textContent = msg.fileName;
    nameInput.value = msg.fileName;
    renderSummary(msg.collections, msg.styles, msg.session, msg.sessionComponentCount);
    renderCollections(msg.collections);
    populateModes(msg.modeNames);
    renderSession(msg.session, msg.sessionComponentCount);
    return;
  }

  if (msg.type === "capture-progress") {
    showCaptureProgress(msg);
    return;
  }

  if (msg.type === "session-result") {
    hideCaptureProgress();
    setCaptureLoading(false);
    renderSession(msg.session, msg.sessionComponentCount);
    renderSummaryFromSession(msg.session, msg.sessionComponentCount);
    if (msg.message) {
      showSessionToast(msg.message, msg.warnings);
    }
    return;
  }

  if (msg.type === "export-result") {
    latestMarkdown = msg.markdown;
    latestTokensJson = msg.tokensJson ?? "";
    setLoading(false);
    showResultView(msg);
    return;
  }

  if (msg.type === "error") {
    setLoading(false);
    setCaptureLoading(false);
    hideCaptureProgress();
    if (activeTab === "session") {
      showSessionToast(msg.message);
      return;
    }
    showSetupView();
    warningsEl.classList.remove("hidden");
    warningsSummary.textContent = "Export failed";
    warningsList.innerHTML = `<li>${escapeHtml(msg.message)}</li>`;
    warningsEl.open = true;
    resultView.classList.add("active");
    setupView.classList.remove("active");
    sessionView.classList.remove("active");
    footer.classList.add("hidden");
  }
};

function renderSummary(
  collections: CollectionInfo[],
  styles: StyleCounts,
  session: SessionInfo[],
  sessionComponentCount: number
): void {
  const totalVars = collections.reduce((sum, c) => sum + c.variableCount, 0);
  const totalStyles = styles.textStyles + styles.paintStyles + styles.effectStyles;

  varCountEl.textContent = String(totalVars);
  styleCountEl.textContent = String(totalStyles);
  sessionCountEl.textContent =
    session.length === 0 ? "0" : `${session.length} · ${sessionComponentCount}`;
}

function renderSummaryFromSession(session: SessionInfo[], sessionComponentCount: number): void {
  sessionCountEl.textContent =
    session.length === 0 ? "0" : `${session.length} · ${sessionComponentCount}`;
}

function renderCollections(collections: CollectionInfo[]): void {
  availableCollections = collections;
  selectedCollectionIds = new Set(collections.map((collection) => collection.id));

  if (collections.length === 0) {
    collectionsSummary.textContent = "No variable collections";
    collectionsToggle.disabled = true;
    return;
  }

  renderCollectionOptions();
}

function renderCollectionOptions(): void {
  const selectedCount = selectedCollectionIds.size;
  const totalCount = availableCollections.length;
  const allSelected = selectedCount === totalCount;

  collectionsSummary.textContent = allSelected
    ? `All collections (${totalCount})`
    : selectedCount === 0
      ? "Select collections"
      : `${selectedCount} of ${totalCount} collections`;

  collectionsList.innerHTML = [
    `<li class="collection-all">
      <label class="collection-option">
        <input type="checkbox" data-collection-all ${allSelected ? "checked" : ""} />
        <span>Select all</span>
        <span class="collection-meta">${totalCount}</span>
      </label>
    </li>`,
    ...availableCollections.map(
      (collection) =>
        `<li>
          <label class="collection-option">
            <input
              type="checkbox"
              data-collection-id="${escapeHtml(collection.id)}"
              ${selectedCollectionIds.has(collection.id) ? "checked" : ""}
            />
            <span>${escapeHtml(collection.name)}</span>
            <span class="collection-meta">${collection.variableCount} · ${escapeHtml(collection.activeMode)}</span>
          </label>
        </li>`
    ),
  ].join("");

  const selectAll = collectionsList.querySelector<HTMLInputElement>("[data-collection-all]");
  if (selectAll) {
    selectAll.indeterminate = selectedCount > 0 && !allSelected;
    selectAll.addEventListener("change", () => {
      selectedCollectionIds = selectAll.checked
        ? new Set(availableCollections.map((collection) => collection.id))
        : new Set();
      renderCollectionOptions();
      updateCollectionSelectionState();
    });
  }

  collectionsList.querySelectorAll<HTMLInputElement>("[data-collection-id]").forEach((input) => {
    input.addEventListener("change", () => {
      const collectionId = input.dataset.collectionId;
      if (!collectionId) return;
      if (input.checked) selectedCollectionIds.add(collectionId);
      else selectedCollectionIds.delete(collectionId);
      renderCollectionOptions();
      updateCollectionSelectionState();
    });
  });
}

function updateCollectionSelectionState(): void {
  const selectedVariables = availableCollections
    .filter((collection) => selectedCollectionIds.has(collection.id))
    .reduce((sum, collection) => sum + collection.variableCount, 0);
  varCountEl.textContent = String(selectedVariables);
  exportBtn.disabled = selectedCollectionIds.size === 0;

  const scope = selectedCollectionIds.size === availableCollections.length
    ? "every collection"
    : `${selectedCollectionIds.size} selected collection${selectedCollectionIds.size === 1 ? "" : "s"}`;
  modeHint.textContent = modeSelect.value
    ? `Uses "${modeSelect.value}" across ${scope}, falling back to each default.`
    : `Uses the default mode for ${scope}.`;
}

function renderSession(session: SessionInfo[], componentCount: number): void {
  sessionData = session;
  includeSessionInput.disabled = session.length === 0;
  if (session.length === 0) {
    includeSessionInput.checked = false;
  }

  if (session.length === 0) {
    sessionList.innerHTML = "";
    sessionEmpty.classList.remove("hidden");
    clearSessionBtn.disabled = true;
    return;
  }

  sessionEmpty.classList.add("hidden");
  clearSessionBtn.disabled = false;
  sessionList.innerHTML = session
    .map((entry) => {
      const badge = entry.isCurrentFile ? '<span class="session-badge">current</span>' : "";
      const captured = formatRelativeTime(entry.capturedAt);
      return `<li class="session-item">
        <div>
          <strong>${escapeHtml(entry.fileName)}${badge}</strong>
          <span>${entry.componentCount} component${entry.componentCount === 1 ? "" : "s"} · ${captured}</span>
        </div>
        <button type="button" class="session-remove" data-file-key="${escapeHtml(entry.fileKey)}" aria-label="Remove ${escapeHtml(entry.fileName)}">Remove</button>
      </li>`;
    })
    .join("");

  sessionList.querySelectorAll(".session-remove").forEach((button) => {
    button.addEventListener("click", () => {
      const fileKey = (button as HTMLButtonElement).dataset.fileKey;
      if (!fileKey) return;
      parent.postMessage({ pluginMessage: { type: "remove-session-file", fileKey } }, "*");
    });
  });

  if (componentCount === 0) {
    sessionCountEl.textContent = "0";
  }
}

function showCaptureProgress(
  progress: Extract<PluginMessage, { type: "capture-progress" }>
): void {
  captureProgress.classList.remove("hidden");
  captureProgressLabel.textContent = progress.message;

  const hasTotal = typeof progress.total === "number" && progress.total > 0;
  const hasCurrent = typeof progress.current === "number";

  if (hasTotal && hasCurrent) {
    captureProgressBar.classList.remove("indeterminate");
    const percent = Math.max(4, Math.round((progress.current / progress.total) * 100));
    captureProgressBar.style.width = `${percent}%`;
    captureProgressDetail.textContent = `${progress.current} / ${progress.total}`;
  } else {
    captureProgressBar.classList.add("indeterminate");
    captureProgressBar.style.width = "";
    captureProgressDetail.textContent =
      progress.phase === "loading-pages" ? "This can take a while on large files" : "";
  }
}

function hideCaptureProgress(): void {
  captureProgress.classList.add("hidden");
  captureProgressBar.classList.remove("indeterminate");
  captureProgressBar.style.width = "0%";
  captureProgressDetail.textContent = "";
}

function showSessionToast(message: string, warnings?: string[]): void {
  const warningText =
    warnings && warnings.length > 0
      ? `<br>${warnings.map((warning) => escapeHtml(warning)).join("<br>")}`
      : "";
  sessionToast.innerHTML = `${escapeHtml(message)}${warningText}`;
  sessionToast.classList.remove("hidden");
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString();
}

function populateModes(modeNames: string[]): void {
  for (const modeName of modeNames) {
    const option = document.createElement("option");
    option.value = modeName;
    option.textContent = `All collections · ${modeName}`;
    modeSelect.appendChild(option);
  }

  modeSelect.addEventListener("change", () => {
    updateCollectionSelectionState();
  });
}

collectionsToggle.addEventListener("click", () => {
  collectionsOpen = !collectionsOpen;
  collectionsList.classList.toggle("open", collectionsOpen);
  collectionsToggle.setAttribute("aria-expanded", String(collectionsOpen));
  collectionsToggle.querySelector("span:last-child")!.textContent = collectionsOpen ? "▴" : "▾";
});

function switchTab(tab: "export" | "session"): void {
  activeTab = tab;
  tabExport.classList.toggle("active", tab === "export");
  tabSession.classList.toggle("active", tab === "session");
  setupView.classList.toggle("active", tab === "export");
  sessionView.classList.toggle("active", tab === "session");
  exportBtn.classList.toggle("hidden", tab !== "export");
  captureBtn.classList.toggle("hidden", tab !== "session");
  footer.classList.remove("hidden");
  resultView.classList.remove("active");
}

tabExport.addEventListener("click", () => switchTab("export"));
tabSession.addEventListener("click", () => {
  switchTab("session");
  parent.postMessage({ pluginMessage: { type: "get-session" } }, "*");
});

function showResultView(msg: Extract<PluginMessage, { type: "export-result" }>): void {
  setupView.classList.remove("active");
  sessionView.classList.remove("active");
  resultView.classList.add("active");
  footer.classList.add("hidden");
  closeExportMenu();

  const fullLineCount = countLines(msg.markdown);
  const previewLineCount = 80;
  const previewLines = msg.markdown.split("\n").slice(0, previewLineCount);
  preview.textContent =
    previewLines.join("\n") +
    (fullLineCount > previewLineCount
      ? `\n\n… ${fullLineCount - previewLineCount} more lines in the downloaded file`
      : "");
  previewMeta.textContent = `${formatBytes(msg.markdown.length)} · Preview`;

  latestPackageName = slugifyFilename(nameInput.value.trim() || fileNameEl.textContent || "design-system");

  const signalCount = Object.values(msg.stats).reduce(
    (sum, value) => sum + (typeof value === "number" ? value : 0),
    0
  );
  packageStatusTitle.textContent = "Export complete";
  packageStatusDetail.textContent = latestTokensJson
    ? `DESIGN.md · ${formatBytes(msg.markdown.length)} · JSON catalog included`
    : `DESIGN.md · ${formatBytes(msg.markdown.length)}`;
  signalsSummary.textContent = `${signalCount} design signals`;
  setActionFeedback("Choose Download, or use the menu for JSON and copy options");

  statsEl.innerHTML = [
    chip("Colors", msg.stats.colors),
    chip("Type", msg.stats.typography),
    chip("Components", msg.stats.components),
    chip("Text styles", msg.stats.textStyles),
    chip("Spacing", msg.stats.spacing),
    chip("Radius", msg.stats.rounded),
    chip("Shadows", msg.stats.shadows),
  ]
    .filter(Boolean)
    .join("");

  downloadBtn.disabled = !latestMarkdown;
  exportMenuBtn.disabled = !latestMarkdown;
  copyBtn.disabled = !latestMarkdown;
  copyTokensBtn.disabled = !latestTokensJson;
  menuDownloadMd.disabled = !latestMarkdown;
  menuDownloadJson.disabled = !latestTokensJson;

  if (msg.warnings.length > 0) {
    warningsEl.classList.remove("hidden");
    warningsSummary.textContent = `${msg.warnings.length} warning${msg.warnings.length === 1 ? "" : "s"}`;
    warningsList.innerHTML = msg.warnings
      .map((warning) => `<li>${escapeHtml(warning)}</li>`)
      .join("");
    warningsEl.open = true;
  } else {
    warningsEl.classList.add("hidden");
    warningsList.innerHTML = "";
  }
}

function showSetupView(): void {
  resultView.classList.remove("active");
  if (activeTab === "export") {
    setupView.classList.add("active");
    sessionView.classList.remove("active");
  } else {
    setupView.classList.remove("active");
    sessionView.classList.add("active");
  }
  footer.classList.remove("hidden");
}

function setLoading(loading: boolean): void {
  exportBtn.disabled = loading || selectedCollectionIds.size === 0;
  exportBtn.classList.toggle("loading", loading);
  exportBtn.textContent = loading ? "Generating…" : "Generate DESIGN.md";
}

function setCaptureLoading(loading: boolean): void {
  captureBtn.disabled = loading;
  captureBtn.classList.toggle("loading", loading);
  captureBtn.textContent = loading ? "Capturing…" : "Capture this file";
}

function chip(label: string, value: number): string {
  if (value === 0) return "";
  return `<span class="chip"><span>${label}</span><b>${value}</b></span>`;
}

function formatBytes(length: number): string {
  if (length < 1024) return `${length} B`;
  return `${(length / 1024).toFixed(1)} KB`;
}

function countLines(text: string): number {
  return text.split("\n").length;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  setLoading(true);
  downloadBtn.disabled = true;
  exportMenuBtn.disabled = true;
  copyBtn.disabled = true;
  copyTokensBtn.disabled = true;
  setActionFeedback("Generating package…");

  parent.postMessage(
    {
      pluginMessage: {
        type: "export",
        name: nameInput.value.trim(),
        description: descriptionInput.value.trim() || undefined,
        includeProse: includeProseInput.checked,
        includeStyles: includeStylesInput.checked,
        includeDtcg: includeDtcgInput.checked,
        includeSessionComponents: includeSessionInput.checked,
        collectionIds: [...selectedCollectionIds],
        modeName: modeSelect.value || undefined,
      },
    },
    "*"
  );
});

captureBtn.addEventListener("click", () => {
  setCaptureLoading(true);
  sessionToast.classList.add("hidden");
  showCaptureProgress({
    type: "capture-progress",
    phase: "loading-pages",
    message: "Starting capture…",
  });
  parent.postMessage({ pluginMessage: { type: "capture-session" } }, "*");
});

refreshSessionBtn.addEventListener("click", () => {
  parent.postMessage({ pluginMessage: { type: "get-session" } }, "*");
});

clearSessionBtn.addEventListener("click", () => {
  if (!confirm("Clear all captured files from this session?")) return;
  parent.postMessage({ pluginMessage: { type: "clear-session" } }, "*");
});

backBtn.addEventListener("click", () => {
  closeExportMenu();
  showSetupView();
});

helpBtn.addEventListener("click", () => helpSheet.classList.add("open"));
closeHelpBtn.addEventListener("click", () => helpSheet.classList.remove("open"));
helpSheet.addEventListener("click", (event) => {
  if (event.target === helpSheet) helpSheet.classList.remove("open");
});

function setActionFeedback(message: string, tone: "neutral" | "success" | "error" = "neutral"): void {
  actionFeedback.textContent = message;
  actionFeedback.classList.toggle("success", tone === "success");
  actionFeedback.classList.toggle("error", tone === "error");
  window.clearTimeout(feedbackTimer);
  if (tone !== "neutral") {
    feedbackTimer = window.setTimeout(() => {
      actionFeedback.classList.remove("success", "error");
    }, 2200);
  }
}

function openExportMenu(): void {
  menuOpen = true;
  exportPopover.classList.add("open");
  exportMenuBtn.setAttribute("aria-expanded", "true");
}

function closeExportMenu(): void {
  menuOpen = false;
  exportPopover.classList.remove("open");
  exportMenuBtn.setAttribute("aria-expanded", "false");
}

function toggleExportMenu(): void {
  if (menuOpen) closeExportMenu();
  else openExportMenu();
}

function slugifyFilename(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "design-system";
}

function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function copyText(content: string, successLabel: string): Promise<void> {
  await navigator.clipboard.writeText(content);
  setActionFeedback(successLabel, "success");
}

function downloadDesignMd(): void {
  if (!latestMarkdown) return;
  setActionFeedback("Downloading DESIGN.md…");
  downloadText("DESIGN.md", latestMarkdown, "text/markdown;charset=utf-8");
  setActionFeedback("Downloaded DESIGN.md", "success");
  closeExportMenu();
}

function downloadPackageJson(): void {
  if (!latestTokensJson) {
    setActionFeedback("JSON package unavailable", "error");
    return;
  }
  setActionFeedback("Downloading JSON package…");
  downloadText(
    `${latestPackageName}.design-package.json`,
    latestTokensJson,
    "application/json;charset=utf-8"
  );
  setActionFeedback("Downloaded JSON package", "success");
  closeExportMenu();
}

downloadBtn.addEventListener("click", downloadDesignMd);
exportMenuBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleExportMenu();
});
menuDownloadMd.addEventListener("click", downloadDesignMd);
menuDownloadJson.addEventListener("click", downloadPackageJson);

copyBtn.addEventListener("click", async () => {
  if (!latestMarkdown) return;
  try {
    await copyText(latestMarkdown, "Copied DESIGN.md");
  } catch {
    setActionFeedback("Copy failed", "error");
  }
  closeExportMenu();
});

copyTokensBtn.addEventListener("click", async () => {
  if (!latestTokensJson) return;
  try {
    await copyText(latestTokensJson, "Copied JSON package");
  } catch {
    setActionFeedback("Copy failed", "error");
  }
  closeExportMenu();
});

document.addEventListener("click", (event) => {
  const target = event.target as Node;

  if (menuOpen && !exportPopover.contains(target) && target !== exportMenuBtn) {
    closeExportMenu();
  }

  if (
    collectionsOpen &&
    !collectionsList.contains(target) &&
    !collectionsToggle.contains(target)
  ) {
    collectionsOpen = false;
    collectionsList.classList.remove("open");
    collectionsToggle.setAttribute("aria-expanded", "false");
    collectionsToggle.querySelector("span:last-child")!.textContent = "▾";
  }
});
