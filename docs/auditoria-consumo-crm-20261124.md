# Auditoria de consumo do CRM - 24/11/2026

## Conclusao

Ha trabalho repetido evitavel no CRM, tanto no navegador quanto no banco. A quantidade
de cards nao descreve esse custo: algumas operacoes varrem bases e historicos completos.
Esta auditoria NAO atribui os 1,5 GB de memoria comprometida a uma funcao ou tabela.
Nao houve acesso a RAM/PSS dos processos do servidor Supabase.

Escopo: Kanban, ficha, documentacao, persona, BI, sincronizacao, permissoes e testes
do repositorio. As definicoes SQL locais nao comprovam, sozinhas, quais versoes estao
instaladas em producao. As coletas enviadas pelo usuario complementam essa evidencia.
Nenhuma alteracao funcional, exclusao, migracao ou mudanca de infraestrutura foi aplicada.

## Achados

Todos os achados abaixo sao P2 (ineficiencia ou risco de crescimento/concorrencia).
A ordem indica a prioridade sugerida de tratamento, nao uma medicao de RAM.

### 1. Documentacao refaz varreduras globais a cada minuto

Referencias: src/components/CRM/CrmDocumentsPanel.tsx:54,75;
sql/crm_kanban_documentacao.sql:104-125.

Enquanto a aba esta montada, o timer consulta o banco a cada 60 segundos sem verificar
a visibilidade da pagina. Cada chamada relista cursos em crm_kanban_contacts e nas tres
bases de origem, convertendo linhas inteiras para JSON e usando o extrator generico.
Tambem recalcula media/mediana dos envios acessiveis, nao apenas da ficha aberta.

Impacto: trabalho global recorrente por aba/usuario mesmo sem novos documentos. Nao e
uma consulta leve limitada ao contato. O timer de 60 segundos de setNow no Kanban e
diferente: aquele apenas atualiza o relogio local e nao consulta o Supabase.

Correcao sugerida: primeiro adequar o polling a cinco minutos e suspender com pagina
oculta; depois separar catalogo de cursos e estatisticas da leitura por contato,
com invalidacao apos escrita e isolamento por usuario/permissao. Preservar o SLA.

### 2. Sincronizacao continua completa, mesmo sem novidades

Referencias: sql/crm_kanban_recorte_20261115.sql:134-205;
sql/crm_kanban_sincronizar_agendar.sql:10;
sql/crm_kanban_estrutura.sql:86-97.

A cada dez minutos, carrega inscritos e leads em fila temporaria, incluindo leads
anteriores ao corte antes de aplicar a elegibilidade, e revisita matriculados.
O payload inteiro vira JSON. A funcao pick percorre e normaliza nomes de campos
para extrair cada valor. O hash evita gravar uma origem identica, mas a verificacao
ocorre dentro de uma chamada por registro, depois de bloqueio consultivo por CPF
e bloqueio da origem.

Reproducao local: com 20 inscritos e 10 leads elegiveis, uma segunda sincronizacao
sem mudancas chamou a importacao 30 vezes, retornando updated=0 e unchanged=30.
Havia ainda 30 leads antigos na tabela de origem. Esse teste mede chamadas,
nao tempo, RAM ou consumo de producao.

Correcao sugerida: projetar campos conhecidos sem varredura generica quando o esquema
estiver validado; comparar mudancas antes de chamar importacao; planejar processamento
incremental que tambem detecte exclusoes e alteracoes retroativas. Nao assumir que
created_at identifica atualizacoes nem simplesmente ignorar registros antigos ligados
a um inscrito. Manter as regras de CPF e os conflitos sem mesclagem automatica.

### 3. Recalculo de visibilidade bloqueia todos os contatos

Referencia: sql/crm_kanban_recorte_20261115.sql:15-39,203.

refresh_intake_scope executa FOR UPDATE sobre todos os contatos, inclusive quando
nenhuma visibilidade precisa mudar. E chamada na sincronizacao. As edicoes dos
vendedores sobre essas linhas podem esperar pelo fim da transacao.

