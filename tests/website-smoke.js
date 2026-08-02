const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const websiteRoot = path.join(root, "website");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const supportEmail = ["infosigaa", "protonmail.com"].join("@");
const pages = [
  { name: "início", file: "index.html" },
  { name: "instalação", file: path.join("instalacao", "index.html") },
  { name: "suporte", file: path.join("suporte", "index.html") },
  { name: "privacidade", file: path.join("privacidade", "index.html") }
];

function read(relativePath) {
  return fs.readFileSync(path.join(websiteRoot, relativePath), "utf8");
}

function resolveLocalReference(pagePath, reference) {
  const withoutFragment = reference.split("#")[0].split("?")[0];
  const pageDirectory = path.dirname(path.join(websiteRoot, pagePath));
  const target = path.resolve(pageDirectory, withoutFragment || ".");

  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    return path.join(target, "index.html");
  }

  return target;
}

assert.ok(fs.existsSync(websiteRoot), "A pasta website deve existir.");

const requiredAssets = [
  path.join("assets", "css", "site.css"),
  path.join("assets", "js", "site.js"),
  path.join("assets", "brand", "logo-mark-white.svg"),
  path.join("assets", "brand", "favicon-light.svg"),
  path.join("assets", "brand", "favicon-dark.svg"),
  path.join("assets", "brand", "apple-touch-icon.png"),
  ".nojekyll",
  "README.md"
];

requiredAssets.forEach((asset) => {
  assert.ok(fs.existsSync(path.join(websiteRoot, asset)), `${asset} deve existir.`);
});

pages.forEach(({ name, file }) => {
  const html = read(file);

  assert.match(html, /<html lang="pt-BR">/, `${name}: idioma deve ser pt-BR.`);
  assert.match(html, /<meta name="viewport"/, `${name}: viewport ausente.`);
  assert.match(html, /<meta name="description"/, `${name}: descrição ausente.`);
  assert.match(html, /<title>[^<]+<\/title>/, `${name}: título ausente.`);
  assert.match(html, /<header class="site-header">/, `${name}: cabeçalho ausente.`);
  assert.match(html, /<main id="conteudo">/, `${name}: conteúdo principal ausente.`);
  assert.match(html, /<footer class="site-footer">/, `${name}: rodapé ausente.`);
  assert.match(html, /data-nav-toggle/, `${name}: controle do menu ausente.`);
  assert.match(html, /aria-current="page"/, `${name}: página atual não identificada.`);
  assert.ok(html.includes(supportEmail), `${name}: e-mail de suporte ausente.`);
  assert.doesNotMatch(html, /(?:href|src)="\//, `${name}: caminho absoluto quebra GitHub Pages em subdiretório.`);
  assert.doesNotMatch(html, /<script[^>]+src="https?:\/\//i, `${name}: scripts externos não são permitidos.`);
  assert.doesNotMatch(html, /<(?:form|iframe)\b/i, `${name}: formulários e iframes não são esperados.`);

  const references = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]);

  references.forEach((reference) => {
    if (
      !reference ||
      reference.startsWith("#") ||
      reference.startsWith("mailto:") ||
      reference.startsWith("http://") ||
      reference.startsWith("https://") ||
      reference.startsWith("chrome://")
    ) {
      return;
    }

    const target = resolveLocalReference(file, reference);
    assert.ok(target.startsWith(websiteRoot), `${name}: referência saiu da pasta website: ${reference}`);
    assert.ok(fs.existsSync(target), `${name}: referência local não encontrada: ${reference}`);
  });
});

const home = read("index.html");
const installation = read(path.join("instalacao", "index.html"));
const support = read(path.join("suporte", "index.html"));
const privacy = read(path.join("privacidade", "index.html"));
const css = read(path.join("assets", "css", "site.css"));
const script = read(path.join("assets", "js", "site.js"));

assert.match(home, /Demonstração com dados fictícios/, "A prévia deve declarar que usa dados fictícios.");
assert.doesNotMatch(home, /data-chrome-download/, "A página inicial não deve apresentar um download indireto como se fosse imediato.");
assert.match(home, />\s*Ver instalação\s*</, "A página inicial deve levar primeiro ao guia de instalação.");
assert.match(installation, /chrome:\/\/extensions/, "A instalação deve indicar a página de extensões.");
assert.match(installation, /Carregar sem compactação/, "A instalação deve explicar o carregamento local.");
assert.match(installation, new RegExp(`Versão ${manifest.version.replace(/\./g, "\\.")}`), "A versão exibida deve corresponder ao manifest.json.");
assert.match(installation, /Suporte oficial nesta fase: Google Chrome/, "O navegador oficialmente suportado deve ficar explícito.");
assert.match(installation, /não recebem atualizações automáticas/i, "A instalação deve explicar que atualizações são manuais.");
assert.match(installation, /pasta permanente/i, "A instalação deve orientar a manter um caminho estável.");
assert.match(installation, /Edge, Brave e Opera/, "A instalação deve diferenciar compatibilidade provável de suporte oficial.");
assert.match(installation, /Firefox não é compatível com o pacote atual/, "A limitação atual do Firefox deve ficar explícita.");
assert.doesNotMatch(installation, /Não selecione a pasta <code>website<\/code>/, "O usuário não deve receber instruções baseadas no repositório completo.");

const releaseAssetPattern = new RegExp(
  `href="https://github\\.com/[^/]+/[^/]+/releases/download/v${manifest.version.replace(/\./g, "\\.")}/InfoSIGAA-Chrome-v${manifest.version.replace(/\./g, "\\.")}\\.zip"`
);
const hasReleaseAsset = releaseAssetPattern.test(installation);
const hasPendingRelease = /data-download-status="pending"/.test(installation) && /Aguardando primeira Release/.test(installation);
assert.ok(hasReleaseAsset || hasPendingRelease, "A página deve ter um asset versionado real ou declarar honestamente que a Release está pendente.");
assert.match(support, /mailto:infosigaa@protonmail\.com/, "O suporte deve possuir contato acionável.");
assert.match(privacy, /chrome\.storage\.local/, "A política deve explicar o armazenamento local.");
assert.match(privacy, /não solicita nem armazena sua senha/i, "A política deve explicar o tratamento de senha.");

[
  "--bg: #171717",
  "--surface: #202020",
  "--surface-muted: #252525",
  "--ok: #6fcf97",
  "--warning: #e6ad55",
  "--danger: #ef7777",
  "--info: #b8c0cc"
].forEach((token) => assert.ok(css.includes(token), `Token visual ausente: ${token}`));

assert.doesNotMatch(css, /(?:linear|radial)-gradient/i, "Gradientes não fazem parte da identidade visual.");
assert.doesNotMatch(css, /backdrop-filter/i, "Glassmorphism não deve ser utilizado.");
assert.doesNotMatch(css, /border-radius:\s*(?:999|9999)px/i, "Controles em formato de cápsula não devem ser utilizados.");
assert.doesNotMatch(script, /chrome\.[a-z]/i, "O site não deve acessar APIs da extensão.");
assert.doesNotMatch(script, /(?:localStorage|sessionStorage|indexedDB|document\.cookie)/i, "O site não deve armazenar dados do visitante.");
assert.doesNotMatch(script, /CHROME_STORE_URL|data-chrome-download/, "O JavaScript não deve transformar todos os CTAs em downloads.");

console.log("website-smoke-ok");
