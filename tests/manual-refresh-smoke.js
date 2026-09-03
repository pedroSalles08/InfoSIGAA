const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const activeTab = {
  id: 1,
  url: "https://sig.iffarroupilha.edu.br/sigaa/portais/discente/discente.jsf",
  title: "Portal do Discente",
  html: "<html><body>Portal</body></html>",
  incognito: false
};
let runtimeMessageListener = null;
let refreshCount = 0;
let activeFetch = null;
let lastActivePage = null;
let tabUpdatedListener = null;
const lockMessages = [];
const runtimeBroadcasts = [];

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function finishRefresh(data = { ok: true, status: "ok", courses: [] }) {
  activeFetch?.resolve(data);
  activeFetch = null;
}

const chrome = {
  action: {
    setBadgeText: async () => {},
    setTitle: async () => {},
    setBadgeBackgroundColor: async () => {},
    setBadgeTextColor: async () => {}
  },
  runtime: {
    lastError: null,
    getPlatformInfo(callback) {
      callback({ os: "win" });
    },
    async sendMessage(message) {
      runtimeBroadcasts.push(message);
    },
    onMessage: {
      addListener(listener) {
        runtimeMessageListener = listener;
      }
    }
  },
  scripting: {
    async executeScript({ target }) {
      assert.strictEqual(target.tabId, activeTab.id);
      return [{
        result: {
          html: activeTab.html,
          title: activeTab.title,
          url: activeTab.url
        }
      }];
    }
  },
  tabs: {
    async query(queryInfo) {
      return [activeTab];
    },
    async sendMessage(tabId, message) {
      lockMessages.push({ tabId, message });
    },
    onUpdated: {
      addListener(listener) {
        tabUpdatedListener = listener;
      }
    },
    onRemoved: { addListener() {} }
  }
};

const sandbox = {
  chrome,
  console,
  globalThis: null,
  importScripts() {},
  AbortController,
  crypto,
  setTimeout() {
    return 2;
  },
  clearTimeout() {},
  setInterval() {
    return 1;
  },
  clearInterval() {}
};
sandbox.globalThis = sandbox;
sandbox.InfoSigaaPrivacyStorage = {
  async restrictStorageAccess() {},
  async getContext({ incognito }) {
    return { incognito, mode: incognito ? "public" : "personal" };
  }
};
sandbox.SigaaFetcher = {
  refreshAllGrades(activePage, _privacyContext, options = {}) {
    refreshCount += 1;
    lastActivePage = activePage;

    return new Promise((resolve, reject) => {
      activeFetch = { resolve, reject };
      options.signal?.addEventListener("abort", () => {
        const error = new Error("cancelled");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    });
  }
};

vm.runInNewContext(fs.readFileSync("src/background.js", "utf8"), sandbox, {
  filename: "src/background.js"
});

function requestRefresh() {
  return new Promise((resolve) => {
    const keepsChannelOpen = runtimeMessageListener(
      { type: "refreshGrades" },
      {},
      resolve
    );
    assert.strictEqual(keepsChannelOpen, true);
  });
}

function request(message) {
  return new Promise((resolve) => runtimeMessageListener(message, {}, resolve));
}

async function run() {
  assert.strictEqual(typeof runtimeMessageListener, "function");

  const first = requestRefresh();
  await flush();
  assert.strictEqual(refreshCount, 1, "O botão Atualizar deve iniciar a coleta manual.");
  assert.strictEqual(lastActivePage.url, activeTab.url, "A coleta deve usar a aba ativa do SIGAA.");

  const simultaneous = requestRefresh();
  await flush();
  assert.strictEqual(refreshCount, 1, "Cliques simultâneos devem compartilhar a coleta em andamento.");

  finishRefresh();
  const [firstResponse, simultaneousResponse] = await Promise.all([first, simultaneous]);
  assert.strictEqual(firstResponse.ok, true);
  assert.strictEqual(simultaneousResponse.ok, true);
  assert.ok(runtimeBroadcasts.some((message) => message.type === "refreshStatusChanged" && message.status?.running));
  assert.ok(runtimeBroadcasts.some((message) => message.type === "refreshStatusChanged" && !message.status?.running));

  const popupResult = await request({ type: "getRefreshStatus", consumer: "popup" });
  const dashboardResult = await request({ type: "getRefreshStatus", consumer: "dashboard" });
  assert.ok(popupResult.response?.ok, "O popup deve receber o resultado concluído.");
  assert.ok(dashboardResult.response?.ok, "O dashboard deve receber o mesmo resultado concluído.");
  await request({ type: "acknowledgeRefreshResult", consumer: "popup" });
  assert.strictEqual((await request({ type: "getRefreshStatus", consumer: "popup" })).response, null);
  assert.ok(
    (await request({ type: "getRefreshStatus", consumer: "dashboard" })).response?.ok,
    "Reconhecer no popup não deve consumir a notificação do dashboard."
  );
  await request({ type: "acknowledgeRefreshResult", consumer: "dashboard" });
  assert.strictEqual((await request({ type: "getRefreshStatus", consumer: "dashboard" })).response, null);

  const next = requestRefresh();
  await flush();
  assert.strictEqual(refreshCount, 2, "Uma nova coleta manual deve ser possível após a anterior terminar.");
  finishRefresh();
  assert.strictEqual((await next).ok, true);

  const cancelled = requestRefresh();
  await flush();
  const runningStatus = await request({ type: "getRefreshStatus" });
  assert.strictEqual(runningStatus.running, true);
  assert.ok(runningStatus.refreshId);
  assert.strictEqual((await request({ type: "cancelRefresh", refreshId: runningStatus.refreshId })).ok, true);
  const cancelledResponse = await cancelled;
  assert.strictEqual(cancelledResponse.ok, false);
  assert.match(cancelledResponse.error, /dados anteriores foram preservados/i);
  assert.ok(lockMessages.some(({ message }) => message.type === "setSigaaInteractionLock" && message.locked));
  assert.ok(lockMessages.some(({ message }) => message.type === "setSigaaInteractionLock" && !message.locked));

  const navigationCancelled = requestRefresh();
  await flush();
  tabUpdatedListener(activeTab.id, { status: "loading" }, activeTab);
  const navigationResponse = await navigationCancelled;
  assert.strictEqual(navigationResponse.ok, false);
  assert.match(navigationResponse.error, /recarregada/i);

  console.log("manual-refresh-smoke-ok");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
