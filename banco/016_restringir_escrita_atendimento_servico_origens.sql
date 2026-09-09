begin;

-- Remove privilegios efetivos herdados dos defaults do ambiente. O grant de
-- SELECT da 015 era aditivo e nao revogava permissoes atribuidas na criacao.
revoke all privileges
  on table public.atendimento_servico_origens
  from public, anon, authenticated;

grant select
  on table public.atendimento_servico_origens
  to anon, authenticated;

-- O backend confiavel continuara apto a ler e persistir as arestas. A RLS do
-- Supabase e contornada apenas pela service_role mantida fora do navegador.
grant select, insert, update, delete
  on table public.atendimento_servico_origens
  to service_role;

commit;
