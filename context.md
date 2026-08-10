# Contexto do Projeto: InfoSIGAA

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
  - Usa `incognito: split` para operar com a sessao propria da janela anonima.
  - Permissoes: `activeTab`, `scripting`, `storage`.
  - Host permission: `https://sig.iffarroupilha.edu.br/sigaa/*`.
  - Service worker: `src/background.js`.
  - Popup: `popup.html`.

- `popup.html`
  - Estrutura do popup.
  - Carrega `popup.css`, `src/privacy-storage.js` e `popup.js`.

- `popup.js`
  - Controla UI do popup.
  - Captura HTML da aba ativa do SIGAA, incluindo frames.
  - Envia mensagem `refreshGrades` para o service worker.
  - Renderiza materias, busca, filtros, cards recolhiveis, tooltips, mudancas, notas e frequencia.
  - Faz a escolha inicial entre dispositivo pessoal e compartilhado.
  - Le o ultimo snapshot do armazenamento correspondente: persistente no modo pessoal e temporario no compartilhado enquanto a sessao atual do Chrome estiver ativa.
  - Oferece configuracao de modo e botao para limpar dados academicos.

- `popup.css`
  - Design do popup.
  - Cards compactos/expandidos.
  - Badges, filtros, notas, tooltips e barra de presenca.

- `src/background.js`
  - Importa `privacy-storage.js`, `sigaa-parser.js`, `snapshot.js` e `sigaa-fetcher.js`.
  - Recebe mensagem do popup e chama `SigaaFetcher.refreshAllGrades`.

- `src/privacy-storage.js`
  - Centraliza preferencia pessoal/compartilhado e o modo efetivo da janela.
  - Mantem dados pessoais em `chrome.storage.local` e dados compartilhados em `chrome.storage.session`.
  - Migra a chave antiga, limpa dados academicos e preserva somente a preferencia.
  - Normaliza a matricula, identifica o proprietario do snapshot e impede comparacao entre alunos diferentes.
  - Restringe o acesso ao armazenamento a contextos confiaveis da extensao.

- `src/snapshot.js`
  - Compara notas entre snapshots.
  - Mescla a atualizacao de uma pagina de notas no snapshot completo.
  - Identifica materias por `courseId`, codigo/ano ou nome/ano sem criar correspondencias ambiguas.
  - Preserva as demais materias e seus destaques quando somente uma materia e atualizada.

- `src/sigaa-fetcher.js`
  - Navega pelo SIGAA usando `fetch` com `credentials: "include"`.
  - Entra nas materias e aciona a opcao `Ver Notas`.
  - Usa a sessao ja logada do usuario.
  - Valida a autenticacao antes da coleta e em cada resposta do SIGAA.
  - Interrompe a atualizacao sem gravar quando a sessao expira.
  - Usa `SigaaSnapshot` para comparar e mesclar resultados.
  - Valida a matricula antes de comparar ou mesclar o snapshot anterior.
  - Salva conforme o modo efetivo e nunca devolve cache temporario em falhas no modo compartilhado.

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

- `tests/session-expiry-smoke.js`
  - Testa sessao expirada antes e durante a coleta e garante que o snapshot valido nao seja substituido.

- `tests/privacy-storage-smoke.js`
  - Testa migracao, modos pessoal/compartilhado, contexto anonimo, limpeza e restricao de acesso.

- `tests/identity-isolation-smoke.js`
  - Testa troca de matricula sem reaproveitar materias e garante que falhas publicas nao revelem cache.

- `tests/privacy-ui-smoke.js`
  - Testa onboarding, controles, manifesto anonimo, encapsulamento do armazenamento e padrao visual.

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

- Na primeira abertura normal, pergunta uma unica vez se o dispositivo e pessoal ou compartilhado.
- O modo pessoal e a opcao principal e preserva a experiencia persistente anterior.
- O modo compartilhado mantem o painel temporario disponivel enquanto a mesma sessao do Chrome estiver aberta.
- Janelas anonimas usam automaticamente o modo compartilhado, sem mudar a preferencia normal.
- O painel de privacidade permite mudar o modo e limpar dados academicos.
- A limpeza nao faz logout nem altera cookies do SIGAA.
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

