(function () {
  "use strict";

  const PORTAL_URL = "https://sig.iffarroupilha.edu.br/sigaa/portais/discente/discente.jsf";
  const privacyStorage = globalThis.InfoSigaaPrivacyStorage;
  const academicModel = globalThis.InfoSigaaAcademicModel;
  const uiFormat = globalThis.InfoSigaaUiFormat;
  const uiModel = globalThis.InfoSigaaUiModel;

  const elements = {
    refreshButton: document.getElementById("refresh-button"),
    cancelRefreshButton: document.getElementById("cancel-refresh-button"),
    openDashboardButton: document.getElementById("open-dashboard-button"),
    settingsButton: document.getElementById("settings-button"),
    closeSettingsButton: document.getElementById("close-settings-button"),
    clearDataButton: document.getElementById("clear-data-button"),
    status: document.getElementById("status"),
    courses: document.getElementById("courses"),
    lastUpdated: document.getElementById("last-updated"),
    privacySummary: document.getElementById("privacy-summary"),
    searchInput: document.getElementById("course-search"),
    filters: document.getElementById("course-filters"),
    semesterFocus: document.getElementById("semester-focus"),
    controls: document.getElementById("course-controls"),
    courseListHeading: document.getElementById("course-list-heading"),
    courseCount: document.getElementById("course-count"),
    dashboard: document.getElementById("dashboard"),
    privacySetup: document.getElementById("privacy-setup"),
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
  let uiPreferences = { semesterFocusByYear: {} };
  let searchQuery = "";
  let activeFilter = "all";
  let deviceMode = "";
  let effectiveMode = "";
  let isIncognito = false;
  let pendingConfirmation = null;
  let refreshStatusTimer = null;
  let observedBackgroundRefresh = false;
  let expandedCourseId = "";
  let lastRefreshProgressKey = "";

  function formatDateValue(isoDate) {
    return uiFormat.formatDateTime(isoDate);
  }

  function formatDate(isoDate) {
    return uiFormat.formatUpdatedAt(isoDate);
  }

  function selectedYear() {
    return uiModel.selectedYear(currentData);
  }

  function getSemesterFocus() {
    return uiModel.semesterFocus(uiPreferences, selectedYear());
  }

  function syncSemesterFocusControl() {
    elements.semesterFocus.value = String(getSemesterFocus() || "");
  }

  function setStatus(message, variant) {
    lastRefreshProgressKey = "";
    elements.status.hidden = !message;
    elements.status.textContent = message || "";
    elements.status.className = `status${variant ? ` ${variant}` : ""}`;
  }

  function setStatusContent(content, variant) {
    if (!String(variant || "").split(/\s+/).includes("refreshing")) {
      lastRefreshProgressKey = "";
    }
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

    if (course.refreshError || course.stale) {
      return createElement("span", "badge changed", "Anterior");
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
    const overview = uiModel.getOverview(courses, getSemesterFocus());
    const container = createElement("div", "status-chips");

    container.appendChild(renderStatusChip("com notas", overview.withGrades, "ok"));
    container.appendChild(renderStatusChip("médias anuais", overview.annualAverages, "average"));
    if (overview.reportedAbsenceCourses > 0) {
      container.appendChild(
        renderStatusChip(
          overview.totalAbsences === 1 ? "falta informada" : "faltas informadas",
          new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(overview.totalAbsences),
          "absence"
        )
      );
    }

    if (overview.noGrades > 0) {
      container.appendChild(renderStatusChip("sem notas", overview.noGrades, "no-grades"));
    }

    if (overview.errors > 0) {
      container.appendChild(renderStatusChip("com erro", overview.errors, "error"));
    }

    if (overview.changes > 0) {
      container.appendChild(renderStatusChip("com mudança", overview.changes, "changed"));
    }

    return {
      element: container,
      hasWarning: overview.errors > 0
    };
  }

  function getOriginalCourseTitle(course) {
    return uiModel.originalCourseTitle(course);
  }

  function getCourseDisplayName(course) {
    return uiModel.courseName(course);
  }

  function renderCourseNotice(label, message, variant) {
    const notice = createElement("p", `course-notice ${variant}`);
    notice.appendChild(createElement("strong", "", label));
    notice.appendChild(document.createTextNode(` ${message}`));
    return notice;
  }

  function getFilteredCourses(courses) {
    return uiModel.filterCourses(courses, { filter: activeFilter, query: searchQuery });
  }

  function hasRecentChange(course) {
    return uiModel.hasRecentChange(course);
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

  function ensureExpansionState(course, index) {
    const courseKey = getCourseKey(course, index);
    return {
      courseKey,
      expanded: expandedCourseId === courseKey
    };
  }

  function toggleCourse(courseKey) {
    expandedCourseId = expandedCourseId === courseKey ? "" : courseKey;

    if (currentData) {
      renderData(currentData);
    }
  }

  function getGradeValue(grade) {
    return normalizeTooltipText(grade.value || grade.valor || "");
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
    return academicModel.getAttendanceMetrics(course);
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

    if (!metrics || metrics.aulasMinistradas == null || metrics.aulasTotal == null) {
      return null;
    }

    const container = createElement("div", `attendance-compact ${metrics.status}`);
    const header = createElement("div", "attendance-compact-header");
    header.appendChild(createElement("span", "", metrics.presencaAtual == null ? "Presença não informada" : `Presença ${formatPercent(metrics.presencaAtual)}`));
    header.appendChild(createElement("span", "", `${metrics.aulasMinistradas}/${metrics.aulasTotal} aulas`));
    container.appendChild(header);
    if (metrics.presencaAtual != null) {
      container.appendChild(renderAttendanceBar(metrics, true));
    }
    return container;
  }

  function renderExpandedAttendance(course) {
    const metrics = getAttendanceMetrics(course);

    if (!metrics || metrics.aulasMinistradas == null || metrics.aulasTotal == null) {
      return null;
    }

    const container = createElement("section", `attendance-detail ${metrics.status}`);
    const header = createElement("div", "attendance-detail-header");
    header.appendChild(createElement("h3", "period-title", "Frequência"));
    container.appendChild(header);
    if (metrics.presencaAtual != null) {
      container.appendChild(renderAttendanceBar(metrics, false));
    }

    const items = createElement("div", "attendance-grid");
    [
      { label: "Aulas", value: `${metrics.aulasMinistradas}/${metrics.aulasTotal}` },
      { label: "Carga ministrada", value: formatPercent(metrics.percentualCargaMinistrada) },
      { label: "Faltas", value: metrics.faltas == null ? "Não informado" : String(metrics.faltas) },
      { label: "Presença atual", value: metrics.presencaAtual == null ? "Não informada" : formatPercent(metrics.presencaAtual), highlight: true },
      {
        label: "Máx. possível",
        value: metrics.presencaFinalMaxima == null ? "Não informada" : formatPercent(metrics.presencaFinalMaxima),
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

  function getMainFirstSemesterGrades(course) {
    const focus = getSemesterFocus();
    return uiModel.getFocusedAssessments(course, focus, 5).map((grade) => ({
      ...grade,
      sigla: focus ? grade.label : `${grade.semesterNumber}º · ${grade.label}`,
      nomeCompleto: grade.fullName
    }));
  }

  function renderCompactGradeChip(grade) {
    const labelText = grade.sigla || grade.label || "Nota";
    const value = getGradeValue(grade) || "--";
    const chip = createElement("span", `compact-grade${grade.changeType ? ` ${grade.changeType}` : ""}${grade.changed ? " changed" : ""}`);
    const label = createElement("span", "compact-grade-label", labelText);
    const fullName = getGradeTooltipText(grade, labelText);
    const displayedValue = grade.changed && grade.previousValue
      ? `${grade.previousValue} → ${value}`
      : value;

    addTooltipBehavior(label, labelText, fullName);
    chip.appendChild(label);
    chip.appendChild(createElement("strong", "", displayedValue));

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
    const view = uiModel.getCourseView(course, getSemesterFocus());

    if (view.state === "error") {
      container.appendChild(renderCourseNotice("Erro:", view.stateMessage || "Não foi possível carregar esta disciplina.", "error-notice"));
      return container;
    }

    if (course.noGrades) {
      container.appendChild(createElement("p", "empty-notes", course.message || "Ainda não há notas lançadas para esta matéria."));
      if (view.state === "stale") {
        container.appendChild(renderCourseNotice("Dados anteriores:", view.stateMessage || "A atualização mais recente não foi concluída.", "stale-notice"));
      }
      const attendance = renderCompactAttendance(course);

      if (attendance) {
        container.appendChild(attendance);
      }

      return container;
    }

    const stats = createElement("div", "compact-stats");
    const focus = view.focus;
    const semesterResult = view.focusResult;
    [
      focus ? renderCompactStat(`${focus}º sem.`, semesterResult?.availability === "available" ? semesterResult.value : "Não informado", "average") : null,
      renderCompactStat("Média anual", view.annualAverage?.value || course.summary?.mediaAnual, "average"),
      renderCompactStat("Faltas", course.summary?.faltas, "absence"),
      renderCompactStat("Situação", view.situation?.value || course.summary?.situacao || course.summary?.resultado, "status")
    ].filter(Boolean).forEach((item) => stats.appendChild(item));

    if (stats.childElementCount > 0) {
      container.appendChild(stats);
    }

    const attendance = renderCompactAttendance(course);

    if (attendance) {
      container.appendChild(attendance);
    }

    const focusedGrades = getMainFirstSemesterGrades(course);

    if (focusedGrades.length > 0) {
      const notes = createElement("div", "compact-notes");
      notes.appendChild(createElement("span", "compact-label", focus ? `${focus}º sem.` : "Recentes"));
      focusedGrades.forEach((grade) => notes.appendChild(renderCompactGradeChip(grade)));
      container.appendChild(notes);
    }

    const flags = createElement("div", "compact-flags");
    [1, 2].forEach((semesterNumber) => {
      const semester = (view.performance.semesters || []).find((item) => Number(item.number) === semesterNumber);
      const hasAvailableData = semester?.result?.availability === "available" ||
        uiModel.getFocusedAssessments(course, semesterNumber, 1).length > 0;
      if (hasAvailableData && semesterNumber !== focus) {
        flags.appendChild(createElement("span", "compact-flag", `${semesterNumber}º semestre lançado`));
      }
    });
    if (view.exam?.availability === "available") {
      flags.appendChild(createElement("span", "compact-flag", "Exame lançado"));
    }
    if (flags.childElementCount > 0) {
      container.appendChild(flags);
    }

    if (view.state === "stale") {
      container.appendChild(renderCourseNotice("Dados anteriores:", view.stateMessage || "A atualização mais recente não foi concluída.", "stale-notice"));
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
    const view = uiModel.getCourseView(course, getSemesterFocus());

    if (view.state === "error") {
      fragment.appendChild(renderCourseNotice("Erro:", view.stateMessage || "Não foi possível carregar esta disciplina.", "error-notice"));
      return fragment;
    }

    if (course.noGrades) {
      fragment.appendChild(createElement("p", "empty-notes", course.message || "Ainda não há notas lançadas para esta matéria."));
      if (view.state === "stale") {
        fragment.appendChild(renderCourseNotice("Dados anteriores:", view.stateMessage || "A atualização mais recente não foi concluída.", "stale-notice"));
      }
      const attendance = renderExpandedAttendance(course);

      if (attendance) {
        fragment.appendChild(attendance);
      }

      return fragment;
    }

    if (view.state === "stale") {
      fragment.appendChild(renderCourseNotice("Dados anteriores:", view.stateMessage || "A atualização mais recente não foi concluída.", "stale-notice"));
    }

    const performance = view.performance;
    const semesters = performance.semesters || [];
    semesters.forEach((semester) => {
      const grades = (semester.assessments || []).map((grade) => ({
        ...grade,
        sigla: grade.label,
        nomeCompleto: grade.fullName,
        value: grade.availability === "available" ? grade.value : ""
      }));
      if (grades.length > 0) {
        fragment.appendChild(renderPeriod({ name: `Avaliações do ${semester.number}º semestre`, grades }));
      }
      const resultSection = document.createElement("section");
      resultSection.className = "summary-section";
      resultSection.appendChild(createElement("h3", "period-title", `Resultado do ${semester.number}º semestre`));
      const resultGrid = createElement("div", "grades");
      resultGrid.appendChild(renderGrade({
        ...semester.result,
        sigla: "Resultado",
        nomeCompleto: semester.result?.fullName,
        value: semester.result?.availability === "available" ? semester.result.value : "Não informado"
      }, true));
      resultSection.appendChild(resultGrid);
      fragment.appendChild(resultSection);
    });

    if (semesters.length === 0) {
      (course.periods || [])
        .filter((period) => !normalizeTooltipText(period?.name).toLocaleLowerCase("pt-BR").includes("exame"))
        .forEach((period) => fragment.appendChild(renderPeriod(period)));
    }

    if (view.exam?.availability === "available") {
      fragment.appendChild(renderPeriod({
        name: "Exame",
        grades: [{
          ...view.exam,
          sigla: view.exam.label || "Exame",
          nomeCompleto: view.exam.fullName,
          value: view.exam.value
        }]
      }));
    }

    if (view.unclassified.length > 0) {
      fragment.appendChild(renderPeriod({
        name: "Outros dados do SIGAA",
        grades: view.unclassified.map((item) => ({
          ...item,
          sigla: item.label || "Campo",
          nomeCompleto: item.fullName,
          value: item.availability === "available" ? item.value : "Não informado"
        }))
      }));
    }

    const summary = renderSummary({
      mediaAnual: view.annualAverage?.availability === "available" ? view.annualAverage.value : course.summary?.mediaAnual,
      resultado: view.annualResult?.availability === "available" ? view.annualResult.value : course.summary?.resultado,
      faltas: course.summary?.faltas,
      situacao: view.situation?.availability === "available" ? view.situation.value : course.summary?.situacao
    });

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
    const view = uiModel.getCourseView(course, getSemesterFocus());
    const changeStatus = course.recentChangeStatus || course.changeStatus;
    const stateClass = view.state === "error"
      ? "state-error"
      : view.state === "stale"
        ? "state-stale"
        : view.state === "no_grades"
          ? "state-no-grades"
          : changeStatus === "removed"
            ? "state-removed"
            : hasRecentChange(course)
              ? "state-changed"
              : "state-ok";
    const article = createElement(
      "article",
      `course ${stateClass}${course.noGrades ? " no-grades" : ""}${view.state === "stale" ? " stale" : ""}${expansion.expanded ? " expanded" : ""}`
    );
    const header = createElement("header", "course-header");
    const headingBlock = createElement("div", "course-heading");
    const headerActions = createElement("div", "course-actions");
    const originalTitle = view.originalTitle;
    const displayName = view.name;
    const title = createElement("h3", "course-title", displayName);

    const toggleButton = createElement("button", "course-toggle");
    const toggleText = createElement("span", "toggle-text", expansion.expanded ? "Recolher" : "Detalhes");
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

    const teachers = view.teachers;

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
    elements.courseListHeading.hidden = true;
    elements.lastUpdated.textContent = formatDate(data?.updatedAt);
    syncSemesterFocusControl();

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
      setStatus(data.message || "Não foi possível buscar as notas.", "warning");
      return;
    }

    const courses = data.courses || [];

    if (courses.length === 0) {
      setStatus("Nenhuma disciplina com notas foi encontrada.", "warning");
      return;
    }

    const summary = renderOverallSummary(courses);
    setStatusContent(summary.element, summary.hasWarning ? "overview has-warning" : "overview");
    elements.controls.hidden = false;

    const filteredCourses = getFilteredCourses(courses);
    elements.courseListHeading.hidden = false;
    elements.courseCount.textContent = filteredCourses.length === courses.length
      ? `${courses.length} ${courses.length === 1 ? "disciplina" : "disciplinas"}`
      : `${filteredCourses.length} de ${courses.length}`;
    filteredCourses.forEach((course) => {
      const originalIndex = courses.indexOf(course);
      elements.courses.appendChild(renderCourse(course, originalIndex));
    });

    if (filteredCourses.length === 0) {
      const emptyState = createElement("div", "empty-results");
      emptyState.appendChild(createElement("strong", "", "Nenhuma disciplina encontrada"));
      emptyState.appendChild(createElement("p", "", "Tente outro termo ou volte a exibir todas as disciplinas."));
      const resetButton = createElement("button", "secondary-button empty-results-action", "Limpar busca e filtros");
      resetButton.type = "button";
      resetButton.addEventListener("click", () => {
        searchQuery = "";
        activeFilter = "all";
        expandedCourseId = "";
        elements.searchInput.value = "";
        elements.filters.querySelectorAll("[data-filter]").forEach((filterButton) => {
          const selected = filterButton.dataset.filter === "all";
          filterButton.classList.toggle("active", selected);
          filterButton.setAttribute("aria-pressed", String(selected));
        });
        renderData(currentData);
        elements.searchInput.focus();
      });
      emptyState.appendChild(resetButton);
      elements.courses.appendChild(emptyState);
    }
  }

  async function openSigaaPortal() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!Number.isInteger(tab?.id)) {
      throw new Error("Não foi possível localizar a aba atual.");
    }

    await chrome.tabs.update(tab.id, { url: PORTAL_URL });
  }

  function renderRefreshFailure(result) {
    const cachedData = result?.cachedData?.ok ? result.cachedData : null;
    renderData(cachedData);

    const content = createElement("div", "refresh-warning");
    content.appendChild(createElement("p", "refresh-warning-message", result?.message || "Não foi possível atualizar as notas."));

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
        setStatus(error.message || "Não foi possível abrir o SIGAA.", "warning");
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
    elements.cancelRefreshButton.hidden = !running;

    const srText = elements.refreshButton.querySelector(".sr-only");
    if (srText) {
      srText.textContent = running ? "Atualizando" : "Atualizar";
    }

  }

  function renderRefreshProgress(status = {}) {
    const completed = Number(status.completedCourses) || 0;
    const total = Number(status.totalCourses) || 0;
    const currentCourse = normalizeTooltipText(status.currentCourseName) || "Preparando atualização";
    const progressKey = `${completed}|${total}|${currentCourse}`;

    if (progressKey === lastRefreshProgressKey && elements.status.classList.contains("refreshing")) {
      return;
    }

    const content = createElement("div", "refresh-progress");
    const heading = createElement("div", "refresh-progress-heading");
    heading.appendChild(createElement("strong", "", "Atualizando notas"));
    heading.appendChild(createElement("span", "", total ? `${completed} de ${total}` : "Em andamento"));
    content.appendChild(heading);
    const currentCourseElement = createElement("p", "", currentCourse);
    currentCourseElement.title = currentCourse;
    content.appendChild(currentCourseElement);

    if (total > 0) {
      const progress = createElement("div", "refresh-progress-bar");
      const fill = createElement("span", "refresh-progress-fill");
      const percentage = clamp((completed / total) * 100, 0, 100);
      fill.style.width = `${percentage}%`;
      progress.setAttribute("role", "progressbar");
      progress.setAttribute("aria-valuemin", "0");
      progress.setAttribute("aria-valuemax", String(total));
      progress.setAttribute("aria-valuenow", String(completed));
      progress.setAttribute("aria-label", `${completed} de ${total} disciplinas atualizadas`);
      progress.appendChild(fill);
      content.appendChild(progress);
    }

    content.appendChild(createElement("small", "", "As abas do SIGAA ficam bloqueadas durante esta etapa."));
    setStatusContent(content, "refreshing");
    lastRefreshProgressKey = progressKey;
  }

  function stopRefreshStatusPolling() {
    if (!refreshStatusTimer) {
      return;
    }

    clearInterval(refreshStatusTimer);
    refreshStatusTimer = null;
  }

  async function syncRefreshStatus() {
    const status = await chrome.runtime.sendMessage({ type: "getRefreshStatus", consumer: "popup" });

    if (status?.running) {
      observedBackgroundRefresh = true;
      setRefreshRunning(true);
      renderRefreshProgress(status);
      return;
    }

    if (!observedBackgroundRefresh && !status?.response) {
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
    chrome.runtime.sendMessage({ type: "acknowledgeRefreshResult", consumer: "popup" }).catch(() => {});
  }

  async function refreshGrades() {
    observedBackgroundRefresh = true;
    setRefreshRunning(true);
    renderRefreshProgress();
    let sourceTabId;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (/^https:\/\/sig\.iffarroupilha\.edu\.br\/sigaa\//.test(tab?.url || "")) {
        sourceTabId = tab.id;
      }
    } catch (_error) {}

    chrome.runtime.sendMessage({ type: "startRefresh", sourceTabId })
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
    elements.privacySettings.hidden = true;
    elements.dashboard.hidden = true;
    elements.refreshButton.hidden = true;
    elements.openDashboardButton.hidden = true;
    elements.settingsButton.hidden = true;
    updatePrivacySummary();
  }

  async function showDashboard({ reload = true, message = "" } = {}) {
    elements.privacySetup.hidden = true;
    elements.privacySettings.hidden = true;
    elements.dashboard.hidden = false;
    elements.refreshButton.hidden = false;
    elements.openDashboardButton.hidden = false;
    elements.settingsButton.hidden = false;
    updatePrivacySummary();

    if (reload) {
      const [storedData, preferences] = await Promise.all([
        privacyStorage.loadData(getPrivacyContext()),
        privacyStorage.getUiPreferences()
      ]);
      uiPreferences = preferences;
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
    elements.dashboard.hidden = true;
    elements.privacySettings.hidden = false;
    elements.refreshButton.hidden = true;
    elements.openDashboardButton.hidden = true;
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

  async function applyDeviceMode(mode) {
    if (mode === privacyStorage.PUBLIC_MODE) {
      currentData = null;
      elements.courses.textContent = "";
    }

    await privacyStorage.setDeviceMode(mode);
    deviceMode = mode;
    effectiveMode = privacyStorage.getEffectiveMode(deviceMode, isIncognito);
    currentData = null;
    expandedCourseId = "";

    await showDashboard({ reload: true });
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
      showDashboard({ reload: false, message: error.message || "Não foi possível alterar o modo." });
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
          throw new Error("Não foi possível limpar todos os dados da extensão.");
        }

        currentData = null;
        searchQuery = "";
        activeFilter = "all";
        expandedCourseId = "";
        elements.searchInput.value = "";
        elements.filters.querySelectorAll("[data-filter]").forEach((button) => {
          const selected = button.dataset.filter === "all";
          button.classList.toggle("active", selected);
          button.setAttribute("aria-pressed", String(selected));
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
    isIncognito = Boolean(tab?.incognito);
    deviceMode = privacy.deviceMode;
    effectiveMode = privacyStorage.getEffectiveMode(deviceMode, isIncognito);

    if (!deviceMode && !isIncognito) {
      showSetup();
      return;
    }

    await showDashboard({ reload: true });
  }

  elements.refreshButton.addEventListener("click", refreshGrades);
  elements.cancelRefreshButton.addEventListener("click", async () => {
    const status = await chrome.runtime.sendMessage({ type: "getRefreshStatus" });
    if (status?.running) {
      await chrome.runtime.sendMessage({ type: "cancelRefresh", refreshId: status.refreshId });
    }
  });
  elements.openDashboardButton.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "openDashboard" })
      .then((response) => {
        if (!response?.ok) throw new Error(response?.error || "Não foi possível abrir o dashboard.");
        window.close();
      })
      .catch((error) => setStatus(error.message || "Não foi possível abrir o dashboard.", "warning"));
  });
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
    applyDeviceMode(button.dataset.setupMode).catch((error) => {
      elements.privacySetup.querySelectorAll("[data-setup-mode]").forEach((choice) => {
        choice.disabled = false;
      });
      elements.privacySetup.querySelector(".panel-description").textContent =
        error.message || "Não foi possível salvar sua escolha.";
    });
  });
  elements.privacySettings.addEventListener("click", (event) => {
    const deviceModeButton = event.target.closest("[data-device-mode]");

    if (deviceModeButton) {
      requestDeviceMode(deviceModeButton.dataset.deviceMode);
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
        message: error.message || "Não foi possível concluir a ação."
      });
    });
  });
  elements.searchInput.addEventListener("input", (event) => {
    searchQuery = event.target.value || "";

    if (currentData) {
      renderData(currentData);
    }
  });

  elements.semesterFocus.addEventListener("change", () => {
    privacyStorage.setSemesterFocus(selectedYear(), elements.semesterFocus.value)
      .then((preferences) => {
        uiPreferences = preferences;
        expandedCourseId = "";
        if (currentData) renderData(currentData);
      })
      .catch((error) => setStatus(error.message || "Não foi possível salvar o período em foco.", "warning"));
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
      filterButton.setAttribute("aria-pressed", String(selected));
    });

    if (currentData) {
      renderData(currentData);
    }
  });

  chrome.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[privacyStorage.UI_PREFERENCES_KEY]) return;
    uiPreferences = privacyStorage.normalizeUiPreferences(changes[privacyStorage.UI_PREFERENCES_KEY].newValue);
    expandedCourseId = "";
    if (currentData) renderData(currentData);
  });

  chrome.runtime.onMessage?.addListener((message) => {
    if (message?.type !== "refreshStatusChanged") return false;
    observedBackgroundRefresh = Boolean(message.status?.running || message.status?.response);
    startRefreshStatusPolling();
    return false;
  });

  initializePrivacy().catch((error) => {
    elements.refreshButton.hidden = true;
    elements.openDashboardButton.hidden = true;
    elements.settingsButton.hidden = true;
    elements.dashboard.hidden = false;
    setStatus(error.message || "Não foi possível iniciar o InfoSIGAA.", "warning");
  });
})();
