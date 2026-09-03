const fs = require("fs");
const http = require("http");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sampleData = {
  ok: true,
  status: "ok",
  schemaVersion: 4,
  updatedAt: "2026-08-28T17:20:00.000Z",
  owner: { enrollment: "0000000000", studentName: "ALUNO TESTE" },
  preferences: { semesterFocusByYear: { 2026: 2 } },
  courses: [
    {
      courseId: "fisica-2026",
      code: "03002118",
      name: "FÍSICA",
      year: "2026",
      teachers: ["DANIELA SCHITTLER"],
      summary: { mediaAnual: "6,8", faltas: "4", situacao: "CURSANDO" },
      attendance: { aulasMinistradas: 80, aulasTotal: 120 },
      performance: {
        semesters: [
          {
            number: 1,
            label: "1º semestre",
            assessments: [
              { sourceKey: "semester:1:101:assessment", role: "assessment", label: "FE", fullName: "Força Eletrostática", value: "8,0", numericValue: 8, rawValue: "8,0", availability: "available", evidence: "evaluation-id", finality: "unknown" },
              { sourceKey: "semester:1:102:assessment", role: "assessment", label: "CE", fullName: "Campo Elétrico", value: "7,5", numericValue: 7.5, rawValue: "7,5", availability: "available", evidence: "evaluation-id", finality: "unknown" }
            ],
            result: { sourceKey: "semester:1:result", role: "semester_result", label: "Resultado do 1º semestre", value: "7,8", numericValue: 7.8, rawValue: "7,8", availability: "available", evidence: "unit-column", finality: "unknown" }
          },
          {
            number: 2,
            label: "2º semestre",
            assessments: [
              { sourceKey: "semester:2:201:assessment", role: "assessment", label: "PI", fullName: "Projeto Integrador", value: "6,2", numericValue: 6.2, rawValue: "6,2", availability: "available", evidence: "evaluation-id", finality: "unknown" }
            ],
            result: { sourceKey: "semester:2:result", role: "semester_result", label: "Resultado do 2º semestre", value: "--", numericValue: null, rawValue: "--", availability: "not_informed", evidence: "unit-column", finality: "unknown" }
          }
        ],
        annual: {
          average: { sourceKey: "annual:average", role: "annual_average", label: "Média anual", value: "6,8", numericValue: 6.8, rawValue: "6,8", availability: "available", evidence: "annual-summary-column", finality: "unknown" },
          result: { sourceKey: "annual:result", role: "annual_result", label: "Resultado", value: "", numericValue: null, rawValue: "", availability: "not_informed", evidence: "annual-summary-column", finality: "unknown" },
          situation: { sourceKey: "annual:situation", role: "annual_situation", label: "Situação", value: "CURSANDO", numericValue: null, rawValue: "CURSANDO", availability: "available", evidence: "annual-summary-column", finality: "unknown" }
        },
        exam: null,
        unclassified: [],
        needsRefresh: false
      },
      changes: [{ field: "semester:2:201:assessment", label: "PI", previousValue: "5,5", currentValue: "6,2" }]
    },
    {
      courseId: "web-2026",
      code: "03002200",
      name: "PROGRAMAÇÃO WEB II",
      year: "2026",
      teachers: ["MARIA ANGELICA FIGUEIREDO OLIVEIRA"],
      summary: { mediaAnual: "", faltas: "8", situacao: "MATRICULADO" },
      attendance: { aulasMinistradas: 72, aulasTotal: 100 },
      performance: {
        semesters: [
          { number: 1, label: "1º semestre", assessments: [], result: { sourceKey: "semester:1:result", role: "semester_result", label: "Resultado do 1º semestre", value: "6,5", numericValue: 6.5, rawValue: "6,5", availability: "available", evidence: "unit-column", finality: "unknown" } },
          { number: 2, label: "2º semestre", assessments: [], result: { sourceKey: "semester:2:result", role: "semester_result", label: "Resultado do 2º semestre", value: "", numericValue: null, rawValue: "", availability: "not_informed", evidence: "unit-column", finality: "unknown" } }
        ],
        annual: {
          average: { sourceKey: "annual:average", role: "annual_average", label: "Média anual", value: "", numericValue: null, rawValue: "", availability: "not_informed", evidence: "annual-summary-column", finality: "unknown" },
          result: { sourceKey: "annual:result", role: "annual_result", label: "Resultado", value: "", numericValue: null, rawValue: "", availability: "not_informed", evidence: "annual-summary-column", finality: "unknown" },
          situation: { sourceKey: "annual:situation", role: "annual_situation", label: "Situação", value: "MATRICULADO", numericValue: null, rawValue: "MATRICULADO", availability: "available", evidence: "annual-summary-column", finality: "unknown" }
        },
        exam: null,
        unclassified: [{ sourceKey: "semester:2:9:unclassified", role: "unclassified", label: "NOTA", value: "", numericValue: null, rawValue: "--", availability: "not_informed", evidence: "ambiguous-note-label", finality: "unknown" }],
        needsRefresh: false
      },
      changes: []
    }
  ]
};

const mock = `<script>
  const previewData = ${JSON.stringify(sampleData)};
  const values = { "infosigaa:privacy:v1": { deviceMode: "personal", onboardingVersion: 1 }, "sigaa-grade-monitor:data:v4": previewData };
  const area = {
    get(keys, callback) { const result = {}; (Array.isArray(keys) ? keys : Object.keys(values)).forEach((key) => { if (key in values) result[key] = values[key]; }); callback(result); },
    set(next, callback) { Object.assign(values, next); callback && callback(); },
    remove(keys, callback) { (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete values[key]); callback && callback(); }
  };
  window.chrome = {
    runtime: { lastError: null, sendMessage: async (message) => message.type === "getRefreshStatus" ? { ok: true, running: false, response: null } : { ok: true } },
    storage: { local: area, session: area },
    extension: { inIncognitoContext: false },
    tabs: { create: async () => ({}) }
  };
</script>`;

const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png" };
http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://127.0.0.1").pathname;
  const requested = pathname === "/" ? "dashboard.html" : pathname.slice(1);
  const file = path.resolve(root, requested);
  if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404).end("Not found");
    return;
  }
  let body = fs.readFileSync(file);
  if (requested === "dashboard.html") {
    body = Buffer.from(body.toString("utf8").replace('<script src="src/academic-model.js"></script>', `${mock}<script src="src/academic-model.js"></script>`));
  }
  response.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  response.end(body);
}).listen(4173, "127.0.0.1", () => console.log("dashboard-preview-ready"));
