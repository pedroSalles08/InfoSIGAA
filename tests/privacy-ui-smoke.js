const assert = require("assert");
const fs = require("fs");

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const popup = fs.readFileSync("popup.html", "utf8");
const popupScript = fs.readFileSync("popup.js", "utf8");
const popupStyles = fs.readFileSync("popup.css", "utf8");
const background = fs.readFileSync("src/background.js", "utf8");
const privacyStorage = fs.readFileSync("src/privacy-storage.js", "utf8");
const uiModel = fs.readFileSync("src/ui-model.js", "utf8");
const packageScript = fs.readFileSync("scripts/package-extension.ps1", "utf8");

assert.strictEqual(manifest.incognito, "split", "A janela anônima deve ter processo separado.");
assert.ok(manifest.permissions.includes("storage"), "Os modos de privacidade dependem da Storage API.");
assert.deepStrictEqual(
  manifest.permissions,
  ["activeTab", "scripting", "storage"],
  "A extensão deve preservar somente as permissões necessárias."
);
assert.match(popup, /Onde você usa o InfoSIGAA\?/, "A escolha inicial deve ser explicada no popup.");
assert.match(popup, /Meu computador[\s\S]*Recomendado/, "O uso pessoal deve ser a escolha principal.");
assert.match(popup, /Computador compartilhado/, "O modo compartilhado deve estar disponível.");
assert.match(popup, /id="clear-data-button"[\s\S]*Limpar dados/, "O controle de limpeza deve estar disponível.");
assert.match(popup, /id="settings-button"[\s\S]*<svg[\s\S]*Configurações/, "O botão deve identificar Configurações com engrenagem.");
assert.doesNotMatch(popup, /Atualização automática|data-(?:setup-)?auto-refresh/, "A interface não deve oferecer atualização automática.");
assert.ok(
  popup.indexOf('src="src/privacy-storage.js"') < popup.indexOf('src="popup.js"'),
  "O contrato de armazenamento deve carregar antes da interface."
);
assert.doesNotMatch(popupScript, /chrome\.storage\.(?:local|session)/, "O popup não deve contornar o contrato de armazenamento.");
assert.doesNotMatch(popupScript, /chrome\.scripting\.executeScript/, "A captura do SIGAA deve continuar mesmo se o popup for fechado.");
assert.match(background, /chrome\.scripting\.executeScript/, "O service worker deve capturar a página ativa do SIGAA.");
assert.match(background, /getRefreshStatus/, "O popup deve conseguir retomar o acompanhamento da atualização.");
assert.match(background, /refreshStatusChanged/, "Popup e dashboard devem receber mudanças globais do estado da atualização.");
assert.match(background, /startRefreshKeepAlive/, "A atualização em segundo plano deve manter o service worker ativo somente durante a busca.");
assert.match(background, /setBadgeText/, "O ícone deve indicar o estado da atualização.");
assert.match(background, /chrome\.tabs\.onUpdated/, "Recarregar uma aba SIGAA deve cancelar a coleta em andamento.");
assert.doesNotMatch(background, /onUpdated[\s\S]{0,500}startRefresh\(/, "Navegar no SIGAA não deve iniciar coleta em segundo plano.");
assert.doesNotMatch(background, /AutoRefresh|automatic/i, "O service worker não deve manter coordenação automática inativa.");
assert.strictEqual(
  (background.match(/SigaaFetcher\.refreshAllGrades/g) || []).length,
  1,
  "O fluxo manual deve manter uma única chamada centralizada ao fetcher."
);
assert.doesNotMatch(privacyStorage, /infosigaa:settings:v1|autoRefresh/i, "O armazenamento não deve manter contratos da funcionalidade removida.");
assert.doesNotMatch(popupScript, /course\.studentName/, "O nome do aluno não deve continuar repetido nos cards.");
assert.match(popupScript, /view\.teachers/, "Os cards devem exibir os docentes preparados pelo view-model.");
assert.match(uiModel, /course\?\.teachers/, "O view-model deve preservar os docentes quando estiverem disponíveis.");
assert.match(popup, /id="semester-focus"[\s\S]*Anual[\s\S]*1º semestre[\s\S]*2º semestre/, "O popup deve oferecer um seletor sutil de período.");
assert.match(popupScript, /elements\.controls\.hidden = false/, "Busca, período e filtros devem ficar visíveis quando houver disciplinas.");
assert.match(popupScript, /elements\.courses\.appendChild\(renderCourse/, "O popup deve renderizar os cards das disciplinas.");
assert.match(popupScript, /expandedCourseId = expandedCourseId === courseKey \? "" : courseKey/, "Somente um card deve permanecer expandido por vez.");
assert.match(popupScript, /consumer: "popup"/, "O popup deve reconhecer resultados de atualização sem consumi-los do dashboard.");
assert.doesNotMatch(background, /OffscreenCanvas|renderRefreshIconFrame/, "O ícone original não deve ser substituído por uma animação.");
assert.doesNotMatch(background, /chrome\.action\.setIcon/, "A atualização não deve substituir o ícone original.");
assert.match(background, /Atualização concluída às/, "O tooltip deve informar quando a atualização terminou.");
assert.match(popupScript, /acknowledgeRefreshResult/, "Abrir o popup deve limpar o aviso já visualizado.");
assert.match(background, /privacy-storage\.js/, "O service worker deve carregar o contrato de privacidade.");
assert.match(packageScript, /src\/privacy-storage\.js/, "O pacote deve incluir o contrato de privacidade.");
assert.doesNotMatch(popupStyles, /(?:linear|radial)-gradient/i, "A nova interface deve preservar o design sem gradientes.");
assert.doesNotMatch(popupStyles, /border-radius:\s*(?:999|9999)px/i, "A nova interface não deve introduzir cápsulas.");

console.log("privacy-ui-smoke-ok");
