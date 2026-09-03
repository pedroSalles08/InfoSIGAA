# Prompt para o Gemini — front/UI do popup do InfoSIGAA

Você vai implementar e aprimorar **somente o front/UI do popup** de uma extensão Chrome MV3 chamada InfoSIGAA. Trabalhe diretamente no repositório que contém este arquivo. O backend, o modelo acadêmico, a persistência, a sincronização do período e a coordenação das atualizações já foram implementados; sua tarefa é transformar essa base funcional em uma interface clara, compacta e bem acabada, sem quebrar os contratos existentes.

## Antes de editar: use `find-skills`

1. Localize, leia por completo e use a skill `find-skills` antes de fazer qualquer alteração.
2. Com ela, procure skills adequadas para frontend de extensão Chrome, UI/UX, acessibilidade e teste visual.
3. Verifique reputação, adoção e origem antes de instalar ou recomendar qualquer skill.
4. Considere prioritariamente a skill `frontend-design`, de `anthropics/skills`:
   - página: https://skills.sh/anthropics/skills/frontend-design
   - instalação, caso necessária: `npx skills add https://github.com/anthropics/skills --skill frontend-design`
5. Informe quais skills escolheu e como elas influenciaram decisões concretas. Não use uma skill como justificativa para ignorar as restrições deste briefing.

## Contexto do produto

O popup e o dashboard têm papéis diferentes:

- **Popup:** consulta rápida, autossuficiente e contextual. O aluno deve entender a situação acadêmica em poucos segundos sem ser obrigado a abrir o dashboard.
- **Dashboard:** panorama amplo, comparação, simuladores e controles avançados.

Há sobreposição informacional intencional. Não remova informações do popup apenas porque elas também aparecem no dashboard.

Leia antes de começar:

- `context.md`;
- `README.md`;
- `popup.html`;
- `popup.css`;
- `popup.js`;
- `src/ui-tokens.css`;
- `src/ui-model.js`;
- `src/ui-format.js`;
- `src/academic-model.js`;
- `tests/privacy-ui-smoke.js`;
- `tests/ui-model-smoke.js`;
- as referências visuais em `screenshots/InfoSIGAA-com-card-escondido.png` e `screenshots/InfoSIGAA-com-card-expandido-1.png`.

Inspecione primeiro `git status` e `git diff`. O working tree já contém trabalho válido e não commitado. Preserve tudo que não estiver diretamente relacionado à sua tarefa. Não use reset, checkout destrutivo ou reescrita ampla.

## Liberdade visual — melhoria permitida, redesign proibido

Você **não pode fazer um redesign arbitrário**, mas deve melhorar a interface se a UX, a UI ou o design atual estiverem ruins. Use julgamento de design de verdade.

Você pode melhorar:

- hierarquia visual e composição;
- organização e densidade dos controles;
- espaçamento, alinhamento e legibilidade;
- contraste e diferenciação de estados;
- affordance dos cards e do acordeão;
- responsividade dentro dos limites físicos do popup;
- foco, teclado, leitores de tela e demais aspectos de acessibilidade;
- microinterações funcionais.

Preserve como identidade-base:

- tema escuro e sóbrio;
- fundo `#171717`;
- superfícies próximas de `#202020`, `#252525` e `#2b2b2b`;
- texto principal próximo de `#ececec`;
- acentos semânticos discretos em verde, amarelo e vermelho;
- tipografia-base do sistema;
- controles com raio aproximado de 7 px e painéis com raio aproximado de 10 px;
- linguagem direta, factual e não promocional;
- sensação de ferramenta acadêmica compacta, não de landing page ou aplicativo genérico gerado por IA.

Não introduza gradientes, glassmorphism, sombras pesadas, cápsulas excessivas, decoração gratuita, uma nova paleta, uma nova tipografia-base ou uma navegação diferente sem uma justificativa objetiva. Se uma mudança mais profunda for realmente necessária, pare e documente a proposta em vez de implementá-la silenciosamente.

## Escopo de arquivos

Você pode alterar principalmente:

- `popup.html`;
- `popup.css`;
- trechos estritamente apresentacionais de `popup.js`;
- testes de UI em `tests/`, quando necessários para comprovar o comportamento;
- arquivos de screenshot ou um harness de preview estritamente de teste, se necessário.

Não altere sem autorização explícita:

- `src/background.js`;
- `src/privacy-storage.js`;
- `src/academic-model.js`;
- `src/ui-model.js`;
- `src/sigaa-parser.js`;
- `src/sigaa-fetcher.js`;
- `src/snapshot.js`;
- `dashboard.html`, `dashboard.css` ou `dashboard.js`;
- `manifest.json` ou permissões da extensão.

Se acreditar que precisa mudar um contrato de dados ou arquivo fora do escopo, pare, explique exatamente por quê e aguarde. Não contorne o contrato dentro do código de apresentação.

## Contratos funcionais que não podem regredir

Mantenha os IDs e hooks existentes usados por `popup.js`, em especial:

- `course-controls`;
- `course-search`;
- `semester-focus`;
- `course-filters`;
- `courses`;
- `status`;
- `refresh-button`;
- `cancel-refresh-button`;
- `open-dashboard-button`;
- `settings-button`;
- os painéis de privacidade e o diálogo de confirmação.