Correcao sugerida: restringir o trabalho a candidatos afetados, revalidando a regra
de cadastro manual depois do bloqueio. Nao remover o bloqueio sem testar a corrida
com o cadastro manual, pois o codigo atual o usa para garantir essa consistencia.
Nao foi medido tempo de espera no servidor real.

### 4. Alteracoes auxiliares da planilha geram historico e versao novos

Referencia: sql/crm_kanban_recorte_20261115.sql:68-91.

O hash considera o payload bruto completo. Alterar somente data_referencia_perfil,
por exemplo, passa a ser uma alteracao de origem, grava before/after completos,
recalcula a ficha e incrementa sua versao mesmo sem mudar os dados canonicos.
Isso pode crescer historico/BI e provocar conflitos de versao evitaveis durante cargas.

Reproducao local: alterar apenas essa data em um inscrito produziu updated=1, um novo
evento source_update e versao maior; current_data permaneceu exatamente igual.

Correcao sugerida: separar a observacao do payload de origem das alteracoes operacionais
do contato. Preservar a auditoria exigida; nao descartar silenciosamente campos nem
apagar historico existente. Decidir quais mudancas justificam nova versao operacional.

### 5. Quadro carrega todas as colunas e filtra depois

Referencias: src/lib/crmKanbanApi.ts:56-75; src/pages/CrmKanban.tsx:382,525.

Cada abertura/atualizacao baixa SELECT * em paginas de 1000, incluindo source_data,
manual_data e current_data (com informacoes repetidas), contatos ocultos e arquivados
que a permissao permitir. A paginacao de transporte nao limita o total carregado.
Os filtros de visibilidade, curso, responsavel e situacao ficam no navegador.

Correcao sugerida: leitura compacta para os cards, filtros no servidor e detalhes
sob demanda. Preservar busca, agenda, contagens e visualizacao de desistencias;
nao trocar SELECT * por campos insuficientes que quebrem a edicao da ficha.

### 6. BI refaz e retorna historico inteiro para intervalos pequenos

Referencias: sql/crm_kanban_gestao_bi.sql:17-35,72-73;
src/lib/crmManagementCache.ts:25-48; src/pages/GestaoCrm.tsx:232-264.

As consultas de eventos e atendimentos nao restringem o volume ao periodo selecionado.
O modelo no navegador aplica filtros depois. O cache de 24 horas funciona, mas e em
memoria do navegador: nova aba, recarga e novas combinacoes de datas podem repetir
a agregacao global. O servidor nao tem snapshot compartilhado nesse fluxo.

Reproducao local: um intervalo de ontem a hoje ainda recebeu todos os 90 eventos
de fase sinteticos de 100 dias antes. Nao e afirmacao de erro nos numeros exibidos;
e evidencia de trabalho/transferencia alem do intervalo escolhido.

Correcao sugerida: separar estado historico necessario das series do periodo e
agregar no servidor. Nao aplicar simplesmente created_at >= p_from ao historico:
isso quebraria primeira entrada, conversao e estado da matricula no corte.

### 7. Ficha faz leituras redundantes e sem limite em atividades/origens

Referencias: src/components/CRM/CrmContactDrawer.tsx:328-344,700-701,738-739;
sql/crm_kanban_estrutura.sql:686-701.

Salvar atendimento/retomar cadencia recarrega o quadro e explicitamente a ficha.
A nova versao do contato tambem dispara o efeito de carregamento da ficha: existem
dois caminhos independentes de leitura sem deduplicacao de requisicao em andamento.
O numero exato de chamadas depende da ordem das respostas e do render.
A ficha limita eventos a 50, mas agrega todas as atividades e todas as origens brutas.

Correcao sugerida: um unico fluxo de atualizacao por escrita; compartilhar a requisicao
de detalhe por contato/versao; paginar atividades/origens e carregar abas sob demanda.
Testar resposta atrasada e troca de contato para nao mostrar dados da ficha anterior.

## Oportunidade adicional que precisa de EXPLAIN em producao

