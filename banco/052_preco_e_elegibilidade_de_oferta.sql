begin;

alter table public.pacotes
  add column especie_elegivel text check (especie_elegivel in ('cao', 'gato')),
  add column porte_elegivel text check (porte_elegivel in ('mini','pequeno','medio','grande','gigante'));

alter table public.pacote_servicos
  add column preco_unitario_fixo numeric(10,2) check (preco_unitario_fixo >= 0);

notify pgrst, 'reload schema';
commit;
