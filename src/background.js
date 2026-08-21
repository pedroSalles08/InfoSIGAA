importScripts("privacy-storage.js", "sigaa-parser.js", "snapshot.js", "sigaa-fetcher.js");

globalThis.InfoSigaaPrivacyStorage.restrictStorageAccess();

const SIGAA_PAGE_PATTERN = /^https:\/\/sig\.iffarroupilha\.edu\.br\/sigaa\//;
const SIGAA_ORIGIN = "https://sig.iffarroupilha.edu.br";
const STUDENT_PORTAL_PATH = "/sigaa/portais/discente/discente.jsf";
const REFRESH_KEEP_ALIVE_INTERVAL_MS = 20_000;
const DEFAULT_ACTION_TITLE = "InfoSIGAA";
let activeRefresh = null;
let refreshStartedAt = "";
let lastRefreshResponse = null;
let refreshKeepAliveTimer = null;

function formatRefreshTime(date = new Date()) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function setRefreshActionState(state) {
  let text = "";
  let color = "#64748b";
  let title = DEFAULT_ACTION_TITLE;

  if (state === "running") {
    title = "InfoSIGAA · Atualizando dados";
  } else if (state === "success") {
    text = "✓";
    color = "#2e7d32";
    title = `InfoSIGAA · Atualização concluída às ${formatRefreshTime()}`;
  } else if (state === "error") {
    text = "!";
    color = "#c62828";
    title = `InfoSIGAA · Falha na atualização às ${formatRefreshTime()}`;
  }

  const updates = [
    chrome.action.setBadgeText({ text }),
    chrome.action.setTitle({ title })
  ];

  if (text) {
    updates.push(chrome.action.setBadgeBackgroundColor({ color }));

    if (chrome.action.setBadgeTextColor) {
      updates.push(chrome.action.setBadgeTextColor({ color: "#ffffff" }));
    }
  }

  return Promise.all(updates).catch(() => {});
}

function isStudentPortalUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === SIGAA_ORIGIN && url.pathname === STUDENT_PORTAL_PATH;
  } catch (_error) {
    return false;
  }
}

async function getRefreshTab(tabId) {
  if (Number.isInteger(tabId)) {
    return chrome.tabs.get(tabId);
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function getSigaaPage({ tabId = null, portalOnly = false } = {}) {
  const tab = await getRefreshTab(tabId);

  if (
    !Number.isInteger(tab?.id) ||
    !SIGAA_PAGE_PATTERN.test(tab.url || "") ||
    (portalOnly && !isStudentPortalUrl(tab.url))
  ) {
    throw new Error("Abra o portal discente do SIGAA e clique em Atualizar novamente.");
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    func: () => ({
      html: document.documentElement.outerHTML,
      title: document.title,
      url: location.href
    })
  });
  const frames = (results || []).map((item) => item.result).filter(Boolean);
  const topFrame = frames.find((frame) => frame.url === tab.url) || frames[0] || null;

  if (!topFrame) {
    throw new Error("Nao foi possivel ler a pagina atual do SIGAA.");
  }

  if (!SIGAA_PAGE_PATTERN.test(topFrame.url || "") || (portalOnly && !isStudentPortalUrl(topFrame.url))) {
    throw new Error("A aba saiu do portal discente antes do inicio da atualizacao.");
  }

  return {
    ...topFrame,
    frames,
    incognito: Boolean(tab.incognito)
  };
}

function startRefreshKeepAlive() {
  if (refreshKeepAliveTimer) {
    return;
  }

  refreshKeepAliveTimer = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
  }, REFRESH_KEEP_ALIVE_INTERVAL_MS);
}

function stopRefreshKeepAlive() {
  if (!refreshKeepAliveTimer) {
    return;
  }

  clearInterval(refreshKeepAliveTimer);
  refreshKeepAliveTimer = null;
}

function startRefresh(options = {}) {
  if (activeRefresh) {
    return activeRefresh;
  }

  refreshStartedAt = new Date().toISOString();
  lastRefreshResponse = null;
  startRefreshKeepAlive();
  setRefreshActionState("running");

  activeRefresh = getSigaaPage(options)
    .then((activePage) =>
      globalThis.InfoSigaaPrivacyStorage.getContext({
        incognito: activePage.incognito
      }).then((privacyContext) =>
        globalThis.SigaaFetcher.refreshAllGrades(activePage, privacyContext)
      )
    )
    .then((data) => {
      lastRefreshResponse = { ok: true, data };
      setRefreshActionState(data?.ok ? "success" : "error");
      return data;
    })
    .catch((error) => {
      lastRefreshResponse = {
        ok: false,
        error: error.message || "Falha ao atualizar notas."
      };
      setRefreshActionState("error");
      throw error;
    })
    .finally(() => {
      activeRefresh = null;
      stopRefreshKeepAlive();
    });

  return activeRefresh;
}

async function handleAutomaticRefresh(tabId, changeInfo, tab) {
  if (changeInfo?.status !== "complete" || !isStudentPortalUrl(tab?.url)) {
    return;
  }

  const settings = await globalThis.InfoSigaaPrivacyStorage.getAutoRefreshState();

  if (!settings.autoRefreshEnabled) {
    return;
  }

  await startRefresh({ tabId, portalOnly: true });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  handleAutomaticRefresh(tabId, changeInfo, tab).catch((error) => {
    console.warn("[InfoSIGAA] Falha na atualizacao automatica:", error?.message || error);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "acknowledgeRefreshResult") {
    if (activeRefresh) {
      sendResponse({ ok: true, cleared: false });
      return false;
    }

    setRefreshActionState("idle").then(() => {
      sendResponse({ ok: true, cleared: true });
    });
    return true;
  }

  if (message?.type === "getRefreshStatus") {
    sendResponse({
      ok: true,
      running: Boolean(activeRefresh),
      startedAt: refreshStartedAt,
      response: lastRefreshResponse
    });
    return false;
  }

  if (!message || message.type !== "refreshGrades") {
    return false;
  }

  startRefresh()
    .then((data) => {
      sendResponse({ ok: true, data });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error.message || "Falha ao atualizar notas."
      });
    });

  return true;
});
