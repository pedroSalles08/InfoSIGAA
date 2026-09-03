const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("dashboard.html", "utf8");
const styles = fs.readFileSync("dashboard.css", "utf8");
const tokens = fs.readFileSync("src/ui-tokens.css", "utf8");
const script = fs.readFileSync("dashboard.js", "utf8");
const popup = fs.readFileSync("popup.html", "utf8");
const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));

[
  "semester-focus", "attendance-summary", "courses", "annual-simulator",
  "custom-scenario", "refresh", "cancel-refresh", "open-sigaa"
].forEach((id) => assert.match(html, new RegExp(`id=["']${id}["']`)));
assert.match(html, /1º semestre × 40% \+ 2º semestre × 60%/);
assert.match(script, /calculateRequiredSecondSemester/);
assert.match(script, /calculateAnnual/);
assert.match(script, /semesterFocusByYear/);
assert.match(script, /Não informado/);
assert.doesNotMatch(`${html}\n${script}`, /Margem|Estimativa/i, "O dashboard não deve exibir estimativas de faltas.");
assert.doesNotMatch(html, /Frequência por data|heatmap|attendance-filter/);
assert.doesNotMatch(script, /attendanceDays|renderHeatmap|aggregateAttendance/);
assert.doesNotMatch(styles, /(?:linear|radial)-gradient/i);
assert.match(tokens, /--bg:\s*#171717/i);
assert.ok(html.indexOf('href="src/ui-tokens.css"') < html.indexOf('href="dashboard.css"'));
assert.ok(popup.indexOf('href="src/ui-tokens.css"') < popup.indexOf('href="popup.css"'));
assert.ok(popup.indexOf('src="src/academic-model.js"') < popup.indexOf('src="popup.js"'));
assert.ok(html.indexOf('src="src/ui-format.js"') < html.indexOf('src="dashboard.js"'));
assert.ok(popup.indexOf('src="src/ui-format.js"') < popup.indexOf('src="popup.js"'));
assert.ok(html.indexOf('src="src/ui-model.js"') < html.indexOf('src="dashboard.js"'));
assert.ok(popup.indexOf('src="src/ui-model.js"') < popup.indexOf('src="popup.js"'));
assert.ok(manifest.content_scripts.some((entry) => entry.run_at === "document_start" && entry.all_frames));

const forbiddenCopy = /sua jornada|domine seus estudos|tudo em um só lugar|transforme sua experiência/i;
[html, script, popup].forEach((content) => assert.doesNotMatch(content, forbiddenCopy));

console.log("dashboard-smoke-ok");
