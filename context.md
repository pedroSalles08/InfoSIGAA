# Contexto do projeto: InfoSIGAA

## Escopo

Extensão Chrome para alunos do IFFarroupilha. Usa a sessão já autenticada no SIGAA, coleta os dados somente quando o aluno solicita e apresenta as informações em um dashboard local da extensão.

Não existe conta do InfoSIGAA, backend, sincronização entre dispositivos, login automático ou atualização periódica.

## Regras acadêmicas

- O resultado do 1º semestre corresponde a 40% da média anual.
- O resultado do 2º semestre corresponde a 60% da média anual.
- Projeção anual: `S1 × 0,40 + S2 × 0,60`.
- Resultado necessário no 2º semestre: `(meta − S1 × 0,40) ÷ 0,60`.
- A média anual oficial é sempre a fornecida pelo SIGAA. Cálculos do InfoSIGAA são identificados como projeções.
- O InfoSIGAA não calcula resultado semestral a partir de avaliações sem uma fórmula configurada pelo aluno.
- O SIGAA não fornece evidência suficiente para afirmar que um resultado semestral está finalizado. A interface usa “valor informado pelo SIGAA” e mantém `finality: "unknown"`.
- `-`, `--` e vazio significam “Não informado”. Coluna inexistente usa disponibilidade `not_exposed`.

## Modelo de dados v4

Cada disciplina possui:

```text
performance
├── semesters[]
│   ├── assessments[]
│   └── result
├── annual
│   ├── average
│   ├── result
│   └── situation
├── exam
└── unclassified[]
```

Cada valor acadêmico inclui `sourceKey`, `role`, `label`, `fullName`, `value`, `numericValue`, `rawValue`, `availability`, `evidence` e `finality`.

Classificação usada pelo parser:

- cabeçalho `aval_...`: avaliação individual, mesmo quando o rótulo é `NOTA`;
- cabeçalho `id="unid"` dentro de semestre: resultado semestral;
- cabeçalho `id="unid"` dentro de exame: resultado do exame;
- coluna “Média Anual”: média anual informada pelo SIGAA;
- `NOTA` sem evidência estrutural: `unclassified`;
- nunca classificar um resultado semestral apenas pela posição da coluna.

Snapshots com modelo v4 usam os identificadores semânticos para comparar mudanças. Na primeira atualização após migrar dados antigos, o comparador legado é usado para preservar a comparação disponível.

## Armazenamento e privacidade

- Preferência: `infosigaa:privacy:v1` em `chrome.storage.local`.
- Dados pessoais v4: `sigaa-grade-monitor:data:v4` em `chrome.storage.local`.
- Dados temporários: `infosigaa:session:data:v4:regular` e `infosigaa:session:data:v4:incognito` em `chrome.storage.session`. Logout e falhas preservam o snapshot válido anterior; ele desaparece quando a sessão de armazenamento é encerrada ou quando o aluno usa “Limpar dados”.
- Dados v3 e v2 são migrados para v4 com `needsAcademicModelRefresh: true` e `performance: null`. Nenhum campo legado chamado `NOTA` é reclassificado durante a migração.
- A próxima coleta substitui o modelo legado por dados classificados a partir da estrutura atual do SIGAA.
- Dados e comparações são isolados por matrícula.
- Modo compartilhado e janelas anônimas não mantêm dados acadêmicos em armazenamento persistente.
- Não armazenar senha, cookie, HTML integral ou `javax.faces.ViewState`.

## Coleta manual protegida

O popup envia `startRefresh { sourceTabId? }`. O dashboard envia `startRefresh` sem aba; nesse caso o background escolhe a aba SIGAA autenticada acessada mais recentemente.

Durante a coleta:

- existe um único `refreshId` ativo;
- o estado operacional fica em `chrome.storage.session`;
- heartbeat: 15 segundos;
- timeout: 10 minutos;
- `AbortSignal` é repassado a todas as requisições;
- todas as abas SIGAA da mesma sessão recebem `setSigaaInteractionLock`;
- o content script roda em `document_start` e em todos os frames;
- mouse, teclado, foco e formulários são bloqueados;
- o overlay mostra andamento, disciplina atual e botão Cancelar;
- recarregar ou navegar numa aba SIGAA durante a coleta cancela a operação.

Cancelamento, timeout, logout, reinício ou falha total não gravam um snapshot incompleto. Se uma disciplina falhar, seus dados anteriores são preservados com `stale` e `refreshError`.

Mensagens de runtime:

- `openDashboard`;
- `startRefresh { sourceTabId? }`;
- `cancelRefresh { refreshId }`;
- `getRefreshStatus { consumer: "popup" | "dashboard" }`;
- `refreshStatusChanged`;
- `setSigaaInteractionLock`;
- `sigaaLockReady`;
- `acknowledgeRefreshResult { consumer: "popup" | "dashboard" }`.

Popup e dashboard reconhecem o resultado de modo independente: visualizar a conclusão em uma interface não consome a mensagem da outra.

