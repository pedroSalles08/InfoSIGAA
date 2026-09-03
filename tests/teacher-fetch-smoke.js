const assert = require("assert");
const fs = require("fs");

const storageKey = "sigaa-grade-monitor:data:v4";
let savedData = null;

global.chrome = {
  runtime: {},
  storage: {
    local: {
      get(_keys, callback) {
        callback({});
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
const certificateHtml = fs.readFileSync("fixtures/atestado-matricula.html", "utf8");
const portalHtml = `
  <html><body>
    <form id="menu:form_menu_discente" action="/sigaa/portais/discente/discente.jsf" method="post">
      <input type="hidden" name="javax.faces.ViewState" value="PORTAL_VIEW_STATE">
      <input type="hidden" name="jscook_action" value="">
      <script>
        var menu = [[null, 'Emitir Atestado de Matr&#237;cula',
          'menu_test:A]#{ portalDiscente.atestadoMatricula }', 'menu:form_menu_discente', null]];
      </script>
    </form>
    <form id="form_acessarTurmaVirtual" action="/sigaa/portais/discente/discente.jsf" method="post">
      <input type="hidden" name="javax.faces.ViewState" value="PORTAL_VIEW_STATE">
      <a href="#" onclick="return jsfcljs(this,{'form_acessarTurmaVirtual:entrar':'form_acessarTurmaVirtual:entrar','frontEndIdTurma':'TEST_TURMA_1'},'');">FÍSICA</a>
    </form>
  </body></html>
`;
const courseHtml = fs.readFileSync("fixtures/turma-virtual-fisica.html", "utf8");
const requests = [];
const responses = [courseHtml, certificateHtml, courseHtml, gradesHtml];

global.fetch = async (url, options = {}) => {
  requests.push({ url, method: options.method || "GET", body: String(options.body || "") });
  const html = responses.shift();

  return {
    ok: true,
    status: 200,
    redirected: false,
    url,
    text: async () => html
  };
};

async function run() {
  const result = await globalThis.SigaaFetcher.refreshAllGrades({
    url: "https://sig.iffarroupilha.edu.br/sigaa/portais/discente/discente.jsf",
    title: "Portal Discente",
    html: portalHtml,
    frames: []
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.courses.length, 1);
  assert.deepStrictEqual(result.courses[0].teachers, ["DANIELA SCHITTLER"]);
  assert.deepStrictEqual(savedData.courses[0].teachers, ["DANIELA SCHITTLER"]);
  assert.strictEqual(requests.length, 4, "A captura consolidada deve buscar atestado e notas sem abrir a frequência diária.");
  assert.match(requests[1].body, /jscook_action=menu_test/);
  assert.strictEqual(responses.length, 0);

  console.log("teacher-fetch-smoke-ok");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
