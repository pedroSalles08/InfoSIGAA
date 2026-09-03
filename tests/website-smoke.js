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
  path.join("assets", "brand", "favicon.svg"),
  path.join("assets", "brand", "apple-touch-icon.png"),
  ".nojekyll",
  "README.md"
];

requiredAssets.forEach((asset) => {
  assert.ok(fs.existsSync(path.join(websiteRoot, asset)), `${asset} deve existir.`);
});

[
  path.join("assets", "brand", "favicon-light.svg"),
  path.join("assets", "brand", "favicon-dark.svg")
].forEach((legacyFavicon) => {
  assert.ok(!fs.existsSync(path.join(websiteRoot, legacyFavicon)), `${legacyFavicon} não deve permanecer após a consolidação.`);
});

pages.forEach(({ name, file }) => {
  const html = read(file);

  assert.match(html, /<html lang="pt-BR">/, `${name}: idioma deve ser pt-BR.`);
  assert.match(html, /<meta name="viewport"/, `${name}: viewport ausente.`);
  assert.match(html, /<meta name="description"/, `${name}: descrição ausente.`);
  assert.match(html, /<title>[^<]+<\/title>/, `${name}: título ausente.`);
  assert.strictEqual((html.match(/<link rel="icon"/g) || []).length, 1, `${name}: deve declarar somente um favicon.`);
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="[^\"]*favicon\.svg\?v=3">/, `${name}: favicon SVG adaptável ausente.`);
  assert.doesNotMatch(html, /<link rel="icon"[^>]+media=/, `${name}: a seleção de tema deve ocorrer dentro do SVG.`);
  assert.doesNotMatch(html, /favicon-(?:light|dark)\.svg/, `${name}: variantes antigas de favicon não devem ser referenciadas.`);
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
const favicon = read(path.join("assets", "brand", "favicon.svg"));

assert.match(favicon, /:root\s*\{\s*fill:\s*#000000;/, "O favicon deve usar símbolo preto por padrão.");
assert.match(favicon, /@media\s*\(prefers-color-scheme:\s*dark\)[\s\S]*fill:\s*#ffffff;/, "O favicon deve usar símbolo branco no tema escuro.");
assert.match(favicon, /fill="inherit"/, "A marca deve herdar a cor adaptável do SVG.");
assert.doesNotMatch(favicon, /<rect\b/i, "O favicon deve permanecer com fundo transparente.");

assert.match(home, /Demonstração com dados fictícios/, "A prévia deve declarar que usa dados fictícios.");
assert.doesNotMatch(home, /data-chrome-download/, "A página inicial não deve apresentar um download indireto como se fosse imediato.");
assert.match(home, />\s*Ver instalação\s*</, "A página inicial deve levar primeiro ao guia de instalação.");
assert.match(installation, /chrome:\/\/extensions/, "A instalação deve indicar a página de extensões.");
assert.match(installation, /Carregar sem compactação/, "A instalação deve explicar o carregamento local.");
assert.match(installation, new RegExp(`Versão ${manifest.version.replace(/\./g, "\\.")}`), "A versão exibida deve corresponder ao manifest.json.");
assert.match(installation, /Compatibilidade atual: Google Chrome/, "A compatibilidade atual deve ficar explícita.");
assert.match(installation, /não recebem atualizações automáticas/i, "A instalação deve explicar que atualizações são manuais.");
assert.match(installation, /pasta permanente/i, "A instalação deve orientar a manter um caminho estável.");
assert.match(installation, /Requisitos de instalação/, "A seção deve identificar os requisitos de instalação.");
assert.match(installation, /O que você precisa para instalar/, "O título da seção de requisitos deve ser claro.");
assert.match(installation, /<span aria-hidden="true">01<\/span>[\s\S]*<span aria-hidden="true">02<\/span>[\s\S]*<span aria-hidden="true">03<\/span>/, "Os requisitos devem usar marcadores numéricos sequenciais.");
assert.doesNotMatch(installation, /<span aria-hidden="true">✓<\/span>/, "Os requisitos não devem parecer previamente validados.");
assert.match(installation, /<section id="primeiro-uso">[\s\S]*Primeiro uso[\s\S]*Atualize a extensão pela primeira vez/, "A seção de primeiro uso deve ter títulos claros.");
assert.match(installation, /notice notice-neutral[^>]*><strong>A extensão não recebe sua senha<\/strong>/, "O aviso sobre senha deve usar apresentação neutra.");
assert.doesNotMatch(installation, /Sua senha não passa pela extensão|notice notice-ok/, "O aviso sobre senha não deve parecer uma confirmação de sucesso.");
assert.match(installation, /Edge, Brave e Opera/, "A instalação deve diferenciar compatibilidade provável de suporte oficial.");
assert.match(installation, /Firefox não é compatível com o pacote atual/, "A limitação atual do Firefox deve ficar explícita.");
assert.doesNotMatch(installation, /Não selecione a pasta <code>website<\/code>/, "O usuário não deve receber instruções baseadas no repositório completo.");
assert.doesNotMatch(installation, /Baixe somente o pacote preparado|Source code|asset versionado|Release oficial/, "O guia não deve destacar termos técnicos de distribuição.");
assert.match(installation, />Notas da versão<\/a><span aria-hidden="true">·<\/span><a [^>]+>Verificar integridade<\/a>/, "Os links técnicos devem permanecer em uma linha discreta.");

const releaseAssetPattern = new RegExp(
  `href="https://github\\.com/[^/]+/[^/]+/releases/download/v${manifest.version.replace(/\./g, "\\.")}/InfoSIGAA-Chrome-v${manifest.version.replace(/\./g, "\\.")}\\.zip"`
);
const hasReleaseAsset = releaseAssetPattern.test(installation);
const hasPendingRelease = /data-download-status="pending"/.test(installation) && /Aguardando primeira Release/.test(installation);
assert.ok(hasReleaseAsset || hasPendingRelease, "A página deve ter um asset versionado real ou declarar honestamente que a Release está pendente.");
assert.match(support, /mailto:infosigaa@protonmail\.com/, "O suporte deve possuir contato acionável.");
assert.match(support, /abra o painel[\s\S]*Atualizar/, "O suporte deve explicar a atualização manual.");
assert.match(privacy, /chrome\.storage\.local/, "A política deve explicar o armazenamento local.");
assert.match(privacy, /chrome\.storage\.session/, "A política deve explicar o armazenamento temporário.");
assert.match(privacy, /modo compartilhado/i, "A política deve explicar a proteção em dispositivo compartilhado.");
assert.match(privacy, /mesma sessão do Chrome estiver ativa/i, "A política deve explicar por quanto tempo o painel compartilhado pode permanecer disponível.");
assert.match(privacy, /removido quando o Chrome é encerrado ou a extensão é recarregada/i, "A política deve explicar quando os dados temporários são removidos.");
assert.match(privacy, /Logout, cancelamento ou falha de atualização preservam/i, "A política deve explicar a preservação transacional no modo compartilhado.");
assert.match(privacy, /Limpar dados/, "A política deve explicar o controle de limpeza.");
assert.match(privacy, /não solicita nem armazena sua senha/i, "A política deve explicar o tratamento de senha.");
assert.doesNotMatch(privacy, /atualização automática dos dados|atualiza em segundo plano/i, "A política não deve anunciar a funcionalidade removida.");
assert.doesNotMatch(installation, /atualizar os dados automaticamente/i, "O primeiro uso deve documentar somente a atualização manual.");
assert.match(installation, /Permitir no modo anônimo/, "A instalação deve explicar como habilitar o uso anônimo.");

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
