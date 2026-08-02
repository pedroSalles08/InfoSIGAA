# Website InfoSIGAA

Website estático e multipágina do InfoSIGAA. Ele é independente da extensão e não importa nenhum arquivo de `popup.*` ou `src/`.

## Executar localmente

A partir da raiz do projeto:

```powershell
python -m http.server 8080 --directory website
```

Abra `http://localhost:8080/` no navegador. Não é necessário instalar pacotes nem executar uma compilação.

## Estrutura

- `index.html`: página inicial.
- `instalacao/`: instalação manual no Chrome.
- `suporte/`: solução de problemas e contato.
- `privacidade/`: política de privacidade.
- `assets/css/site.css`: tokens e componentes visuais do site.
- `assets/js/site.js`: menu móvel, ano do rodapé e destino central dos CTAs.
- `assets/brand/`: cópias selecionadas dos arquivos de marca originais.

## Download da extensão

A página inicial leva ao guia de instalação; somente o guia deve iniciar um download. Enquanto a primeira GitHub Release não existir, a página mostra explicitamente que o download está pendente.

Depois de publicar uma Release, substitua o estado pendente em `instalacao/index.html` por um link direto e imutável neste formato:

```text
https://github.com/OWNER/REPOSITORY/releases/download/vX.Y.Z/InfoSIGAA-Chrome-vX.Y.Z.zip
```

A versão mostrada na página deve ser igual à versão de `manifest.json`. Não use os arquivos automáticos “Source code” da Release.

## Verificar

```powershell
node tests\website-smoke.js
node tests\package-smoke.js
```

## Publicação

O workflow `.github/workflows/pages.yml` envia somente esta pasta ao GitHub Pages quando alterações do site chegam à branch `main`. No repositório do GitHub, configure **Settings → Pages → Source** como **GitHub Actions**.

O workflow `.github/workflows/release-extension.yml` valida, empacota e publica a extensão quando uma tag `vX.Y.Z` é enviada. A tag deve corresponder à versão do manifesto.
