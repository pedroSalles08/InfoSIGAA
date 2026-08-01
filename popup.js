(function () {
  "use strict";

  const STORAGE_KEY = "sigaa-grade-monitor:data:v2";

  const elements = {
    refreshButton: document.getElementById("refresh-button"),
    status: document.getElementById("status"),
    courses: document.getElementById("courses"),
    lastUpdated: document.getElementById("last-updated"),
    searchInput: document.getElementById("course-search"),
    filters: document.getElementById("course-filters")
  };

  let tooltipElement = null;
  let tooltipTarget = null;
  let currentData = null;
  let searchQuery = "";
  let activeFilter = "all";
  const expandedCourseIds = new Set();
  const initializedCourseIds = new Set();

  function formatDate(isoDate) {
    if (!isoDate) {
      return "Nenhuma atualizacao ainda";
    }

    return `Atualizado em ${new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(new Date(isoDate))}`;
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
    const container = createElement("div", "status-chips");

    container.appendChild(renderStatusChip("com notas", loadedCount, "ok"));

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
      { label: "Presença atual", value: formatPercent(metrics.presencaAtual) },
      {
        label: "Máx. possível",
        value: formatPercent(metrics.presencaFinalMaxima),
        title: "Maior presença possível caso o aluno compareça a todas as aulas restantes."
      }
    ].forEach(({ label, value, title }) => {
      const item = createElement("div", "attendance-item");
      const labelElement = createElement("span", "", label);

      if (title) {
        labelElement.title = title;
        labelElement.setAttribute("aria-label", title);
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
      renderCompactStat("Sit.", course.summary?.situacao || course.summary?.resultado, "status")
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

  function renderExpandedQuickSummary(course) {
    const container = createElement("div", "expanded-quick-summary");
    const metrics = getAttendanceMetrics(course);

    [
      renderCompactStat("Média", course.summary?.mediaAnual, "average"),
      renderCompactStat("Faltas", course.summary?.faltas, "absence"),
      metrics ? renderCompactStat("Presença", formatPercent(metrics.presencaAtual), `presence ${metrics.status}`) : null,
      renderCompactStat("Sit.", course.summary?.situacao || course.summary?.resultado, "status")
    ].filter(Boolean).forEach((item) => container.appendChild(item));

    return container.childElementCount > 0 ? container : null;
  }

  function renderGrade(grade) {
    const item = createElement("div", `grade${grade.changeType ? ` ${grade.changeType}` : ""}${grade.changed ? " changed" : ""}`);
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
    const section = createElement("section", "period");
    section.appendChild(createElement("h3", "period-title", period.name));

    const grades = createElement("div", "grades");
    (period.grades || []).forEach((grade) => grades.appendChild(renderGrade(grade)));
    section.appendChild(grades);

    return section;
  }

  function renderSummary(summary) {
    const entries = [
      ["Media anual", summary?.mediaAnual],
      ["Resultado", summary?.resultado],
      ["Faltas", summary?.faltas],
      ["Situacao", summary?.situacao]
    ].filter(([, value]) => value);

    if (entries.length === 0) {
      return null;
    }

    const container = createElement("div", "summary");
    entries.forEach(([label, value]) => {
      const item = createElement("div", "summary-item");
      item.appendChild(createElement("span", "", label));
      item.appendChild(createElement("strong", "", value));
      container.appendChild(item);
    });

    return container;
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

    const quickSummary = renderExpandedQuickSummary(course);

    if (quickSummary) {
      fragment.appendChild(quickSummary);
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
    const headingBlock = createElement("div");
    const headerActions = createElement("div", "course-actions");
    const originalTitle = getOriginalCourseTitle(course);
    const displayName = getCourseDisplayName(course);
    const title = createElement("h2", "course-title", displayName);
    const toggleButton = createElement("button", "course-toggle", expansion.expanded ? "Ocultar" : "Ver detalhes");

    if (originalTitle && originalTitle !== displayName) {
      title.title = originalTitle;
      title.setAttribute("aria-label", originalTitle);
    }

    headingBlock.appendChild(title);

    if (course.studentName) {
      headingBlock.appendChild(createElement("p", "muted", course.studentName));
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
    toggleButton.setAttribute("aria-label", `${expansion.expanded ? "Recolher" : "Expandir"} ${displayName}`);
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
    elements.lastUpdated.textContent = formatDate(data?.updatedAt);

    if (!data) {
      setStatus("Clique em Atualizar para buscar suas notas no SIGAA.", "");
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

    const filteredCourses = getFilteredCourses(courses);

    if (filteredCourses.length === 0) {
      elements.courses.appendChild(createElement("p", "empty-results", "Nenhuma matéria encontrada com esse filtro."));
      return;
    }

    filteredCourses.forEach((course, index) => elements.courses.appendChild(renderCourse(course, index)));
  }

  function loadStoredData() {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      renderData(result[STORAGE_KEY] || null);
    });
  }

  async function getActiveSigaaPage() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id || !/^https:\/\/sig\.iffarroupilha\.edu\.br\/sigaa\//.test(tab.url || "")) {
      return null;
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => ({
        html: document.documentElement.outerHTML,
        title: document.title,
        url: location.href
      })
    });
    const frames = (results || []).map((item) => item.result).filter(Boolean);
    const topFrame = frames.find((frame) => frame.url === tab.url) || frames[0] || null;

    if (!topFrame) {
      return null;
    }

    return {
      ...topFrame,
      frames
    };
  }

  function refreshGrades() {
    elements.refreshButton.disabled = true;
    elements.refreshButton.textContent = "Atualizando";
    setStatus("Lendo a pagina atual do SIGAA e buscando notas.", "");

    getActiveSigaaPage()
      .then((activePage) => {
        if (!activePage) {
          throw new Error("Abra o portal discente do SIGAA e clique em Atualizar novamente.");
        }

        return chrome.runtime.sendMessage({ type: "refreshGrades", activePage });
      })
      .then((response) => {
        elements.refreshButton.disabled = false;
        elements.refreshButton.textContent = "Atualizar";

        if (!response?.ok) {
          setStatus(response?.error || "Falha ao atualizar notas.", "warning");
          return;
        }

        renderData(response.data);
      })
      .catch((error) => {
        elements.refreshButton.disabled = false;
        elements.refreshButton.textContent = "Atualizar";
        setStatus(error.message || "Falha ao atualizar notas.", "warning");
      });
  }

  elements.refreshButton.addEventListener("click", refreshGrades);
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

  loadStoredData();
})();