O popup deve continuar oferecendo:

1. resumo global;
2. busca por disciplina;
3. filtros **Todas**, **Com notas**, **Sem notas**, **Alteradas** e **Erros**;
4. seletor sutil com **Anual**, **1º semestre** e **2º semestre**;
5. todas as disciplinas, sem limite artificial, na ordem original do SIGAA;
6. cards inicialmente recolhidos;
7. somente um card expandido por vez;
8. busca vazia e filtro “Todas” sempre que o popup é reaberto;
9. persistência apenas do período em foco, sincronizado com o dashboard;
10. atualização manual; não reintroduza atualização automática.

O card recolhido deve comunicar, quando os dados existirem:

- nome da disciplina;
- docentes;
- estado do card;
- resultado do semestre em foco, quando o foco for 1º ou 2º;
- média anual;
- faltas;
- situação;
- presença e progresso da carga horária;
- até cinco avaliações do período em foco;
- na visão anual, as cinco avaliações academicamente mais recentes entre os semestres, identificando o semestre;
- indicadores de outro semestre lançado e de exame lançado;
- badges **Nova**, **Alterada** ou **Removida** nas avaliações modificadas.

O card expandido deve mostrar:

- avaliações do 1º e 2º semestres;
- resultados semestrais;
- exame, se exposto pelo SIGAA;
- resumo anual;
- faltas e frequência detalhada;
- dados não classificados, quando existirem;
- valores anteriores das avaliações alteradas;
- mensagens claras para dados incompletos.

Estados obrigatórios:

- normal;
- sem notas;
- erro sem dados utilizáveis;
- falha parcial com dados anteriores preservados (`stale`/`refreshError`);
- alteração recente;
- atualização em andamento e possibilidade de cancelar;
- ausência de resultados para busca/filtro.

Um erro nunca deve apagar visualmente o último dado válido preservado.

## Contratos técnicos já implementados

- `InfoSigaaUiModel` é a fonte compartilhada para nome de disciplina, estados, métricas, foco, avaliações compactas e filtros.
- `InfoSigaaPrivacyStorage.setSemesterFocus(year, focus)` salva a preferência separadamente do snapshot acadêmico.
- Popup e dashboard recebem resultados de atualização como consumidores independentes. Não remova `consumer: "popup"` das mensagens.
- A visão anual não pode cair silenciosamente no primeiro semestre.
- O exame não é opção do seletor de período; ele aparece como indicador no compacto e com valor completo no expandido.
- O front não deve recalcular ou reinterpretar regras acadêmicas já definidas nos módulos compartilhados.

## Restrições da extensão

- Use apenas HTML, CSS e JavaScript locais já adotados pelo projeto.
- Não adicione framework, biblioteca de UI, fonte remota, CDN, telemetria ou recurso externo.
- Não solicite novas permissões.
- Mantenha compatibilidade com CSP de extensão Chrome MV3.
- Não inclua dados reais de aluno, matrícula, cookies, `ViewState` ou HTML integral do SIGAA em fixtures ou screenshots.
- Preserve o popup estreito, com rolagem interna e bom comportamento com muitas disciplinas e textos longos.

## Acessibilidade e movimento

- Todo controle deve funcionar por teclado.
- Use foco visível e ordem de tabulação lógica.
- Preserve nomes acessíveis, estados `aria-expanded`, regiões `aria-live` e labels do seletor.
- Não dependa apenas de cor para comunicar erro, alteração ou sucesso.
- Garanta contraste adequado.
- Permita somente microinterações discretas para expansão, foco e atualização.
- Respeite `prefers-reduced-motion` e evite qualquer transição que atrase a consulta.

## Verificação obrigatória

Execute a suíte completa documentada no `README.md`. No mínimo, garanta que passem:

```text
node tests/academic-model-smoke.js
node tests/ui-model-smoke.js
node tests/dashboard-smoke.js
node tests/privacy-storage-smoke.js
node tests/manual-refresh-smoke.js
node tests/privacy-ui-smoke.js
node tests/fixtures-privacy.js
node tests/package-smoke.js
```

Adicione ou melhore um teste funcional do popup que comprove, com dados sintéticos:

- controles visíveis;
- disciplinas renderizadas;
- nota, faltas, situação e frequência presentes;
- busca e cada filtro funcionando;
- período anual/1º/2º funcionando;
- apenas um card expandido;
- mudança inline com valor anterior;
- estados sem notas, erro e dados preservados.

Faça QA visual e entregue screenshots sintéticos dos estados:

1. normal/recolhido;
2. card expandido;
3. busca ou filtro ativo;
4. sem notas;
5. erro ou dados anteriores preservados;
6. atualização em andamento.

Verifique também textos longos, muitas disciplinas, rolagem, zoom, teclado, foco, contraste e `prefers-reduced-motion`.

## Entrega

Ao terminar, informe:

- skills usadas e sua influência concreta;
- arquivos alterados;
- decisões de UX/UI e justificativas;
- comportamento preservado;
- testes executados e resultados;
- caminhos dos screenshots;
- qualquer limitação ou ponto que ainda exija revisão.

Não declare conclusão sem executar os testes e conferir visualmente os estados solicitados.
