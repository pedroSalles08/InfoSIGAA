const assert = require("assert");
const fs = require("fs");

require("../src/academic-model.js");
const uiModel = require("../src/ui-model.js");
const { buildCourses } = require("./popup-preview-server.js");

const courses = buildCourses();
const ids = (items) => items.map((course) => course.courseId);

assert.deepStrictEqual(
  ids(uiModel.filterCourses(courses, { filter: "all" })),
  ids(courses),
  "A consulta rápida deve preservar a ordem original do SIGAA."
);
assert.deepStrictEqual(
  ids(uiModel.filterCourses(courses, { filter: "with-grades" })),
  ["fisica-ii", "projeto-integrador", "historia-tecnologia", "calculo-numerico"]
);
assert.deepStrictEqual(ids(uiModel.filterCourses(courses, { filter: "no-grades" })), ["quimica-geral"]);
assert.deepStrictEqual(ids(uiModel.filterCourses(courses, { filter: "changed" })), ["fisica-ii", "calculo-numerico"]);
assert.deepStrictEqual(ids(uiModel.filterCourses(courses, { filter: "errors" })), ["historia-tecnologia", "biologia"]);
assert.deepStrictEqual(
  ids(uiModel.filterCourses(courses, { query: "ana beatriz" })),
  ["projeto-integrador"],
  "A busca deve encontrar docentes mesmo quando o nome da disciplina é longo."
);

const physics = courses[0];
const annualAssessments = uiModel.getFocusedAssessments(physics, 0, 5);
assert.strictEqual(annualAssessments.length, 5, "O card compacto anual deve limitar a prévia a cinco avaliações.");
assert.ok(annualAssessments.every((item) => [1, 2].includes(item.semesterNumber)), "A visão anual deve identificar o semestre de cada nota.");
assert.strictEqual(uiModel.getCourseView(physics, 2).focusResult.value, "8,1");
assert.strictEqual(uiModel.getCourseView(courses[2]).state, "no_grades");
assert.strictEqual(uiModel.getCourseView(courses[3]).state, "stale");
assert.strictEqual(uiModel.getCourseView(courses[4]).state, "error");

const popup = fs.readFileSync("popup.html", "utf8");
const script = fs.readFileSync("popup.js", "utf8");
const styles = fs.readFileSync("popup.css", "utf8");
const rootRule = styles.match(/html\s*\{([^}]+)\}/)?.[1] || "";

assert.match(popup, /id="course-filters"[^>]+role="group"/);
assert.match(popup, /data-filter="all"[^>]+aria-pressed="true"/);
assert.match(popup, /id="course-count"[^>]+aria-live="polite"/);
assert.match(script, /stateClass[\s\S]+state-error[\s\S]+state-stale[\s\S]+state-no-grades/);
assert.match(script, /Limpar busca e filtros/);
assert.match(script, /renderRefreshProgress\(status\)/);
assert.match(script, /role", "progressbar"/);
assert.match(script, /lastRefreshProgressKey/, "O progresso não deve reconstruir o popup quando nada mudou.");
assert.doesNotMatch(script, /Margem estimada/, "O popup não deve exibir estimativas de faltas nos cards.");
assert.match(styles, /\.course::before[\s\S]+var\(--course-state\)/, "O estado deve ter uma marca estrutural além do badge colorido.");
assert.match(styles, /html\s*\{[\s\S]*scrollbar-gutter:\s*stable/, "A barra de rolagem não deve alterar a largura do popup.");
assert.match(styles, /html\s*\{[\s\S]*overflow-x:\s*hidden/, "A reserva da barra vertical não deve criar rolagem horizontal.");
assert.match(rootRule, /width:\s*440px/);
assert.match(rootRule, /min-width:\s*440px/);
assert.match(rootRule, /max-width:\s*440px/);
assert.doesNotMatch(rootRule, /v(?:w|h)/, "O tamanho raiz do popup não pode depender do viewport que o Chrome está calculando.");
assert.match(styles, /--popup-scrollbar-width:\s*8px/, "A reserva de largura deve corresponder à barra personalizada.");
assert.match(styles, /body\s*\{[\s\S]*width:\s*432px/, "O conteúdo deve usar uma largura absoluta e estável dentro do popup.");
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
assert.doesNotMatch(popup, /https?:\/\//, "O popup não deve depender de fontes, scripts ou estilos remotos.");

console.log("popup-ui-smoke-ok");
