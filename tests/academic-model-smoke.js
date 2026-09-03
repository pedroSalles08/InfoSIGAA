const assert = require("assert");
const model = require("../src/academic-model.js");
const uiFormat = require("../src/ui-format.js");

assert.strictEqual(model.parseNumber("7,5"), 7.5);
assert.strictEqual(model.parseNumber("--"), null);
assert.strictEqual(model.getAvailability("", true), "not_informed");
assert.strictEqual(model.getAvailability("7,0", true), "available");
assert.strictEqual(model.getAvailability("", false), "not_exposed");

const unknownResult = model.createValue({
  sourceKey: "semester:1:result",
  role: "semester_result",
  label: "Resultado do 1º semestre",
  rawValue: "--",
  evidence: "unit-column"
});
assert.strictEqual(unknownResult.availability, "not_informed");
assert.strictEqual(unknownResult.finality, "unknown");

assert.strictEqual(model.calculateAnnual(8, 6), 6.8);
assert.ok(Math.abs(model.calculateRequiredSecondSemester(8, 7) - (19 / 3)) < 1e-12);
assert.strictEqual(model.calculateAnnual(null, 7), null);
assert.strictEqual(model.calculateRequiredSecondSemester(undefined, 7), null);
const attendance = model.getAttendanceMetrics({
  attendance: { aulasMinistradas: 61, aulasTotal: 120 },
  summary: { faltas: "12" }
});
assert.ok(Math.abs(attendance.presencaAtual - ((49 / 61) * 100)) < 1e-12);
assert.strictEqual(attendance.presencaFinalMaxima, 90);
assert.strictEqual(attendance.limiteFaltas, 30);
assert.strictEqual(attendance.margemFaltas, 18);
assert.strictEqual(attendance.status, "ok");

const temporarilyBelow = model.getAttendanceMetrics({
  attendance: { aulasMinistradas: 10, aulasTotal: 100 },
  summary: { faltas: "3" }
});
assert.strictEqual(temporarilyBelow.presencaAtual, 70);
assert.strictEqual(temporarilyBelow.status, "ok", "Ficar abaixo de 75% durante o período não deve gerar alerta por si só.");
assert.strictEqual(temporarilyBelow.margemFaltas, 22);

const noMargin = model.getAttendanceMetrics({
  attendance: { aulasMinistradas: 40, aulasTotal: 80 },
  summary: { faltas: "20" }
});
assert.strictEqual(noMargin.status, "warning");
assert.strictEqual(noMargin.margemFaltas, 0);

const exceeded = model.getAttendanceMetrics({
  attendance: { aulasMinistradas: 40, aulasTotal: 80 },
  summary: { faltas: "21" }
});
assert.strictEqual(exceeded.status, "critical");
assert.strictEqual(exceeded.margemFaltas, -1);

const missingAbsences = model.getAttendanceMetrics({
  attendance: { aulasMinistradas: 40, aulasTotal: 80 },
  summary: { faltas: "--" }
});
assert.strictEqual(missingAbsences.faltas, null);
assert.strictEqual(missingAbsences.presencaAtual, null);
assert.strictEqual(missingAbsences.margemFaltas, null);
assert.strictEqual(missingAbsences.status, "unknown");

const inconsistentAttendance = model.getAttendanceMetrics({
  attendance: { aulasMinistradas: 10, aulasTotal: 80 },
  summary: { faltas: "12" }
});
assert.strictEqual(inconsistentAttendance.presencaAtual, null);
assert.strictEqual(inconsistentAttendance.presencaFinalMaxima, null);
assert.strictEqual(inconsistentAttendance.margemFaltas, null);
assert.strictEqual(inconsistentAttendance.status, "unknown");
assert.strictEqual(uiFormat.formatNumber(7.5), "7,5");
assert.match(uiFormat.formatUpdatedAt("2026-08-28T17:20:00.000Z"), /^Atualizado em .* às \d{2}:\d{2}$/);

console.log("academic-model-smoke-ok");
