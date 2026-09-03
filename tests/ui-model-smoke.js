const assert = require("assert");
require("../src/academic-model.js");
const uiModel = require("../src/ui-model.js");

function value(sourceKey, label, valueText, extra = {}) {
  return globalThis.InfoSigaaAcademicModel.createValue({
    sourceKey,
    role: extra.role || "assessment",
    label,
    fullName: extra.fullName || label,
    value: valueText,
    rawValue: valueText,
    ...extra
  });
}

const changedAssessment = {
  ...value("semester:2:assessment:p2", "P2", "8,5"),
  changed: true,
  changeType: "changed",
  previousValue: "7,0"
};
const courses = [
  {
    courseId: "A",
    year: "2026",
    rawTitle: "12345 - FÍSICA II (80h) - Turma: A",
    teachers: ["Professora Teste"],
    summary: { faltas: "4" },
    recentChangeStatus: "changed",
    changes: [{ field: "P2", currentValue: "8,5", previousValue: "7,0" }],
    performance: {
      semesters: [
        { number: 1, label: "1º semestre", assessments: [value("s1:p1", "P1", "7,0")], result: value("s1:r", "Resultado", "7,0") },
        { number: 2, label: "2º semestre", assessments: [value("s2:p1", "P1", "8,0"), changedAssessment], result: value("s2:r", "Resultado", "8,2") }
      ],
      annual: {
        average: value("annual:average", "Média anual", "7,7"),
        result: value("annual:result", "Resultado", "Aprovado"),
        situation: value("annual:situation", "Situação", "Aprovado")
      },
      exam: value("exam:result", "Exame", "6,0"),
      unclassified: []
    }
  },
  {
    courseId: "B",
    year: "2026",
    rawTitle: "67890 - QUÍMICA I (40h)",
    noGrades: true,
    summary: {},
    performance: { semesters: [], annual: {}, exam: value("exam:result", "Exame", "", { columnExists: false }), unclassified: [] }
  },
  {
    courseId: "C",
    year: "2026",
    rawTitle: "BIOLOGIA",
    refreshError: "Sessão expirou",
    stale: true,
    summary: { faltas: "2" },
    performance: { semesters: [], annual: {}, exam: value("exam:result", "Exame", "", { columnExists: false }), unclassified: [] }
  }
];

assert.strictEqual(uiModel.courseName(courses[0]), "Física II");
assert.strictEqual(uiModel.selectedYear({ courses }), "2026");
assert.strictEqual(uiModel.normalizeSemesterFocus(9), 0);
assert.strictEqual(uiModel.semesterFocus({ semesterFocusByYear: { 2026: 2 } }, "2026"), 2);
assert.deepStrictEqual(uiModel.filterCourses(courses, { filter: "all" }).map((course) => course.courseId), ["A", "B", "C"], "A ordem original do SIGAA deve ser preservada.");
assert.deepStrictEqual(uiModel.filterCourses(courses, { filter: "no-grades" }).map((course) => course.courseId), ["B"]);
assert.deepStrictEqual(uiModel.filterCourses(courses, { filter: "errors" }).map((course) => course.courseId), ["C"]);
assert.deepStrictEqual(uiModel.filterCourses(courses, { query: "professora" }).map((course) => course.courseId), ["A"]);

const semesterAssessments = uiModel.getFocusedAssessments(courses[0], 2);
assert.deepStrictEqual(semesterAssessments.map((item) => item.label), ["P1", "P2"]);
assert.strictEqual(semesterAssessments[1].previousValue, "7,0");
const annualAssessments = uiModel.getFocusedAssessments(courses[0], 0);
assert.deepStrictEqual(annualAssessments.map((item) => `${item.semesterNumber}:${item.label}`), ["2:P2", "2:P1", "1:P1"]);

const view = uiModel.getCourseView(courses[0], 2);
assert.strictEqual(view.exam.value, "6,0");
assert.strictEqual(view.focusResult.value, "8,2");
assert.strictEqual(uiModel.getCourseView(courses[2]).state, "stale");
const overview = uiModel.getOverview(courses, 2);
assert.strictEqual(overview.courses, 3);
assert.strictEqual(overview.noGrades, 1);
assert.strictEqual(overview.errors, 1);
assert.strictEqual(overview.changes, 1);

const legacyCourse = {
  rawTitle: "MATEMÁTICA",
  summary: {},
  periods: [
    { name: "1º Semestre", grades: [{ sigla: "N1", value: "6,5" }] },
    { name: "Exame", grades: [{ sigla: "EX", value: "7,0" }] }
  ]
};
assert.strictEqual(uiModel.courseHasGrades(legacyCourse), true);
assert.strictEqual(uiModel.getFocusedAssessments(legacyCourse, 1)[0].value, "6,5");
assert.strictEqual(uiModel.getCourseView(legacyCourse).exam.value, "7,0");

console.log("ui-model-smoke-ok");
