(function () {
  "use strict";

  const BASE_URL = "https://sig.iffarroupilha.edu.br/sigaa/ava/index.jsf";
  const privacyStorage = globalThis.InfoSigaaPrivacyStorage || (
    typeof require === "function" ? require("./privacy-storage.js") : null
  );
  const STORAGE_KEY = privacyStorage?.DATA_KEY || "sigaa-grade-monitor:data:v4";
  const MAX_COURSES = 30;
  const SESSION_EXPIRED_CODE = "SIGAA_SESSION_EXPIRED";

  class SigaaSessionExpiredError extends Error {
    constructor() {
      super("A sessão do SIGAA expirou.");
      this.name = "SigaaSessionExpiredError";
      this.code = SESSION_EXPIRED_CODE;
    }
  }

  function isSessionExpiredError(error) {
    return error?.code === SESSION_EXPIRED_CODE;
  }

  function isAbortError(error) {
    return error?.name === "AbortError" || error?.code === "INFO_SIGAA_ABORTED";
  }

  function throwIfAborted(signal) {
    if (signal?.aborted) {
      const error = new Error("Atualização cancelada. Os dados anteriores foram preservados.");
      error.name = "AbortError";
      error.code = "INFO_SIGAA_ABORTED";
      throw error;
    }
  }

  function absoluteSigaaUrl(action) {
    return new URL(action || BASE_URL, BASE_URL).toString();
  }

  function normalizeCourseText(value) {
    return globalThis.SigaaParser.normalizeText(value)
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getActivePageHtml(activePage) {
    const parts = [
      activePage?.html,
      ...(activePage?.frames || []).map((frame) => frame.html)
    ].filter(Boolean);

    return parts.join("\n");
  }

  function courseMatchesIdentity(course, identity) {
    if (!course || !identity) {
      return false;
    }

    if (identity.code && course.code && identity.code === course.code) {
      return true;
    }

    const courseName = normalizeCourseText(course.name || course.rawTitle);
    const identityName = normalizeCourseText(identity.name || identity.rawTitle);

    return Boolean(courseName && identityName && courseName === identityName);
  }

  function mergeActiveAttendance(course, attendance, activeAttendance, activeCourse) {
    if (attendance || !activeAttendance || !courseMatchesIdentity(course, activeCourse)) {
      return attendance || null;
    }

    return activeAttendance;
  }

  function getCourseTeachers(course, enrollmentCourses) {
    const code = String(course?.code || "").trim();

    if (code) {
      const codeMatches = enrollmentCourses.filter((item) => String(item?.code || "").trim() === code);

      if (codeMatches.length === 1) {
        return codeMatches[0].teachers || [];
      }
    }

    const name = normalizeCourseText(course?.name || course?.rawTitle);

    if (!name) {
      return [];
    }

    const nameMatches = enrollmentCourses.filter(
      (item) => normalizeCourseText(item?.name) === name
    );

    return nameMatches.length === 1 ? nameMatches[0].teachers || [] : [];
  }

  function attachCourseTeachers(course, enrollmentCourses) {
    return {
      ...course,
      teachers: getCourseTeachers(course, enrollmentCourses)
    };
  }

  async function fetchHtml(url, options) {
    const response = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      redirect: "follow",
      ...options,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...(options?.headers || {})
      }
    });

    const html = await response.text();

    if (globalThis.SigaaParser.isAuthenticationPage(html, response.url, response.status)) {
      throw new SigaaSessionExpiredError();
    }

    if (!response.ok) {
      throw new Error(`SIGAA respondeu HTTP ${response.status}`);
    }

    return html;
  }

  function encodePayload(payload) {
    const body = new URLSearchParams();

    Object.entries(payload || {}).forEach(([key, value]) => {
      body.set(key, value == null ? "" : String(value));
    });

    return body;
  }

  async function postJsf(html, formId, params, signal) {
    const action = globalThis.SigaaParser.extractFormAction(html, formId);
    const payload = globalThis.SigaaParser.buildFormPayload(html, formId, params);

    return fetchHtml(absoluteSigaaUrl(action), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: encodePayload(payload),
      signal
    });
  }

  function normalizePrivacyContext(context) {
    return {
      incognito: Boolean(context?.incognito),
      mode: context?.mode === privacyStorage.PUBLIC_MODE
        ? privacyStorage.PUBLIC_MODE
        : privacyStorage.PERSONAL_MODE
    };
  }

  async function loadStoredGrades(privacyContext) {
    return privacyStorage.loadData(normalizePrivacyContext(privacyContext));
  }

  async function saveStoredGrades(data, privacyContext) {
    return privacyStorage.saveData(normalizePrivacyContext(privacyContext), data);
  }

  function isPublicMode(privacyContext) {
    return normalizePrivacyContext(privacyContext).mode === privacyStorage.PUBLIC_MODE;
  }

  async function discardCurrentData(privacyContext) {
    return privacyStorage.removeCurrentData(normalizePrivacyContext(privacyContext));
  }

  function getCachedData(previousData, privacyContext) {
    return previousData?.ok && Array.isArray(previousData.courses) ? previousData : null;
  }

  function buildAuthenticationResult(previousData, attemptedAt, privacyContext) {
    const cachedData = getCachedData(previousData, privacyContext);

    return {
      ok: false,
      status: cachedData ? "session_expired" : "not_logged_in",
      attemptedAt,
      cachedData,
      message: cachedData
        ? "Sua sessão do SIGAA expirou. Faça login novamente para atualizar."
        : "Entre no SIGAA no navegador para buscar suas notas."
    };
  }

  function buildRefreshFailure(previousData, attemptedAt, status, message, privacyContext) {
    return {
      ok: false,
      status,
      attemptedAt,
      cachedData: getCachedData(previousData, privacyContext),
      message
    };
  }

  async function getPreviousForCurrent(previousData, currentData, privacyContext) {
    if (!previousData) {
      return null;
    }

    const matchingPrevious = privacyStorage.getMatchingPrevious(previousData, currentData);

    if (!matchingPrevious) {
      await discardCurrentData(privacyContext);
    }

    return matchingPrevious;
  }

  async function persistSuccessfulData(data, privacyContext) {
    const ownedData = privacyStorage.attachOwner(data);

    if (isPublicMode(privacyContext) && !privacyStorage.extractOwner(ownedData)) {
      await discardCurrentData(privacyContext);
      return ownedData;
    }

    const saved = await saveStoredGrades(ownedData, privacyContext);

    if (!saved) {
      throw new Error("Não foi possível salvar os dados atualizados.");
    }

    return ownedData;
  }

  function getInitialCourses(parser, html) {
    const portalCourses = parser.extractPortalCourses(html);

    if (portalCourses.length > 0) {
      return {
        type: "portal",
        courses: portalCourses
      };
    }

    return {
      type: "ava",
      courses: parser.extractCourses(html)
    };
  }

  async function refreshAllGrades(activePage, requestedPrivacyContext, options = {}) {
    const parser = globalThis.SigaaParser;
    const signal = options.signal;
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
    const privacyContext = normalizePrivacyContext(requestedPrivacyContext);
    const previousData = await loadStoredGrades(privacyContext);
    const startedAt = new Date().toISOString();

    try {
      throwIfAborted(signal);
      onProgress({ phase: "verifying_session", completedCourses: 0, totalCourses: 0, currentCourseName: "" });
      const hasActiveSigaaPage =
        activePage?.html &&
        /^https:\/\/sig\.iffarroupilha\.edu\.br\/sigaa\//.test(activePage.url || "");

      if (hasActiveSigaaPage && parser.isAuthenticationPage(activePage.html, activePage.url, 200)) {
        return buildAuthenticationResult(previousData, startedAt, privacyContext);
      }

      const authenticatedIndexHtml = await fetchHtml(BASE_URL, { signal });
      const activeHtml = hasActiveSigaaPage ? getActivePageHtml(activePage) : "";
      const indexHtml = hasActiveSigaaPage ? activePage.html : authenticatedIndexHtml;
      const activeGrades = hasActiveSigaaPage
        ? parser.parseGradesPage(indexHtml, {
            rawTitle: activePage.title || "Página atual"
          })
        : null;
      const activeAttendance = hasActiveSigaaPage ? parser.extractAttendance(activeHtml || indexHtml) : null;
      const activeCourse = hasActiveSigaaPage ? parser.extractCurrentCourse(activeHtml || indexHtml) : null;

      if (activeGrades?.tableFound && activeGrades.hasGrades) {
        const updatedAt = new Date().toISOString();
        const currentCourse = {
          ...activeGrades.course,
          studentName: activeGrades.studentName,
          enrollment: activeGrades.enrollment,
          periods: activeGrades.periods,
          performance: activeGrades.performance,
          summary: activeGrades.summary,
          attendance: activeAttendance,
          updatedAt
        };
        const matchingPrevious = await getPreviousForCurrent(
          previousData,
          { courses: [currentCourse] },
          privacyContext
        );
        const data = globalThis.SigaaSnapshot.mergeActiveCourse(
          matchingPrevious,
          currentCourse,
          updatedAt
        );

        return persistSuccessfulData(data, privacyContext);
      }

      const initial = getInitialCourses(parser, indexHtml);
      const initialCourses = initial.courses;
      onProgress({
        phase: "collecting_courses",
        completedCourses: 0,
        totalCourses: Math.min(initialCourses.length, MAX_COURSES),
        currentCourseName: ""
      });

      if (initialCourses.length === 0) {
        return buildRefreshFailure(
          previousData,
          startedAt,
          "refresh_failed",
          "Não foi possível encontrar a lista de disciplinas. Abra o Portal do Discente e tente novamente.",
          privacyContext
        );
      }

      let enrollmentCourses = [];

      if (initial.type === "portal") {
        const certificateAction = parser.extractEnrollmentCertificateAction(indexHtml);

        if (certificateAction) {
          try {
            const certificateHtml = await postJsf(
              indexHtml,
              certificateAction.formId,
              certificateAction.params,
              signal
            );
            enrollmentCourses = parser.extractEnrollmentCourses(certificateHtml);
          } catch (error) {
            if (isSessionExpiredError(error)) {
              throw error;
            }

            console.warn(
              "[InfoSIGAA] Não foi possível obter os docentes no atestado de matrícula:",
              error?.message || error
            );
          }
        }
      }

      const results = [];
      let navigationHtml = indexHtml;

      const selectedCourses = initialCourses.slice(0, MAX_COURSES);
      for (let courseIndex = 0; courseIndex < selectedCourses.length; courseIndex++) {
        const initialCourse = selectedCourses[courseIndex];
        throwIfAborted(signal);
        onProgress({
          phase: "collecting_course",
          completedCourses: courseIndex,
          totalCourses: selectedCourses.length,
          currentCourseName: initialCourse.name || initialCourse.rawTitle || "Disciplina"
        });
        try {
          const sourceHtml = initial.type === "portal" ? indexHtml : navigationHtml;
          const freshCourses =
            initial.type === "portal"
              ? parser.extractPortalCourses(sourceHtml)
              : parser.extractCourses(sourceHtml);
          const course = attachCourseTeachers(
            freshCourses.find((item) => item.courseId === initialCourse.courseId) || initialCourse,
            enrollmentCourses
          );
          const courseHtml = await postJsf(sourceHtml, course.formId, course.params, signal);

          if (initial.type !== "portal") {
            navigationHtml = courseHtml;
          }

          const attendance = mergeActiveAttendance(
            course,
            parser.extractAttendance(courseHtml),
            activeAttendance,
            activeCourse
          );
          const verNotasAction = parser.extractVerNotasAction(courseHtml);

          if (!verNotasAction) {
            results.push({
              ...course,
              periods: [],
              summary: {},
              attendance,
              error: "O SIGAA não exibiu a opção Ver Notas nesta disciplina."
            });
            continue;
          }

          const gradesHtml = await postJsf(courseHtml, verNotasAction.formId, verNotasAction.params, signal);
          const parsedGrades = parser.parseGradesPage(gradesHtml, course);

          if (!parsedGrades.tableFound) {
            results.push({
              ...parsedGrades.course,
              periods: [],
              summary: {},
              attendance,
              noGrades: true,
              noGradesReason: "missing_table",
              message: "Ainda não há notas lançadas para esta matéria."
            });
            continue;
          }

          if (!parsedGrades.hasGrades) {
            results.push({
              ...parsedGrades.course,
              studentName: parsedGrades.studentName,
              enrollment: parsedGrades.enrollment,
              periods: [],
              summary: {},
              attendance,
              noGrades: true,
              noGradesReason: "empty_table",
              message: "Ainda não há notas lançadas para esta matéria."
            });
            continue;
          }

          results.push({
            ...parsedGrades.course,
            studentName: parsedGrades.studentName,
            enrollment: parsedGrades.enrollment,
            periods: parsedGrades.periods,
            performance: parsedGrades.performance,
            summary: parsedGrades.summary,
            attendance,
            updatedAt: new Date().toISOString()
          });
        } catch (error) {
          if (isSessionExpiredError(error) || isAbortError(error)) {
            throw error;
          }

          results.push({
            ...initialCourse,
            periods: [],
            summary: {},
            error: error.message || "Não foi possível buscar as notas desta disciplina."
          });
        }

        onProgress({
          phase: "collecting_course",
          completedCourses: courseIndex + 1,
          totalCourses: selectedCourses.length,
          currentCourseName: initialCourse.name || initialCourse.rawTitle || "Disciplina"
        });
      }

      if (results.every((course) => course.error)) {
        return buildRefreshFailure(
          previousData,
          startedAt,
          "refresh_failed",
          "Não foi possível atualizar nenhuma disciplina. Os dados anteriores foram preservados.",
          privacyContext
        );
      }

      const preliminaryData = {
        ok: true,
        status: "ok",
        schemaVersion: 4,
        needsAcademicModelRefresh: false,
        updatedAt: new Date().toISOString(),
        courses: results,
        errors: results.filter((course) => course.error).length,
        noGrades: results.filter((course) => course.noGrades).length
      };
      const matchingPrevious = await getPreviousForCurrent(
        previousData,
        preliminaryData,
        privacyContext
      );
      const courses = results.map((course) => {
        const previousIndex = globalThis.SigaaSnapshot.findCourseIndex?.(matchingPrevious?.courses || [], course) ?? -1;
        const previousCourse = previousIndex >= 0 ? matchingPrevious?.courses?.[previousIndex] : null;
        if (!course.error || !matchingPrevious) {
          return course;
        }

        return previousCourse
          ? { ...previousCourse, stale: true, refreshError: course.error }
          : course;
      });
      const currentData = {
        ...preliminaryData,
        courses,
        preferences: matchingPrevious?.preferences || previousData?.preferences || {},
        errors: courses.filter((course) => course.error || course.refreshError).length
      };
      onProgress({
        phase: "saving",
        completedCourses: selectedCourses.length,
        totalCourses: selectedCourses.length,
        currentCourseName: ""
      });
      const data = globalThis.SigaaSnapshot.annotateChanges(
        currentData,
        matchingPrevious
      );

      return persistSuccessfulData(data, privacyContext);
    } catch (error) {
      if (isSessionExpiredError(error)) {
        return buildAuthenticationResult(previousData, startedAt, privacyContext);
      }

      throw error;
    }
  }

  globalThis.SigaaFetcher = {
    BASE_URL,
    STORAGE_KEY,
    loadStoredGrades,
    refreshAllGrades,
    saveStoredGrades
  };
})();
