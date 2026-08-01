# Contexto do Projeto: Monitor de Notas SIGAA

## Objetivo

Extensao de navegador para uso pessoal que ajuda o aluno a acompanhar as proprias notas no SIGAA do IFFarroupilha.

O foco atual e mostrar um painel no popup da extensao com as materias, notas, mudancas recentes e frequencia, usando apenas a sessao ja aberta no navegador.

## Regras de seguranca e privacidade

- Nao fazer login automaticamente.
- Nao guardar senha.
- Nao salvar cookies manualmente.
- Nao enviar dados para servidor externo.
- Funcionar somente quando o usuario ja esta logado no SIGAA.
- Usar requisicoes com a sessao atual do navegador.
- Dados ficam locais no navegador.

## Arquitetura atual

Arquivos principais ativos:

- `manifest.json`
  - Extensao MV3.
  - Permissoes: `activeTab`, `scripting`, `storage`.
  - Host permission: `https://sig.iffarroupilha.edu.br/sigaa/*`.
  - Service worker: `src/background.js`.
  - Popup: `popup.html`.

- `popup.html`
  - Estrutura do popup.
  - Carrega `popup.css` e `popup.js`.

- `popup.js`
  - Controla UI do popup.
  - Captura HTML da aba ativa do SIGAA, incluindo frames.
  - Envia mensagem `refreshGrades` para o service worker.
  - Renderiza materias, busca, filtros, cards recolhiveis, tooltips, mudancas, notas e frequencia.
  - Le o ultimo snapshot salvo via `chrome.storage.local`.

- `popup.css`
  - Design do popup.
  - Cards compactos/expandidos.
  - Badges, filtros, notas, tooltips e barra de presenca.

- `src/background.js`
  - Importa `sigaa-parser.js`, `snapshot.js` e `sigaa-fetcher.js`.
  - Recebe mensagem do popup e chama `SigaaFetcher.refreshAllGrades`.

- `src/snapshot.js`
  - Compara notas entre snapshots.
  - Mescla a atualizacao de uma pagina de notas no snapshot completo.
  - Identifica materias por `courseId`, codigo/ano ou nome/ano sem criar correspondencias ambiguas.
  - Preserva as demais materias e seus destaques quando somente uma materia e atualizada.

- `src/sigaa-fetcher.js`
  - Navega pelo SIGAA usando `fetch` com `credentials: "include"`.
  - Entra nas materias e aciona a opcao `Ver Notas`.
  - Usa a sessao ja logada do usuario.
  - Usa `SigaaSnapshot` para comparar e mesclar resultados.
  - Salva o snapshot atual em `chrome.storage.local`.

- `src/sigaa-parser.js`
  - Parser de paginas do SIGAA.
  - Extrai materias do portal discente.
  - Extrai acao `Ver Notas`.
  - Parseia tabela de notas genericamente.
  - Extrai sigla, nome completo da avaliacao, valor, periodos, media, faltas, resultado e situacao.
  - Extrai `Aulas (Ministradas/Total)` e percentual de carga horaria.

- `tests/parser-smoke.js`
  - Testes smoke do parser usando apenas fixtures sinteticas.

- `tests/snapshot-smoke.js`
  - Testa deteccao de mudancas e atualizacao parcial sem perda de materias.

- `tests/active-page-smoke.js`
  - Testa o fluxo real do fetcher ao atualizar diretamente uma pagina de notas.

- `tests/fixtures-privacy.js`
  - Impede que capturas integrais e indicadores comuns de dados pessoais entrem nas fixtures publicas.

Arquivos antigos do MVP:

- `src/content.js`
- `src/diff.js`
- `src/notice.js`
- `src/parser.js`
- `src/storage.js`

Esses arquivos existem no projeto, mas nao estao referenciados no `manifest.json` atual. Eles pertencem a uma abordagem antiga de content script e aviso direto na pagina. A versao atual funciona pelo popup + background.

## Funcionalidades ja implementadas

### Coleta de materias e notas

