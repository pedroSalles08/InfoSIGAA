const assert = require("assert");
const fs = require("fs");

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const popup = fs.readFileSync("popup.html", "utf8");
const popupScript = fs.readFileSync("popup.js", "utf8");
const popupStyles = fs.readFileSync("popup.css", "utf8");
const background = fs.readFileSync("src/background.js", "utf8");
const packageScript = fs.readFileSync("scripts/package-extension.ps1", "utf8");

assert.strictEqual(manifest.incognito, "split", "A janela anônima deve ter processo separado.");
assert.ok(manifest.permissions.includes("storage"), "Os modos de privacidade dependem da Storage API.");
assert.match(popup, /Onde você usa o InfoSIGAA\?/, "A escolha inicial deve ser explicada no popup.");
assert.match(popup, /Meu computador[\s\S]*Recomendado/, "O uso pessoal deve ser a escolha principal.");
assert.match(popup, /Computador compartilhado/, "O modo compartilhado deve estar disponível.");
assert.match(popup, /id="clear-data-button"[\s\S]*Limpar dados/, "O controle de limpeza deve estar disponível.");
assert.ok(
  popup.indexOf('src="src/privacy-storage.js"') < popup.indexOf('src="popup.js"'),
  "O contrato de armazenamento deve carregar antes da interface."
);
assert.doesNotMatch(popupScript, /chrome\.storage\.(?:local|session)/, "O popup não deve contornar o contrato de armazenamento.");
assert.match(background, /privacy-storage\.js/, "O service worker deve carregar o contrato de privacidade.");
assert.match(packageScript, /src\/privacy-storage\.js/, "O pacote deve incluir o contrato de privacidade.");
assert.doesNotMatch(popupStyles, /(?:linear|radial)-gradient/i, "A nova interface deve preservar o design sem gradientes.");
assert.doesNotMatch(popupStyles, /border-radius:\s*(?:999|9999)px/i, "A nova interface não deve introduzir cápsulas.");

console.log("privacy-ui-smoke-ok");
