begin;

alter table public.configuracao_agenda
  add column espera_normal_minutos integer not null default 15
    check (espera_normal_minutos >= 0);

alter table public.servico_etapas
  add column politica_espera_antes text not null default 'padrao',
  add column espera_antes_minutos integer;

alter table public.servico_etapas
  add constraint servico_etapas_politica_espera_check
    check (
      politica_espera_antes in (
        'padrao', 'personalizada', 'sem_limite_operacional'
      )
    ),
  add constraint servico_etapas_espera_antes_minutos_check
    check (espera_antes_minutos is null or espera_antes_minutos >= 0),
  add constraint servico_etapas_espera_coerencia_check
    check (
      (politica_espera_antes = 'personalizada'
        and espera_antes_minutos is not null)
      or
      (politica_espera_antes in ('padrao', 'sem_limite_operacional')
        and espera_antes_minutos is null)
    );

do $$
declare
  etapa_finalizacao_id uuid;
  quantidade integer;
begin
  select count(*)
  into quantidade
  from public.servico_etapas etapa
  join public.servicos servico on servico.id = etapa.servico_id
  where servico.nome = 'Banho'
    and etapa.nome = 'Finalização'
    and etapa.ordem = 3;

  if quantidade <> 1 then
    raise exception 'Era esperada exatamente uma etapa Finalização, ordem 3, no serviço Banho.';
  end if;

  select etapa.id
  into etapa_finalizacao_id
  from public.servico_etapas etapa
  join public.servicos servico on servico.id = etapa.servico_id
  where servico.nome = 'Banho'
    and etapa.nome = 'Finalização'
    and etapa.ordem = 3;

  update public.servico_etapas
  set politica_espera_antes = 'sem_limite_operacional',
      espera_antes_minutos = null
  where id = etapa_finalizacao_id;
end;
$$;

commit;