- A extensao le materias no portal discente.
- Para cada materia, entra na Turma Virtual.
- Abre a pagina `Ver Notas`.
- Parseia a tabela de notas.
- Agrupa notas por materia e periodo.
- Suporta estruturas variaveis de tabela com multiplas linhas de cabecalho, `colspan` e `rowspan`.
- Nao usa regras fixas por disciplina.

### Siglas e tooltips

- As siglas das avaliacoes sao lidas da propria pagina de notas.
- O nome completo da avaliacao e capturado quando disponivel em:
  - inputs ocultos do SIGAA;
  - `title`;
  - `alt`;
  - `data-*`;
  - eventos de tooltip;
  - conteudo relacionado no HTML.
- No popup, a sigla aparece compacta.
- Ao passar o mouse ou focar na sigla, aparece tooltip customizado.
- O atributo `title` tambem e mantido como fallback.

### Materias sem notas

- Ausencia de notas lancadas nao e tratada como erro critico.
- O status exibido e `Sem notas`.
- Mensagem amigavel:
  - `Ainda não há notas lançadas para esta matéria.`
- Erros reais continuam com status `Erro`.

### Popup

- Cards por materia.
- Nome da materia encurtado genericamente:
  - remove codigo inicial;
  - remove carga horaria como `(66h)`;
  - remove trecho `- Turma: ...`;
  - remove trecho entre colchetes.
- Nome completo original fica em `title`/tooltip.
- Numerais romanos sao preservados em maiusculas de forma generica:
  - `I`, `II`, `III`, `IV`, `V`, `VI`, `VII`, `VIII`, `IX`, `X`.
- Cards sao recolhiveis/expansiveis.
- Por padrao, ficam compactos.
- Materias com mudanca recente podem abrir expandidas.
- Busca por materia ignora maiusculas/minusculas e acentos.
- Filtros:
  - Todas;
  - Com notas;
  - Sem notas;
  - Alteradas;
  - Erros.
- Busca e filtros funcionam juntos.

### Snapshots e mudancas

Mecanismo atual:

- Usa `chrome.storage.local`.
- Chave ativa:
  - `sigaa-grade-monitor:data:v2`
- O snapshot salvo contem o ultimo resultado completo da atualizacao.

Deteccao:

- Compara snapshot anterior com snapshot atual por materia e avaliacao.
- Marca `Nova` quando antes estava vazio, `--`, ausente, `null` ou `undefined`, e agora ha valor valido.
- Marca `Alterada` quando antes havia valor e agora o valor mudou.
- Marca `Removida` quando havia valor e depois ficou vazio.
- Ignora diferencas irrelevantes de espaco.
- Nao trata `--` para `--` como mudanca.
- Destaque aparece na avaliacao especifica e no card da materia.
- Materias alteradas aparecem no topo.
- O destaque dura ate a proxima atualizacao bem-sucedida daquela materia.
- Ao atualizar diretamente uma pagina de notas, somente a materia correspondente e substituida; as demais permanecem no snapshot.

### Frequencia

O parser captura quando disponivel:

```js
attendance: {
  aulasMinistradas: 32,
  aulasTotal: 80,
  percentualCargaMinistrada: 40
}
```

O popup calcula:

```js
presencaAtual = ((aulasMinistradas - faltas) / aulasMinistradas) * 100
presencaFinalMaxima = ((aulasTotal - faltas) / aulasTotal) * 100
```

Estados:

- Verde/OK:
  - `presencaAtual >= 75%`
- Amarelo/Atencao:
  - `presencaAtual < 75%`
  - `presencaFinalMaxima >= 75%`
- Vermelho/Critico:
  - `presencaFinalMaxima < 75%`

Visual atual:

- No card compacto: presenca, aulas e carga ministrada.
- No card expandido: frequencia aparece por ultimo, depois das notas.
- O bloco de frequencia e complementar, com fundo neutro.
- Cor do estado aparece principalmente na barra, borda discreta e texto de status.
- O campo `Máx. possível` tem tooltip:
  - `Maior presença possível caso o aluno compareça a todas as aulas restantes.`

## Ordem visual atual do card expandido

1. Cabecalho da materia.
2. Resumo rapido.
3. Notas do 1o semestre.
4. Notas do 2o semestre.
5. Exame.
6. Outros periodos/campos de nota.
7. Resumo de notas.
8. Frequencia.

