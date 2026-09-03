const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 4174);

function grade(value, label = "Nota", extra = {}) {
  const text = value == null ? "" : String(value).replace(".", ",");
  return {
    sourceKey: extra.sourceKey || label.toLocaleLowerCase("pt-BR").replace(/\W+/g, "-"),
    role: extra.role || "assessment",
    label,
    fullName: extra.fullName || label,
    value: text,
    numericValue: value == null ? null : Number(value),
    rawValue: text,
    availability: value == null ? "not_informed" : "available",
    evidence: "preview",
    finality: "unknown",
    ...extra,
  };
}

function performance({ first = [], second = [], firstResult, secondResult, annual, exam, situation = "Cursando", unclassified = [] } = {}) {
  return {
    semesters: [
      { number: 1, label: "1º semestre", assessments: first, result: grade(firstResult, "Resultado", { role: "semester_result", sourceKey: "semester:1:result" }) },
      { number: 2, label: "2º semestre", assessments: second, result: grade(secondResult, "Resultado", { role: "semester_result", sourceKey: "semester:2:result" }) },
    ],
    annual: {
      average: grade(annual, "Média anual", { role: "annual_average", sourceKey: "annual:average" }),
      result: grade(annual == null ? null : "Em andamento", "Resultado", { role: "annual_result", sourceKey: "annual:result" }),
      situation: grade(situation, "Situação", { role: "annual_situation", sourceKey: "annual:situation" }),
    },
    exam: grade(exam, "Exame", { role: "exam_result", sourceKey: "exam:result" }),
    unclassified,
  };
}

function buildCourses() {
  return [
    {
      id: "fisica-ii",
      courseId: "fisica-ii",
      year: "2026",
      name: "Física II",
      rawTitle: "112233 - FÍSICA II (80h) - Turma: A",
      teachers: ["Marina Albuquerque"],
      recentChangeStatus: "changed",
      changes: [{ field: "Prova 2", previousValue: "6,5", currentValue: "8,5" }],
      summary: { faltas: "8", mediaAnual: "7,7", situacao: "Cursando" },
      attendance: { aulasMinistradas: 74, aulasTotal: 120, percentualCargaMinistrada: 61.7 },
      performance: performance({
        firstResult: 7.2,
        secondResult: 8.1,
        annual: 7.7,
        exam: 6,
        first: [
          grade(7.2, "P1", { fullName: "Prova 1", sourceKey: "fis-p1" }),
          grade(8, "LAB", { fullName: "Relatório de laboratório", sourceKey: "fis-lab" }),
          grade(6.5, "SEM", { fullName: "Seminário", sourceKey: "fis-seminario" }),
          grade(10, "AT", { fullName: "Atividade complementar", sourceKey: "fis-extra" }),
        ],
        second: [
          grade(9, "LE", { fullName: "Lista de exercícios", sourceKey: "fis-lista" }),
          grade(8.5, "P2", { fullName: "Prova 2", sourceKey: "fis-p2", changed: true, changeType: "changed", previousValue: "6,5" }),
        ],
      }),
    },
    {
      id: "projeto-integrador",
      courseId: "projeto-integrador",
      year: "2026",
      name: "Projeto Integrador de Redes e Sistemas Embarcados",
      rawTitle: "445566 - PROJETO INTEGRADOR DE REDES E SISTEMAS EMBARCADOS (120h) - Turma: B",
      teachers: ["Carlos Henrique da Silva", "Ana Beatriz Monteiro"],
      recentChangeStatus: "unchanged",
      summary: { faltas: "3", mediaAnual: "8,9", situacao: "Cursando" },
      attendance: { aulasMinistradas: 64, aulasTotal: 96, percentualCargaMinistrada: 66.7 },
      performance: performance({
        firstResult: 9.1,
        secondResult: 8.7,
        annual: 8.9,
        first: [grade(9.1, "Pitch", { fullName: "Apresentação intermediária", sourceKey: "proj-pitch" })],
        second: [
          grade(9.5, "Demo", { fullName: "Demonstração do protótipo funcional", sourceKey: "proj-demo" }),
          grade(8, "Doc", { fullName: "Documentação técnica", sourceKey: "proj-doc" }),
        ],
      }),
    },
    {
      id: "quimica-geral",
      courseId: "quimica-geral",
      year: "2026",
      name: "Química Geral",
      rawTitle: "778899 - QUÍMICA GERAL (60h)",
      teachers: ["Júlia Nascimento"],
      recentChangeStatus: "unchanged",
      noGrades: true,
      message: "O SIGAA ainda não publicou avaliações nesta disciplina.",
      summary: { faltas: "0" },
      attendance: { aulasMinistradas: 18, aulasTotal: 60, percentualCargaMinistrada: 30 },
      performance: performance(),
    },
    {
      id: "historia-tecnologia",
      courseId: "historia-tecnologia",
      year: "2026",
      name: "História da Ciência e da Tecnologia",
      rawTitle: "990011 - HISTÓRIA DA CIÊNCIA E DA TECNOLOGIA (60h)",
      teachers: ["Renato Alves"],
      recentChangeStatus: "unchanged",
      refreshError: "O SIGAA não respondeu nesta atualização. Exibindo os últimos dados válidos.",
      stale: true,
      summary: { faltas: "6", mediaAnual: "7,6", situacao: "Cursando" },
      attendance: { aulasMinistradas: 52, aulasTotal: 60, percentualCargaMinistrada: 86.7 },
      performance: performance({
        firstResult: 7.8,
        secondResult: 7.4,
        annual: 7.6,
        first: [grade(7.8, "AV1", { fullName: "Avaliação escrita", sourceKey: "hist-prova" })],
        second: [grade(7.4, "EC", { fullName: "Ensaio crítico", sourceKey: "hist-ensaio" })],
      }),
    },
    {
      id: "biologia",
      courseId: "biologia",
      year: "2026",
      name: "Biologia Aplicada",
      rawTitle: "221100 - BIOLOGIA APLICADA (40h)",
      teachers: ["Patrícia Lima"],
      recentChangeStatus: "unchanged",
      error: "Não foi possível ler esta disciplina. Abra o SIGAA e tente atualizar novamente.",
      summary: {},
      performance: performance({ situation: null }),
    },
    {
      id: "calculo-numerico",
      courseId: "calculo-numerico",
      year: "2026",
      name: "Cálculo Numérico",
      rawTitle: "332211 - CÁLCULO NUMÉRICO (60h)",
      teachers: ["Eduardo Costa"],
      recentChangeStatus: "new",
      changes: [{ field: "Segunda avaliação", currentValue: "8,8" }],
      summary: { faltas: "2", mediaAnual: "8,6", situacao: "Cursando" },
      attendance: { aulasMinistradas: 40, aulasTotal: 60, percentualCargaMinistrada: 66.7 },
      performance: performance({
        firstResult: 8.3,
        secondResult: 8.8,
        annual: 8.6,
        first: [grade(8.3, "AV1", { fullName: "Primeira avaliação", sourceKey: "calc-p1" })],
        second: [grade(8.8, "AV2", { fullName: "Segunda avaliação", sourceKey: "calc-p2", changed: true, changeType: "new" })],
      }),
    },
  ];
}

