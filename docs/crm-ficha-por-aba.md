# Ficha do CRM por aba

## Ativacao

1. Executar somente `sql/crm_kanban_ficha_por_aba.sql` no SQL Editor do Supabase.
2. Publicar a aplicacao com a nova ficha.
3. Recarregar o navegador e abrir um candidato no Kanban.

Nao executar a estrutura completa em uma instalacao existente. O novo SQL e
repetivel, cria uma consulta de leitura e nao altera dados, rotinas de sincronizacao,
cadencias ou frequencia de atualizacao. Exige a estrutura e o funil atuais do CRM.

## Comportamento

- Abrir Dados busca somente o cadastro atual, sem todos os atendimentos/origens.
- Atendimentos carrega 50 registros por pagina, por data e ID decrescentes.
- Historico carrega 50 eventos por pagina, por ID decrescente, e as fases percorridas.
- Origens carrega 10 registros por pagina, por data decrescente e chave de origem.
- Os botoes de carregar mais permitem chegar a todos os registros antigos.
- Persona e Documentacao preservam suas consultas e regras existentes.

Cada aba e carregada ao ser aberta e reutilizada enquanto a ficha estiver aberta
na mesma versao. Uma nova versao invalida as listas anteriores; somente a aba ativa
e relida. Trocar de aba durante uma leitura compartilha a requisicao pendente.
Erros permitem tentar novamente, sem repeticao automatica em loop. Respostas de
outro contato ou de uma versao antiga nao substituem o conteudo atual.

Depois de salvar atendimento, uma consulta curta atualiza o cadastro e a aba de
atendimentos visivel e relida. Alteracoes que ja retornam o cadastro atualizado,
como documentacao e retomada de cadencia, nao buscam novamente toda a ficha.
Uma versao nova descoberta durante a paginacao reinicia a lista pela primeira pagina.

Nao ha cache persistente, compartilhado entre usuarios ou novo polling. Os dados
temporarios das abas sao descartados quando a ficha e fechada.

## Banco e compatibilidade

A nova RPC e `crm_kanban_detail_section(uuid,text,jsonb)`. Ela confere o acesso ao
contato em todas as paginas: gestores mantem acesso gerencial e vendedores mantem
acesso proprio/sem responsavel. O cursor nao permite ler outro candidato.
Paginacao usa chaves estaveis, incluindo desempate de horarios iguais, sem OFFSET.

O cadastro retornado nao inclui as copias `source_data` e `manual_data`. O perfil
consolidado continua completo. Na aba Origens, o payload original continua visivel,
mas a consulta deixa de repetir campos internos como canonical_data e payload_hash.
Nenhum atendimento, evento ou origem e apagado.

A RPC anterior `crm_kanban_detail(uuid,bigint)` permanece inalterada para navegadores
antigos. Se o novo SQL nao estiver instalado, a interface informa o arquivo necessario;
nao volta silenciosamente a carregar toda a ficha. Para reverter a interface, publicar
a versao anterior do aplicativo; a consulta antiga continua disponivel. Nao e
necessario excluir a nova funcao para isso.

## Verificacao

- `tools/test-crm-detail-sections-sql.mjs <caminho-do-pglite>`: 123 atendimentos,
  123 eventos e 23 origens; limites, desempates, cursores, dados originais, fases,
  permissoes de vendedor/gestao/anonimo, repetibilidade e compatibilidade antiga.
- `tools/verify-crm-detail-sections.mjs <pasta-com-playwright>`: abertura enxuta,
  abas sob demanda, paginacao, cache por versao, leitura pendente compartilhada,
  erros/repeticao manual, respostas atrasadas, troca de contato, mudanca de versao,
  ausencia de migracao e layouts desktop/mobile.
- Regressoes no navegador: Kanban, atendimento retroativo, cadencias, persona,
  motivos de desistencia, documentacao, atualizacao por escrita e Gestao do CRM.

Testes usam apenas dados ficticios. A reducao de dados por leitura nao comprova
queda do comprometimento de memoria de 1,5 GB. Ainda ha consultas por contato e
leituras historicas quando as abas correspondentes sao abertas.
