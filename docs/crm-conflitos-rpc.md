# Conflitos De Versao Nas RPCs

## Defeito Corrigido

As RPCs do CRM usavam SQLSTATE `40001` para rejeitar versoes ou cadencias desatualizadas. Esse codigo e reservado para falhas transitorias de serializacao. Segundo a documentacao oficial da Supabase, o PostgREST 14 pode repetir indefinidamente essas transacoes; o problema e corrigido no PostgREST 16. Isso pode gerar CPU alta, muitos rollbacks e chamadas `set_config` mesmo sem trafego HTTP correspondente.

O codigo correto para o conflito de negocio e `PT409`, retornando HTTP 409 ao cliente. A protecao de concorrencia continua ativa: nenhum dado desatualizado e sobrescrito. As mensagens existentes e o tratamento da interface permanecem compativeis.

Referencia: https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b

## Aplicar Em Uma Instalacao Existente

1. Execute `sql/crm_kanban_corrigir_conflitos_rpc.sql` no SQL Editor, fonte Database, do projeto correto. Nao depende de publicar o frontend. O script modifica apenas as oito RPCs conhecidas que estiverem instaladas, substituindo o codigo de erro na definicao atual. E atomico e reaplicavel; preserva assinaturas, permissoes e ajustes locais. O resultado deve indicar `erro_40001_ainda_presente=false` e `conflito_http_409=true`.
2. No Explorer, fonte Logs e intervalo Last 15 minutes, execute `sql/diagnostico_retry_40001_logs.sql` para identificar os processos que emitiram esses erros. Contadores historicos nao caem apos a correcao; compare horarios novos e taxas de crescimento.
3. Se a carga persistir, execute `sql/diagnostico_backends_crm_retry.sql` na fonte Database e cruze os PIDs atuais com os process_id dos erros. A documentacao alerta que mudar a funcao nao garante encerrar tentativas ja em andamento. Encerrar um backend identificado aborta sua transacao e pode exigir reconexao do cliente; nao matar todas as conexoes nem reutilizar PIDs antigos sem verificacao. Uma reinicializacao do projeto tambem interrompe conexoes, portanto deve ser combinada antes com a equipe.

Os scripts de instalacao/atualizacao de estrutura, cadencias, desistencias e documentacao tambem foram corrigidos para nao reintroduzir `40001` nos conflitos de negocio. Nao substituem o hotfix na base que ja esta instalada.

## Limites Da Investigacao

As coletas de 24/11/2026 mostraram 985104 novas execucoes do contexto PostgREST em 704,08 segundos e poucos eventos no gateway; isso e compativel com retries internos, mas nao confirma sozinho a versao do PostgREST nem o erro exato que estava rodando no projeto. A presenca do defeito no codigo e comprovada; sua participacao no incidente deve ser confirmada pelos logs e pela queda das taxas apos a correcao.

Nenhum script foi executado no Supabase real pelo assistente. Os testes locais validam codigo de erro, preservacao de dados e permissoes, reaplicacao e rejeicao de gravacoes desatualizadas; nao reproduzem o servidor PostgREST gerenciado.