Nao existe segundo sistema de recolhimento para frequencia.

## Armazenamento atual

Usa somente `chrome.storage.local` na versao ativa.

Nao ha uso ativo de:

- `chrome.storage.sync`
- `chrome.storage.session`
- `localStorage`
- `sessionStorage`
- IndexedDB

Comportamento:

- Persiste ao fechar e abrir o Chrome.
- Persiste ao recarregar a extensao em `chrome://extensions`.
- Persiste ao atualizar codigo se a extensao mantiver o mesmo ID.
- Ao remover a extensao, o Chrome normalmente apaga os dados locais dela.
- Nao sincroniza entre computadores.
- Nao e compartilhado entre perfis diferentes do Chrome.
- Em outro computador, a extensao comeca sem snapshots anteriores.
- Na primeira atualizacao sem snapshot anterior, as notas atuais viram estado inicial e nao sao marcadas como novas.

Risco em computador compartilhado:

- Se outro usuario usar o mesmo perfil do Chrome, pode abrir o popup e ver o ultimo snapshot salvo.
- Recomendacao futura: criar `Modo computador publico` ou botao `Limpar dados deste navegador`.

## Testes e comandos uteis

Rodar os testes:

```powershell
node tests\parser-smoke.js
node tests\snapshot-smoke.js
node tests\active-page-smoke.js
node tests\fixtures-privacy.js
```

Checar sintaxe:

```powershell
node --check popup.js
node --check src\sigaa-parser.js
node --check src\snapshot.js
node --check src\sigaa-fetcher.js
node --check src\background.js
```

Ver dados salvos no DevTools do popup:

```js
chrome.storage.local.get("sigaa-grade-monitor:data:v2", (r) => {
  console.log(r["sigaa-grade-monitor:data:v2"]);
});
```

Ver resumo de materias, frequencia e faltas:

```js
chrome.storage.local.get("sigaa-grade-monitor:data:v2", (r) => {
  console.log(r["sigaa-grade-monitor:data:v2"].courses.map((c) => ({
    materia: c.name,
    attendance: c.attendance,
    faltas: c.summary?.faltas
  })));
});
```

## Fixtures existentes

- `fixtures/portal-discente.html`
- `fixtures/turma-virtual-fisica.html`
- `fixtures/ver-notas-fisica.html`

Elas sao sinteticas e usadas para validar parsing de materias, navegacao JSF, notas, tooltips e frequencia.

Capturas reais para diagnostico ficam somente em `fixtures/private/`, diretorio ignorado pelo Git. Elas nunca devem ser copiadas para as fixtures publicas sem sanitizacao.

## Pontos importantes para nao quebrar

- Nao criar regras especificas por disciplina, curso ou ano.
- Nao mapear siglas manualmente por materia.
- Nao alterar login, cookies ou sessao.
- Nao enviar dados para fora.
- Preservar tooltips das siglas.
- Preservar busca e filtros.
- Preservar cards recolhiveis.
- Preservar materias sem notas como `Sem notas`, nao `Erro`.
- Preservar ordenacao de materias alteradas no topo.
- Preservar destaque de notas novas/alteradas na avaliacao especifica.
- Preservar o snapshot local como fonte da comparacao.

## Possiveis proximas melhorias

1. Modo computador publico:
   - nao persistir snapshots em `chrome.storage.local`;
   - usar dados temporarios ou `chrome.storage.session`;
   - adicionar botao `Limpar dados deste navegador`.

2. Melhor exportacao/debug:
   - botao para copiar diagnostico sem dados sensiveis;
   - mostrar se ha snapshot salvo.

3. Melhorar confiabilidade da frequencia:
   - confirmar se `attendance` aparece para todas as materias quando o SIGAA retorna o painel lateral em segundo plano.

4. Testes adicionais:
   - fixtures de materias sem notas;
   - fixtures de frequencia com estados verde, amarelo e vermelho.

5. Refinamento visual:
   - pequenos ajustes de espacamento no popup apos teste real em diferentes resolucoes.