function buildMockScript(state) {
  const now = Date.now();
  const localData = {
    "sigaa-grade-monitor:data:v4": {
      ok: true,
      schemaVersion: 4,
      courses: buildCourses(),
      updatedAt: new Date(now - 8 * 60 * 1000).toISOString(),
      mode: "personal",
    },
    "infosigaa:privacy:v1": { deviceMode: "personal", onboardingVersion: 1 },
    "infosigaa:ui-preferences:v1": { semesterFocusByYear: { 2026: 0 } },
  };
  const runtimeStatus = state === "refreshing"
    ? { running: true, completedCourses: 2, totalCourses: 6, currentCourseName: "Química Geral" }
    : { running: false };

  return `
    (() => {
      const localData = ${JSON.stringify(localData)};
      const sessionData = {};
      const changeListeners = [];
      const runtimeListeners = [];
      let refreshStatus = ${JSON.stringify(runtimeStatus)};

      const makeArea = (store, areaName) => ({
        get(keys, callback) {
          const list = keys == null ? Object.keys(store) : Array.isArray(keys) ? keys : [keys];
          const result = {};
          list.forEach((key) => { if (Object.prototype.hasOwnProperty.call(store, key)) result[key] = store[key]; });
          callback(result);
        },
        set(values, callback) {
          const changes = {};
          Object.entries(values).forEach(([key, value]) => {
            changes[key] = { oldValue: store[key], newValue: value };
            store[key] = value;
          });
          changeListeners.forEach((listener) => listener(changes, areaName));
          callback?.();
        },
        remove(keys, callback) {
          (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete store[key]);
          callback?.();
        },
        setAccessLevel(_options, callback) { callback?.(); },
      });

      const emitRefresh = () => runtimeListeners.forEach((listener) => listener({
        type: "refreshStatusChanged",
        status: refreshStatus,
      }));

      window.chrome = {
        extension: { inIncognitoContext: false },
        runtime: {
          lastError: null,
          sendMessage(message, callback) {
            let result;
            if (message?.type === "getRefreshStatus") result = refreshStatus;
            else if (message?.type === "startRefresh") {
              refreshStatus = { running: true, completedCourses: 0, totalCourses: 6, currentCourseName: "Física II" };
              emitRefresh();
              result = { ok: true };
            } else if (message?.type === "cancelRefresh") {
              refreshStatus = { running: false };
              emitRefresh();
              result = { ok: true };
            } else result = { ok: true };
            callback?.(result);
            return callback ? undefined : Promise.resolve(result);
          },
          onMessage: { addListener(listener) { runtimeListeners.push(listener); } },
        },
        storage: {
          local: makeArea(localData, "local"),
          session: makeArea(sessionData, "session"),
          onChanged: { addListener(listener) { changeListeners.push(listener); } },
        },
        tabs: {
          query(_options, callback) {
            const result = [{ id: 1, url: "https://sigaa.example.edu.br/", incognito: false }];
            callback?.(result);
            return callback ? undefined : Promise.resolve(result);
          },
          update(_id, _options, callback) {
            callback?.();
            return callback ? undefined : Promise.resolve();
          },
        },
      };
      window.__popupPreview = { getRefreshStatus: () => refreshStatus };
    })();
  `;
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
  }[extension] || "application/octet-stream";
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://127.0.0.1:${PORT}`);
  const relativePath = requestUrl.pathname === "/" ? "popup.html" : decodeURIComponent(requestUrl.pathname.slice(1));
  const filePath = path.resolve(ROOT, relativePath);

  if (path.relative(ROOT, filePath).startsWith("..") || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  let body = fs.readFileSync(filePath);
  if (relativePath === "popup.html") {
    const state = requestUrl.searchParams.get("state") || "normal";
    const html = body.toString("utf8").replace(
      '<script src="src/academic-model.js"></script>',
      `<script>${buildMockScript(state)}</script>\n  <script src="src/academic-model.js"></script>`,
    );
    body = Buffer.from(html);
  }

  response.writeHead(200, { "Content-Type": contentType(filePath), "Cache-Control": "no-store" });
  response.end(body);
});

if (require.main === module) {
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Popup preview: http://127.0.0.1:${PORT}/popup.html`);
  });
}

module.exports = { buildCourses };