RLS usa crm_kanban_can_read(owner_id), que consulta funcoes de perfil/gestor, na
politica da listagem (sql/crm_kanban_estrutura.sql:69-80,1193-1194). O argumento varia
por linha; nao se pode envolver a funcao inteira em SELECT como se fosse constante.
Separar verificacoes independentes da linha em initPlans pode reduzir custo. E preciso
comparar planos e testar todos os papeis antes de alterar seguranca. Nenhuma permissao
foi relaxada e nao foi atribuido um percentual de ganho a essa possibilidade.

## O que esta funcionando e deve ser preservado

- Polling do quadro a cinco minutos e pausa em segundo plano.
- Cache BI de 24 horas, deduplicacao de chamadas em andamento e limpeza por sessao.
- Persona carregada apenas na aba correspondente e cache por curso por dez minutos.
- Trava consultiva para impedir sincronizacoes simultaneas.
- Hash de origem evita regravar payloads exatamente iguais.
- Indices de contato em fontes/eventos/atividades/documentos existem na instalacao.
- Conflitos de negocio agora usam PT409, mantendo controle de versao e permissoes.

O defeito anterior de 40001 nao foi reintroduzido nos SQLs locais. O hotfix segue
como alteracao local anterior a esta auditoria; nao houve commit/push nesta etapa.

## Validacao

Passaram localmente:

- tools/audit-crm-workload.mjs (tres reproducoes sinteticas descritas acima).
- tools/test-crm-refresh-cache.mjs.
- tools/test-crm-intake-scope-sql.mjs.
- tools/test-crm-documents-sql.mjs.
- tools/test-crm-management-sql.mjs.
- tools/test-crm-rpc-conflict-hotfix.mjs.
- tools/test-crm-persona.mjs (18.001 linhas sinteticas; nao e benchmark de producao).

Nao foram executados EXPLAIN ANALYZE, migracoes, mudancas de configuracao ou consultas
com credenciais no Supabase. Nao ha medicao de memoria por processo disponivel.

## Fontes tecnicas

- https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
- https://supabase.com/docs/guides/observability/reports#memory-commitment
- https://www.postgresql.org/docs/17/view-pg-backend-memory-contexts.html

## Primeira etapa implementada depois da auditoria

Na interface local, Documentacao passou para cinco minutos, com pausa em segundo
plano e atualizacao ao retornar apenas quando vencida. Atualizacoes apos escrita
e o botao manual foram preservados. Atendimento e retomada de cadencia passaram
a atualizar a ficha/card sem recarregar o quadro completo, evitando a leitura
duplicada de detalhe. O quadro rejeita respostas com versao inferior a atual.

Isso reduz a frequencia e a repeticao, mas nao altera as consultas SQL globais,
a sincronizacao, o catalogo de cursos ou o BI identificados acima. Nao houve
migracao, exclusao, upgrade, commit ou publicacao automatica nesta etapa.

## Segunda etapa preparada depois da primeira publicacao

Foi preparada a migracao `sql/crm_kanban_otimizar_sincronizacao.sql`. Ela compara
os snapshots antes da importacao por CPF e limita o bloqueio de visibilidade a
candidatos a mudanca, com revalidacao depois do bloqueio. No teste local de 30
origens identicas, as chamadas de importacao passaram de 30 para zero. As leituras
das fontes e a comparacao de payloads continuam existindo.

Foram preparados tambem uma consulta de conferencia e um SQL de reversao apenas
desta etapa. Nao foram aplicados no Supabase pelo assistente. A documentacao de
instalacao, limites e verificacoes fica em `docs/crm-sincronizacao-otimizada.md`.

## Terceira etapa preparada

A listagem do quadro passou a solicitar colunas explicitas, sem as copias brutas
`source_data` e `manual_data`, e aplica `intake_visible=true` no servidor. Dados de
perfil em `current_data` e a ficha completa continuam disponiveis.

Foi preparada `sql/crm_kanban_otimizar_documentacao.sql`, que le somente as colunas
de curso, deduplica antes de extrair aliases e evita helpers de perfil por documento
na agregacao de SLA. Mantem o contrato da RPC e nao altera dados. Continua havendo
leitura das fontes e agregacao dos documentos; nao e uma solucao comprovada para
os 1,5 GB de comprometimento. Ver `docs/crm-carregamento-enxuto.md`.
