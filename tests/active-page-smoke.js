const fs = require("fs");
const assert = require("assert");

const storageKey = "sigaa-grade-monitor:data:v2";
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
      periods: [{ name: "1º Semestre", grades: [{ label: "FE", value: "7,0" }] }],
      summary: { mediaAnual: "7,0", faltas: "4" },
      recentChangeStatus: "unchanged",
      changeStatus: "unchanged",
      changes: []
    },
    {
      courseId: "TEST_TURMA_2",
      code: "99990002",
      name: "PROGRAMAÇÃO WEB II",
      year: "2026",
      periods: [{ name: "1º Semestre", grades: [{ label: "AV1", value: "9,0" }] }],
      summary: { mediaAnual: "9,0", faltas: "0" },
      recentChangeStatus: "new",
      changeStatus: "new",
      changes: []
    }
  ],
  errors: 0,
  noGrades: 0
};
let savedData = null;

global.chrome = {
  runtime: {},
  storage: {
    local: {
      get(_keys, callback) {
        callback({ [storageKey]: previousData });
      },
      set(value, callback) {
        savedData = value[storageKey];
        callback();
      }
    }
  }
};

require("../src/sigaa-parser.js");
require("../src/snapshot.js");
require("../src/sigaa-fetcher.js");

const gradesHtml = fs.readFileSync("fixtures/ver-notas-fisica.html", "utf8");
const authenticatedHtml = fs.readFileSync("fixtures/turma-virtual-fisica.html", "utf8");

global.fetch = async () => ({
  ok: true,
  status: 200,
  redirected: false,
  url: "https://sig.iffarroupilha.edu.br/sigaa/ava/index.jsf",
  text: async () => authenticatedHtml
});

globalThis.SigaaFetcher.refreshAllGrades({
  url: "https://sig.iffarroupilha.edu.br/sigaa/ava/notas.jsf",
  title: "Notas",
  html: gradesHtml,
  frames: []
}).then((result) => {
  assert.strictEqual(result.courses.length, 2);
  assert.strictEqual(result.courses[0].courseId, "TEST_TURMA_1");
  assert.strictEqual(result.courses[0].periods[0].grades[0].value, "8,3");
  assert.strictEqual(result.courses[0].periods[0].grades[0].changeType, "changed");
  assert.strictEqual(result.courses[1], previousData.courses[1]);
  assert.strictEqual(result.courses[1].recentChangeStatus, "new");
  assert.strictEqual(savedData.courses.length, 2);
  assert.deepStrictEqual(savedData, result);
  console.log("active-page-smoke-ok");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
