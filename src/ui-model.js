(function () {
  "use strict";

  const academicModel = globalThis.InfoSigaaAcademicModel || (
    typeof require === "function" ? require("./academic-model.js") : null
  );
  const VALID_SEMESTER_FOCUS = new Set([0, 1, 2]);

  function normalizeText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function normalizeSearchText(value) {
    return normalizeText(value)
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function normalizeSemesterFocus(value) {
    const focus = Number(value) || 0;
    return VALID_SEMESTER_FOCUS.has(focus) ? focus : 0;
  }

  function selectedYear(data) {
    return normalizeText((data?.courses || []).map((course) => course?.year).find(Boolean)) ||
      String(new Date().getFullYear());
  }

  function semesterFocus(preferences, year) {
    return normalizeSemesterFocus(preferences?.semesterFocusByYear?.[year]);
  }

  function originalCourseTitle(course) {
    return normalizeText(
      course?.rawTitle ||
      [course?.code, course?.name].filter(Boolean).join(" - ") ||
      "Matéria"
    );
  }

  function toTitleCase(value) {
    const lowercaseWords = new Set(["a", "as", "com", "da", "das", "de", "do", "dos", "e", "em", "no", "nos"]);
    const romanNumeralPattern = /^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i;

    return normalizeText(value)
      .toLocaleLowerCase("pt-BR")
      .split(" ")
      .map((word, index) => {
        if (romanNumeralPattern.test(word)) return word.toLocaleUpperCase("pt-BR");
        if (index > 0 && lowercaseWords.has(word)) return word;
        return word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1);
      })
      .join(" ");
  }

  function courseName(course) {
    const originalTitle = originalCourseTitle(course);
    const cleaned = originalTitle
      .replace(/^\s*\d{5,}\s*-\s*/, "")
      .replace(/\s*\(\s*\d+\s*h\s*\)\s*/gi, " ")
      .replace(/\s*-\s*Turma\s*:\s*.*$/i, "")
      .replace(/\s*\[[^\]]+\]\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const fallback = normalizeText(course?.name) || originalTitle;
    return toTitleCase(cleaned.length >= 2 ? cleaned : fallback);
  }

  function hasRecentChange(course) {
    return ["new", "changed", "removed"].includes(course?.recentChangeStatus || course?.changeStatus) ||
      Boolean(course?.changes?.length);
  }

  function hasAvailableValue(value) {
    return value?.availability === "available";
  }

  function legacyGradeValue(grade) {
    return normalizeText(grade?.value || grade?.valor);
  }

  function legacyPeriodKey(period) {
    return normalizeSearchText(period?.name);
  }

  function legacyAssessments(course, semesterNumber) {
    const semesterKey = String(semesterNumber);
    return (course?.periods || [])
      .filter((period) => {
        const key = legacyPeriodKey(period);
        return key.includes(semesterKey) && key.includes("semestre");
      })
      .flatMap((period) => (period.grades || []).map((grade, index) => ({
        ...grade,
        sourceKey: grade.sourceKey || `legacy:${semesterNumber}:${index}`,
        label: normalizeText(grade.label || grade.sigla || "Nota"),
        fullName: normalizeText(grade.fullName || grade.nomeCompleto),
        value: legacyGradeValue(grade),
        availability: legacyGradeValue(grade) && !["-", "--"].includes(legacyGradeValue(grade))
          ? "available"
          : "not_informed",
        semesterNumber: Number(semesterNumber),
        semesterLabel: `${semesterNumber}º semestre`,
        sourceOrder: index
      })));
  }

  function legacyExam(course) {
    const grade = (course?.periods || [])
      .find((period) => legacyPeriodKey(period).includes("exame"))
      ?.grades?.find((item) => legacyGradeValue(item) && !["-", "--"].includes(legacyGradeValue(item)));
    if (!grade) return null;
    return {
      ...grade,
      sourceKey: grade.sourceKey || "legacy:exam",
      label: normalizeText(grade.label || grade.sigla || "Exame"),
      fullName: normalizeText(grade.fullName || grade.nomeCompleto),
      value: legacyGradeValue(grade),
      availability: "available"
    };
  }

  function courseHasGrades(course) {
    if (course?.error || course?.noGrades) return false;
    const performance = academicModel.getCoursePerformance(course);
    return (performance.semesters || []).some((semester) =>
      hasAvailableValue(semester.result) || (semester.assessments || []).some(hasAvailableValue)
    ) || hasAvailableValue(performance.annual?.average) || hasAvailableValue(performance.exam) ||
      [1, 2].some((semesterNumber) => legacyAssessments(course, semesterNumber).some(hasAvailableValue));
  }

  function getFocusedAssessments(course, focus, limit = 5) {
    const normalizedFocus = normalizeSemesterFocus(focus);
    const semesters = [...(academicModel.getCoursePerformance(course).semesters || [])];
    const availableFrom = (semester) => (semester?.assessments || [])
      .filter(hasAvailableValue)
      .map((assessment, index) => ({
        ...assessment,
        semesterNumber: semester.number,
        semesterLabel: semester.label || `${semester.number}º semestre`,
        sourceOrder: index
      }));

    if (normalizedFocus) {
      const semester = semesters.find((item) => Number(item.number) === normalizedFocus);
      const assessments = availableFrom(semester);
      return (assessments.length ? assessments : legacyAssessments(course, normalizedFocus).filter(hasAvailableValue)).slice(0, limit);
    }

    const annualAssessments = semesters
      .sort((left, right) => Number(right.number) - Number(left.number))
      .flatMap((semester) => availableFrom(semester).reverse())
      .slice(0, limit);
    if (annualAssessments.length) return annualAssessments;
    return [2, 1]
      .flatMap((semesterNumber) => legacyAssessments(course, semesterNumber).filter(hasAvailableValue).reverse())
      .slice(0, limit);
  }

  function getCourseView(course, focus = 0) {
    const normalizedFocus = normalizeSemesterFocus(focus);
    const performance = academicModel.getCoursePerformance(course);
    const attendance = academicModel.getAttendanceMetrics(course);
    const state = course?.error
      ? "error"
      : course?.refreshError || course?.stale
        ? "stale"
        : course?.noGrades
          ? "no_grades"
          : "ok";

    return {
      course,
      name: courseName(course),
      originalTitle: originalCourseTitle(course),
      teachers: Array.isArray(course?.teachers) ? course.teachers.map(normalizeText).filter(Boolean) : [],
      state,
      stateMessage: course?.refreshError || course?.error || course?.message || "",
      hasGrades: courseHasGrades(course),
      hasRecentChange: hasRecentChange(course),
      performance,
      attendance,
      focus: normalizedFocus,
      focusResult: normalizedFocus ? academicModel.getSemesterResult(course, normalizedFocus) : null,
      focusedAssessments: getFocusedAssessments(course, normalizedFocus),
      annualAverage: performance.annual?.average || null,
      annualResult: performance.annual?.result || null,
      situation: performance.annual?.situation || null,
      exam: hasAvailableValue(performance.exam) ? performance.exam : legacyExam(course) || performance.exam || null,
      unclassified: performance.unclassified || [],
      changes: course?.changes || []
    };
  }

  function courseMatchesFilter(view, filter) {
    if (filter === "with-grades") return view.hasGrades;
    if (filter === "no-grades") return view.state === "no_grades";
    if (filter === "changed") return view.hasRecentChange;
    if (filter === "errors") return view.state === "error" || view.state === "stale";
    return true;
  }

  function courseMatchesSearch(view, query) {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return true;
    const haystack = normalizeSearchText([
      view.name,
      view.originalTitle,
      view.course?.name,
      view.course?.code,
      ...view.teachers
    ].filter(Boolean).join(" "));
    return haystack.includes(normalizedQuery);
  }

  function filterCourses(courses, { filter = "all", query = "" } = {}) {
    return (courses || []).filter((course) => {
      const view = getCourseView(course);
      return courseMatchesFilter(view, filter) && courseMatchesSearch(view, query);
    });
  }

  function getOverview(courses, focus = 0) {
    const views = (courses || []).map((course) => getCourseView(course, focus));
    const reportedAbsences = views
      .map((view) => view.attendance?.faltas)
      .filter(Number.isFinite);
    return {
      courses: views.length,
      withGrades: views.filter((view) => view.hasGrades).length,
      noGrades: views.filter((view) => view.state === "no_grades").length,
      errors: views.filter((view) => view.state === "error" || view.state === "stale").length,
      changes: views.filter((view) => view.hasRecentChange).length,
      changeItems: views.reduce((total, view) => total + view.changes.length, 0),
      annualAverages: views.filter((view) => hasAvailableValue(view.annualAverage)).length,
      semesterResults: focus
        ? views.filter((view) => hasAvailableValue(view.focusResult)).length
        : 0,
      reportedAbsenceCourses: reportedAbsences.length,
      totalAbsences: reportedAbsences.reduce((total, value) => total + value, 0),
      calculableMargins: views.filter((view) => view.attendance?.margemFaltas != null).length
    };
  }

  function collectChanges(courses) {
    const items = [];
    const seen = new Set();
    (courses || []).forEach((course) => {
      (course.changes || []).forEach((change) => {
        const key = `${course.courseId || courseName(course)}:${change.field}:${change.currentValue}`;
        if (seen.has(key)) return;
        seen.add(key);
        items.push({ course: courseName(course), change });
      });
    });
    return items;
  }

  const api = {
    collectChanges,
    courseHasGrades,
    courseName,
    filterCourses,
    getCourseView,
    getFocusedAssessments,
    getOverview,
    hasRecentChange,
    normalizeSearchText,
    normalizeSemesterFocus,
    originalCourseTitle,
    selectedYear,
    semesterFocus
  };

  globalThis.InfoSigaaUiModel = api;
  if (typeof module !== "undefined") module.exports = api;
})();
