importScripts("academic-model.js", "privacy-storage.js", "sigaa-parser.js", "snapshot.js", "sigaa-fetcher.js");

globalThis.InfoSigaaPrivacyStorage.restrictStorageAccess();

const SIGAA_PAGE_PATTERN = /^https:\/\/sig\.iffarroupilha\.edu\.br\/sigaa\//;
const SIGAA_TAB_PATTERN = "https://sig.iffarroupilha.edu.br/sigaa/*";
const REFRESH_KEEP_ALIVE_INTERVAL_MS = 20_000;
const REFRESH_HEARTBEAT_INTERVAL_MS = 15_000;
const REFRESH_TIMEOUT_MS = 10 * 60_000;
const REFRESH_STATE_KEY = "infosigaa:refresh-state:v1";
const DEFAULT_ACTION_TITLE = "InfoSIGAA";

let activeRefresh = null;
let lastRefreshResponse = null;
let acknowledgedRefreshConsumers = new Set();
let refreshKeepAliveTimer = null;
let refreshHeartbeatTimer = null;

function makeRefreshId() {
  return globalThis.crypto?.randomUUID?.() || `refresh-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatRefreshTime(date = new Date()) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function setRefreshActionState(state) {
  let text = "";
  let color = "#64748b";
  let title = DEFAULT_ACTION_TITLE;
  if (state === "running") title = "InfoSIGAA · Atualizando dados";
  if (state === "success") {
    text = "✓";
    color = "#2e7d32";
    title = `InfoSIGAA · Atualização concluída às ${formatRefreshTime()}`;
  }
  if (state === "error") {
    text = "!";
    color = "#c62828";
    title = `InfoSIGAA · Falha na atualização às ${formatRefreshTime()}`;
  }

  const updates = [chrome.action.setBadgeText({ text }), chrome.action.setTitle({ title })];
  if (text) {
    updates.push(chrome.action.setBadgeBackgroundColor({ color }));
    if (chrome.action.setBadgeTextColor) updates.push(chrome.action.setBadgeTextColor({ color: "#ffffff" }));
  }
  return Promise.all(updates).catch(() => {});
}

function writeOperationalState(value) {
  const area = chrome.storage?.session;
  if (!area) return Promise.resolve();
  return new Promise((resolve) => {
    const callback = () => resolve();
    if (value && area.set) area.set({ [REFRESH_STATE_KEY]: value }, callback);
    else if (!value && area.remove) area.remove(REFRESH_STATE_KEY, callback);
    else resolve();
  });
}

function normalizeRefreshConsumer(value) {
  return value === "popup" || value === "dashboard" ? value : "";
}

function publicRefreshStatus(consumer = "") {
  const normalizedConsumer = normalizeRefreshConsumer(consumer);
  const response = normalizedConsumer && acknowledgedRefreshConsumers.has(normalizedConsumer)
    ? null
    : lastRefreshResponse;
  if (!activeRefresh) return { ok: true, running: false, response };
  return {
    ok: true,
    running: true,
    refreshId: activeRefresh.refreshId,
    startedAt: activeRefresh.startedAt,
    ...activeRefresh.progress,
    canCancel: true,
    response: null
  };
}

function notifyRefreshStatusChanged() {
  if (typeof chrome.runtime?.sendMessage !== "function") return;
  Promise.resolve(chrome.runtime.sendMessage({
    type: "refreshStatusChanged",
    status: publicRefreshStatus()
  })).catch(() => {});
}

async function getSigaaTabs() {
  try {
    return await chrome.tabs.query({ url: SIGAA_TAB_PATTERN });
  } catch (_error) {
    const tabs = await chrome.tabs.query({});
    return tabs.filter((tab) => SIGAA_PAGE_PATTERN.test(tab.url || ""));
  }
}

async function getRefreshTab(tabId) {
  if (Number.isInteger(tabId)) {
    const tab = chrome.tabs.get
      ? await chrome.tabs.get(tabId)
      : (await chrome.tabs.query({})).find((item) => item.id === tabId);
    return SIGAA_PAGE_PATTERN.test(tab?.url || "") ? tab : null;
  }
  const tabs = await getSigaaTabs();
  return tabs
    .filter((tab) => Number.isInteger(tab.id) && SIGAA_PAGE_PATTERN.test(tab.url || ""))
    .sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0))[0] || null;
}

async function captureSigaaPage(tab) {
  if (!Number.isInteger(tab?.id) || !SIGAA_PAGE_PATTERN.test(tab.url || "")) {
    throw new Error("Abra o SIGAA e tente atualizar novamente.");
  }
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    func: () => ({ html: document.documentElement.outerHTML, title: document.title, url: location.href })
  });
  const frames = (results || []).map((item) => item.result).filter(Boolean);
  const topFrame = frames.find((frame) => frame.url === tab.url) || frames[0] || null;
  if (!topFrame || !SIGAA_PAGE_PATTERN.test(topFrame.url || "")) {
    throw new Error("Não foi possível ler a página atual do SIGAA.");
  }
  return { ...topFrame, frames, incognito: Boolean(tab.incognito), sourceTabId: tab.id };
}

async function sendLockMessage(tabId, message) {
  if (!chrome.tabs.sendMessage) return;
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (_error) {
    // O content script consulta o estado ao carregar.
  }
}

async function broadcastLock(locked) {
  const tabs = await getSigaaTabs();
  const status = publicRefreshStatus();
  await Promise.all(tabs.map((tab) => {
    if (!Number.isInteger(tab.id)) return Promise.resolve();
    if (activeRefresh) activeRefresh.lockedTabIds.add(tab.id);
    return sendLockMessage(tab.id, { type: "setSigaaInteractionLock", locked, status });
  }));
}

function updateProgress(progress) {
  if (!activeRefresh) return;
  activeRefresh.progress = { ...activeRefresh.progress, ...progress };
  writeOperationalState(publicRefreshStatus()).catch(() => {});
  broadcastLock(true).catch(() => {});
  notifyRefreshStatusChanged();
}

function startRefreshKeepAlive() {
  if (!refreshKeepAliveTimer) {
    refreshKeepAliveTimer = setInterval(() => {
      chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
    }, REFRESH_KEEP_ALIVE_INTERVAL_MS);
  }
  if (!refreshHeartbeatTimer) {
    refreshHeartbeatTimer = setInterval(() => {
      if (activeRefresh) writeOperationalState(publicRefreshStatus()).catch(() => {});
    }, REFRESH_HEARTBEAT_INTERVAL_MS);
  }
}

function stopRefreshKeepAlive() {
  clearInterval(refreshKeepAliveTimer);
  clearInterval(refreshHeartbeatTimer);
  refreshKeepAliveTimer = null;
  refreshHeartbeatTimer = null;
}

function cancelRefresh(reason = "Atualização cancelada. Os dados anteriores foram preservados.") {
  if (!activeRefresh) return false;
  activeRefresh.abortReason = reason;
  activeRefresh.controller.abort();
  return true;
}

function startRefresh(options = {}) {
  if (activeRefresh) return activeRefresh.promise;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    cancelRefresh("A atualização excedeu 10 minutos. Os dados anteriores foram preservados.");
  }, REFRESH_TIMEOUT_MS);
  activeRefresh = {
    refreshId: makeRefreshId(),
    controller,
    startedAt: new Date().toISOString(),
    timeoutId,
    abortReason: "",
    lockedTabIds: new Set(),
    progress: { phase: "preparing", completedCourses: 0, totalCourses: 0, currentCourseName: "" },
    promise: null
  };
  lastRefreshResponse = null;
  acknowledgedRefreshConsumers = new Set();
  startRefreshKeepAlive();
  setRefreshActionState("running");
  notifyRefreshStatusChanged();

  activeRefresh.promise = (async () => {
    const sourceTab = await getRefreshTab(options.tabId);
    if (!sourceTab) throw new Error("Abra o SIGAA e tente atualizar novamente.");
    await broadcastLock(true);
    const activePage = await captureSigaaPage(sourceTab);
    const privacyContext = await globalThis.InfoSigaaPrivacyStorage.getContext({ incognito: activePage.incognito });
    const data = await globalThis.SigaaFetcher.refreshAllGrades(activePage, privacyContext, {
      signal: controller.signal,
      onProgress: updateProgress
    });
    lastRefreshResponse = {
      ok: true,
      refreshId: activeRefresh.refreshId,
      completedAt: new Date().toISOString(),
      data
    };
    setRefreshActionState(data?.ok ? "success" : "error");
    return data;
  })().catch((error) => {
    const message = activeRefresh?.abortReason || error.message || "Falha ao atualizar os dados.";
    lastRefreshResponse = {
      ok: false,
      refreshId: activeRefresh?.refreshId || "",
      completedAt: new Date().toISOString(),
      status: controller.signal.aborted ? "cancelled" : "error",
      error: message
    };
    setRefreshActionState("error");
    throw new Error(message);
  }).finally(async () => {
    clearTimeout(timeoutId);
    await broadcastLock(false);
    activeRefresh = null;
    stopRefreshKeepAlive();
    await writeOperationalState(null);
    notifyRefreshStatusChanged();
  });
  writeOperationalState(publicRefreshStatus()).catch(() => {});
  return activeRefresh.promise;
}

async function openDashboard() {
  const url = chrome.runtime.getURL("dashboard.html");
  const existing = await chrome.tabs.query({ url });
  const tab = existing.find((item) => Number.isInteger(item.id));
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    if (Number.isInteger(tab.windowId) && chrome.windows?.update) {
      try { await chrome.windows.update(tab.windowId, { focused: true }); } catch (_error) {}
    }
    return tab;
  }
  return chrome.tabs.create({ url });
}

chrome.tabs.onUpdated?.addListener((tabId, changeInfo, tab) => {
  if (!activeRefresh || changeInfo?.status !== "loading") return;
  if (activeRefresh.lockedTabIds.has(tabId) || SIGAA_PAGE_PATTERN.test(changeInfo.url || tab?.url || "")) {
    cancelRefresh("A página do SIGAA foi recarregada durante a atualização. Os dados anteriores foram preservados.");
  }
});

chrome.tabs.onRemoved?.addListener((tabId) => activeRefresh?.lockedTabIds.delete(tabId));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "getRefreshStatus") {
    sendResponse(publicRefreshStatus(message.consumer));
    return false;
  }
  if (message?.type === "sigaaLockReady") {
    const status = publicRefreshStatus();
    if (status.running && Number.isInteger(sender.tab?.id)) activeRefresh.lockedTabIds.add(sender.tab.id);
    sendResponse({ locked: status.running, status });
    return false;
  }
  if (message?.type === "cancelRefresh") {
    const matches = !message.refreshId || message.refreshId === activeRefresh?.refreshId;
    sendResponse({ ok: matches && cancelRefresh() });
    return false;
  }
  if (message?.type === "openDashboard") {
    openDashboard().then((tab) => sendResponse({ ok: true, tabId: tab?.id }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "acknowledgeRefreshResult") {
    const consumer = normalizeRefreshConsumer(message.consumer);
    if (consumer && lastRefreshResponse) acknowledgedRefreshConsumers.add(consumer);
    if (!activeRefresh) {
      setRefreshActionState("idle").then(() => sendResponse({
        ok: true,
        acknowledged: Boolean(consumer),
        clearedForConsumer: Boolean(consumer)
      }));
      return true;
    }
    sendResponse({ ok: true, acknowledged: false, clearedForConsumer: false });
    return false;
  }
  if (message?.type !== "refreshGrades" && message?.type !== "startRefresh") return false;
  startRefresh({ tabId: message.sourceTabId })
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

writeOperationalState(null).catch(() => {});
setRefreshActionState("idle");
