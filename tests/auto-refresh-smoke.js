const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const portalUrl = "https://sig.iffarroupilha.edu.br/sigaa/portais/discente/discente.jsf?origem=teste#topo";
const tabs = {
  1: { id: 1, url: portalUrl, title: "Portal do Discente", incognito: false },
  2: { id: 2, url: portalUrl, title: "Portal ativo", incognito: false }
};
let autoRefreshEnabled = false;
let tabUpdatedListener = null;
let runtimeMessageListener = null;
let executeCount = 0;
let refreshCount = 0;
let executedTabId = null;
let resolveRefresh = null;

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
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
    onMessage: {
      addListener(listener) {
        runtimeMessageListener = listener;
      }
    }
  },
  scripting: {
    async executeScript({ target }) {
      executeCount += 1;
      executedTabId = target.tabId;
      const tab = tabs[target.tabId];
      return [{ result: { html: "<html></html>", title: tab.title, url: tab.url } }];
    }
  },
  tabs: {
    async get(tabId) {
      return tabs[tabId];
    },
    async query() {
      return [tabs[2]];
    },
    onUpdated: {
      addListener(listener) {
        tabUpdatedListener = listener;
      }
    }
  }
};

const sandbox = {
  URL,
  chrome,
  console,
  globalThis: null,
  importScripts() {},
  setInterval() {
    return 1;
  },
  clearInterval() {}
};
sandbox.globalThis = sandbox;
sandbox.InfoSigaaPrivacyStorage = {
  async restrictStorageAccess() {},
  async getAutoRefreshState() {
    return { autoRefreshEnabled };
  },
  async getContext({ incognito }) {
    return { incognito, mode: incognito ? "public" : "personal" };
  }
};
sandbox.SigaaFetcher = {
  refreshAllGrades() {
    refreshCount += 1;
    return new Promise((resolve) => {
      resolveRefresh = resolve;
    });
  }
};

vm.runInNewContext(fs.readFileSync("src/background.js", "utf8"), sandbox, {
  filename: "src/background.js"
});

async function run() {
  assert.strictEqual(typeof tabUpdatedListener, "function");
  assert.strictEqual(typeof runtimeMessageListener, "function");

  tabUpdatedListener(1, { status: "complete" }, tabs[1]);
  await nextTurn();
  assert.strictEqual(executeCount, 0, "Preferencia desativada nao deve capturar a pagina.");

  autoRefreshEnabled = true;
  tabUpdatedListener(1, { status: "loading" }, tabs[1]);
  tabUpdatedListener(1, { status: "complete" }, { ...tabs[1], url: "https://sig.iffarroupilha.edu.br/sigaa/ava/index.jsf" });
  await nextTurn();
  assert.strictEqual(executeCount, 0, "Somente a conclusao do portal discente deve disparar.");

  tabUpdatedListener(1, { status: "complete" }, tabs[1]);
  tabUpdatedListener(1, { status: "complete" }, tabs[1]);
  await nextTurn();
  await nextTurn();
  assert.strictEqual(executeCount, 1, "Eventos simultaneos devem compartilhar a mesma captura.");
  assert.strictEqual(executedTabId, 1, "A atualizacao deve usar a aba que carregou, mesmo sem estar ativa.");
  assert.strictEqual(refreshCount, 1, "Eventos simultaneos devem compartilhar o mesmo fetch.");

  let manualResponse = null;
  const keepsChannelOpen = runtimeMessageListener(
    { type: "refreshGrades" },
    {},
    (response) => {
      manualResponse = response;
    }
  );
  assert.strictEqual(keepsChannelOpen, true);
  await nextTurn();
  assert.strictEqual(refreshCount, 1, "O botao manual deve reutilizar a atualizacao automatica em andamento.");

  resolveRefresh({ ok: true, courses: [] });
  await nextTurn();
  await nextTurn();
  assert.strictEqual(manualResponse?.ok, true);

  tabUpdatedListener(1, { status: "complete" }, tabs[1]);
  await nextTurn();
  await nextTurn();
  assert.strictEqual(refreshCount, 2, "Um novo carregamento concluido deve iniciar uma nova atualizacao.");
  resolveRefresh({ ok: true, courses: [] });
  await nextTurn();

  console.log("auto-refresh-smoke-ok");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
