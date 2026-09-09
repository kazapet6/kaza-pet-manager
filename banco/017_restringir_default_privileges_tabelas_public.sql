begin;

-- Afeta somente tabelas futuras criadas por postgres no schema public. Os
-- defaults globais e os defaults pertencentes a supabase_admin permanecem
-- intactos.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete, truncate, references, trigger
  on tables from public;

-- A leitura automatica existente e preservada. Cada tabela ainda depende de
-- RLS e policy explicita para que anon/authenticated consigam ler registros.
alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate, references, trigger
  on tables from anon, authenticated;

-- Nenhum default da service_role e alterado: o backend confiavel conserva os
-- privilegios definidos pelo ambiente Supabase para novas tabelas.

commit;
