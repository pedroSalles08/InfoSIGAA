(function () {
  "use strict";

  const PLACEHOLDERS = new Set(["", "-", "--"]);

  function normalizeText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function normalizeKey(value) {
    return normalizeText(value)
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function parseNumber(value) {
    const text = normalizeText(value);
    if (PLACEHOLDERS.has(text)) {
      return null;
    }

    const match = text.match(/-?\d+(?:[,.]\d+)?/);
    if (!match) {
      return null;
    }

    const number = Number(match[0].replace(",", "."));
    return Number.isFinite(number) ? number : null;
  }

  function getAvailability(rawValue, columnExists = true) {
    if (!columnExists) {
      return "not_exposed";
    }

    return PLACEHOLDERS.has(normalizeText(rawValue)) ? "not_informed" : "available";
  }

  function createValue({
    sourceKey,
    role,
    label,
    fullName = "",
    value = "",
    rawValue = value,
    evidence = "",
    columnExists = true,
    finality = "unknown"
  }) {
    const availability = getAvailability(rawValue, columnExists);
    const displayValue = availability === "available" ? normalizeText(value || rawValue) : "";

    return {
      sourceKey,
      role,
      label: normalizeText(label),
      fullName: normalizeText(fullName),
      value: displayValue,
      numericValue: parseNumber(displayValue),
      rawValue: normalizeText(rawValue),
      availability,
      evidence,
      finality
    };
  }

  function getSemester(performance, number) {
    return (performance?.semesters || []).find((semester) => semester.number === Number(number)) || null;
  }

  function getCoursePerformance(course) {
    if (course?.performance) {
      return course.performance;
    }

    return {
      semesters: [],
      annual: {
        average: createValue({
          sourceKey: "annual:average",
          role: "annual_average",
          label: "Média anual",
          value: course?.summary?.mediaAnual || "",
          rawValue: course?.summary?.mediaAnual || "",
          evidence: "legacy-summary"
        }),
        result: createValue({
          sourceKey: "annual:result",
          role: "annual_result",
          label: "Resultado",
          value: course?.summary?.resultado || "",
          rawValue: course?.summary?.resultado || "",
          columnExists: Object.prototype.hasOwnProperty.call(course?.summary || {}, "resultado"),
          evidence: "legacy-summary"
        }),
        situation: createValue({
          sourceKey: "annual:situation",
          role: "annual_situation",
          label: "Situação",
          value: course?.summary?.situacao || "",
          rawValue: course?.summary?.situacao || "",
          columnExists: Object.prototype.hasOwnProperty.call(course?.summary || {}, "situacao"),
          evidence: "legacy-summary"
        })
      },
      exam: createValue({
        sourceKey: "exam:result",
        role: "exam_result",
        label: "Exame",
        columnExists: false,
        evidence: "legacy-model"
      }),
      unclassified: [],
      needsRefresh: true
    };
  }

  function getSemesterResult(course, number) {
    return getSemester(getCoursePerformance(course), number)?.result || null;
  }

  function getSemesterAssessments(course, number) {
    return getSemester(getCoursePerformance(course), number)?.assessments || [];
  }

  function getAnnualAverage(course) {
    return getCoursePerformance(course)?.annual?.average || null;
  }

  function finiteInput(value) {
    if (value == null || normalizeText(value) === "") {
      return null;
    }

    const number = typeof value === "string" ? parseNumber(value) : Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function clampPercent(value) {
    return Math.min(100, Math.max(0, value));
  }

  function getAttendanceMetrics(course) {
    const attendance = course?.attendance || {};
    const aulasMinistradas = finiteInput(attendance.aulasMinistradas);
    const aulasTotal = finiteInput(attendance.aulasTotal);
    const faltas = parseNumber(course?.summary?.faltas);
    const hasValidTotals =
      aulasMinistradas != null &&
      aulasTotal != null &&
      aulasMinistradas >= 0 &&
      aulasTotal > 0 &&
      aulasMinistradas <= aulasTotal;
    const hasValidAbsences = faltas != null && faltas >= 0;

    if (!hasValidTotals && !hasValidAbsences) {
      return null;
    }

    const percentualInformado = finiteInput(attendance.percentualCargaMinistrada);
    const percentualCargaMinistrada = hasValidTotals
      ? clampPercent(percentualInformado != null
        ? percentualInformado
        : (aulasMinistradas / aulasTotal) * 100)
      : null;
    const hasConsistentCounts = hasValidTotals && hasValidAbsences && faltas <= aulasMinistradas;
    const presencaAtual = hasConsistentCounts && aulasMinistradas > 0
      ? clampPercent(((aulasMinistradas - faltas) / aulasMinistradas) * 100)
      : null;
    const presencaFinalMaxima = hasConsistentCounts
      ? clampPercent(((aulasTotal - faltas) / aulasTotal) * 100)
      : null;
    const limiteFaltas = hasValidTotals ? Math.floor(aulasTotal * 0.25 + Number.EPSILON) : null;
    const margemFaltas = limiteFaltas != null && hasConsistentCounts ? limiteFaltas - faltas : null;
    const status = margemFaltas == null
      ? "unknown"
      : margemFaltas < 0
        ? "critical"
        : margemFaltas === 0
          ? "warning"
          : "ok";

    return {
      aulasMinistradas: hasValidTotals ? aulasMinistradas : null,
      aulasTotal: hasValidTotals ? aulasTotal : null,
      faltas: hasValidAbsences ? faltas : null,
      percentualCargaMinistrada,
      presencaAtual,
      presencaFinalMaxima,
      limiteFaltas,
      margemFaltas,
      status
    };
  }

  function calculateAnnual(firstSemester, secondSemester) {
    const first = finiteInput(firstSemester);
    const second = finiteInput(secondSemester);
    return first != null && second != null ? first * 0.4 + second * 0.6 : null;
  }

  function calculateRequiredSecondSemester(firstSemester, target = 7) {
    const first = finiteInput(firstSemester);
    const desired = finiteInput(target);
    return first != null && desired != null ? (desired - first * 0.4) / 0.6 : null;
  }

  const api = {
    calculateAnnual,
    calculateRequiredSecondSemester,
    createValue,
    getAnnualAverage,
    getAvailability,
    getCoursePerformance,
    getAttendanceMetrics,
    getSemester,
    getSemesterAssessments,
    getSemesterResult,
    normalizeKey,
    normalizeText,
    parseNumber
  };

  globalThis.InfoSigaaAcademicModel = api;

  if (typeof module !== "undefined") {
    module.exports = api;
  }
})();
