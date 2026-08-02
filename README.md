# InfoSIGAA

Extensao de navegador para uso pessoal que mostra as proprias notas do SIGAA em um painel local do navegador.

## O que a versao atual faz

- Funciona somente quando voce ja esta logado no SIGAA.
- Adiciona um popup no icone da extensao.
- Ao clicar em `Atualizar`, busca as materias no SIGAA usando a sessao ja logada do navegador.
- Entra em cada materia, aciona a opcao `Ver Notas` e tenta ler a tabela de notas.
- Mostra as notas agrupadas por materia no popup.
- Salva o ultimo resultado em `chrome.storage.local`.
- Destaca valores alterados quando uma atualizacao nova difere da anterior.

## O que a extensao nao faz

- Nao faz login automaticamente.
- Nao armazena senha.
- Nao salva cookies manualmente.
- Nao envia dados para servidor externo.
- Nao roda verificacoes em segundo plano.
- Nao mostra notificacoes do sistema operacional.

## Como instalar localmente no Chrome

1. Abra `chrome://extensions`.
2. Ative o modo de desenvolvedor.
3. Clique em "Carregar sem compactacao".
4. Selecione esta pasta do projeto.
5. Acesse o SIGAA manualmente e faca login.
6. Abra o portal discente:
   `https://sig.iffarroupilha.edu.br/sigaa/portais/discente/discente.jsf`
7. Clique no icone da extensao.
8. Clique em `Atualizar`.

O Google Chrome é o único navegador oficialmente suportado nesta fase. Edge, Brave e Opera podem ser compatíveis por usarem Chromium, mas ainda precisam de homologação completa. O pacote atual não é compatível com Firefox.

## Gerar o pacote de distribuição

O script de empacotamento copia somente os arquivos usados pela extensão, cria um ZIP versionado e gera seu SHA-256:

```powershell
./scripts/package-extension.ps1 -ExpectedTag v0.1.0
```

Os artefatos são gravados em `dist/` e permanecem fora do Git. Para publicar uma nova versão, atualize `manifest.json`, execute os testes, crie a tag correspondente e deixe o workflow `release-extension.yml` criar a GitHub Release.

## Comportamento esperado

O popup le a pagina ativa do portal discente, encontra as materias em `Turmas do Semestre` e usa a sessao ja logada para abrir a Turma Virtual de cada materia. Quando terminar, deve listar as materias e as notas encontradas.

Se voce nao estiver logado, o popup deve orientar a entrar no SIGAA e tentar novamente.

Se a sessao expirar, a tentativa de atualizacao e interrompida sem substituir o snapshot. O popup continua mostrando os ultimos dados validos, informa a data deles e oferece um botao para abrir o SIGAA e fazer login novamente.

Se alguma materia falhar, a extensao mostra erro apenas naquela materia e mantem as demais.

Se a pagina aberta ja for uma tabela de notas, a extensao atualiza somente aquela materia e preserva as demais no snapshot local.

Se voce clicar em `Atualizar` fora do SIGAA, a extensao vai pedir para abrir o portal discente primeiro.

## Observacoes tecnicas

O SIGAA usa JSF/RichFaces. Por isso a extensao simula os mesmos POSTs dos links da interface, usando formularios como `form_acessarTurmaVirtual`, `formTurma`, `formMenu`, `frontEndIdTurma` e `javax.faces.ViewState`.

Os dados ficam somente no armazenamento local da extensao, no proprio navegador.

## Testes locais

Com Node.js instalado:

```bash
node tests/parser-smoke.js
node tests/snapshot-smoke.js
node tests/active-page-smoke.js
node tests/session-expiry-smoke.js
node tests/fixtures-privacy.js
```

Os testes usam somente fixtures pequenas e sinteticas para validar o portal discente, a Turma Virtual, a tabela de notas, a mesclagem de snapshots e a ausencia de dados pessoais nos arquivos publicos. Capturas reais usadas para diagnostico devem ficar em `fixtures/private/`, que e ignorada pelo Git.
