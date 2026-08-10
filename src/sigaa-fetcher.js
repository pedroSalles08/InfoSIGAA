(function () {
  "use strict";

  const BASE_URL = "https://sig.iffarroupilha.edu.br/sigaa/ava/index.jsf";
  const privacyStorage = globalThis.InfoSigaaPrivacyStorage || (
    typeof require === "function" ? require("./privacy-storage.js") : null
  );
  const STORAGE_KEY = privacyStorage?.DATA_KEY || "sigaa-grade-monitor:data:v3";
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

  async function postJsf(html, formId, params) {
    const action = globalThis.SigaaParser.extractFormAction(html, formId);
    const payload = globalThis.SigaaParser.buildFormPayload(html, formId, params);

    return fetchHtml(absoluteSigaaUrl(action), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: encodePayload(payload)
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
    if (isPublicMode(privacyContext)) {
      return null;
    }

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
      throw new Error("Nao foi possivel salvar os dados atualizados.");
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

  async function refreshAllGrades(activePage, requestedPrivacyContext) {
    const parser = globalThis.SigaaParser;
    const privacyContext = normalizePrivacyContext(requestedPrivacyContext);
    const previousData = await loadStoredGrades(privacyContext);
    const startedAt = new Date().toISOString();

    try {
      const hasActiveSigaaPage =
        activePage?.html &&
        /^https:\/\/sig\.iffarroupilha\.edu\.br\/sigaa\//.test(activePage.url || "");

      if (hasActiveSigaaPage && parser.isAuthenticationPage(activePage.html, activePage.url, 200)) {
        if (isPublicMode(privacyContext)) {
          await discardCurrentData(privacyContext);
        }

        return buildAuthenticationResult(previousData, startedAt, privacyContext);
      }

      const authenticatedIndexHtml = await fetchHtml(BASE_URL);
      const activeHtml = hasActiveSigaaPage ? getActivePageHtml(activePage) : "";
      const indexHtml = hasActiveSigaaPage ? activePage.html : authenticatedIndexHtml;
      const activeGrades = hasActiveSigaaPage
        ? parser.parseGradesPage(indexHtml, {
            rawTitle: activePage.title || "Pagina atual"
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

      if (initialCourses.length === 0) {
        return buildRefreshFailure(
          previousData,
          startedAt,
          "refresh_failed",
          "Nao encontrei a lista de materias. Abra o portal discente do SIGAA e tente novamente.",
          privacyContext
        );
      }

      const results = [];
      let navigationHtml = indexHtml;

      for (const initialCourse of initialCourses.slice(0, MAX_COURSES)) {
        try {
          const sourceHtml = initial.type === "portal" ? indexHtml : navigationHtml;
          const freshCourses =
            initial.type === "portal"
              ? parser.extractPortalCourses(sourceHtml)
              : parser.extractCourses(sourceHtml);
          const course = freshCourses.find((item) => item.courseId === initialCourse.courseId) || initialCourse;
          const courseHtml = await postJsf(sourceHtml, course.formId, course.params);

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
              error: "Nao encontrei a opcao Ver Notas nesta materia."
            });
            continue;
          }

          const gradesHtml = await postJsf(courseHtml, verNotasAction.formId, verNotasAction.params);
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
            summary: parsedGrades.summary,
            attendance,
            updatedAt: new Date().toISOString()
          });
        } catch (error) {
          if (isSessionExpiredError(error)) {
            throw error;
          }

          results.push({
            ...initialCourse,
            periods: [],
            summary: {},
            error: error.message || "Falha ao buscar notas desta materia."
          });
        }
      }

      if (results.every((course) => course.error)) {
        return buildRefreshFailure(
          previousData,
          startedAt,
          "refresh_failed",
          isPublicMode(privacyContext)
            ? "Nao foi possivel atualizar nenhuma materia. Tente novamente."
            : "Nao foi possivel atualizar nenhuma materia. Os ultimos dados validos foram preservados.",
          privacyContext
        );
      }

      const currentData = {
        ok: true,
        status: "ok",
        updatedAt: new Date().toISOString(),
        courses: results,
        errors: results.filter((course) => course.error).length,
        noGrades: results.filter((course) => course.noGrades).length
      };
      const matchingPrevious = await getPreviousForCurrent(
        previousData,
        currentData,
        privacyContext
      );
      const data = globalThis.SigaaSnapshot.annotateChanges(
        currentData,
        matchingPrevious
      );

      return persistSuccessfulData(data, privacyContext);
    } catch (error) {
      if (isSessionExpiredError(error)) {
        if (isPublicMode(privacyContext)) {
          await discardCurrentData(privacyContext);
        }

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
