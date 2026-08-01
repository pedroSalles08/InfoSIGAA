const assert = require("assert");
const snapshot = require("../src/snapshot.js");

function makeCourse({
  courseId,
  code,
  name,
  year = "2026",
  value = "8,0",
  recentChangeStatus = "unchanged",
  error = ""
}) {
  return {
    courseId,
    code,
    name,
    year,
    rawTitle: `${code} - ${name} (80h) - Turma: TESTE (${year})`,
    periods: [
      {
        name: "1º Semestre",
        grades: [{ label: "AV1", sigla: "AV1", value, valor: value }]
      }
    ],
    summary: { mediaAnual: value, faltas: "0" },
    recentChangeStatus,
    changeStatus: recentChangeStatus,
    changes: [],
    ...(error ? { error } : {})
  };
}

const courseA = makeCourse({
  courseId: "TEST_TURMA_1",
  code: "99990001",
  name: "FÍSICA",
  value: "8,0"
});
const courseB = makeCourse({
  courseId: "TEST_TURMA_2",
  code: "99990002",
  name: "PROGRAMAÇÃO WEB II",
  value: "9,0",
  recentChangeStatus: "new"
});
const previousData = {
  ok: true,
  status: "ok",
  updatedAt: "2026-07-31T10:00:00.000Z",
  courses: [courseA, courseB],
  errors: 0,
  noGrades: 0
};
const activeCourseA = makeCourse({
  courseId: "https://sig.iffarroupilha.edu.br/sigaa/ava/notas.jsf",
  code: "99990001",
  name: "FÍSICA",
  value: "9,5"
});
const merged = snapshot.mergeActiveCourse(previousData, activeCourseA, "2026-08-01T10:00:00.000Z");

assert.strictEqual(merged.courses.length, 2);
assert.strictEqual(merged.courses[0].courseId, "TEST_TURMA_1");
assert.strictEqual(merged.courses[0].periods[0].grades[0].value, "9,5");
assert.strictEqual(merged.courses[0].periods[0].grades[0].changeType, "changed");
assert.strictEqual(merged.courses[0].periods[0].grades[0].previousValue, "8,0");
assert.strictEqual(merged.courses[0].recentChangeStatus, "changed");
assert.strictEqual(merged.courses[1], courseB);
assert.strictEqual(merged.courses[1].recentChangeStatus, "new");

const unknownCourse = makeCourse({
  courseId: "99990003",
  code: "99990003",
  name: "LÍNGUA PORTUGUESA E LITERATURA",
  value: "7,0"
});
const withUnknownCourse = snapshot.mergeActiveCourse(previousData, unknownCourse, "2026-08-01T11:00:00.000Z");

assert.strictEqual(withUnknownCourse.courses.length, 3);
assert.strictEqual(withUnknownCourse.courses[0], courseA);
assert.strictEqual(withUnknownCourse.courses[1], courseB);
assert.strictEqual(withUnknownCourse.courses[2].courseId, "99990003");
assert.strictEqual(withUnknownCourse.courses[2].recentChangeStatus, "unchanged");
assert.deepStrictEqual(withUnknownCourse.courses[2].changes, []);

const initialSnapshot = snapshot.mergeActiveCourse(null, unknownCourse, "2026-08-01T12:00:00.000Z");

assert.strictEqual(initialSnapshot.courses.length, 1);
assert.strictEqual(initialSnapshot.courses[0].recentChangeStatus, "unchanged");
assert.strictEqual(initialSnapshot.errors, 0);
assert.strictEqual(initialSnapshot.noGrades, 0);

const differentYear = makeCourse({
  courseId: "PAGE_COURSE",
  code: "99990001",
  name: "FÍSICA",
  year: "2027",
  value: "10,0"
});
const withDifferentYear = snapshot.mergeActiveCourse(previousData, differentYear, "2026-08-01T13:00:00.000Z");

assert.strictEqual(withDifferentYear.courses.length, 3);
assert.strictEqual(withDifferentYear.courses[0], courseA);
assert.strictEqual(withDifferentYear.courses[2].courseId, "PAGE_COURSE");

const errorCourse = makeCourse({
  courseId: "TEST_TURMA_ERROR",
  code: "99990004",
  name: "MATÉRIA COM ERRO",
  error: "Falha sintética"
});
const previousWithError = { ...previousData, courses: [courseA, errorCourse], errors: 0 };
const mergedWithError = snapshot.mergeActiveCourse(previousWithError, activeCourseA, "2026-08-01T14:00:00.000Z");

assert.strictEqual(mergedWithError.errors, 1);
assert.strictEqual(mergedWithError.noGrades, 0);

const fullRefresh = snapshot.annotateChanges(
  {
    ok: true,
    status: "ok",
    updatedAt: "2026-08-01T15:00:00.000Z",
    courses: [{ ...courseA, periods: [{ name: "1º Semestre", grades: [{ label: "AV1", value: "8,5" }] }] }]
  },
  previousData
);

assert.strictEqual(fullRefresh.courses[0].periods[0].grades[0].changeType, "changed");
assert.strictEqual(fullRefresh.courses[0].periods[0].grades[0].previousValue, "8,0");

console.log("snapshot-smoke-ok");
