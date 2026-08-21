(function () {
  "use strict";

  const PORTAL_URL = "https://sig.iffarroupilha.edu.br/sigaa/portais/discente/discente.jsf";
  const privacyStorage = globalThis.InfoSigaaPrivacyStorage;

  const elements = {
    refreshButton: document.getElementById("refresh-button"),
    settingsButton: document.getElementById("settings-button"),
    closeSettingsButton: document.getElementById("close-settings-button"),
    clearDataButton: document.getElementById("clear-data-button"),
    status: document.getElementById("status"),
    courses: document.getElementById("courses"),
    lastUpdated: document.getElementById("last-updated"),
    privacySummary: document.getElementById("privacy-summary"),
    searchInput: document.getElementById("course-search"),
    filters: document.getElementById("course-filters"),
    controls: document.getElementById("course-controls"),
    dashboard: document.getElementById("dashboard"),
    privacySetup: document.getElementById("privacy-setup"),
    autoRefreshSetup: document.getElementById("auto-refresh-setup"),
    privacySettings: document.getElementById("privacy-settings"),
    settingsDescription: document.getElementById("settings-description"),
    incognitoNote: document.getElementById("incognito-note"),
    confirmationDialog: document.getElementById("confirmation-dialog"),
    confirmationTitle: document.getElementById("confirmation-title"),
    confirmationMessage: document.getElementById("confirmation-message"),
    confirmActionButton: document.getElementById("confirm-action-button")
  };

  let tooltipElement = null;
  let tooltipTarget = null;
  let currentData = null;
  let searchQuery = "";
  let activeFilter = "all";
  let deviceMode = "";
  let effectiveMode = "";
  let autoRefreshEnabled = false;
  let autoRefreshConfigured = false;
  let autoRefreshOnboardingPending = false;
  let isIncognito = false;
  let pendingConfirmation = null;
  let refreshStatusTimer = null;
  let observedBackgroundRefresh = false;
  const expandedCourseIds = new Set();
  const initializedCourseIds = new Set();

  function formatDateValue(isoDate) {
    if (!isoDate) {
      return "";
    }

    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(new Date(isoDate));
  }

  function formatDate(isoDate) {
    const value = formatDateValue(isoDate);
    return value ? `Atualizado em ${value}` : "Nenhuma atualizacao ainda";
  }

  function setStatus(message, variant) {
    elements.status.hidden = !message;
    elements.status.textContent = message || "";
    elements.status.className = `status${variant ? ` ${variant}` : ""}`;
  }

  function setStatusContent(content, variant) {
    elements.status.hidden = !content;
    elements.status.textContent = "";
    elements.status.className = `status${variant ? ` ${variant}` : ""}`;

    if (content) {
      elements.status.appendChild(content);
    }
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) {
      element.className = className;
    }

    if (text != null) {
      element.textContent = text;
    }

    return element;
  }

  function normalizeTooltipText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeSearchText(value) {
    return normalizeTooltipText(value)
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function getGradeTooltipText(grade, labelText) {
    const tooltipText = normalizeTooltipText(grade.nomeCompleto);
    const normalizedLabel = normalizeTooltipText(labelText).toLowerCase();

    if (!tooltipText || tooltipText.toLowerCase() === normalizedLabel) {
      return "";
    }

    return tooltipText;
  }

  function addTooltipBehavior(element, labelText, fullName) {
    if (!fullName) {
      return;
    }

    element.title = fullName;
    element.dataset.tooltip = fullName;
    element.setAttribute("aria-label", `${labelText}: ${fullName}`);
    element.tabIndex = 0;
    element.addEventListener("mouseenter", showTooltip);
    element.addEventListener("mouseleave", hideTooltip);
    element.addEventListener("focus", showTooltip);
    element.addEventListener("blur", hideTooltip);
  }

  function ensureTooltipElement() {
    if (tooltipElement) {
      return tooltipElement;
    }

    tooltipElement = createElement("div", "custom-tooltip");
    tooltipElement.id = "grade-tooltip";
    tooltipElement.setAttribute("role", "tooltip");
    tooltipElement.hidden = true;
    document.body.appendChild(tooltipElement);

    return tooltipElement;
  }

  function positionTooltip(target, tooltip) {
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const gap = 8;
    const margin = 8;
    let top = targetRect.top - tooltipRect.height - gap;
    let left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;

    if (top < margin) {
      top = targetRect.bottom + gap;
    }

    left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - tooltipRect.height - margin));

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function showTooltip(event) {
    const target = event.currentTarget;
    const text = target?.dataset?.tooltip || "";

    if (!text) {
      return;
    }

    const tooltip = ensureTooltipElement();
    tooltipTarget = target;
    tooltip.textContent = text;
    tooltip.hidden = false;
    target.setAttribute("aria-describedby", tooltip.id);
    positionTooltip(target, tooltip);
  }

  function hideTooltip(event) {
    if (tooltipTarget && event?.currentTarget === tooltipTarget) {
      tooltipTarget.removeAttribute("aria-describedby");
    }

    tooltipTarget = null;

    if (tooltipElement) {
      tooltipElement.hidden = true;
      tooltipElement.textContent = "";
    }
  }

  function getBadge(course) {
    if (course.error) {
      return createElement("span", "badge error", "Erro");
    }

    if (course.noGrades) {
      return createElement("span", "badge no-grades", "Sem notas");
    }

    if (course.recentChangeStatus === "new" || course.changeStatus === "new") {
      return createElement("span", "badge new", "Nova");
    }

    if (course.recentChangeStatus === "changed" || course.changeStatus === "changed") {
      return createElement("span", "badge changed", "Alterada");
    }

    if (course.recentChangeStatus === "removed" || course.changeStatus === "removed") {
      return createElement("span", "badge removed", "Removida");
    }

    return createElement("span", "badge ok", "OK");
  }

  function renderStatusChip(label, value, variant) {
    const chip = createElement("span", `status-chip${variant ? ` ${variant}` : ""}`);
    chip.appendChild(createElement("strong", "", String(value)));
    chip.appendChild(createElement("span", "", label));
    return chip;
  }

  function renderOverallSummary(courses) {
    const errorCount = courses.filter((course) => course.error).length;
    const noGradesCount = courses.filter((course) => course.noGrades).length;
    const changedCount = courses.filter((course) => hasRecentChange(course)).length;
    const loadedCount = courses.length - errorCount - noGradesCount;
    const totalAbsences = courses.reduce((total, course) => {
      const absences = parseLocalizedNumber(course.summary?.faltas);
      return total + (absences == null ? 0 : Math.max(0, absences));
    }, 0);
    const container = createElement("div", "status-chips");

    container.appendChild(renderStatusChip("com notas", loadedCount, "ok"));
    container.appendChild(
      renderStatusChip(
        totalAbsences === 1 ? "falta no total" : "faltas no total",
        new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(totalAbsences),
        "absence"
      )
    );

    if (noGradesCount > 0) {
      container.appendChild(renderStatusChip("sem notas", noGradesCount, "no-grades"));
    }

    if (errorCount > 0) {
      container.appendChild(renderStatusChip("com erro", errorCount, "error"));
    }

    if (changedCount > 0) {
      container.appendChild(renderStatusChip("com mudança", changedCount, "changed"));
    }

    return {
      element: container,
      hasWarning: errorCount > 0
    };
  }

  function getOriginalCourseTitle(course) {
    return normalizeTooltipText(
      course.rawTitle ||
      [course.code, course.name].filter(Boolean).join(" - ") ||
      "Materia"
    );
  }

  function toTitleCase(value) {
    const lowercaseWords = new Set(["a", "as", "com", "da", "das", "de", "do", "dos", "e", "em", "no", "nos"]);
    const romanNumeralPattern = /^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i;

    return normalizeTooltipText(value)
      .toLocaleLowerCase("pt-BR")
      .split(" ")
      .map((word, index) => {
        if (romanNumeralPattern.test(word)) {
          return word.toLocaleUpperCase("pt-BR");
        }

        if (index > 0 && lowercaseWords.has(word)) {
          return word;
        }

        return word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1);
      })
      .join(" ");
  }

  function getCourseDisplayName(course) {
    const originalTitle = getOriginalCourseTitle(course);
    let displayName = originalTitle
      .replace(/^\s*\d{5,}\s*-\s*/, "")
      .replace(/\s*\(\s*\d+\s*h\s*\)\s*/gi, " ")
      .replace(/\s*-\s*Turma\s*:\s*.*$/i, "")
      .replace(/\s*\[[^\]]+\]\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!displayName) {
      displayName = normalizeTooltipText(course.name) || originalTitle;
    }

    if (!displayName || displayName.length < 2) {
      return originalTitle;
    }

    return toTitleCase(displayName);
  }

  function courseHasGrades(course) {
    return !course.error && !course.noGrades && (course.periods || []).length > 0;
  }

  function courseMatchesFilter(course) {
    if (activeFilter === "with-grades") {
      return courseHasGrades(course);
    }

    if (activeFilter === "no-grades") {
      return Boolean(course.noGrades);
    }

    if (activeFilter === "changed") {
      return hasRecentChange(course);
    }

    if (activeFilter === "errors") {
      return Boolean(course.error);
    }

    return true;
  }

  function courseMatchesSearch(course) {
    const query = normalizeSearchText(searchQuery);

    if (!query) {
      return true;
    }

    const haystack = normalizeSearchText([
      getCourseDisplayName(course),
      getOriginalCourseTitle(course),
      course.name,
      course.code
    ].filter(Boolean).join(" "));

    return haystack.includes(query);
  }

  function getFilteredCourses(courses) {
    return sortCourses((courses || []).filter((course) => courseMatchesFilter(course) && courseMatchesSearch(course)));
  }

  function hasRecentChange(course) {
    return ["new", "changed", "removed"].includes(course.recentChangeStatus || course.changeStatus);
  }

  function getCourseSortRank(course) {
    if (hasRecentChange(course)) {
      return 0;
    }

    if (course.error) {
      return 3;
    }

    if (course.noGrades) {
      return 2;
    }

    return 1;
  }

  function sortCourses(courses) {
    return courses
      .map((course, index) => ({ course, index }))
      .sort((left, right) => {
        const rankDiff = getCourseSortRank(left.course) - getCourseSortRank(right.course);

        if (rankDiff !== 0) {
          return rankDiff;
        }

        return left.index - right.index;
      })
      .map(({ course }) => course);
  }

  function getCourseKey(course, index) {
    return normalizeTooltipText(
      [
        course.courseId,
        course.code,
        course.rawTitle || course.name,
        index
      ].filter(Boolean).join("|")
    ) || `course-${index}`;
  }

  function shouldExpandByDefault(course) {
    return hasRecentChange(course);
  }

  function ensureExpansionState(course, index) {
    const courseKey = getCourseKey(course, index);

    if (!initializedCourseIds.has(courseKey)) {
      initializedCourseIds.add(courseKey);

      if (shouldExpandByDefault(course)) {
        expandedCourseIds.add(courseKey);
      }
    }

    return {
      courseKey,
      expanded: expandedCourseIds.has(courseKey)
    };
  }

  function toggleCourse(courseKey) {
    if (expandedCourseIds.has(courseKey)) {
      expandedCourseIds.delete(courseKey);
    } else {
      expandedCourseIds.add(courseKey);
    }

    if (currentData) {
      renderData(currentData);
    }
  }

  function getGradeValue(grade) {
    return normalizeTooltipText(grade.value || grade.valor || "");
  }

  function hasFilledGrade(grade) {
    const value = getGradeValue(grade);
    return Boolean(value && value !== "--" && value !== "-");
  }

  function parseLocalizedNumber(value) {
    const match = normalizeTooltipText(value).match(/-?\d+(?:[,.]\d+)?/);

    if (!match) {
      return null;
    }

    const number = Number(match[0].replace(",", "."));
    return Number.isFinite(number) ? number : null;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function formatPercent(value) {
    if (!Number.isFinite(value)) {
      return "";
    }

    const rounded = Math.round(value * 10) / 10;
    const digits = Number.isInteger(rounded) ? 0 : 1;

    return `${new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: digits,
      maximumFractionDigits: 1
    }).format(rounded)}%`;
  }

  function getAttendanceMetrics(course) {
    const attendance = course.attendance || {};
    const aulasMinistradas = Number(attendance.aulasMinistradas);
    const aulasTotal = Number(attendance.aulasTotal);
    const faltas = parseLocalizedNumber(course.summary?.faltas) ?? 0;

    if (
      !Number.isFinite(aulasMinistradas) ||
      !Number.isFinite(aulasTotal) ||
      aulasMinistradas <= 0 ||
      aulasTotal <= 0
    ) {
      return null;
    }

    const safeFaltas = Math.max(0, faltas);
    const presencaAtual = clamp(((aulasMinistradas - safeFaltas) / aulasMinistradas) * 100, 0, 100);
    const presencaFinalMaxima = clamp(((aulasTotal - safeFaltas) / aulasTotal) * 100, 0, 100);
    const percentualCargaMinistrada = Number.isFinite(Number(attendance.percentualCargaMinistrada))
      ? clamp(Number(attendance.percentualCargaMinistrada), 0, 100)
      : clamp((aulasMinistradas / aulasTotal) * 100, 0, 100);
    let status = "ok";

    if (presencaFinalMaxima < 75) {
      status = "critical";
    } else if (presencaAtual < 75) {
      status = "warning";
    }

    return {
      aulasMinistradas,
      aulasTotal,
      faltas: safeFaltas,
      percentualCargaMinistrada,
      presencaAtual,
      presencaFinalMaxima,
      status
    };
  }

  function getAttendanceStatusText(status) {
    if (status === "critical") {
      return "Risco: não recuperável com as aulas restantes";
    }

    if (status === "warning") {
      return "Atenção: ainda dá para recuperar";
    }

    return "Presença em dia";
  }

  function renderAttendanceBar(metrics, compact) {
    const container = createElement("div", `attendance-bar ${metrics.status}${compact ? " compact" : ""}`);
    const fill = createElement("span", "attendance-fill");
    const width = clamp(metrics.presencaAtual, 0, 100);

    fill.style.width = `${width}%`;

    if (metrics.status === "ok") {
      fill.style.opacity = String(0.58 + (width / 100) * 0.34);
    }

    container.setAttribute("role", "meter");
    container.setAttribute("aria-valuemin", "0");
    container.setAttribute("aria-valuemax", "100");
    container.setAttribute("aria-valuenow", String(Math.round(width)));
    container.setAttribute("aria-label", `Presença atual ${formatPercent(metrics.presencaAtual)}`);
    container.appendChild(fill);

    return container;
  }

  function renderCompactAttendance(course) {
    const metrics = getAttendanceMetrics(course);

    if (!metrics) {
      return null;
    }

    const container = createElement("div", `attendance-compact ${metrics.status}`);
    const header = createElement("div", "attendance-compact-header");
    header.appendChild(createElement("span", "", `Presença ${formatPercent(metrics.presencaAtual)}`));
    header.appendChild(createElement("span", "", `${metrics.aulasMinistradas}/${metrics.aulasTotal} aulas`));
    container.appendChild(header);
    container.appendChild(renderAttendanceBar(metrics, true));
    container.appendChild(createElement("span", "attendance-compact-load", `Carga ministrada ${formatPercent(metrics.percentualCargaMinistrada)}`));

    return container;
  }

  function renderExpandedAttendance(course) {
    const metrics = getAttendanceMetrics(course);

    if (!metrics) {
      return null;
    }

    const container = createElement("section", `attendance-detail ${metrics.status}`);
    const header = createElement("div", "attendance-detail-header");
    header.appendChild(createElement("h3", "period-title", "Frequência"));
    header.appendChild(createElement("span", "attendance-status", getAttendanceStatusText(metrics.status)));
    container.appendChild(header);
    container.appendChild(renderAttendanceBar(metrics, false));

    const items = createElement("div", "attendance-grid");
    [
      { label: "Aulas", value: `${metrics.aulasMinistradas}/${metrics.aulasTotal}` },
      { label: "Carga ministrada", value: formatPercent(metrics.percentualCargaMinistrada) },
      { label: "Faltas", value: String(metrics.faltas) },
      { label: "Presença atual", value: formatPercent(metrics.presencaAtual), highlight: true },
      {
        label: "Máx. possível",
        value: formatPercent(metrics.presencaFinalMaxima),
        title: "Maior presença possível caso o aluno compareça a todas as aulas restantes."
      }
    ].forEach(({ label, value, title, highlight }) => {
      const item = createElement("div", `attendance-item${highlight ? ` ${metrics.status}` : ""}`);
      const labelElement = createElement("span", "", label);

      if (title) {
        labelElement.title = title;
        labelElement.setAttribute("aria-label", title);
        labelElement.tabIndex = 0;
      }

      item.appendChild(labelElement);
      item.appendChild(createElement("strong", "", value));
      items.appendChild(item);
    });

    container.appendChild(items);
    return container;
  }

  function getPeriodKey(period) {
    return normalizeTooltipText(period?.name).toLocaleLowerCase("pt-BR");
  }

  function getFirstSemesterPeriod(course) {
    const periods = course.periods || [];
    return (
      periods.find((period) => getPeriodKey(period).includes("1") && getPeriodKey(period).includes("semestre")) ||
      periods[0] ||
      null
    );
  }

  function periodHasGrades(course, matcher) {
    return (course.periods || []).some((period) =>
      matcher(getPeriodKey(period)) &&
      (period.grades || []).some(hasFilledGrade)
    );
  }

  function getMainFirstSemesterGrades(course) {
    const period = getFirstSemesterPeriod(course);
    return (period?.grades || []).filter(hasFilledGrade).slice(0, 5);
  }

  function renderCompactGradeChip(grade) {
    const labelText = grade.sigla || grade.label || "Nota";
    const value = getGradeValue(grade) || "--";
    const chip = createElement("span", `compact-grade${grade.changeType ? ` ${grade.changeType}` : ""}${grade.changed ? " changed" : ""}`);
    const label = createElement("span", "compact-grade-label", labelText);
    const fullName = getGradeTooltipText(grade, labelText);

    addTooltipBehavior(label, labelText, fullName);
    chip.appendChild(label);
    chip.appendChild(createElement("strong", "", value));

    if (grade.changeType) {
      chip.appendChild(createElement("span", "change-pill", getChangeTypeLabel(grade.changeType)));
    }

    return chip;
  }

  function getChangeTypeLabel(changeType) {
    if (changeType === "new") {
      return "Nova";
    }

    if (changeType === "removed") {
      return "Removida";
    }

    return "Alterada";
  }

  function renderCompactStat(label, value, variant) {
    const text = normalizeTooltipText(value);

    if (!text) {
      return null;
    }

    const item = createElement("span", `compact-stat${variant ? ` ${variant}` : ""}`);
    item.appendChild(createElement("span", "", label));
    item.appendChild(createElement("strong", "", text));
    return item;
  }

  function renderCompactSummary(course) {
    const container = createElement("div", "compact-summary");

    if (course.error) {
      container.appendChild(createElement("p", "error", course.error));
      return container;
    }

    if (course.noGrades) {
      container.appendChild(createElement("p", "empty-notes", course.message || "Ainda não há notas lançadas para esta matéria."));
      const attendance = renderCompactAttendance(course);

      if (attendance) {
        container.appendChild(attendance);
      }

      return container;
    }

    const stats = createElement("div", "compact-stats");
    [
      renderCompactStat("Média", course.summary?.mediaAnual, "average"),
      renderCompactStat("Faltas", course.summary?.faltas, "absence"),
      renderCompactStat("Situação", course.summary?.situacao || course.summary?.resultado, "status")
    ].filter(Boolean).forEach((item) => stats.appendChild(item));

    if (stats.childElementCount > 0) {
      container.appendChild(stats);
    }

    const attendance = renderCompactAttendance(course);

    if (attendance) {
      container.appendChild(attendance);
    }

    const firstSemesterGrades = getMainFirstSemesterGrades(course);

    if (firstSemesterGrades.length > 0) {
      const notes = createElement("div", "compact-notes");
      notes.appendChild(createElement("span", "compact-label", "1º sem."));
      firstSemesterGrades.forEach((grade) => notes.appendChild(renderCompactGradeChip(grade)));
      container.appendChild(notes);
    }

    const flags = createElement("div", "compact-flags");

    if (periodHasGrades(course, (periodName) => periodName.includes("2") && periodName.includes("semestre"))) {
      flags.appendChild(createElement("span", "compact-flag", "2º semestre lançado"));
    }

    if (periodHasGrades(course, (periodName) => periodName.includes("exame"))) {
      flags.appendChild(createElement("span", "compact-flag", "Exame lançado"));
    }

    if (flags.childElementCount > 0) {
      container.appendChild(flags);
    }

    if (container.childElementCount === 0) {
      container.appendChild(createElement("p", "empty-notes", "Notas carregadas, sem resumo disponível."));
    }

    return container;
  }

  function renderGrade(grade, isInline) {
    const item = createElement(
      "div",
      `grade${isInline ? " inline-grade" : ""}${grade.changeType ? ` ${grade.changeType}` : ""}${grade.changed ? " changed" : ""}`
    );
    const labelText = grade.sigla || grade.label || "Nota";
    const label = createElement("span", "grade-label", labelText);
    const fullName = getGradeTooltipText(grade, labelText);

    addTooltipBehavior(label, labelText, fullName);

    item.appendChild(label);
    item.appendChild(createElement("span", "grade-value", grade.value || "--"));

    if (grade.changed) {
      item.appendChild(createElement("span", "change-pill", getChangeTypeLabel(grade.changeType)));
      item.appendChild(createElement("span", "previous-value", `Antes: ${grade.previousValue || "--"}`));
    }

    return item;
  }

  function renderPeriod(period) {
    const grades = period.grades || [];
    const isSingle = grades.length === 1;
    const section = createElement("section", `period${isSingle ? " single-item" : ""}`);

    if (isSingle) {
      const headerRow = createElement("div", "period-single-row");
      headerRow.appendChild(createElement("h3", "period-title", period.name));
      headerRow.appendChild(renderGrade(grades[0], true));
      section.appendChild(headerRow);
      return section;
    }

    section.appendChild(createElement("h3", "period-title", period.name));
    const gradesContainer = createElement("div", "grades");
    grades.forEach((grade) => gradesContainer.appendChild(renderGrade(grade, false)));
    section.appendChild(gradesContainer);

    return section;
  }

  function renderSummary(summary) {
    const entries = [
      ["Média anual", summary?.mediaAnual],
      ["Resultado", summary?.resultado],
      ["Faltas", summary?.faltas],
      ["Situação", summary?.situacao]
    ].filter(([, value]) => value);

    if (entries.length === 0) {
      return null;
    }

    const section = createElement("section", "summary-section");
    section.appendChild(createElement("h3", "period-title", "Resumo do ano"));
    const container = createElement("div", "summary-grid");
    entries.forEach(([label, value]) => {
      const item = createElement("div", "summary-item");
      item.appendChild(createElement("span", "", label));
      item.appendChild(createElement("strong", "", value));
      container.appendChild(item);
    });
    section.appendChild(container);

    return section;
  }

  function renderExpandedContent(course) {
    const fragment = document.createDocumentFragment();

    if (course.error) {
      fragment.appendChild(createElement("p", "error", course.error));
      return fragment;
    }

    if (course.noGrades) {
      fragment.appendChild(createElement("p", "empty-notes", course.message || "Ainda não há notas lançadas para esta matéria."));
      const attendance = renderExpandedAttendance(course);

      if (attendance) {
        fragment.appendChild(attendance);
      }

      return fragment;
    }

    (course.periods || []).forEach((period) => fragment.appendChild(renderPeriod(period)));
    const summary = renderSummary(course.summary);

    if (summary) {
      fragment.appendChild(summary);
    }

    const attendance = renderExpandedAttendance(course);

    if (attendance) {
      fragment.appendChild(attendance);
    }

    return fragment;
  }

  function renderCourse(course, index) {
    const expansion = ensureExpansionState(course, index);
    const article = createElement(
      "article",
      `course${course.noGrades ? " no-grades" : ""}${expansion.expanded ? " expanded" : ""}`
    );
    const header = createElement("header", "course-header");
    const headingBlock = createElement("div", "course-heading");
    const headerActions = createElement("div", "course-actions");
    const originalTitle = getOriginalCourseTitle(course);
    const displayName = getCourseDisplayName(course);
    const title = createElement("h2", "course-title", displayName);

    const toggleButton = createElement("button", "course-toggle");
    const toggleText = createElement("span", "toggle-text", "Detalhes");
    const chevronSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    chevronSvg.setAttribute("class", "toggle-chevron");
    chevronSvg.setAttribute("viewBox", "0 0 24 24");
    chevronSvg.setAttribute("width", "12");
    chevronSvg.setAttribute("height", "12");
    chevronSvg.setAttribute("aria-hidden", "true");
    const chevronPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    chevronPath.setAttribute("fill", "currentColor");
    chevronPath.setAttribute("d", "M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z");
    chevronSvg.appendChild(chevronPath);

    toggleButton.appendChild(toggleText);
    toggleButton.appendChild(chevronSvg);

    if (originalTitle && originalTitle !== displayName) {
      title.title = originalTitle;
      title.setAttribute("aria-label", originalTitle);
    }

    headingBlock.appendChild(title);

    const teachers = Array.isArray(course.teachers)
      ? course.teachers.map((name) => String(name || "").trim()).filter(Boolean)
      : [];

    if (teachers.length > 0) {
      headingBlock.appendChild(createElement("p", "course-teacher muted", teachers.join(" e ")));
    }

    header.appendChild(headingBlock);
    headerActions.appendChild(getBadge(course));
    headerActions.appendChild(toggleButton);
    header.appendChild(headerActions);
    article.appendChild(header);

    const body = createElement("div", "course-body");

    if (expansion.expanded) {
      body.appendChild(renderExpandedContent(course));
    } else {
      body.appendChild(renderCompactSummary(course));
    }

    toggleButton.type = "button";
    toggleButton.setAttribute("aria-expanded", String(expansion.expanded));
    toggleButton.setAttribute("aria-label", `${expansion.expanded ? "Recolher detalhes de" : "Ver detalhes de"} ${displayName}`);
    toggleButton.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleCourse(expansion.courseKey);
    });

    header.addEventListener("click", () => toggleCourse(expansion.courseKey));

    if (!expansion.expanded) {
      body.addEventListener("click", () => toggleCourse(expansion.courseKey));
    }

    article.appendChild(body);
    return article;
  }

  function renderData(data) {
    currentData = data;
    elements.courses.textContent = "";
    elements.controls.hidden = true;
    elements.lastUpdated.textContent = formatDate(data?.updatedAt);

    if (!data) {
      setStatus(
        effectiveMode === privacyStorage.PUBLIC_MODE
          ? "Por privacidade, clique em Atualizar para confirmar seus dados neste uso."
          : "Clique em Atualizar para buscar suas notas no SIGAA.",
        ""
      );
      return;
    }

    if (!data.ok) {
      setStatus(data.message || "Nao foi possivel buscar as notas.", "warning");
      return;
    }

    const courses = data.courses || [];

    if (courses.length === 0) {
      setStatus("Nenhuma materia com notas foi encontrada.", "warning");
      return;
    }

    const summary = renderOverallSummary(courses);
    setStatusContent(summary.element, summary.hasWarning ? "warning" : "");
    elements.controls.hidden = false;

    const filteredCourses = getFilteredCourses(courses);

    if (filteredCourses.length === 0) {
      elements.courses.appendChild(createElement("p", "empty-results", "Nenhuma matéria encontrada com esse filtro."));
      return;
    }

    filteredCourses.forEach((course, index) => elements.courses.appendChild(renderCourse(course, index)));
  }

  async function openSigaaPortal() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!Number.isInteger(tab?.id)) {
      throw new Error("Nao foi possivel localizar a aba atual.");
    }

    await chrome.tabs.update(tab.id, { url: PORTAL_URL });
  }

  function renderRefreshFailure(result) {
    const cachedData = result?.cachedData?.ok ? result.cachedData : null;
    renderData(cachedData);

    const content = createElement("div", "refresh-warning");
    content.appendChild(createElement("p", "refresh-warning-message", result?.message || "Nao foi possivel atualizar as notas."));

    if (cachedData?.updatedAt) {
      content.appendChild(
        createElement(
          "p",
          "refresh-warning-cache",
          `Exibindo dados salvos de ${formatDateValue(cachedData.updatedAt)}.`
        )
      );
    }

    const loginButton = createElement("button", "status-action", "Abrir SIGAA");
    loginButton.type = "button";
    loginButton.addEventListener("click", () => {
      loginButton.disabled = true;
      openSigaaPortal().catch((error) => {
        loginButton.disabled = false;
        setStatus(error.message || "Nao foi possivel abrir o SIGAA.", "warning");
      });
    });
    content.appendChild(loginButton);
    setStatusContent(content, "warning");
  }

  function renderRefreshResult(data) {
    if (data?.ok) {
      renderData(data);
      return;
    }

    if (["session_expired", "not_logged_in", "refresh_failed"].includes(data?.status)) {
      renderRefreshFailure(data);
      return;
    }

    renderData(data);
  }

  function setRefreshRunning(running) {
    elements.refreshButton.disabled = running;
    elements.refreshButton.classList.toggle("is-refreshing", running);
    elements.refreshButton.title = running ? "Atualizando..." : "Atualizar";
    elements.refreshButton.setAttribute("aria-label", running ? "Atualizando" : "Atualizar");

    const srText = elements.refreshButton.querySelector(".sr-only");
    if (srText) {
      srText.textContent = running ? "Atualizando" : "Atualizar";
    }

    if (running) {
      setStatus("Atualizando em segundo plano. Você pode fechar este painel e continuar usando o SIGAA.", "");
    }
  }

  function stopRefreshStatusPolling() {
    if (!refreshStatusTimer) {
      return;
    }

    clearInterval(refreshStatusTimer);
    refreshStatusTimer = null;
  }

  async function syncRefreshStatus() {
    const status = await chrome.runtime.sendMessage({ type: "getRefreshStatus" });

    if (status?.running) {
      observedBackgroundRefresh = true;
      setRefreshRunning(true);
      return;
    }

    if (!observedBackgroundRefresh) {
      return;
    }

    observedBackgroundRefresh = false;
    stopRefreshStatusPolling();
    setRefreshRunning(false);

    if (status?.response?.ok) {
      renderRefreshResult(status.response.data);
      acknowledgeRefreshResult();
      return;
    }

    if (status?.response?.error) {
      setStatus(status.response.error, "warning");
      acknowledgeRefreshResult();
      return;
    }

    const storedData = await privacyStorage.loadData(getPrivacyContext());
    renderData(storedData);
    acknowledgeRefreshResult();
  }

  function startRefreshStatusPolling() {
    if (!refreshStatusTimer) {
      refreshStatusTimer = setInterval(() => {
        syncRefreshStatus().catch(() => {});
      }, 750);
    }

    syncRefreshStatus().catch(() => {});
  }

  function acknowledgeRefreshResult() {
    chrome.runtime.sendMessage({ type: "acknowledgeRefreshResult" }).catch(() => {});
  }

  function refreshGrades() {
    observedBackgroundRefresh = true;
    setRefreshRunning(true);
    chrome.runtime.sendMessage({ type: "refreshGrades" })
      .catch((error) => {
        observedBackgroundRefresh = false;
        stopRefreshStatusPolling();
        setRefreshRunning(false);

        if (effectiveMode === privacyStorage.PUBLIC_MODE) {
          renderData(null);
        }

        setStatus(error.message || "Falha ao atualizar notas.", "warning");
      });
    startRefreshStatusPolling();
  }

  function getPrivacyContext() {
    return {
      incognito: isIncognito,
      deviceMode,
      mode: effectiveMode
    };
  }

  function updatePrivacySummary() {
    if (!effectiveMode) {
      elements.privacySummary.hidden = true;
      elements.privacySummary.textContent = "";
      return;
    }

    elements.privacySummary.hidden = false;
    elements.privacySummary.textContent = effectiveMode === privacyStorage.PUBLIC_MODE
      ? `Modo compartilhado${isIncognito ? " · janela anônima" : ""}`
      : "Modo pessoal";
  }

  function showSetup() {
    elements.privacySetup.hidden = false;
    elements.autoRefreshSetup.hidden = true;
    elements.privacySettings.hidden = true;
    elements.dashboard.hidden = true;
    elements.refreshButton.hidden = true;
    elements.settingsButton.hidden = true;
    updatePrivacySummary();
  }

  function showAutoRefreshSetup() {
    elements.privacySetup.hidden = true;
    elements.autoRefreshSetup.hidden = false;
    elements.privacySettings.hidden = true;
    elements.dashboard.hidden = true;
    elements.refreshButton.hidden = true;
    elements.settingsButton.hidden = true;
    updatePrivacySummary();
  }

  async function showDashboard({ reload = true, message = "" } = {}) {
    elements.privacySetup.hidden = true;
    elements.autoRefreshSetup.hidden = true;
    elements.privacySettings.hidden = true;
    elements.dashboard.hidden = false;
    elements.refreshButton.hidden = false;
    elements.settingsButton.hidden = false;
    updatePrivacySummary();

    if (reload) {
      const storedData = await privacyStorage.loadData(getPrivacyContext());
      renderData(storedData);
    } else {
      renderData(currentData);
    }

    if (message) {
      setStatus(message, "");
    }

    syncRefreshStatus()
      .then(() => {
        if (observedBackgroundRefresh) {
          startRefreshStatusPolling();
        } else {
          acknowledgeRefreshResult();
        }
      })
      .catch(() => {});
  }

  function updateSettingsContent() {
    const displayedMode = isIncognito ? privacyStorage.PUBLIC_MODE : deviceMode;

    elements.privacySettings.querySelectorAll("[data-device-mode]").forEach((button) => {
      const active = button.dataset.deviceMode === displayedMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
      button.disabled = isIncognito;
    });

    elements.incognitoNote.hidden = !isIncognito;
    elements.privacySettings.querySelectorAll("[data-auto-refresh-enabled]").forEach((button) => {
      const active = (button.dataset.autoRefreshEnabled === "true") === autoRefreshEnabled;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    if (isIncognito) {
      elements.settingsDescription.textContent = "Esta janela usa proteção temporária automaticamente. A preferência do navegador não foi alterada.";
    } else if (deviceMode === privacyStorage.PUBLIC_MODE) {
      elements.settingsDescription.textContent = "O painel fica temporário e permanece disponível enquanto esta sessão do Chrome estiver aberta.";
    } else {
      elements.settingsDescription.textContent = "O último painel válido fica salvo neste perfil para abrir rapidamente e comparar mudanças.";
    }
  }

  function showSettings() {
    updateSettingsContent();
    elements.privacySetup.hidden = true;
    elements.autoRefreshSetup.hidden = true;
    elements.dashboard.hidden = true;
    elements.privacySettings.hidden = false;
    elements.refreshButton.hidden = true;
    elements.settingsButton.hidden = true;
  }

  function showConfirmation({ title, message, confirmLabel, onConfirm }) {
    elements.confirmationTitle.textContent = title;
    elements.confirmationMessage.textContent = message;
    elements.confirmActionButton.textContent = confirmLabel;
    elements.confirmationDialog.returnValue = "";
    pendingConfirmation = onConfirm;
    elements.confirmationDialog.showModal();
  }

  async function applyDeviceMode(mode, { continueOnboarding = false } = {}) {
    if (mode === privacyStorage.PUBLIC_MODE) {
      currentData = null;
      elements.courses.textContent = "";
    }

    await privacyStorage.setDeviceMode(mode);
    deviceMode = mode;
    effectiveMode = privacyStorage.getEffectiveMode(deviceMode, isIncognito);
    currentData = null;
    expandedCourseIds.clear();
    initializedCourseIds.clear();

    if (continueOnboarding && !autoRefreshConfigured) {
      showAutoRefreshSetup();
      return;
    }

    await showDashboard({ reload: true });
  }

  async function applyAutoRefreshPreference(enabled, { completeOnboarding = false } = {}) {
    const state = await privacyStorage.setAutoRefreshEnabled(enabled);
    autoRefreshEnabled = state.autoRefreshEnabled;
    autoRefreshConfigured = state.autoRefreshConfigured;
    autoRefreshOnboardingPending = state.autoRefreshOnboardingPending;

    if (completeOnboarding) {
      await showDashboard({ reload: true });
      return;
    }

    updateSettingsContent();
  }

  function setAutoRefreshControlsDisabled(disabled) {
    elements.privacySettings.querySelectorAll("[data-auto-refresh-enabled]").forEach((button) => {
      button.disabled = disabled;
    });
  }

  function requestAutoRefreshPreference(enabled) {
    if (enabled === autoRefreshEnabled && autoRefreshConfigured) {
      return;
    }

    setAutoRefreshControlsDisabled(true);
    applyAutoRefreshPreference(enabled)
      .catch((error) => {
        showDashboard({
          reload: false,
          message: error.message || "Nao foi possivel alterar a atualizacao automatica."
        });
      })
      .finally(() => {
        setAutoRefreshControlsDisabled(false);
      });
  }

  function requestDeviceMode(mode) {
    if (isIncognito || mode === deviceMode) {
      return;
    }

    if (mode === privacyStorage.PUBLIC_MODE) {
      showConfirmation({
        title: "Usar modo compartilhado?",
        message: "Os dados acadêmicos salvos serão apagados agora. As próximas consultas ficarão somente na memória do navegador.",
        confirmLabel: "Ativar e apagar",
        onConfirm: () => applyDeviceMode(mode)
      });
      return;
    }

    applyDeviceMode(mode).catch((error) => {
      showDashboard({ reload: false, message: error.message || "Nao foi possivel alterar o modo." });
    });
  }

  function requestClearData() {
    showConfirmation({
      title: "Limpar dados da extensão?",
      message: "Isso apaga notas, frequência e histórico de mudanças deste perfil do Chrome. Sua sessão do SIGAA continuará aberta.",
      confirmLabel: "Limpar dados",
      onConfirm: async () => {
        const cleared = await privacyStorage.clearAcademicData();

        if (!cleared) {
          throw new Error("Nao foi possivel limpar todos os dados da extensão.");
        }

        currentData = null;
        searchQuery = "";
        activeFilter = "all";
        expandedCourseIds.clear();
        initializedCourseIds.clear();
        elements.searchInput.value = "";
        elements.filters.querySelectorAll("[data-filter]").forEach((button) => {
          const selected = button.dataset.filter === "all";
          button.classList.toggle("active", selected);
          button.setAttribute("aria-selected", String(selected));
        });
        await showDashboard({
          reload: false,
          message: "Dados da extensão apagados. Sua sessão do SIGAA continua aberta."
        });
      }
    });
  }

  async function initializePrivacy() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const privacy = await privacyStorage.getPrivacyState();
    let autoRefresh = await privacyStorage.getAutoRefreshState();
    isIncognito = Boolean(tab?.incognito);
    deviceMode = privacy.deviceMode;
    effectiveMode = privacyStorage.getEffectiveMode(deviceMode, isIncognito);
    autoRefreshEnabled = autoRefresh.autoRefreshEnabled;
    autoRefreshConfigured = autoRefresh.autoRefreshConfigured;
    autoRefreshOnboardingPending = autoRefresh.autoRefreshOnboardingPending;

    if (!deviceMode && !isIncognito) {
      if (!autoRefreshConfigured && !autoRefreshOnboardingPending) {
        autoRefresh = await privacyStorage.markAutoRefreshOnboardingPending();
        autoRefreshEnabled = autoRefresh.autoRefreshEnabled;
        autoRefreshConfigured = autoRefresh.autoRefreshConfigured;
        autoRefreshOnboardingPending = autoRefresh.autoRefreshOnboardingPending;
      }

      showSetup();
      return;
    }

    if (deviceMode && autoRefreshOnboardingPending && !isIncognito) {
      showAutoRefreshSetup();
      return;
    }

    if (deviceMode && !autoRefreshConfigured && !autoRefreshOnboardingPending) {
      autoRefresh = await privacyStorage.initializeAutoRefreshForExistingUser();
      autoRefreshEnabled = autoRefresh.autoRefreshEnabled;
      autoRefreshConfigured = autoRefresh.autoRefreshConfigured;
      autoRefreshOnboardingPending = autoRefresh.autoRefreshOnboardingPending;
    }

    await showDashboard({ reload: true });
  }

  elements.refreshButton.addEventListener("click", refreshGrades);
  elements.settingsButton.addEventListener("click", showSettings);
  elements.closeSettingsButton.addEventListener("click", () => showDashboard({ reload: false }));
  elements.clearDataButton.addEventListener("click", requestClearData);
  elements.privacySetup.addEventListener("click", (event) => {
    const button = event.target.closest("[data-setup-mode]");

    if (!button) {
      return;
    }

    elements.privacySetup.querySelectorAll("[data-setup-mode]").forEach((choice) => {
      choice.disabled = true;
    });
    applyDeviceMode(button.dataset.setupMode, { continueOnboarding: true }).catch((error) => {
      elements.privacySetup.querySelectorAll("[data-setup-mode]").forEach((choice) => {
        choice.disabled = false;
      });
      elements.privacySetup.querySelector(".panel-description").textContent =
        error.message || "Nao foi possivel salvar sua escolha.";
    });
  });
  elements.autoRefreshSetup.addEventListener("click", (event) => {
    const button = event.target.closest("[data-setup-auto-refresh]");

    if (!button) {
      return;
    }

    elements.autoRefreshSetup.querySelectorAll("[data-setup-auto-refresh]").forEach((choice) => {
      choice.disabled = true;
    });
    applyAutoRefreshPreference(button.dataset.setupAutoRefresh === "true", { completeOnboarding: true })
      .catch((error) => {
        elements.autoRefreshSetup.querySelectorAll("[data-setup-auto-refresh]").forEach((choice) => {
          choice.disabled = false;
        });
        elements.autoRefreshSetup.querySelector(".panel-description").textContent =
          error.message || "Nao foi possivel salvar sua escolha.";
      });
  });
  elements.privacySettings.addEventListener("click", (event) => {
    const deviceModeButton = event.target.closest("[data-device-mode]");
    const autoRefreshButton = event.target.closest("[data-auto-refresh-enabled]");

    if (deviceModeButton) {
      requestDeviceMode(deviceModeButton.dataset.deviceMode);
    } else if (autoRefreshButton) {
      requestAutoRefreshPreference(autoRefreshButton.dataset.autoRefreshEnabled === "true");
    }
  });
  elements.confirmationDialog.addEventListener("close", () => {
    const action = pendingConfirmation;
    const confirmed = elements.confirmationDialog.returnValue === "confirm";
    pendingConfirmation = null;

    if (!confirmed || !action) {
      return;
    }

    Promise.resolve(action()).catch((error) => {
      showDashboard({
        reload: false,
        message: error.message || "Nao foi possivel concluir a ação."
      });
    });
  });
  elements.searchInput.addEventListener("input", (event) => {
    searchQuery = event.target.value || "";

    if (currentData) {
      renderData(currentData);
    }
  });

  elements.filters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");

    if (!button) {
      return;
    }

    activeFilter = button.dataset.filter || "all";
    elements.filters.querySelectorAll("[data-filter]").forEach((filterButton) => {
      const selected = filterButton === button;
      filterButton.classList.toggle("active", selected);
      filterButton.setAttribute("aria-selected", String(selected));
    });

    if (currentData) {
      renderData(currentData);
    }
  });

  initializePrivacy().catch((error) => {
    elements.refreshButton.hidden = true;
    elements.settingsButton.hidden = true;
    elements.dashboard.hidden = false;
    setStatus(error.message || "Nao foi possivel iniciar o InfoSIGAA.", "warning");
  });
})();
