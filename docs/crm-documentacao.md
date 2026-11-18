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

A duração é `retorno da análise - envio`, em horas corridas. Média e mediana usam apenas retornos concluídos de contatos reais e acessíveis ao perfil, excluindo cancelados e testes. A quantidade de retornos explicita o tamanho da amostra. Abertos não entram como zero na média: aparecem separadamente com maior espera. Abertos de fichas ocultas ficam fora da carteira atual, mas retornos históricos concluídos são preservados.

Não há meta de SLA definida nem calendário de dias úteis. A referência observada permite estabelecer essa meta depois. A tabela é atualizada ao salvar e a cada minuto enquanto a aba estiver aberta; acompanha o responsável atual da ficha, não uma classificação de desempenho do vendedor original.

## Verificação

`tools/test-crm-documents-sql.mjs` valida instalação/atualização, permissões, datas, repetição segura, correções, histórico e estatísticas. `tools/verify-crm-documents.mjs` verifica o uso da interface com dados fictícios no navegador.
