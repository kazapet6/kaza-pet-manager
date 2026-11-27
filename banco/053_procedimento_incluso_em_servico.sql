begin;

alter table public.servicos
  add column procedimento_incluso_em_servico_id uuid references public.servicos(id) on delete restrict,
  add constraint servico_procedimento_incluso_distinto check (procedimento_incluso_em_servico_id <> id);

notify pgrst, 'reload schema';
commit;
