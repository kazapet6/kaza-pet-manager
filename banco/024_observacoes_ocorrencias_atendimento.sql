begin;

alter table public.atendimentos
  add column observacao_operacional text,
  add column observacoes_versao bigint not null default 0,
  add constraint atendimentos_observacao_operacional_tamanho_check
    check (observacao_operacional is null or char_length(observacao_operacional) <= 1000),
  add constraint atendimentos_observacoes_versao_check check (observacoes_versao >= 0);

create table public.atendimento_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  atendimento_id uuid not null references public.atendimentos(id) on delete cascade,
  tipo text not null check (tipo in (
    'tranquilo', 'agitado', 'medroso', 'agressivo', 'muitos_nos',
    'pele_avermelhada', 'ferida_aparente', 'queda_excessiva_pelos',
    'pulgas', 'carrapatos', 'unhas_muito_grandes', 'ouvido_aspecto_incomum'
  )),
  created_at timestamptz not null default now(),
  unique (atendimento_id, tipo)
);

create index atendimento_ocorrencias_atendimento_idx
  on public.atendimento_ocorrencias (atendimento_id);
alter table public.atendimento_ocorrencias enable row level security;
revoke all on public.atendimento_ocorrencias from public, anon, authenticated;
grant select, insert, delete on public.atendimento_ocorrencias to service_role;

create or replace function public.salvar_observacoes_atendimento(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_atendimento_id uuid;
  v_versao_esperada bigint;
  v_observacao text;
  v_ocorrencias jsonb;
  v_atual public.atendimentos%rowtype;
  v_total integer;
  v_distintos integer;
begin
  begin
    v_atendimento_id := (p_payload ->> 'atendimentoId')::uuid;
    v_versao_esperada := (p_payload ->> 'versaoEsperada')::bigint;
    v_ocorrencias := p_payload -> 'ocorrencias';
    v_observacao := nullif(btrim(p_payload ->> 'observacao'), '');
  exception when others then
    return jsonb_build_object('status','invalido','codigo','INTENCAO_INVALIDA','mensagem','Dados de observacoes invalidos.');
  end;

  if v_ocorrencias is null or jsonb_typeof(v_ocorrencias) <> 'array'
    or v_versao_esperada is null
  then
    return jsonb_build_object('status','invalido','codigo','INTENCAO_INVALIDA','mensagem','Dados de observacoes invalidos.');
  end if;
  if v_observacao is not null and char_length(v_observacao) > 1000 then
    return jsonb_build_object('status','invalido','codigo','OBSERVACAO_MUITO_LONGA','mensagem','A observacao deve ter no maximo 1000 caracteres.');
  end if;

  select item.* into v_atual from public.atendimentos item
  where item.id = v_atendimento_id for update;
  if not found then
    return jsonb_build_object('status','invalido','codigo','ATENDIMENTO_NAO_ENCONTRADO','mensagem','Atendimento nao encontrado.');
  end if;
  if v_atual.status not in (
    'agendado', 'confirmado', 'recebido', 'em_atendimento',
    'aguardando_retirada', 'aguardando_entrega'
  ) then
    return jsonb_build_object('status','invalido','codigo','ATENDIMENTO_SOMENTE_LEITURA','mensagem','Este atendimento permite somente leitura das observacoes.');
  end if;
  if v_atual.observacoes_versao <> v_versao_esperada then
    return jsonb_build_object('status','conflito','codigo','OBSERVACOES_ALTERADAS','mensagem','As observacoes foram alteradas por outro usuario.','versaoAtual',v_atual.observacoes_versao);
  end if;

  select count(*), count(distinct valor)
  into v_total, v_distintos
  from jsonb_array_elements_text(v_ocorrencias) item(valor);
  if v_total <> v_distintos then
    return jsonb_build_object('status','invalido','codigo','OCORRENCIA_DUPLICADA','mensagem','Uma ocorrencia nao pode ser informada mais de uma vez.');
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(v_ocorrencias) item(valor)
    where valor not in (
      'tranquilo', 'agitado', 'medroso', 'agressivo', 'muitos_nos',
      'pele_avermelhada', 'ferida_aparente', 'queda_excessiva_pelos',
      'pulgas', 'carrapatos', 'unhas_muito_grandes', 'ouvido_aspecto_incomum'
    )
  ) then
    return jsonb_build_object('status','invalido','codigo','OCORRENCIA_INVALIDA','mensagem','Tipo de ocorrencia desconhecido.');
  end if;

  delete from public.atendimento_ocorrencias item
  where item.atendimento_id = v_atendimento_id;
  insert into public.atendimento_ocorrencias (atendimento_id, tipo)
  select v_atendimento_id, item.valor
  from jsonb_array_elements_text(v_ocorrencias) item(valor);
  update public.atendimentos item
  set observacao_operacional = v_observacao,
      observacoes_versao = item.observacoes_versao + 1
  where item.id = v_atendimento_id
  returning item.* into v_atual;

  return jsonb_build_object(
    'status','salvo','atendimentoId',v_atendimento_id,
    'versao',v_atual.observacoes_versao,
    'observacao',v_atual.observacao_operacional,
    'ocorrencias',v_ocorrencias
  );
end;
$$;

revoke all on function public.salvar_observacoes_atendimento(jsonb)
  from public, anon, authenticated;
grant execute on function public.salvar_observacoes_atendimento(jsonb)
  to service_role;

commit;
