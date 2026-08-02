const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const script = path.join(root, "scripts", "package-extension.ps1");
const archiveName = `InfoSIGAA-Chrome-v${manifest.version}.zip`;
const archivePath = path.join(root, "dist", archiveName);
const checksumPath = `${archivePath}.sha256`;

assert.ok(fs.existsSync(script), "O script de empacotamento deve existir.");

const success = spawnSync(
  "pwsh",
  ["-NoProfile", "-File", script, "-ExpectedTag", `v${manifest.version}`],
  { cwd: root, encoding: "utf8" }
);

assert.strictEqual(success.status, 0, `O empacotamento deve funcionar.\n${success.stdout}\n${success.stderr}`);
assert.ok(fs.existsSync(archivePath), "O ZIP versionado deve ser criado em dist/.");
assert.ok(fs.existsSync(checksumPath), "O checksum SHA-256 deve ser criado ao lado do ZIP.");

const expectedHash = crypto.createHash("sha256").update(fs.readFileSync(archivePath)).digest("hex");
const checksum = fs.readFileSync(checksumPath, "utf8").trim();
assert.strictEqual(checksum, `${expectedHash}  ${archiveName}`, "O checksum deve corresponder exatamente ao ZIP publicado.");

const wrongTag = spawnSync(
  "pwsh",
  ["-NoProfile", "-File", script, "-ExpectedTag", "v99.99.99"],
  { cwd: root, encoding: "utf8" }
);

assert.notStrictEqual(wrongTag.status, 0, "O empacotamento deve rejeitar uma tag diferente da versão do manifesto.");

console.log("package-smoke-ok");
