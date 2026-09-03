const assert = require("assert");

const storageKey = "sigaa-grade-monitor:data:v4";
const previousData = {
  ok: true,
  status: "ok",
  schemaVersion: 4,
  updatedAt: "2026-08-20T12:00:00.000Z",
  owner: { enrollment: "0000000000", studentName: "ALUNO TESTE" },
  courses: [{ courseId: "A", enrollment: "0000000000", name: "FÍSICA", periods: [], summary: {} }]
};
let saveCalls = 0;
const local = {
  get(_keys, callback) { callback({ [storageKey]: previousData }); },
  set(_values, callback) { saveCalls += 1; callback?.(); },
  remove(_keys, callback) { callback?.(); }
};

global.chrome = { runtime: {}, storage: { local, session: local } };
require("../src/academic-model.js");
require("../src/sigaa-parser.js");
require("../src/snapshot.js");
require("../src/sigaa-fetcher.js");

global.fetch = (_url, options = {}) => new Promise((_resolve, reject) => {
  options.signal?.addEventListener("abort", () => {
    const error = new Error("cancelled");
    error.name = "AbortError";
    reject(error);
  }, { once: true });
});

async function run() {
  const controller = new AbortController();
  const refresh = globalThis.SigaaFetcher.refreshAllGrades({
    url: "https://sig.iffarroupilha.edu.br/sigaa/portais/discente/discente.jsf",
    title: "Portal do Discente",
    html: "<html><body>Portal do Discente</body></html>",
    frames: []
  }, { mode: "personal", incognito: false }, { signal: controller.signal });
  controller.abort();
  await assert.rejects(refresh, (error) => error.name === "AbortError");
  assert.strictEqual(saveCalls, 0, "O cancelamento não deve gravar um snapshot parcial.");
  assert.strictEqual((await globalThis.SigaaFetcher.loadStoredGrades({ mode: "personal" })), previousData);
  console.log("cancel-refresh-smoke-ok");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
