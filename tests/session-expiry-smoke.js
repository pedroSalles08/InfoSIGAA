const fs = require("fs");
const assert = require("assert");

const storageKey = "sigaa-grade-monitor:data:v2";
const portalHtml = fs.readFileSync("fixtures/portal-discente.html", "utf8");
const authenticatedHtml = fs.readFileSync("fixtures/turma-virtual-fisica.html", "utf8");
const loginHtml = `
  <!doctype html>
  <html lang="pt-BR">
    <body>
      <h1>Entrar no SIGAA</h1>
      <form action="/sigaa/verTelaLogin.do" method="post">
        <label>Usuário <input name="usuario" autocomplete="username"></label>
        <label>Senha <input name="senha" type="password"></label>
        <button type="submit">Entrar</button>
      </form>
    </body>
  </html>
`;
const previousData = {
  ok: true,
  status: "ok",
  updatedAt: "2026-07-31T10:00:00.000Z",
  courses: [
    {
      courseId: "TEST_TURMA_1",
      code: "99990001",
      name: "FÍSICA",
      year: "2026",
      periods: [{ name: "1º Semestre", grades: [{ label: "FE", value: "8,0" }] }],
      summary: { mediaAnual: "8,0", faltas: "4" },
      recentChangeStatus: "unchanged",
      changeStatus: "unchanged",
      changes: []
    }
  ],
  errors: 0,
  noGrades: 0
};
let storedData = previousData;
let savedData = null;
let saveCalls = 0;

global.chrome = {
  runtime: {},
  storage: {
    local: {
      get(_keys, callback) {
        callback({ [storageKey]: storedData });
      },
      set(value, callback) {
        saveCalls++;
        savedData = value[storageKey];
        callback();
      }
    }
  }
};

const parser = require("../src/sigaa-parser.js");
require("../src/snapshot.js");
require("../src/sigaa-fetcher.js");

function response(html, {
  url = "https://sig.iffarroupilha.edu.br/sigaa/ava/index.jsf",
  status = 200,
  redirected = false
} = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    redirected,
    url,
    text: async () => html
  };
}

function activePortalPage() {
  return {
    url: "https://sig.iffarroupilha.edu.br/sigaa/portais/discente/discente.jsf",
    title: "Portal Discente",
    html: portalHtml,
    frames: []
  };
}

async function run() {
  assert.strictEqual(
    parser.isAuthenticationPage(loginHtml, "https://sig.iffarroupilha.edu.br/sigaa/verTelaLogin.do", 200),
    true
  );
  assert.strictEqual(parser.isAuthenticationPage("", "https://sig.iffarroupilha.edu.br/sigaa/ava/index.jsf", 401), true);
  assert.strictEqual(parser.isAuthenticationPage("<p>Sua sessão expirou. Faça login novamente.</p>", "", 200), true);
  assert.strictEqual(parser.isAuthenticationPage(authenticatedHtml, "https://sig.iffarroupilha.edu.br/sigaa/ava/index.jsf", 200), false);

  storedData = previousData;
  savedData = null;
  saveCalls = 0;
  global.fetch = async () => response(loginHtml, {
    url: "https://sig.iffarroupilha.edu.br/sigaa/verTelaLogin.do",
    redirected: true
  });

  const expiredAtStart = await globalThis.SigaaFetcher.refreshAllGrades(activePortalPage());
  assert.strictEqual(expiredAtStart.ok, false);
  assert.strictEqual(expiredAtStart.status, "session_expired");
  assert.strictEqual(expiredAtStart.cachedData, previousData);
  assert.strictEqual(saveCalls, 0);
  assert.strictEqual(savedData, null);

  storedData = null;
  const notLoggedIn = await globalThis.SigaaFetcher.refreshAllGrades(activePortalPage());
  assert.strictEqual(notLoggedIn.status, "not_logged_in");
  assert.strictEqual(notLoggedIn.cachedData, null);
  assert.strictEqual(saveCalls, 0);

  storedData = previousData;
  savedData = null;
  saveCalls = 0;
  const midRefreshResponses = [
    response(authenticatedHtml),
    response(authenticatedHtml),
    response(loginHtml, {
      url: "https://sig.iffarroupilha.edu.br/sigaa/verTelaLogin.do",
      redirected: true
    })
  ];
  global.fetch = async () => midRefreshResponses.shift();

  const expiredMidRefresh = await globalThis.SigaaFetcher.refreshAllGrades(activePortalPage());
  assert.strictEqual(expiredMidRefresh.status, "session_expired");
  assert.strictEqual(expiredMidRefresh.cachedData, previousData);
  assert.strictEqual(saveCalls, 0);
  assert.strictEqual(midRefreshResponses.length, 0);

  storedData = previousData;
  savedData = null;
  saveCalls = 0;
  let fetchCount = 0;
  global.fetch = async () => {
    fetchCount++;
    return fetchCount === 1
      ? response(authenticatedHtml)
      : response("<html><body>Página inesperada, mas autenticada.</body></html>");
  };

  const totalFailure = await globalThis.SigaaFetcher.refreshAllGrades(activePortalPage());
  assert.strictEqual(totalFailure.status, "refresh_failed");
  assert.strictEqual(totalFailure.cachedData, previousData);
  assert.strictEqual(saveCalls, 0);
  assert.strictEqual(fetchCount, 4);

  console.log("session-expiry-smoke-ok");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
