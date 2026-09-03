(function () {
  "use strict";

  const PORTAL_URL = "https://sig.iffarroupilha.edu.br/sigaa/portais/discente/discente.jsf";
  const model = globalThis.InfoSigaaAcademicModel;
  const uiFormat = globalThis.InfoSigaaUiFormat;
  const uiModel = globalThis.InfoSigaaUiModel;
  const storage = globalThis.InfoSigaaPrivacyStorage;
  const elements = Object.fromEntries([
    "last-updated", "semester-focus", "privacy-mode", "refresh", "cancel-refresh", "open-sigaa", "status",
    "metrics", "attendance-summary", "changes", "courses", "simulator-course",
    "simulator-s1", "simulator-s2", "simulator-target", "simulator-output", "scenario-type", "scenario-values",
    "scenario-weights", "scenario-output", "weights-label"
  ].map((id) => [id, document.getElementById(id)]));

  let currentData = null;
  let uiPreferences = { semesterFocusByYear: {} };
  let privacyContext = null;
  let refreshTimer = null;

  function create(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== "") node.textContent = text;
    return node;
  }

  function formatNumber(value, digits = 1) {
    return uiFormat.formatNumber(value, digits);
  }

  function formatUpdated(value) {
    return uiFormat.formatUpdatedAt(value);
  }

  function courseName(course) {
    return uiModel.courseName(course);
  }

  function selectedYear() {
    return uiModel.selectedYear(currentData);
  }

  function focusSemester() {
    return uiModel.normalizeSemesterFocus(elements["semester-focus"].value);
  }

  function setStatus(message = "", variant = "") {
    elements.status.hidden = !message;
    elements.status.textContent = message;
    elements.status.className = `status${variant ? ` ${variant}` : ""}`;
  }

  function metric(label, value) {
    const item = create("div", "metric");
    item.append(create("span", "", label), create("strong", "", String(value)));
    return item;
  }

  function renderMetrics() {
    const courses = currentData?.courses || [];
    const focus = focusSemester();
    const overview = uiModel.getOverview(courses, focus);
    const absencesText = overview.reportedAbsenceCourses === 0
      ? "Não informadas"
      : overview.reportedAbsenceCourses === courses.length
        ? formatNumber(overview.totalAbsences, 2)
        : `${formatNumber(overview.totalAbsences, 2)} em ${overview.reportedAbsenceCourses} matérias`;
    elements.metrics.replaceChildren(
      metric("Disciplinas", overview.courses),
      metric(focus ? `Resultados do ${focus}º semestre` : "Semestre em foco", focus ? overview.semesterResults : "Visão anual"),
      metric("Médias anuais informadas", `${overview.annualAverages} de ${courses.length}`),
      metric("Faltas informadas", absencesText),
      metric("Mudanças", overview.changeItems)
    );
  }

  function attendanceValue(value, suffix = "") {
    return Number.isFinite(value) ? `${formatNumber(value, 2)}${suffix}` : "Não informado";
  }

  function renderAttendance() {
    const fragment = document.createDocumentFragment();
    (currentData?.courses || []).forEach((course) => {
      const attendance = uiModel.getCourseView(course, focusSemester()).attendance;
      const card = create("article", `attendance-card ${attendance?.status || "unknown"}`);
      const header = create("header");
      header.appendChild(create("h3", "", courseName(course)));
      const values = create("div", "attendance-values");
      values.append(
        stat("Faltas", attendanceValue(attendance?.faltas)),
        stat("Aulas ministradas", attendanceValue(attendance?.aulasMinistradas)),
        stat("Carga total", attendanceValue(attendance?.aulasTotal)),
        stat("Presença atual", attendanceValue(attendance?.presencaAtual, "%")),
        stat("Máxima possível", attendanceValue(attendance?.presencaFinalMaxima, "%"))
      );
      card.append(header, values);
      fragment.appendChild(card);
    });
    elements["attendance-summary"].replaceChildren(fragment);
    if (!currentData?.courses?.length) {
      elements["attendance-summary"].appendChild(create("p", "empty", "Nenhuma disciplina disponível."));
    }
  }

  function renderChanges() {
    const items = uiModel.collectChanges(currentData?.courses || []);
    if (!items.length) {
      elements.changes.replaceChildren(create("p", "empty", "Nenhuma mudança identificada na última atualização."));
      return;
    }
    const list = create("ul", "changes-list");
    items.slice(0, 12).forEach(({ course, change }) => {
      const item = create("li");
      item.append(create("strong", "", `${course}: ${change.label}`), create("span", "", `${change.previousValue || "Não informado"} → ${change.currentValue || "Não informado"}`));
      list.appendChild(item);
    });
    elements.changes.replaceChildren(list);
  }

  function valueText(value) {
    if (typeof value === "string") return value || "Não informado";
    return value?.availability === "available" ? value.value : "Não informado";
  }

  function renderSemester(semester) {
    const section = create("section", "academic-section");
    section.appendChild(create("h3", "", semester.label));
    const assessments = create("div", "assessments");
    if (!semester.assessments.length) assessments.appendChild(create("p", "empty", "Nenhuma avaliação informada."));
    semester.assessments.forEach((assessment) => {
      const row = create("div", "assessment");
      row.append(create("span", "", assessment.fullName || assessment.label), create("strong", "", valueText(assessment)));
      assessments.appendChild(row);
    });
    const result = create("div", "academic-result");
    result.append(create("span", "", `Resultado do ${semester.number}º semestre`), create("strong", "", valueText(semester.result)));
    section.append(assessments, result);
    return section;
  }

  function stat(label, value) {
    const item = create("span", "stat");
    item.append(create("span", "", label), create("strong", "", value || "—"));
    return item;
  }

  function renderCourses() {
    const fragment = document.createDocumentFragment();
    (currentData?.courses || []).forEach((course) => {
      const focus = focusSemester();
      const view = uiModel.getCourseView(course, focus);
      const performance = view.performance;
      const focusResult = view.focusResult;
      const details = create("details", "course-card");
      const summary = create("summary");
      const title = create("div", "course-title");
      title.append(
        create("h3", "", view.name),
        create("p", "", view.teachers.join(" e ") || (view.state === "stale" ? "Dados anteriores preservados" : ""))
      );
      const stats = create("div", "course-stats");
      if (focus) stats.appendChild(stat(`${focus}º semestre`, valueText(focusResult)));
      stats.appendChild(stat("Média anual", valueText(performance.annual?.average)));
      const attendance = view.attendance;
      stats.appendChild(stat("Frequência", attendanceValue(attendance?.presencaAtual, "%")));
      stats.appendChild(stat("Faltas", attendanceValue(attendance?.faltas)));
      stats.appendChild(stat("Situação", valueText(performance.annual?.situation)));
      summary.append(title, stats);

      const body = create("div", "course-body");
      const semesters = create("div", "semester-grid");
      (performance.semesters || []).forEach((semester) => semesters.appendChild(renderSemester(semester)));
      body.appendChild(semesters);
      const annual = create("div", "annual-row");
      annual.append(
        stat("Média anual", valueText(performance.annual?.average)),
        stat("Resultado no SIGAA", valueText(performance.annual?.result)),
        stat("Situação no SIGAA", valueText(performance.annual?.situation))
      );
      body.appendChild(annual);
      if (performance.exam) body.appendChild(stat("Exame", valueText(performance.exam)));
      if (performance.unclassified?.length) {
        const other = create("section", "academic-section");
        other.appendChild(create("h3", "", "Outros dados do SIGAA"));
        performance.unclassified.forEach((item) => other.appendChild(stat(item.label || "Campo", valueText(item))));
        body.appendChild(other);
      }
      if (course.refreshError) body.appendChild(create("p", "empty", `Não foi possível atualizar esta disciplina: ${course.refreshError}`));
      details.append(summary, body);
      fragment.appendChild(details);
    });
    elements.courses.replaceChildren(fragment);
    if (!currentData?.courses?.length) elements.courses.appendChild(create("p", "empty", "Nenhuma disciplina disponível."));
  }

  function parseList(value) {
    return String(value || "").split(/[;\n]/).map((item) => Number(item.trim().replace(",", "."))).filter(Number.isFinite);
  }

  function renderSimulatorCourses() {
    const selected = elements["simulator-course"].value;
    const options = (currentData?.courses || []).map((course, index) => new Option(courseName(course), String(index)));
    elements["simulator-course"].replaceChildren(...options);
    if (options.length) elements["simulator-course"].value = selected && Number(selected) < options.length ? selected : "0";
    updateAnnualSimulator();
  }

  function updateAnnualSimulator() {
    const course = currentData?.courses?.[Number(elements["simulator-course"].value)];
    const first = model.getSemesterResult(course, 1)?.numericValue;
    const secondText = elements["simulator-s2"].value.trim();
    const targetText = elements["simulator-target"].value.trim();
    const secondInput = secondText ? Number(secondText.replace(",", ".")) : null;
    const target = targetText ? Number(targetText.replace(",", ".")) : 7;
    elements["simulator-s1"].value = first == null ? "" : formatNumber(first);
    if (first == null) {
      elements["simulator-output"].textContent = "O SIGAA não informou o resultado do 1º semestre.";
      return;
    }
    if (!Number.isFinite(target) || target < 0 || target > 10) {
      elements["simulator-output"].textContent = "Informe uma meta anual entre 0 e 10.";
      return;
    }
    if (secondInput != null && (!Number.isFinite(secondInput) || secondInput < 0 || secondInput > 10)) {
      elements["simulator-output"].textContent = "Informe um resultado projetado do 2º semestre entre 0 e 10.";
      return;
    }
    const required = model.calculateRequiredSecondSemester(first, Number.isFinite(target) ? target : 7);
    const parts = required <= 0
      ? ["A projeção 40%/60% já atinge a meta informada."]
      : required > 10
        ? [`A meta é inalcançável apenas pelo 2º semestre: seria necessário ${formatNumber(required)}.`]
        : [`Resultado necessário no 2º semestre: ${formatNumber(required)}.`];
    if (secondInput != null && Number.isFinite(secondInput)) parts.push(`Média anual projetada: ${formatNumber(model.calculateAnnual(first, secondInput))}.`);
    elements["simulator-output"].textContent = parts.join(" ");
  }

  function updateCustomScenario() {
    const values = parseList(elements["scenario-values"].value);
    const type = elements["scenario-type"].value;
    elements["weights-label"].hidden = type !== "weighted";
    if (!values.length) {
      elements["scenario-output"].textContent = "Informe os valores.";
      return;
    }
    let result = null;
    if (type === "sum") result = values.reduce((sum, value) => sum + value, 0);
    if (type === "simple") result = values.reduce((sum, value) => sum + value, 0) / values.length;
    if (type === "weighted") {
      const weights = parseList(elements["scenario-weights"].value);
      if (weights.length !== values.length || !weights.reduce((sum, value) => sum + value, 0)) {
        elements["scenario-output"].textContent = "Informe um peso para cada valor.";
        return;
      }
      result = values.reduce((sum, value, index) => sum + value * weights[index], 0) / weights.reduce((sum, value) => sum + value, 0);
    }
    elements["scenario-output"].textContent = `Resultado do cenário: ${formatNumber(result, 2)}.`;
  }

  async function saveSemesterFocus() {
    const year = selectedYear();
    uiPreferences = await storage.setSemesterFocus(year, focusSemester());
    renderAll();
  }

  function renderAll() {
    elements["last-updated"].textContent = formatUpdated(currentData?.updatedAt);
    const focus = uiModel.semesterFocus(uiPreferences, selectedYear());
    elements["semester-focus"].value = String(focus || "");
    renderMetrics(); renderAttendance(); renderChanges(); renderCourses(); renderSimulatorCourses();
    if (currentData?.needsAcademicModelRefresh) setStatus("Atualize os dados para organizar avaliações e resultados semestrais.", "warning");
  }

  async function loadData() {
    [currentData, uiPreferences] = await Promise.all([
      storage.loadData(privacyContext),
      storage.getUiPreferences()
    ]);
    renderAll();
    if (!currentData) setStatus("Entre no SIGAA e clique em Atualizar.");
  }

  async function syncRefresh() {
    const status = await chrome.runtime.sendMessage({ type: "getRefreshStatus", consumer: "dashboard" });
    elements.refresh.disabled = Boolean(status?.running);
    elements["cancel-refresh"].hidden = !status?.running;
    if (status?.running) {
      const progress = status.totalCourses ? `${status.completedCourses} de ${status.totalCourses}` : "";
      setStatus([status.currentCourseName || "Atualizando dados", progress].filter(Boolean).join(" · "));
      return;
    }
    clearInterval(refreshTimer); refreshTimer = null;
    await loadData();
    if (status?.response?.error) {
      setStatus(status.response.error, "warning");
    } else if (status?.response?.data && !status.response.data.ok) {
      setStatus(status.response.data.message || "Não foi possível atualizar os dados.", "warning");
    }
    if (status?.response) {
      chrome.runtime.sendMessage({ type: "acknowledgeRefreshResult", consumer: "dashboard" }).catch(() => {});
    }
  }

  function startPolling() {
    if (!refreshTimer) refreshTimer = setInterval(() => syncRefresh().catch(() => {}), 750);
    syncRefresh().catch(() => {});
  }

  elements.refresh.addEventListener("click", () => {
    elements.refresh.disabled = true;
    chrome.runtime.sendMessage({ type: "startRefresh" }).catch((error) => setStatus(error.message, "warning"));
    startPolling();
  });
  elements["cancel-refresh"].addEventListener("click", () => chrome.runtime.sendMessage({ type: "cancelRefresh" }).catch(() => {}));
  elements["open-sigaa"].addEventListener("click", () => chrome.tabs.create({ url: PORTAL_URL }));
  elements["semester-focus"].addEventListener("change", () => saveSemesterFocus().catch(() => setStatus("Não foi possível salvar o semestre em foco.", "warning")));
  [elements["simulator-course"], elements["simulator-s2"], elements["simulator-target"]].forEach((element) => element.addEventListener("input", updateAnnualSimulator));
  [elements["scenario-type"], elements["scenario-values"], elements["scenario-weights"]].forEach((element) => element.addEventListener("input", updateCustomScenario));
  document.getElementById("annual-simulator").addEventListener("submit", (event) => event.preventDefault());
  document.getElementById("custom-scenario").addEventListener("submit", (event) => event.preventDefault());

  chrome.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[storage.UI_PREFERENCES_KEY]) return;
    uiPreferences = storage.normalizeUiPreferences(changes[storage.UI_PREFERENCES_KEY].newValue);
    renderAll();
  });

  chrome.runtime.onMessage?.addListener((message) => {
    if (message?.type !== "refreshStatusChanged") return false;
    startPolling();
    return false;
  });

  (async () => {
    const incognito = Boolean(chrome.extension?.inIncognitoContext);
    privacyContext = await storage.getContext({ incognito });
    elements["privacy-mode"].textContent = privacyContext.mode === storage.PUBLIC_MODE ? "Modo compartilhado" : "Modo pessoal";
    await loadData();
    startPolling();
  })().catch((error) => setStatus(error.message || "Não foi possível abrir o dashboard.", "warning"));
})();
