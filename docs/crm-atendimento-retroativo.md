# Atendimento retroativo no Kanban

## Correcao para a base existente

Execute somente `sql/crm_kanban_atendimento_retroativo.sql` no SQL Editor do Supabase.
E compativel com o aplicativo ja publicado: nao exige esperar o novo deploy.
O assistente nao executou este SQL no banco real.

O script substitui apenas a funcao de registro de atendimento, sem alterar registros
existentes, assinatura, permissoes ou responsaveis. Pode ser reaplicado. Nao precisa
reexecutar a estrutura completa nem a migracao antiga de funil/cadencias.

## Comportamento

- Atendimento sem vinculo de cadencia continua aceitando datas passadas.
- Ao usar um botao de cadencia e informar data anterior a entrada na fase atual,
  salva o atendimento e seu horario no historico, mas nao conclui a cadencia atual.
- A auditoria do evento guarda o codigo solicitado e o motivo de nao aplica-lo.
- Uma cadencia atual pausada ou ja concluida nao impede registrar esse contato antigo;
  seu estado atual e preservado.
- Datas dentro da fase continuam cumprindo a cadencia normalmente.
- Fase/ancora desatualizada de verdade, codigo invalido, data futura e falta de permissao
  continuam bloqueados. Conflitos usam PT409, nunca 40001.
- O relogio de ultima interacao usa o maior horario registrado; adicionar um contato
  antigo nao substitui uma interacao mais recente.

A interface local tambem mostra um aviso quando a data e anterior a fase. Esse aviso
aparecera apos publicar o aplicativo; a correcao no banco funciona sem ele.

## Testes

`tools/test-crm-retroactive-activity.mjs` reproduz o bloqueio anterior e valida a migracao,
permissoes, fase realmente desatualizada, datas, cadencias pausadas/concluidas, relogios,
auditoria, repeticao da migracao e equivalencia com a instalacao nova.
O teste de navegador `tools/verify-crm-kanban.mjs` cobre o aviso e a preservacao da cadencia.
