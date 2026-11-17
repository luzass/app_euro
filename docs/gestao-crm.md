# Gestao do CRM

Pagina: `/app/gestao-crm`. Acesso exclusivo a admin, reitoria e captacao_gerente, com bloqueio tambem na consulta do banco. O vendedor continua operando apenas o CRM permitido pelo seu perfil.

## Ativacao

1. Publicar a aplicacao com esta versao.
2. Executar `sql/crm_kanban_gestao_bi.sql` no SQL Editor do Supabase.
3. Abrir Gestao do CRM pelo menu e atualizar os indicadores.

A migracao pressupoe estrutura, funil/cadencias e motivos de desistencia ja instalados. E repetivel e apenas cria a consulta de leitura e suas permissoes. Nao importa, apaga ou altera contatos, fontes, inscritos ou matriculados. Para uma instalacao nova, a consulta ja esta incluida em `crm_kanban_estrutura.sql`.

## Leituras disponiveis

- Resumo: carteira atual, pendencias vencidas, falta de interacao/resposta, entradas reais, primeiros atendimentos e movimento diario/semanal.
- Funil: pessoas por etapa, permanencia mediana atual e conversao por grupos de entrada real, separando leads e inscritos diretos.
- Equipe: carteira atual, contatos e respostas registrados, candidatos contatados, pendencias, confirmacoes observadas e encerramentos.
- Desistencias: episodios e pessoas distintas, motivos informados pelo candidato separados da percepcao do atendente e reaberturas.

Filtros compartilhados: datas, responsavel, curso, campus, ingresso e origem de entrada. Testes ficam excluidos por padrao; podem ser incluidos explicitamente. Listas abertas pelos indicadores permitem buscar candidatos e acessar a ficha completa. Filtros e aba permanecem na URL ao voltar da ficha. Atualizacao automatica a cada minuto enquanto a pagina estiver visivel e ao retornar para ela.

## Criterios

- Carteira e alertas sao atuais, nao uma reconstrucao do estoque na data final selecionada.
- Datas usam America/Sao_Paulo. O corte inclui todo o dia final. Datas futuras sao rejeitadas.
- Entrada real usa o primeiro evento nao marcado como teste ou cadastro manual. A data mutavel de observacao da fonte nao define entrada. Fallback de created_at e sinalizado e fica fora das conversoes.
- Inscricao/matricula sao confirmacoes observadas nas fontes do CRM, nao datas academicas retroativas. A primeira carga pode conter pessoas que ja tinham esses resultados.
- Conversao acompanha entradas do periodo ate o corte; matriculas presentes na entrada ficam fora do numerador e do denominador. Inscritos diretos nao viram conversao lead-inscrito. Matricula exige contrato ativo confirmado depois da entrada e ainda ativo no corte. Varios contratos do mesmo contato sao avaliados individualmente.
- Historico academico incompleto nao gera taxas estimadas. Ausencia de resposta nunca e inferida como desistencia.
- Carteira/alertas: responsavel atual. Coortes: primeiro responsavel a partir da entrada real, ate o corte. Confirmacoes: responsavel na hora do evento. Atendimentos: autor do registro. Nada disso implica causalidade de uma venda.
- Curso/campus/ingresso usam a ficha atual, exceto encerramentos, que usam o retrato imutavel registrado na perda. Alteracoes do catalogo nao apagam o motivo historico da ficha.
- Permanencia e a mediana de quem ainda esta na etapa, nao tempo de ciclo concluido. Movimentos para etapa contam eventos de troca, nao a criacao inicial.
- Reabertura preserva episodios passados. O mesmo candidato pode ter mais de um encerramento. A contagem de pessoas distintas evita confundir episodios com pessoas.
- Contatos/respostas precisam ser registrados. Anotacoes internas e registros antigos sem direcao nao contam como tentativas ou respostas. Nao ha integracao automatica de mensagens.
- O resumo nao recebe CPF, telefone, e-mail, notas ou payloads brutos. A ficha completa continua protegida pelas permissoes do CRM.

## Verificacao local

- `node tools/test-crm-management.mjs`
- `node tools/test-crm-management-sql.mjs <caminho-do-pglite>`
- `node tools/verify-crm-management.mjs <pasta-de-pacotes-com-playwright>`
- `node tools/test-crm-workflow.mjs`
- `npm run build`

Os testes usam dados ficticios e banco temporario local. Nao comprovam que a migracao foi executada no ambiente real.