- No modo pessoal, usa `chrome.storage.local`.
- No modo compartilhado, usa `chrome.storage.session` para o painel e para comparacao temporaria durante a sessao atual do Chrome.
- Chave pessoal ativa:
  - `sigaa-grade-monitor:data:v3`
- Preferencia nao sensivel:
  - `infosigaa:privacy:v1`
- Chaves temporarias:
  - `infosigaa:session:data:v3:regular`
  - `infosigaa:session:data:v3:incognito`
- O snapshot salvo contem o ultimo resultado completo da atualizacao.
- O snapshot inclui `owner` com matricula normalizada e nome quando uma identidade consistente foi encontrada.

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
- A mesclagem parcial so reutiliza as demais materias quando a matricula atual coincide com a proprietaria do snapshot.
- No modo pessoal, sessao expirada ou falha total nao substitui o ultimo snapshot valido.
- No modo compartilhado, falhas nunca revelam o snapshot temporario e expiracao de sessao o remove.

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

Modo pessoal:

- Usa `chrome.storage.local` e mostra o ultimo painel imediatamente.
- Persiste ao fechar/reabrir o Chrome e recarregar a extensao mantendo o mesmo ID.
- Nao sincroniza entre computadores ou perfis.
- Preserva o ultimo resultado valido em falhas.

Modo compartilhado:

- Usa `chrome.storage.session`; dados academicos nao sao gravados permanentemente.
- O snapshot temporario permanece disponivel ao reabrir o popup enquanto a mesma sessao do Chrome estiver ativa.
- Matricula diferente ou inconsistente impede reutilizar o snapshot anterior para comparacao ou mesclagem.
- O snapshot temporario e removido ao encerrar o Chrome, recarregar a extensao ou detectar logout durante uma atualizacao.
- Se nao houver identidade confiavel, o resultado atual pode ser exibido, mas nao e mantido para comparacao.
- Janelas anonimas sempre usam este modo, mesmo quando a preferencia normal e pessoal.

Limpeza e migracao:

- `Limpar dados` remove chaves v3, v2, snapshots v1 e dados de sessao, mas preserva a preferencia do dispositivo.
- Escolher modo compartilhado apaga imediatamente os snapshots persistentes.
- Voltar ao modo pessoal nao promove dados temporarios para armazenamento persistente.
- A primeira escolha pessoal migra a chave v2 para v3; ate a escolha, dados antigos ficam ocultos.
- Nenhum modo usa `chrome.storage.sync`, `localStorage`, Web `sessionStorage` ou IndexedDB.

## Testes e comandos uteis

Rodar os testes:

```powershell
node tests\parser-smoke.js
node tests\snapshot-smoke.js
node tests\active-page-smoke.js
node tests\session-expiry-smoke.js
node tests\privacy-storage-smoke.js
node tests\identity-isolation-smoke.js
node tests\privacy-ui-smoke.js
node tests\fixtures-privacy.js
```

Checar sintaxe:

```powershell
node --check popup.js
node --check src\privacy-storage.js
node --check src\sigaa-parser.js
node --check src\snapshot.js
node --check src\sigaa-fetcher.js
node --check src\background.js
```

Ver dados salvos no DevTools do popup:

```js
chrome.storage.local.get("sigaa-grade-monitor:data:v3", (r) => {
  console.log(r["sigaa-grade-monitor:data:v3"]);
});
```

Ver resumo de materias, frequencia e faltas:

```js
chrome.storage.local.get("sigaa-grade-monitor:data:v3", (r) => {
  console.log(r["sigaa-grade-monitor:data:v3"].courses.map((c) => ({
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
- Preservar o snapshot selecionado pelo modo como fonte da comparacao, sempre isolado por matricula.

## Possiveis proximas melhorias

1. Melhor exportacao/debug:
   - botao para copiar diagnostico sem dados sensiveis;
   - mostrar se ha snapshot salvo.

2. Melhorar confiabilidade da frequencia:
   - confirmar se `attendance` aparece para todas as materias quando o SIGAA retorna o painel lateral em segundo plano.

3. Testes adicionais:
   - fixtures de materias sem notas;
   - fixtures de frequencia com estados verde, amarelo e vermelho.

4. Refinamento visual:
   - pequenos ajustes de espacamento no popup apos teste real em diferentes resolucoes.
