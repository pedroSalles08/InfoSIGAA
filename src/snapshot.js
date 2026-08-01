(function () {
  "use strict";

  function normalizeIdentityText(value) {
    return String(value || "")
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeGradeValue(value) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    return text === "--" || text === "-" ? "" : text;
  }

  function getGradeChangeType(previousValue, currentValue) {
    const previous = normalizeGradeValue(previousValue);
    const current = normalizeGradeValue(currentValue);

    if (!previous && current) {
      return "new";
    }

    if (previous && current && previous !== current) {
      return "changed";
    }

    if (previous && !current) {
      return "removed";
    }

    return "";
  }

  function flatGradeMap(course) {
    const map = new Map();

    (course?.periods || []).forEach((period) => {
      (period.grades || []).forEach((grade) => {
        map.set(`${period.name}:${grade.label}`, normalizeGradeValue(grade.value || grade.valor || ""));
      });
    });

    Object.entries(course?.summary || {}).forEach(([key, value]) => {
      map.set(`Resumo:${key}`, normalizeGradeValue(value));
    });

    return map;
  }

  function annotateCourseChanges(course, previousCourse, detectedAt) {
    if (!previousCourse || course.error || course.noGrades) {
      return {
        ...course,
        changeStatus: "unchanged",
        recentChangeStatus: "unchanged",
        changes: []
      };
    }

    const previousGrades = flatGradeMap(previousCourse);
    const changes = [];
    let courseChangeStatus = "unchanged";
    const periods = (course.periods || []).map((period) => ({
      ...period,
      grades: (period.grades || []).map((grade) => {
        const key = `${period.name}:${grade.label}`;
        const previousValue = previousGrades.get(key);
        const currentValue = normalizeGradeValue(grade.value || grade.valor || "");
        const changeType = getGradeChangeType(previousValue, currentValue);

        if (changeType) {
          changes.push({
            type: changeType,
            field: key,
            period: period.name,
            label: grade.label,
            previousValue: normalizeGradeValue(previousValue),
            currentValue,
            detectedAt
          });

          if (changeType === "changed" || courseChangeStatus === "unchanged") {
            courseChangeStatus = changeType;
          }
        }

        return {
          ...grade,
          changed: Boolean(changeType),
          changeType,
          previousValue: changeType ? normalizeGradeValue(previousValue) : "",
          changedAt: changeType ? detectedAt : ""
        };
      })
    }));
    const summary = { ...(course.summary || {}) };
    const summaryChanges = {};

    Object.entries(summary).forEach(([key, value]) => {
      const previousValue = previousGrades.get(`Resumo:${key}`);
      const currentValue = normalizeGradeValue(value);

      if (previousValue != null && normalizeGradeValue(previousValue) !== currentValue) {
        summaryChanges[key] = normalizeGradeValue(previousValue);
      }
    });

    return {
      ...course,
      periods,
      summary,
      summaryChanges,
      changes,
      changeStatus: courseChangeStatus,
      recentChangeStatus: courseChangeStatus,
      recentChangedAt: changes.length > 0 ? detectedAt : ""
    };
  }

  function indexPreviousCourses(previousData) {
    const map = new Map();

    (previousData?.courses || []).forEach((course) => {
      map.set(course.courseId, course);
    });

    return map;
  }

  function annotateChanges(currentData, previousData) {
    const previousCourses = indexPreviousCourses(previousData);
    const detectedAt = currentData.updatedAt || new Date().toISOString();

    return {
      ...currentData,
      courses: (currentData.courses || []).map((course) =>
        annotateCourseChanges(course, previousCourses.get(course.courseId), detectedAt)
      )
    };
  }

  function findUniqueMatchIndex(courses, predicate) {
    const matches = [];

    courses.forEach((course, index) => {
      if (predicate(course)) {
        matches.push(index);
      }
    });

    return matches.length === 1 ? matches[0] : -1;
  }

  function findCourseIndex(courses, currentCourse) {
    if (currentCourse?.courseId) {
      const exactIndex = courses.findIndex((course) => course.courseId === currentCourse.courseId);

      if (exactIndex >= 0) {
        return exactIndex;
      }
    }

    const code = normalizeIdentityText(currentCourse?.code);
    const year = normalizeIdentityText(currentCourse?.year);

    if (code && year) {
      const codeIndex = findUniqueMatchIndex(
        courses,
        (course) => normalizeIdentityText(course.code) === code && normalizeIdentityText(course.year) === year
      );

      if (codeIndex >= 0) {
        return codeIndex;
      }
    }

    const name = normalizeIdentityText(currentCourse?.name);

    if (name && year) {
      return findUniqueMatchIndex(
        courses,
        (course) => normalizeIdentityText(course.name) === name && normalizeIdentityText(course.year) === year
      );
    }

    return -1;
  }

  function mergeActiveCourse(previousData, currentCourse, updatedAt) {
    const detectedAt = updatedAt || new Date().toISOString();
    const hasPreviousSnapshot = Boolean(previousData?.ok && Array.isArray(previousData.courses));
    const previousCourses = hasPreviousSnapshot ? previousData.courses : [];
    const matchIndex = findCourseIndex(previousCourses, currentCourse);
    const courses = [...previousCourses];

    if (matchIndex >= 0) {
      const previousCourse = previousCourses[matchIndex];
      const stableCurrentCourse = {
        ...currentCourse,
        courseId: previousCourse.courseId || currentCourse.courseId
      };
      courses[matchIndex] = annotateCourseChanges(stableCurrentCourse, previousCourse, detectedAt);
    } else {
      courses.push(annotateCourseChanges(currentCourse, null, detectedAt));
    }

    return {
      ...(hasPreviousSnapshot ? previousData : {}),
      ok: true,
      status: "ok",
      updatedAt: detectedAt,
      source: "active-page",
      courses,
      errors: courses.filter((course) => course.error).length,
      noGrades: courses.filter((course) => course.noGrades).length
    };
  }

  const api = {
    annotateChanges,
    findCourseIndex,
    mergeActiveCourse,
    normalizeGradeValue
  };

  globalThis.SigaaSnapshot = api;

  if (typeof module !== "undefined") {
    module.exports = api;
  }
})();
