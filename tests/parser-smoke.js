const fs = require("fs");
const assert = require("assert");
const parser = require("../src/sigaa-parser.js");

const fixtureHtml = fs.readFileSync("fixtures/turma-virtual-fisica.html", "utf8");
const portalHtml = fs.readFileSync("fixtures/portal-discente.html", "utf8");
const enrollmentCertificateHtml = fs.readFileSync("fixtures/atestado-matricula.html", "utf8");
const courses = parser.extractCourses(fixtureHtml);
const portalCourses = parser.extractPortalCourses(portalHtml);
const enrollmentCertificateAction = parser.extractEnrollmentCertificateAction(portalHtml);
const enrollmentCourses = parser.extractEnrollmentCourses(enrollmentCertificateHtml);
const verNotasAction = parser.extractVerNotasAction(fixtureHtml);

assert.strictEqual(courses.length, 3);
assert.ok(courses.some((course) => course.code === "99990001" && course.name === "FÍSICA"));
assert.strictEqual(portalCourses.length, 3);
assert.ok(portalCourses.some((course) => course.name === "FÍSICA"));
assert.ok(portalCourses.every((course) => course.formId.startsWith("form_acessarTurmaVirtual")));
assert.deepStrictEqual(enrollmentCertificateAction, {
  formId: "menu:form_menu_discente",
  actionParam: "jscook_action",
  params: {
    jscook_action: "menu_test:A]#{ portalDiscente.atestadoMatricula }"
  }
});
assert.strictEqual(enrollmentCourses.length, 4);
assert.deepStrictEqual(enrollmentCourses[0], {
  code: "99990001",
  name: "FÍSICA",
  teachers: ["DANIELA SCHITTLER"]
});
assert.deepStrictEqual(enrollmentCourses[1].teachers, [
  "MARIA ANGELICA FIGUEIREDO OLIVEIRA",
  "JOÃO DA SILVA"
]);
assert.deepStrictEqual(enrollmentCourses[2].teachers, []);
assert.deepStrictEqual(enrollmentCourses[3].teachers, []);
assert.ok(verNotasAction);
assert.strictEqual(verNotasAction.formId, "formMenu");

const syntheticGradesPage = `
  <html>
    <body>
      <h3>03002118 - FISICA (100h) - Turma: 3B (2026)</h3>
      <table>
        <tr><th colspan="13">Alunos Matriculados</th></tr>
        <tr>
          <th>Matricula Nome</th>
          <th colspan="6">1o Semestre</th>
          <th>2o Semestre</th>
          <th>Exame</th>
          <th>Media Anual</th>
          <th>Resultado</th>
          <th>Faltas</th>
          <th>Sit.</th>
        </tr>
        <tr>
          <th></th>
          <th>FE</th><th>CE</th><th>TL</th><th>PE</th><th>Cap</th><th>Nota</th>
          <th>Nota</th><th>Nota</th><th></th><th></th><th></th><th></th>
        </tr>
        <tr>
          <td>0000000000 ALUNO TESTE</td>
          <td>8,3</td><td>10,0</td><td>10,0</td><td>6,0</td><td>--</td><td>--</td>
          <td>--</td><td>--</td><td>2,8</td><td>--</td><td>12</td><td>--</td>
        </tr>
      </table>
    </body>
  </html>
`;

const parsedGrades = parser.parseGradesPage(syntheticGradesPage, courses.find((course) => course.code === "99990001"));

assert.strictEqual(parsedGrades.tableFound, true);
assert.strictEqual(parsedGrades.hasGrades, true);
assert.strictEqual(parsedGrades.course.code, "03002118");
assert.strictEqual(parsedGrades.studentName, "ALUNO TESTE");
assert.strictEqual(parsedGrades.periods[0].grades[0].label, "FE");
assert.strictEqual(parsedGrades.periods[0].grades[0].value, "8,3");
assert.strictEqual(parsedGrades.summary.mediaAnual, "2,8");
assert.strictEqual(parsedGrades.summary.faltas, "12");

const syntheticSeparatedIdentityGradesPage = `
  <html>
    <body>
      <h3>03002118 - FISICA (100h) - Turma: 3B (2026)</h3>
      <table>
        <tr><th colspan="14">Alunos Matriculados</th></tr>
        <tr>
          <th>Matricula</th>
          <th>Nome</th>
          <th colspan="6">1o Semestre</th>
          <th>2o Semestre</th>
          <th>Exame</th>
          <th>Media Anual</th>
          <th>Resultado</th>
          <th>Faltas</th>
          <th>Sit.</th>
        </tr>
        <tr>
          <td>0000000000</td>
          <td>ALUNO TESTE</td>
          <td>8,3</td><td>10,0</td><td>10,0</td><td>6,0</td><td>9,0</td><td>--</td>
          <td>--</td><td>--</td><td>2,8</td><td>--</td><td>12</td><td>--</td>
        </tr>
      </table>
    </body>
  </html>
`;

