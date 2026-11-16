# CRM Kanban - Captação

## Implantação

1. Execute **SQL - CRM Kanban Unieuro: estrutura, histórico e permissões** (`sql/crm_kanban_estrutura.sql`) no SQL Editor do projeto correto. Cria somente tabelas/funções `crm_kanban_*`; não escreve nas fontes existentes.
2. Habilite `pg_cron` em Database / Extensions. Execute **SQL - Sincronizar e agendar o CRM Kanban a cada 10 minutos** (`sql/crm_kanban_sincronizar_agendar.sql`). O agendamento usa nome fixo e pode ser atualizado sem criar jobs duplicados. Sem a extensão, o script para com aviso explícito; o botão Sincronizar continua disponível para gestores.
3. Publique o aplicativo e acesse `/app/crm`. Não é necessário alterar os fluxos n8n que já atualizam inscritos/matriculados/leads: a rotina lê essas fontes, e a página consulta o CRM a cada 30 segundos enquanto visível.

Os SQLs não foram executados no Supabase real durante o desenvolvimento. A validação foi feita em PostgreSQL local isolado e com dados fictícios no navegador.

### Correção De Timeout Da Persona

Para uma instalação existente, execute apenas `sql/crm_kanban_otimizar_persona.sql` no SQL Editor e recarregue a aplicação. Não precisa refazer a importação, recriar contatos ou aumentar o limite de execução do banco. A correção também atende a versão já publicada pela função antiga.

A consulta lê diretamente os cabeçalhos normalizados de matriculados. A versão atual do aplicativo solicita apenas o curso da ficha e compartilha o resultado entre fichas do mesmo curso por até dez minutos. O filtro de calouros ativos, o CPF único por curso, a idade na matrícula e a desidentificação foram preservados. O botão Tentar novamente permite recuperar uma falha sem reabrir a ficha.

### Atualização Do Funil E Das Cadências

Em uma instalação existente, publique primeiro a nova versão do aplicativo e depois execute `sql/crm_kanban_funil_cadencias.sql` no SQL Editor. O quadro antigo de seis colunas não exibe as novas etapas; não aplique esta migração mantendo somente a tela antiga em produção. Não precisa recriar os contatos nem repetir a carga das planilhas. A correção da persona é independente; execute também seu SQL se ainda estiver pendente. A instalação completa já inclui essas definições.

## Funil

Baseado em `Processo comercial Unieuro Central 5800.pdf`, página 1, e `Scripts Processo Comercial - UNIEURO.pdf`, páginas 1-3:

- Primeiro contato.
- Abordagem / Sondagem.
- Negociação.
- Fechamento.
- Inscrito.
- Vestibular / Prova online.
- Aguardando matrícula.
- Matriculado.

Abordagem mantém A1/A2/A3 em D+0/D+2/D+5; Negociação mantém N1/N2/N3 em D+0/D+1/D+5. A cobrança de acesso/conclusão da prova usa D+1/D+3/D+5 em Vestibular. O acompanhamento de contrato/pagamento usa D+0/D+3/D+10 em Aguardando matrícula. Primeiro contato, Fechamento e Inscrito têm uma ação inicial D+0. Os dias são corridos, contados da entrada na etapa. Preços, juros, ofertas e datas antigas dos PDFs não foram tratados como condições comerciais atuais.

Uma inscrição nova entra diretamente em Inscrito, sem inventar atendimentos nas fases anteriores. Aprovação ou evidência de emissão/pagamento encaminha para Aguardando matrícula. A indicação genérica EM ABERTO, sem identificador de lançamento/contrato, não comprova boleto emitido. ENEM não exige passagem pela prova online nem implica aprovação automática. Uma matrícula ativa na base oficial promove a Matriculado. A identificação acadêmica Lead/Inscrito/Matriculado confirmado continua separada da coluna operacional: arrastar um cartão não cria aprovação, pagamento ou matrícula oficial.

Na Negociação, N4 registra se é a primeira graduação; N5 seleciona ENEM/Vestibular; N6 apresenta a solicitação do boletim; N7 orienta dados, inscrição e link da prova. Para quem já cursa/concluiu outra graduação, F3/F4/F5 orientam transferência/segunda graduação. Essas respostas ficam salvas no cadastro e no histórico.

## Agenda E Interações

- A agenda mostra ações vencidas, ações de hoje, ausência de interação por três dias, ausência de resposta por três dias e todos os retornos. Respeita o responsável, as permissões e os filtros do quadro.
- Contato da equipe, resposta do candidato e anotação interna são registros diferentes. Anotações, qualificação, mudança de campo e importações diárias não reiniciam o relógio de conversa. Atendimentos antigos ficam como tipo desconhecido e não são tratados como prova de mensagem sem resposta.
- Cada visita a uma etapa tem cadência própria. Copiar texto ou abrir WhatsApp não conclui o envio. Registrar um contato vinculado à cadência grava o atendimento e sua conclusão de forma atômica; a repetição do mesmo envio é bloqueada. As datas de entrada não mudam em uma carga diária sem mudança real de fase.
- Uma resposta recebida pausa as mensagens automáticas daquela etapa; o vendedor pode agendar um retorno ou retomar a cadência. Retomar não apaga os envios anteriores. Um retorno combinado para o futuro prevalece sobre a cadência e os alertas de inatividade. Registrar um contato após o horário combinado conclui esse retorno.
- Matriculados e arquivados não geram cobranças automáticas. Os lembretes aparecem dentro do CRM e são recalculados enquanto a página está aberta; não há envio automático de WhatsApp, e-mail ou notificações fora do aplicativo. Respostas do WhatsApp precisam ser registradas pelo atendente até existir integração de conversas.

## Cadastro único e atualização

