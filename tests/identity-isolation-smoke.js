const assert = require("assert");
const fs = require("fs");

function createArea(initial = {}) {
  const values = { ...initial };

  return {
    values,
    get(keys, callback) {
      if (keys == null) {
        callback({ ...values });
        return;
      }

      const result = {};
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(values, key)) {
          result[key] = values[key];
        }
      });
      callback(result);
    },
    set(next, callback) {
      Object.assign(values, next);
      callback?.();
    },
    remove(keys, callback) {
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete values[key]);
      callback?.();
    }
  };
}

const local = createArea();
const session = createArea();
global.chrome = { runtime: {}, storage: { local, session } };

const storage = require("../src/privacy-storage.js");
require("../src/sigaa-parser.js");
require("../src/snapshot.js");
require("../src/sigaa-fetcher.js");

const gradesHtml = fs.readFileSync("fixtures/ver-notas-fisica.html", "utf8");
const authenticatedHtml = fs.readFileSync("fixtures/turma-virtual-fisica.html", "utf8");
const previousStudent = {
  ok: true,
  status: "ok",
  updatedAt: "2026-08-03T12:00:00.000Z",
  owner: { enrollment: "00000000000", studentName: "OUTRO ALUNO" },
  courses: [
    {
      courseId: "OLD_1",
      enrollment: "00000000000",
      studentName: "OUTRO ALUNO",
      name: "MATÉRIA ANTIGA",
      periods: []
    },
    {
      courseId: "OLD_2",
      enrollment: "00000000000",
      studentName: "OUTRO ALUNO",
      name: "OUTRA MATÉRIA",
      periods: []
    }
  ]
};

const activePage = {
  url: "https://sig.iffarroupilha.edu.br/sigaa/ava/notas.jsf",
  title: "Notas",
  html: gradesHtml,
  frames: [],
  incognito: false
};
const loginPage = {
  url: "https://sig.iffarroupilha.edu.br/sigaa/verTelaLogin.do",
  title: "Login",
  html: '<form action="/sigaa/verTelaLogin.do"><input name="usuario"><input name="senha" type="password"></form>',
  frames: [],
  incognito: false
};

global.fetch = async () => ({
  ok: true,
  status: 200,
  url: "https://sig.iffarroupilha.edu.br/sigaa/ava/index.jsf",
  text: async () => authenticatedHtml
});

async function run() {
  const personalContext = { mode: storage.PERSONAL_MODE, incognito: false };
  local.values[storage.DATA_KEY] = previousStudent;

  const personalResult = await globalThis.SigaaFetcher.refreshAllGrades(activePage, personalContext);
  assert.strictEqual(personalResult.courses.length, 1, "A troca de aluno não pode preservar matérias antigas.");
  assert.strictEqual(personalResult.owner.enrollment, "0000000000");
  assert.strictEqual(personalResult.courses.some((course) => course.courseId === "OLD_1"), false);
  assert.strictEqual(local.values[storage.DATA_KEY].owner.enrollment, "0000000000");

  const publicContext = { mode: storage.PUBLIC_MODE, incognito: false };
  const publicKey = `${storage.SESSION_DATA_PREFIX}regular`;
  session.values[publicKey] = previousStudent;

  const publicResult = await globalThis.SigaaFetcher.refreshAllGrades(activePage, publicContext);
  assert.strictEqual(publicResult.courses.length, 1);
  assert.strictEqual(publicResult.owner.enrollment, "0000000000");
  assert.strictEqual(session.values[publicKey].owner.enrollment, "0000000000");
  assert.strictEqual(local.values[storage.DATA_KEY].owner.enrollment, "0000000000");

  const expired = await globalThis.SigaaFetcher.refreshAllGrades(loginPage, publicContext);
  assert.strictEqual(expired.cachedData, null, "O modo público não deve devolver cache em falha de autenticação.");
  assert.strictEqual(session.values[publicKey], undefined, "A sessão temporária deve ser apagada ao detectar logout.");

  console.log("identity-isolation-smoke-ok");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
