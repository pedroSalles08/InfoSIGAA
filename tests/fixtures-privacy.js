const fs = require("fs");
const path = require("path");
const assert = require("assert");

const projectRoot = path.resolve(__dirname, "..");
const fixturesDirectory = path.join(projectRoot, "fixtures");
const publicFixtures = fs.readdirSync(fixturesDirectory)
  .filter((name) => name.endsWith(".html"))
  .map((name) => path.join(fixturesDirectory, name));
const testSources = fs.readdirSync(__dirname)
  .filter((name) => name.endsWith(".js"))
  .map((name) => path.join(__dirname, name));
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const cpfPattern = /\b\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2}\b/g;
const longNumericIdPattern = /\b\d{10,}\b/g;

assert.deepStrictEqual(
  publicFixtures.map((file) => path.basename(file)).sort(),
  ["portal-discente.html", "turma-virtual-fisica.html", "ver-notas-fisica.html"]
);

for (const file of publicFixtures) {
  const content = fs.readFileSync(file, "utf8");
  const relativePath = path.relative(projectRoot, file);

  assert.ok(Buffer.byteLength(content) < 50_000, `${relativePath} parece ser uma captura HTML integral.`);
  assert.strictEqual((content.match(emailPattern) || []).length, 0, `${relativePath} contem e-mail.`);
  assert.strictEqual((content.match(cpfPattern) || []).length, 0, `${relativePath} contem CPF.`);

  const longNumericIds = content.match(longNumericIdPattern) || [];
  assert.ok(
    longNumericIds.every((value) => /^0+$/.test(value)),
    `${relativePath} contem matricula ou identificador numerico nao ficticio.`
  );

  for (const [tag] of content.matchAll(/<input\b[^>]*>/gi)) {
    const name = tag.match(/\bname=["']([^"']*)["']/i)?.[1] || "";
    const value = tag.match(/\bvalue=["']([^"']*)["']/i)?.[1] || "";

    if (name === "javax.faces.ViewState") {
      assert.match(value, /^TEST_VIEW_STATE(?:_\d+)?$/, `${relativePath} contem ViewState nao sintetico.`);
    }
  }
}

for (const file of testSources) {
  const content = fs.readFileSync(file, "utf8");
  const relativePath = path.relative(projectRoot, file);

  assert.strictEqual((content.match(emailPattern) || []).length, 0, `${relativePath} contem e-mail.`);
  const longNumericIds = content.match(longNumericIdPattern) || [];
  assert.ok(
    longNumericIds.every((value) => /^0+$/.test(value)),
    `${relativePath} contem matricula ou identificador numerico nao ficticio.`
  );
}

console.log("fixtures-privacy-ok");
