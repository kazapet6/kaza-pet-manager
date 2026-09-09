begin;

alter table public.atendimentos
  add column retornos_versao bigint not null default 0,
  add constraint atendimentos_retornos_versao_check check (retornos_versao >= 0);

create table public.atendimento_financeiro (
  atendimento_id uuid primary key references public.atendimentos(id) on delete cascade,
  isento boolean not null default false,
  versao bigint not null default 0 check (versao >= 0),
  updated_at timestamptz not null default now()
);

create table public.atendimento_recebimentos (
  id uuid primary key default gen_random_uuid(),
  atendimento_id uuid not null references public.atendimentos(id) on delete restrict,
  valor numeric(10,2) not null check (valor > 0),
  forma_pagamento text not null check (forma_pagamento in ('pix','dinheiro','debito','credito','outro')),
  recebido_em timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default now(),
  chave_idempotencia uuid not null unique
);
create index atendimento_recebimentos_atendimento_idx on public.atendimento_recebimentos(atendimento_id);

create table public.atendimento_recomendacoes_retorno (
  atendimento_servico_id uuid primary key references public.atendimento_servicos(id) on delete cascade,
  intervalo_dias integer not null check (intervalo_dias between 1 and 3650),
  data_recomendada date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.atendimento_financeiro enable row level security;
alter table public.atendimento_recebimentos enable row level security;
alter table public.atendimento_recomendacoes_retorno enable row level security;
revoke all on public.atendimento_financeiro, public.atendimento_recebimentos,
  public.atendimento_recomendacoes_retorno from public, anon, authenticated;
grant select, insert, update on public.atendimento_financeiro to service_role;
grant select, insert on public.atendimento_recebimentos to service_role;
grant select, insert, update, delete on public.atendimento_recomendacoes_retorno to service_role;

create or replace function public.registrar_recebimento_atendimento(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_atendimento_id uuid := (p_payload->>'atendimentoId')::uuid;
  v_chave uuid := (p_payload->>'chaveIdempotencia')::uuid;
  v_valor numeric(10,2) := (p_payload->>'valor')::numeric;
  v_forma text := p_payload->>'formaPagamento';
  v_atendimento public.atendimentos%rowtype;
  v_financeiro public.atendimento_financeiro%rowtype;
  v_existente public.atendimento_recebimentos%rowtype;
  v_total numeric(10,2);
begin
  select item.* into v_existente from public.atendimento_recebimentos item where item.chave_idempotencia = v_chave;
  if found then
    if v_existente.atendimento_id <> v_atendimento_id or v_existente.valor <> v_valor or v_existente.forma_pagamento <> v_forma then
      return jsonb_build_object('status','conflito','codigo','IDEMPOTENCIA_CONFLITANTE','mensagem','A chave de recebimento ja foi usada com outros dados.');
    end if;
    return jsonb_build_object('status','registrado','recebimentoId',v_existente.id,'reutilizado',true);
  end if;
  if v_valor <= 0 or v_forma not in ('pix','dinheiro','debito','credito','outro') then
    return jsonb_build_object('status','invalido','codigo','RECEBIMENTO_INVALIDO','mensagem','Valor ou forma de pagamento invalida.');
  end if;
  select item.* into v_atendimento from public.atendimentos item where item.id = v_atendimento_id for update;
  if not found then return jsonb_build_object('status','invalido','codigo','ATENDIMENTO_NAO_ENCONTRADO','mensagem','Atendimento nao encontrado.'); end if;
  insert into public.atendimento_financeiro(atendimento_id) values(v_atendimento_id) on conflict do nothing;
  select item.* into v_financeiro from public.atendimento_financeiro item where item.atendimento_id = v_atendimento_id for update;
  if v_financeiro.isento then return jsonb_build_object('status','invalido','codigo','ATENDIMENTO_ISENTO','mensagem','Atendimento isento nao aceita recebimentos.'); end if;
  select coalesce(sum(item.valor),0)::numeric(10,2) into v_total from public.atendimento_recebimentos item where item.atendimento_id = v_atendimento_id;
  if v_total + v_valor > v_atendimento.valor_final then return jsonb_build_object('status','invalido','codigo','VALOR_SUPERA_SALDO','mensagem','O recebimento supera o saldo disponivel.'); end if;
  insert into public.atendimento_recebimentos(atendimento_id,valor,forma_pagamento,chave_idempotencia)
  values(v_atendimento_id,v_valor,v_forma,v_chave) returning * into v_existente;
  update public.atendimento_financeiro item set versao=item.versao+1,updated_at=statement_timestamp() where item.atendimento_id=v_atendimento_id;
  return jsonb_build_object('status','registrado','recebimentoId',v_existente.id,'reutilizado',false);
exception when unique_violation then
  return public.registrar_recebimento_atendimento(p_payload);
end; $$;

create or replace function public.definir_isencao_atendimento(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_id uuid := (p_payload->>'atendimentoId')::uuid; v_esperada bigint := (p_payload->>'versaoEsperada')::bigint; v_isento boolean := (p_payload->>'isento')::boolean; v_item public.atendimento_financeiro%rowtype; v_total numeric;
begin
  perform 1 from public.atendimentos item where item.id=v_id for update;
  if not found then return jsonb_build_object('status','invalido','codigo','ATENDIMENTO_NAO_ENCONTRADO','mensagem','Atendimento nao encontrado.'); end if;
  insert into public.atendimento_financeiro(atendimento_id) values(v_id) on conflict do nothing;
  select item.* into v_item from public.atendimento_financeiro item where item.atendimento_id=v_id for update;
  if v_item.versao <> v_esperada then return jsonb_build_object('status','conflito','codigo','FINANCEIRO_ALTERADO','mensagem','Os dados financeiros foram alterados.'); end if;
  select coalesce(sum(item.valor),0) into v_total from public.atendimento_recebimentos item where item.atendimento_id=v_id;
  if v_isento and v_total > 0 then return jsonb_build_object('status','invalido','codigo','ISENCAO_COM_RECEBIMENTOS','mensagem','Nao e possivel isentar atendimento com recebimentos.'); end if;
  update public.atendimento_financeiro item set isento=v_isento,versao=item.versao+1,updated_at=statement_timestamp() where item.atendimento_id=v_id returning * into v_item;
  return jsonb_build_object('status','atualizado','versao',v_item.versao,'isento',v_item.isento);
end; $$;

create or replace function public.salvar_retornos_atendimento(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_id uuid := (p_payload->>'atendimentoId')::uuid; v_esperada bigint := (p_payload->>'versaoEsperada')::bigint; v_itens jsonb := p_payload->'recomendacoes'; v_data date; v_atual bigint;
begin
  select grupo.data_operacional,item.retornos_versao into v_data,v_atual from public.atendimentos item join public.grupos_agendamento grupo on grupo.id=item.grupo_agendamento_id where item.id=v_id for update of item;
  if not found then return jsonb_build_object('status','invalido','codigo','ATENDIMENTO_NAO_ENCONTRADO','mensagem','Atendimento nao encontrado.'); end if;
  if v_atual <> v_esperada then return jsonb_build_object('status','conflito','codigo','RETORNOS_ALTERADOS','mensagem','As recomendacoes foram alteradas.'); end if;
  if jsonb_typeof(v_itens) <> 'array'
    or (select count(*) from jsonb_to_recordset(v_itens) x("atendimentoServicoId" uuid,"intervaloDias" integer))
      <> (select count(distinct x."atendimentoServicoId") from jsonb_to_recordset(v_itens) x("atendimentoServicoId" uuid,"intervaloDias" integer))
    or exists(select 1 from jsonb_to_recordset(v_itens) x("atendimentoServicoId" uuid,"intervaloDias" integer) where x."intervaloDias" not between 1 and 3650 or not exists(select 1 from public.atendimento_servicos s where s.id=x."atendimentoServicoId" and s.atendimento_id=v_id)) then
    return jsonb_build_object('status','invalido','codigo','RETORNO_INVALIDO','mensagem','Recomendacao de retorno invalida.');
  end if;
  delete from public.atendimento_recomendacoes_retorno r using public.atendimento_servicos s where r.atendimento_servico_id=s.id and s.atendimento_id=v_id;
  insert into public.atendimento_recomendacoes_retorno(atendimento_servico_id,intervalo_dias,data_recomendada)
  select x."atendimentoServicoId",x."intervaloDias",v_data+x."intervaloDias" from jsonb_to_recordset(v_itens) x("atendimentoServicoId" uuid,"intervaloDias" integer);
  update public.atendimentos item set retornos_versao=item.retornos_versao+1 where item.id=v_id returning item.retornos_versao into v_atual;
  return jsonb_build_object('status','salvo','versao',v_atual);
end; $$;

revoke all on function public.registrar_recebimento_atendimento(jsonb), public.definir_isencao_atendimento(jsonb), public.salvar_retornos_atendimento(jsonb) from public,anon,authenticated;
grant execute on function public.registrar_recebimento_atendimento(jsonb), public.definir_isencao_atendimento(jsonb), public.salvar_retornos_atendimento(jsonb) to service_role;
commit;
