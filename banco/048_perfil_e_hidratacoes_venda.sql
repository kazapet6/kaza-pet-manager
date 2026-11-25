begin;

alter table public.contratos
  alter column pet_especie_snapshot drop not null,
  alter column pet_raca_id_snapshot drop not null,
  alter column pet_raca_nome_snapshot drop not null,
  alter column pet_porte_snapshot drop not null,
  alter column pet_pelagem_snapshot drop not null,
  alter column pet_temperamento_snapshot drop not null,
  drop constraint contratos_pet_raca_nome_snapshot_check,
  add constraint contratos_pet_raca_nome_snapshot_check
    check (pet_raca_nome_snapshot is null or nullif(btrim(pet_raca_nome_snapshot), '') is not null);

-- Preserva o hash das vendas anteriores e das novas vendas sem distribuição manual.
create or replace function public.normalizar_intencao_comercial_venda_042(p_intencao jsonb)
returns jsonb language sql immutable set search_path=pg_catalog as $$
  select jsonb_build_object(
    'clienteId',p_intencao->>'clienteId',
    'petId',p_intencao->>'petId',
    'pacoteId',p_intencao->>'pacoteId',
    'pacoteVersaoEsperada',(p_intencao->>'pacoteVersaoEsperada')::bigint,
    'valorContratado',(p_intencao->>'valorContratado')::numeric,
    'motivoAjusteValor',nullif(btrim(p_intencao->>'motivoAjusteValor'),''),
    'dataAncora',p_intencao->>'dataAncora',
    'diaSemanaFixo',(p_intencao->>'diaSemanaFixo')::smallint,
    'horarioFixo',left(p_intencao->>'horarioFixo',5),
    'modalidadeTransporte',p_intencao->>'modalidadeTransporte',
    'taxidogCicloId',nullif(p_intencao->>'taxidogCicloId',''),
    'funcionarioResponsavelId',p_intencao->>'funcionarioResponsavelId',
    'renovacaoAutomatica',(p_intencao->>'renovacaoAutomatica')::boolean
  ) || case when jsonb_typeof(p_intencao->'hidratacoesNosBanhos') = 'array'
    then jsonb_build_object('hidratacoesNosBanhos', p_intencao->'hidratacoesNosBanhos')
    else '{}'::jsonb end;
$$;

commit;