const parsedSeparatedGrades = parser.parseGradesPage(
  syntheticSeparatedIdentityGradesPage,
  courses.find((course) => course.code === "99990001")
);

assert.strictEqual(parsedSeparatedGrades.tableFound, true);
assert.strictEqual(parsedSeparatedGrades.hasGrades, true);
assert.strictEqual(parsedSeparatedGrades.enrollment, "0000000000");
assert.strictEqual(parsedSeparatedGrades.studentName, "ALUNO TESTE");
assert.strictEqual(parsedSeparatedGrades.periods[0].grades[0].value, "8,3");
assert.strictEqual(parsedSeparatedGrades.periods[0].grades[4].value, "9,0");
assert.strictEqual(parsedSeparatedGrades.summary.mediaAnual, "2,8");
assert.strictEqual(parsedSeparatedGrades.summary.faltas, "12");

const syntheticGenericGradesPage = `
  <html>
    <body>
      <h3>03009999 - HARDWARE (66h) - Turma: 3B (2026)</h3>
      <table>
        <tr><th colspan="10">Alunos Matriculados</th></tr>
        <tr>
          <th rowspan="2">Matricula</th>
          <th rowspan="2">Nome</th>
          <th colspan="2">1o Semestre</th>
          <th colspan="2">2o Semestre</th>
          <th rowspan="2">Media Anual</th>
          <th rowspan="2">Resultado</th>
          <th rowspan="2">Faltas</th>
          <th rowspan="2">Sit.</th>
        </tr>
        <tr>
          <th title="Prova de Hardware">PH</th>
          <th data-original-title="Trabalho de Bancada">TB</th>
          <th title="Projeto Integrador">PI</th>
          <th>REC</th>
        </tr>
        <tr>
          <td>0000000000</td>
          <td>ALUNO TESTE</td>
          <td>8,0</td><td>9,5</td><td>7,0</td><td>--</td>
          <td>8,2</td><td>APROVADO</td><td>4</td><td>--</td>
        </tr>
      </table>
    </body>
  </html>
`;

const parsedGenericGrades = parser.parseGradesPage(syntheticGenericGradesPage, {
  courseId: "03009999",
  rawTitle: "03009999 - HARDWARE (66h) - Turma: 3B (2026)"
});

assert.strictEqual(parsedGenericGrades.tableFound, true);
assert.strictEqual(parsedGenericGrades.hasGrades, true);
assert.strictEqual(parsedGenericGrades.periods[0].name, "1º Semestre");
assert.strictEqual(parsedGenericGrades.periods[0].grades[0].label, "PH");
assert.strictEqual(parsedGenericGrades.periods[0].grades[0].sigla, "PH");
assert.strictEqual(parsedGenericGrades.periods[0].grades[0].nomeCompleto, "Prova de Hardware");
assert.strictEqual(parsedGenericGrades.periods[0].grades[1].label, "TB");
assert.strictEqual(parsedGenericGrades.periods[0].grades[1].nomeCompleto, "Trabalho de Bancada");
assert.strictEqual(parsedGenericGrades.periods[1].name, "2º Semestre");
assert.strictEqual(parsedGenericGrades.periods[1].grades[0].label, "PI");
assert.strictEqual(parsedGenericGrades.periods[1].grades[0].nomeCompleto, "Projeto Integrador");
assert.strictEqual(parsedGenericGrades.periods[1].grades[1].label, "REC");
assert.strictEqual(parsedGenericGrades.periods[1].grades[1].value, "");
assert.strictEqual(parsedGenericGrades.summary.mediaAnual, "8,2");
assert.strictEqual(parsedGenericGrades.summary.resultado, "APROVADO");
assert.strictEqual(parsedGenericGrades.summary.faltas, "4");

const syntheticSemanticGradesPage = `
  <html><body>
    <h3>03009998 - REDES (80h) - Turma: 3B (2026)</h3>
    <table>
      <tr><th colspan="12">Alunos Matriculados</th></tr>
      <tr>
        <th rowspan="2">Matricula</th><th rowspan="2">Nome</th>
        <th colspan="3">1o Semestre</th><th colspan="2">2o Semestre</th><th>Exame</th>
        <th rowspan="2">Media Anual</th><th rowspan="2">Resultado</th><th rowspan="2">Faltas</th><th rowspan="2">Sit.</th>
      </tr>
      <tr>
        <th id="aval_101" title="Prova 1">P1</th><th id="aval_102" title="Avaliação chamada NOTA">NOTA</th><th id="unid">NOTA</th>
        <th id="aval_201">P2</th><th id="unid">NOTA</th><th id="unid">NOTA</th>
      </tr>
      <tr><td>0000000000</td><td>ALUNO TESTE</td><td>8,0</td><td>7,5</td><td>--</td><td>9,0</td><td>-</td><td></td><td>6,8</td><td></td><td>3</td><td>CURSANDO</td></tr>
    </table>
  </body></html>
`;
const parsedSemantic = parser.parseGradesPage(syntheticSemanticGradesPage, { courseId: "03009998" });
const semanticS1 = parsedSemantic.performance.semesters.find((semester) => semester.number === 1);
const semanticS2 = parsedSemantic.performance.semesters.find((semester) => semester.number === 2);
assert.deepStrictEqual(semanticS1.assessments.map((item) => item.sourceKey), [
  "semester:1:101:assessment",
  "semester:1:102:assessment"
]);
assert.strictEqual(semanticS1.assessments[1].label, "NOTA");
assert.strictEqual(semanticS1.result.sourceKey, "semester:1:result");
assert.strictEqual(semanticS1.result.availability, "not_informed");
assert.strictEqual(semanticS1.result.finality, "unknown");
assert.strictEqual(semanticS2.result.availability, "not_informed");
assert.strictEqual(parsedSemantic.performance.exam.availability, "not_informed");
assert.strictEqual(parsedSemantic.performance.annual.average.value, "6,8");
assert.strictEqual(parsedSemantic.performance.annual.situation.value, "CURSANDO");
assert.strictEqual(parsedSemantic.performance.annual.situation.sourceKey, "annual:situation");
assert.strictEqual(parsedSemantic.performance.unclassified.length, 0);

