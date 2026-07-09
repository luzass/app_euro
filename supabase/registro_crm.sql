create table if not exists public.registro_crm (
  id bigserial primary key,
  "Identificador" text,
  "Código externo do registro" text,
  "Etapa" text,
  "Data da criação" text,
  "Momento do último ganho" text,
  "Momento da última perda" text,
  "Na mesma etapa desde" text,
  "Código - Oferta de curso" text,
  "Nome - Oferta de curso" text,
  "Identificador da pessoa" text,
  "Código externo da pessoa" text,
  "Nome da pessoa" text,
  "Nome do responsável" text,
  "Atividade" text,
  "E-mail da pessoa" text,
  "E-mails secundários" text,
  "Telefone da pessoa" text,
  "Telefones secundários" text,
  "Natureza Jurídica" text,
  "CPF" text,
  "CNPJ" text,
  "Data de nascimento" text,
  "Valor da oportunidade" text,
  "Data da atividade" text,
  "Forma de ingresso" text,
  "Grau de instrução" text,
  "Escola de origem" text,
  "Nota do ENEM" text,
  "Processo seletivo" text,
  "Unidade" text,
  "Modalidade" text,
  "Status" text,
  "Nível de ensino" text,
  "Local da oferta" text,
  "Canal" text,
  "Resumo atual" text,
  "Objeção" text,
  "Observações da perda" text,
  "Endereço" text,
  "Número" text,
  "Bairro" text,
  "Cidade" text,
  "UF" text,
  "Concorrentes" text,
  "Probabilidade" text,
  "Contato_Relacionado_aluno" text,
  "Contato_Relacionado_pai" text,
  "Contato_Relacionado_mae" text,
  "Contato_Relacionado_conjuge" text,
  "Contato_Relacionado_responsavel" text,
  "Contato_Relacionado_responsavelFinanceiro" text,
  "Contato_Relacionado_responsavelAcademico" text,
  "Link continuar inscrição processo seletivo integrado TOTVS" text,
  "Vendedor" text,
  "Nome do responsável2" text,
  "Indicador" text,
  "Link do Google Meet" text,
  "Ra/Matrícula" text,
  "Unidade de Interesse" text,
  "Categoria" text,
  "Tipo de Evento" text,
  "Comentários avaliação" text,
  "Recomendações avaliação" text,
  "Avaliação gramatical" text,
  "Curso de interesse" text,
  "Curso/Disciplina ou Nome da Empresa/Startup" text,
  "Atividade a ser realizada" text,
  "Tipo de Público" text,
  "Quantidade de participantes" text,
  "Nota Final" text,
  "Nota redação" text,
  "Nota abrangência" text,
  "Nota estrutura" text,
  "Nota gramatica" text,
  "Nota tangenciamento" text,
  created_at timestamptz not null default now()
);

create index if not exists idx_registro_crm_pessoa
  on public.registro_crm ("Identificador da pessoa");

create index if not exists idx_registro_crm_cpf
  on public.registro_crm ("CPF");

create index if not exists idx_registro_crm_email
  on public.registro_crm ("E-mail da pessoa");

create index if not exists idx_registro_crm_status
  on public.registro_crm ("Status");

alter table public.registro_crm enable row level security;

drop policy if exists "registro_crm_select_authenticated" on public.registro_crm;
create policy "registro_crm_select_authenticated"
on public.registro_crm
for select
to authenticated
using (true);