- CPF obrigatório no cadastro manual. Normaliza pontuação/zeros; valida formato, não situação cadastral na Receita. Nunca une pessoas por nome, e-mail ou telefone compartilhado.
- Um único registro em `crm_kanban_contacts` por CPF. Transações, unicidade no banco e bloqueio por CPF protegem importação/cadastro simultâneos.
- As fontes são `leads_cursos` e `inscritos_20271`. Inscrições de Medicina são excluídas. A base `matriculados_20271`, também sem Medicina, apenas enriquece pessoas já existentes e identifica matrícula ativa; não cria cards por si só.
- A chave lógica da fonte é preservada. Alteração de CPF sob a mesma chave exige revisão e não une pessoas automaticamente. Fontes sem CPF, data ou identificador ficam contabilizadas como pendência, sem exclusão na origem.
- Dados acadêmicos e contatos não vazios são combinados por fonte/data. Inscrição tem precedência sobre landing page; matrícula oficial tem precedência sobre ambas. Todas as inscrições/interesses continuam em Origens e nas versões do Histórico.
- Edições manuais têm precedência apenas nos campos efetivamente alterados. Editar uma observação não congela o restante do cadastro. Um novo cadastro manual com CPF existente aproveita informações preenchidas sem apagar dados de origem por campos vazios do formulário.
- A importação nunca altera um responsável já atribuído. Um responsável da landing page só é aproveitado quando corresponde de forma única ao nome/perfil da equipe; ambiguidades permanecem sem responsável.
- Cada atualização de fonte registra os dados anteriores e recebidos. Mudanças manuais e de responsável, fases e revisões de atendimento mantêm auditoria. A ficha tem histórico paginado, sem apagar o passado ao editar.
- Datas de atendimento são editáveis; a versão anterior da observação permanece no histórico. Próximas ações têm data/hora e indicação de atraso.

## Permissões

- Admin, reitoria e gerente de captação: todos os contatos e alteração de responsável.
- Captação/funcionário: próprios contatos e fila sem responsável; pode assumir um contato livre atomicamente. Depois não pode transferir ou remover o responsável.
- Um contato deve ser assumido antes de o vendedor editar, movimentar ou registrar atendimento.
- Coordenador e Spike mantêm os acessos anteriores, sem acesso ao novo CRM.
- O banco verifica permissões em cada escrita. Não basta esconder o seletor. Escritas diretas nas novas tabelas não são concedidas a `authenticated`; usam-se RPCs com campos permitidos e versão do contato.
- Perfil de equipe expõe apenas identificador, nome e papel. Dados de fontes/histórico são retornados apenas para contatos visíveis ao usuário.

## Persona

Reutiliza o modelo descritivo já existente: faixa etária, campus, turno e ingresso, por curso, com no mínimo 20 CPFs históricos e três características comparáveis. A consulta devolve uma base histórica desidentificada, sem CPF real, nomes, nascimento, telefone ou e-mail. Históricos faltantes deixam a compatibilidade pendente.

Usa a data real da inscrição quando disponível; para lead/manual, a referência é a entrada do contato e fica identificada. O índice não é probabilidade de matrícula, não decide elegibilidade e não restringe oportunidades ou atendimento.

## Modo de teste e corte

Configuração inicial: corte **13/11/2026**, amostra fixa de até **200 CPFs antigos** e todos os registros válidos a partir do corte. A seleção antiga é persistida, para não importar mais 200 a cada execução. Novos registros do mesmo CPF atualizam o card existente e o tornam real, preservando o histórico.

Contatos de teste são marcados. Não são dados fictícios injetados na produção: vêm da amostra autorizada das fontes. Um cadastro manual real também retira o contato do grupo exclusivamente de teste.

O encerramento não foi executado. Existe uma função administrativa protegida por confirmação (`crm_kanban_finish_tests`) para, quando o usuário pedir, desligar a amostra, remover somente os contatos exclusivamente de teste e retirar snapshots de teste dos contatos reais. Preserva cadastros que receberam novas fontes/cadastro manual e não apaga tabelas de origem. O job não reimporta a amostra depois disso.

## Verificações

- `tools/test-crm-kanban-sql.mjs`: PostgreSQL isolado, 250 contatos antigos para provar o limite de 200, repetição por CPF, Medicina excluída, importação idempotente, responsáveis/claim, RLS, versões concorrentes, atendimentos editáveis com auditoria, persona desidentificada e limpeza sem apagar fontes.
- `tools/test-crm-kanban.mjs`: movimentação/ordem, regras de perfil, contato e persona.
- `tools/test-crm-persona.mjs`: 18 mil linhas históricas, recorte por curso, compatibilidade do cliente anterior, deduplicação, idade e privacidade.
- `tools/test-crm-workflow.mjs` e `tools/test-crm-workflow-sql.mjs`: etapas, N4/N7, prazos, resposta x tentativa x anotação, pausa/retomada, envios auditados, avanço por fonte e migração sem duplicar.
- `tools/verify-crm-kanban.mjs`: navegador com fontes fictícias, arrastar entre fases, ordenar por teclado, rolagem automática horizontal e por toque, ficha, edição parcial, atendimento, persona, cadastro sem duplicação, assumir lead e desktop/mobile.

## Diagnóstico

`crm_kanban_config.last_sync_result` informa atualizados, inalterados, inválidos, conflitos e fontes ausentes. Até 20 conflitos trazem referência de origem e motivo, visíveis somente a gestores. Nenhum gatilho de reconstrução completa foi instalado nas tabelas do n8n.

A retirada de registros das fontes não prova desistência e não exclui o histórico do CRM. Confirmar matrícula é diferente de arrastar o card para a fase Matriculado. Interrupções de uma fonte não são apresentadas como uma base vazia sem aviso.
