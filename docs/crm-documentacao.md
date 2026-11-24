# Documentação E Outra IES

## Instalação

Em uma base existente, execute `sql/crm_kanban_documentacao.sql` no SQL Editor do Supabase, depois das migrações de funil, motivos e recorte de 15/11. Pode instalar antes de publicar a interface. A estrutura completa já inclui a funcionalidade. Não execute novamente os scripts antigos de funil depois desta migração, pois eles contêm uma versão anterior da validação do cadastro.

O script é reaplicável, não altera fontes de inscritos/leads/matriculados nem exige nova importação. Não foi executado no banco real pelo assistente.

## Cadastro

- Em Dados / Editar dados, `Ingressante de outra IES` é opcional: Não informado, Sim ou Não. Sim permite informar a IES de origem, também opcional.
- A informação é manual, não inferida de transferência ou da forma de ingresso. Novas sincronizações preservam o preenchimento manual e as alterações ficam no histórico.

## Documentação

- A aba Documentação pertence à ficha do candidato. Cada envio tem curso responsável pela análise, descrição, data/hora e observação opcional.
- Registrar recebimento significa que o vendedor recebeu o retorno/análise do curso, não que o curso acusou entrega.
- Novos envios criam ciclos separados. Correções e cancelamentos exigem motivo e preservam versões no histórico. Não há exclusão pela interface.
- Este fluxo registra metadados, não upload de arquivos. Não inclua documentos pessoais, credenciais ou dados sensíveis nas observações.
- Vendedores alteram apenas fichas próprias. Gestores autorizados acompanham a equipe. Registros administrativos não mudam fase, responsável, cadências ou o relógio de interação com o candidato.
- Novos envios exigem atendimento aberto e visível; retornos de envios já existentes podem ser registrados mesmo após encerramento ou matrícula.

## Prazo Observado

A consulta pode ser otimizada em bases existentes com `sql/crm_kanban_otimizar_documentacao.sql`, sem novo deploy. Ela passa a ler apenas colunas de curso nas fontes, preservando aliases e o SLA por perfil. Veja `docs/crm-carregamento-enxuto.md` para conferencia e reversao.

A duração é `retorno da análise - envio`, em horas corridas. Média e mediana usam apenas retornos concluídos de contatos reais e acessíveis ao perfil, excluindo cancelados e testes. A quantidade de retornos explicita o tamanho da amostra. Abertos não entram como zero na média: aparecem separadamente com maior espera. Abertos de fichas ocultas ficam fora da carteira atual, mas retornos históricos concluídos são preservados.

Não há meta de SLA definida nem calendário de dias úteis. A referência observada permite estabelecer essa meta depois. A tabela é atualizada ao salvar e a cada cinco minutos enquanto a aba estiver aberta e a página visível. Ao voltar à página, atualiza se já passaram cinco minutos desde a última consulta; mudanças rápidas de foco não geram consultas extras. O botão de atualização continua disponível. Acompanha o responsável atual da ficha, não uma classificação de desempenho do vendedor original.

A redução de consultas de 24/11/2026 exige apenas publicar o aplicativo, sem nova migração SQL. Registrar um atendimento ou retomar uma cadência atualiza o contato e a ficha sem recarregar todos os cards. Respostas de versões mais antigas não substituem versões mais recentes no quadro.

## Verificação

`tools/test-crm-documents-sql.mjs` valida instalação/atualização, permissões, datas, repetição segura, correções, histórico e estatísticas. `tools/verify-crm-documents.mjs` verifica o uso da interface com dados fictícios no navegador.
