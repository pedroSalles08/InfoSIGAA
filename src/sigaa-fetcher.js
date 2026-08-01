(function () {
  "use strict";

  const BASE_URL = "https://sig.iffarroupilha.edu.br/sigaa/ava/index.jsf";
  const STORAGE_KEY = "sigaa-grade-monitor:data:v2";
  const MAX_COURSES = 30;

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

  async function loadStoredGrades() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        resolve(result[STORAGE_KEY] || null);
      });
    });
  }

  async function saveStoredGrades(data) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [STORAGE_KEY]: data }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve();
      });
    });
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

  async function refreshAllGrades(activePage) {
    const parser = globalThis.SigaaParser;
    const previousData = await loadStoredGrades();
    const startedAt = new Date().toISOString();
    const hasActiveSigaaPage =
      activePage?.html &&
      /^https:\/\/sig\.iffarroupilha\.edu\.br\/sigaa\//.test(activePage.url || "");
    const activeHtml = hasActiveSigaaPage ? getActivePageHtml(activePage) : "";
    const indexHtml = hasActiveSigaaPage ? activePage.html : await fetchHtml(BASE_URL);

    if (parser.isLoginPage(indexHtml)) {
      return {
        ok: false,
        status: "not_logged_in",
        updatedAt: startedAt,
        courses: [],
        message: "Entre no SIGAA no navegador e tente atualizar novamente."
      };
    }

    const activeGrades = hasActiveSigaaPage
      ? parser.parseGradesPage(indexHtml, {
          rawTitle: activePage.title || "Pagina atual"
        })
      : null;
    const activeAttendance = hasActiveSigaaPage ? parser.extractAttendance(activeHtml || indexHtml) : null;
    const activeCourse = hasActiveSigaaPage ? parser.extractCurrentCourse(activeHtml || indexHtml) : null;

    if (activeGrades?.tableFound && activeGrades.hasGrades) {
      const updatedAt = new Date().toISOString();
      const data = globalThis.SigaaSnapshot.mergeActiveCourse(
        previousData,
        {
          ...activeGrades.course,
          studentName: activeGrades.studentName,
          enrollment: activeGrades.enrollment,
          periods: activeGrades.periods,
          summary: activeGrades.summary,
          attendance: activeAttendance,
          updatedAt
        },
        updatedAt
      );

      await saveStoredGrades(data);
      return data;
    }

    const initial = getInitialCourses(parser, indexHtml);
    const initialCourses = initial.courses;

    if (initialCourses.length === 0) {
      return {
        ok: false,
        status: "no_courses",
        updatedAt: startedAt,
        courses: [],
        message: "Nao encontrei a lista de materias. Abra o portal discente do SIGAA e clique em Atualizar."
      };
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
        results.push({
          ...initialCourse,
          periods: [],
          summary: {},
          error: error.message || "Falha ao buscar notas desta materia."
        });
      }
    }

    const data = globalThis.SigaaSnapshot.annotateChanges(
      {
        ok: true,
        status: "ok",
        updatedAt: new Date().toISOString(),
        courses: results,
        errors: results.filter((course) => course.error).length,
        noGrades: results.filter((course) => course.noGrades).length
      },
      previousData
    );

    await saveStoredGrades(data);
    return data;
  }

  globalThis.SigaaFetcher = {
    BASE_URL,
    STORAGE_KEY,
    loadStoredGrades,
    refreshAllGrades,
    saveStoredGrades
  };
})();