## Frequência

O fetcher não abre a opção “Frequência” de cada Turma Virtual. As faltas vêm da tabela “Ver Notas”; aulas ministradas, carga total e percentual de carga ministrada vêm da tela inicial da Turma Virtual.

Quando faltas e totais estão explicitamente disponíveis, o modelo calcula:

- presença atual: `(aulas ministradas − faltas) ÷ aulas ministradas`;
- presença máxima possível: `(carga total − faltas) ÷ carga total`;
- limite estimado de faltas: `floor(carga total × 25%)`;
- margem estimada: `limite − faltas`.

Campo vazio ou `--` não equivale a zero. As margens são apresentadas como estimativas em unidades de aula, não em dias, e não afirmam aprovação ou reprovação oficial. O regime do curso pode exigir frequência por componente ou pelo total da etapa letiva.

## Interfaces

### Dashboard

Arquivos: `dashboard.html`, `dashboard.css`, `dashboard.js`.

Ordem:

1. cabeçalho com atualização, privacidade e semestre em foco;
2. resumo acadêmico;
3. resumo de frequência e margem estimada por disciplina;
4. mudanças da última atualização;
5. disciplinas;
6. projeção anual e cenário configurado pelo aluno.

O semestre em foco pode ser anual, 1º ou 2º semestre e é salvo por ano em uma preferência separada do snapshot acadêmico. Popup e dashboard compartilham essa preferência. Cada disciplina separa avaliações, resultados semestrais, média anual, exame e campos não classificados.

### Popup

O popup é uma consulta rápida autossuficiente. Ele mostra resumo numérico, busca, filtros, período em foco, todas as disciplinas na ordem do SIGAA e um card por disciplina. Os cards começam recolhidos, somente um pode ser expandido por vez e exibem notas, mudanças inline, valores anteriores, frequência, faltas, situação, exame e estados de erro ou dados preservados. Busca, filtro e expansão são temporários; apenas o período é persistido e sincronizado com o dashboard.

### Design e texto

- fundo `#171717`;
- superfícies `#202020`, `#252525` e `#2b2b2b`;
- texto `#ececec`;
- controles com raio de 7 px e painéis com raio de 10 px;
- sem gradientes, sombras pesadas ou bibliotecas visuais externas;
- transições de 120–180 ms e `prefers-reduced-motion`;
- textos diretos, factuais e sem frases promocionais;
- distinguir fatos do SIGAA, cálculos do InfoSIGAA e configurações do aluno.

## Arquivos principais

- `manifest.json`: manifesto MV3, permissões, popup, service worker e content script de bloqueio.
- `src/academic-model.js`: disponibilidade, valores acadêmicos, fórmulas 40%/60% e estimativas de frequência.
- `src/ui-tokens.css`: cores, tipografia, espaçamentos, raios e transições compartilhados pelo popup e dashboard.
- `src/ui-format.js`: formatação compartilhada de números e datas.
- `src/ui-model.js`: view-model compartilhado de disciplinas, filtros, métricas e período em foco.
- `src/sigaa-parser.js`: páginas JSF, avaliações, resultados, resumo e totais de frequência.
- `src/sigaa-fetcher.js`: navegação autenticada, progresso e coleta de notas por disciplina.
- `src/snapshot.js`: mesclagem e comparação semântica.
- `src/privacy-storage.js`: armazenamento v4, migração, modo de privacidade e identidade.
- `src/background.js`: coordenação, seleção de aba, bloqueio, cancelamento, timeout e dashboard.
- `src/sigaa-lock.js`: bloqueio e overlay em páginas SIGAA.
- `popup.*`: consulta rápida completa por disciplina.
- `dashboard.*`: interface principal.

## Testes

Executar todos os testes smoke:

```powershell
Get-ChildItem tests\*-smoke.js | Sort-Object Name | ForEach-Object { node $_.FullName; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
```

Casos cobertos incluem modelo acadêmico, `aval_...`, `unid`, `NOTA` ambíguo, placeholders, `Sit.`, fórmula 40%/60%, totais e estimativas de frequência, migração v3→v4, isolamento por matrícula, falhas de sessão, atualização parcial, cancelamento, recarga durante coleta, dashboard, website e pacote.

Capturas reais usadas para diagnóstico ficam somente em `fixtures/private/`, diretório ignorado pelo Git. Fixtures públicas devem permanecer sintéticas e sem nome, matrícula, cookies, `ViewState` ou HTML integral real.

## Restrições para alterações futuras

- Não inventar regra acadêmica ausente do SIGAA ou de configuração explícita do aluno.
- Não reclassificar `NOTA` sem evidência estrutural.
- Não inferir fechamento de semestre por valor, posição ou situação anual.
- Não misturar projeções e cenários com valores oficiais.
- Não iniciar coleta por navegação ou temporizador.
- Não substituir snapshot válido em cancelamento ou falha total.
- Não criar regra específica por disciplina, curso ou ano.
- Não enviar dados acadêmicos para fora do navegador.
