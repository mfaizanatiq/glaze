type CollectionInfo = {
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
let collectionsOpen = false;
let activeTab: "export" | "session" = "export";
let sessionData: SessionInfo[] = [];

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
  if (collections.length === 0) {
    collectionsSummary.textContent = "No variable collections";
    collectionsToggle.disabled = true;
    return;
  }

  collectionsSummary.textContent = `${collections.length} collections`;
  collectionsList.innerHTML = collections
    .map(
      (collection) =>
        `<li><span>${escapeHtml(collection.name)}</span><span>${collection.variableCount} · ${escapeHtml(collection.activeMode)}</span></li>`
    )
    .join("");
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
    modeHint.textContent = modeSelect.value
      ? `Uses "${modeSelect.value}" where available, otherwise each collection's default.`
      : "Syncs every collection using its own default mode.";
  });
}

collectionsToggle.addEventListener("click", () => {
  collectionsOpen = !collectionsOpen;
  collectionsList.classList.toggle("open", collectionsOpen);
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

  preview.textContent = msg.markdown;
  previewMeta.textContent = `${formatBytes(msg.markdown.length)} · ${countLines(msg.markdown)} lines`;

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

  if (latestTokensJson) {
    copyTokensBtn.classList.remove("hidden");
    copyTokensBtn.disabled = false;
  } else {
    copyTokensBtn.classList.add("hidden");
    copyTokensBtn.disabled = true;
  }

  copyBtn.disabled = false;

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
  exportBtn.disabled = loading;
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
  return `<span class="chip"><b>${value}</b> ${label}</span>`;
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
  copyBtn.disabled = true;
  copyTokensBtn.disabled = true;

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

backBtn.addEventListener("click", showSetupView);

helpBtn.addEventListener("click", () => helpSheet.classList.add("open"));
closeHelpBtn.addEventListener("click", () => helpSheet.classList.remove("open"));
helpSheet.addEventListener("click", (event) => {
  if (event.target === helpSheet) helpSheet.classList.remove("open");
});

copyBtn.addEventListener("click", async () => {
  if (!latestMarkdown) return;
  await navigator.clipboard.writeText(latestMarkdown);
  flashButton(copyBtn, "Copied");
});

copyTokensBtn.addEventListener("click", async () => {
  if (!latestTokensJson) return;
  await navigator.clipboard.writeText(latestTokensJson);
  flashButton(copyTokensBtn, "Copied");
});

function flashButton(button: HTMLButtonElement, label: string): void {
  const original = button.textContent;
  button.textContent = label;
  setTimeout(() => {
    button.textContent = original;
  }, 1400);
}
