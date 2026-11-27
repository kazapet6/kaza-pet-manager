begin;
alter table public.servico_etapas
  add column especie_aplicavel text check (especie_aplicavel in ('cao','gato')),
  add column porte_aplicavel text check (porte_aplicavel in ('mini','pequeno','medio','grande','gigante')),
  add column habilitacao_explicita boolean not null default false;
notify pgrst, 'reload schema';
commit;