const syntheticAmbiguousNotePage = syntheticGenericGradesPage.replace(
  '<th title="Prova de Hardware">PH</th>',
  '<th>NOTA</th>'
);
const parsedAmbiguous = parser.parseGradesPage(syntheticAmbiguousNotePage, { courseId: "03009999" });
assert.ok(parsedAmbiguous.performance.unclassified.some((item) => item.label === "NOTA"));

const realTooltipHtml = fs.readFileSync("fixtures/ver-notas-fisica.html", "utf8");
const parsedRealTooltip = parser.parseGradesPage(realTooltipHtml, courses.find((course) => course.code === "99990001"));
const firstRealPeriod = parsedRealTooltip.periods[0];

assert.strictEqual(parsedRealTooltip.tableFound, true);
assert.strictEqual(parsedRealTooltip.hasGrades, true);
assert.strictEqual(firstRealPeriod.grades[0].label, "FE");
assert.strictEqual(firstRealPeriod.grades[0].nomeCompleto, "Força Eletrostática");
assert.strictEqual(firstRealPeriod.grades[1].label, "CE");
assert.strictEqual(firstRealPeriod.grades[1].nomeCompleto, "Campo Elétrico");
assert.strictEqual(firstRealPeriod.grades.length, 2);

const syntheticAttendanceHtml = `
  <html>
    <body>
      <section>
        <div>Aulas (Ministradas/Total): <i>32 / 80</i></div>
      </section>
    </body>
  </html>
`;
const syntheticAttendance = parser.extractAttendance(syntheticAttendanceHtml);
assert.deepStrictEqual(syntheticAttendance, {
  aulasMinistradas: 32,
  aulasTotal: 80,
  percentualCargaMinistrada: 40
});

const syntheticAttendanceWithPercentHtml = `
  <html>
    <body>
      <div>Aulas (Ministradas/Total): <i>32 / 80</i></div>
      <div class="progress">
        <div class="progress-bar" style="width: 42.5%;">42,5%</div>
      </div>
      <div>% de Carga Horária Ministrada</div>
    </body>
  </html>
`;
const syntheticAttendanceWithPercent = parser.extractAttendance(syntheticAttendanceWithPercentHtml);
assert.deepStrictEqual(syntheticAttendanceWithPercent, {
  aulasMinistradas: 32,
  aulasTotal: 80,
  percentualCargaMinistrada: 42.5
});

const syntheticGenericAttendanceHtml = `
  <html>
    <body>
      <div class="progress">32 / 80</div>
      <div>% de Carga Horária Ministrada</div>
    </body>
  </html>
`;
const syntheticGenericAttendance = parser.extractAttendance(syntheticGenericAttendanceHtml);
assert.deepStrictEqual(syntheticGenericAttendance, {
  aulasMinistradas: 32,
  aulasTotal: 80,
  percentualCargaMinistrada: 40
});

assert.strictEqual(parser.extractAttendance("<html><body>Sem informacao de aulas.</body></html>"), null);

const savedVerNotas = fs.readFileSync("fixtures/turma-virtual-fisica.html", "utf8");
const savedAttendance = parser.extractAttendance(savedVerNotas);
const savedCurrentCourse = parser.extractCurrentCourse(savedVerNotas);
assert.strictEqual(savedAttendance.aulasMinistradas, 61);
assert.strictEqual(savedAttendance.aulasTotal, 120);
assert.strictEqual(savedAttendance.percentualCargaMinistrada, 51);
assert.strictEqual(savedCurrentCourse.code, "99990001");
assert.strictEqual(savedCurrentCourse.name, "FÍSICA");

const parsedSavedVerNotas = parser.parseGradesPage(savedVerNotas, courses.find((course) => course.code === "99990001"));
assert.strictEqual(parsedSavedVerNotas.tableFound, false);

console.log("parser-smoke-ok");
