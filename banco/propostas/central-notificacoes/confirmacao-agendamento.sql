begin;

create schema mensageria_interna;
revoke all on schema mensageria_interna from public, anon, authenticated;

-- O cadastro legado não tem empresa ou unidade. A atribuição é explícita
-- e somente a operação administrativa pode gravar estes vínculos.
create table mensageria_interna.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (btrim(nome) <> '')
);

create table mensageria_interna.unidades (
  empresa_id uuid not null references mensageria_interna.empresas(id),
  unidade_id uuid not null default gen_random_uuid(),
  nome text not null check (btrim(nome) <> ''),
  confirmacao_ativa boolean not null default false,
  primary key (empresa_id, unidade_id)
);

create table mensageria_interna.clientes_unidades (
  cliente_id text primary key references public.clientes(id) on update cascade on delete restrict,
  empresa_id uuid not null,
  unidade_id uuid not null,
  foreign key (empresa_id, unidade_id) references mensageria_interna.unidades (empresa_id, unidade_id)
);

create table mensageria_interna.acessos_unidades (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  empresa_id uuid not null,
  unidade_id uuid not null,
  primary key (usuario_id, empresa_id, unidade_id),
  foreign key (empresa_id, unidade_id) references mensageria_interna.unidades (empresa_id, unidade_id)
);

alter table mensageria_interna.empresas enable row level security;
alter table mensageria_interna.unidades enable row level security;
alter table mensageria_interna.clientes_unidades enable row level security;
alter table mensageria_interna.acessos_unidades enable row level security;

create index mensageria_clientes_unidades_escopo_idx
  on mensageria_interna.clientes_unidades (empresa_id, unidade_id);
create index mensageria_acessos_unidades_escopo_idx
  on mensageria_interna.acessos_unidades (empresa_id, unidade_id);

revoke all on all tables in schema mensageria_interna from public, anon, authenticated;
grant usage on schema mensageria_interna to service_role;
grant select, insert, update, delete on all tables in schema mensageria_interna to service_role;

alter table public.mensageria_empresa
  add column gerar_confirmacao_agendamento boolean not null default false;

update public.mensageria_eventos_catalogo
set status = 'definido', conectavel = true, descricao = 'Geração de pendência após confirmação transacional na Agenda.'
where codigo = 'NOVO_AGENDAMENTO';

alter table public.mensageria_eventos
  add column empresa_id uuid,
  add column unidade_id uuid,
  add constraint mensageria_evento_unidade_fk
    foreign key (empresa_id, unidade_id)
    references mensageria_interna.unidades (empresa_id, unidade_id) match full;

-- O pacote HML já provê status_meta e status_meta_at. Na fundação 040/041
-- pura, as colunas habilitam a mesma projeção quando o status for integrado.
alter table public.mensageria_mensagens
  add column if not exists status_meta text,
  add column if not exists status_meta_at timestamptz,
  add column cancelamento_motivo text;

create index mensageria_eventos_confirmacao_unidade_idx
  on public.mensageria_eventos (empresa_id, unidade_id, id)
  where evento_codigo = 'NOVO_AGENDAMENTO' and empresa_id is not null;
create index mensageria_eventos_confirmacao_atendimento_idx
  on public.mensageria_eventos (atendimento_id)
  where evento_codigo = 'NOVO_AGENDAMENTO' and empresa_id is not null;
create index mensageria_mensagens_evento_idx on public.mensageria_mensagens (evento_id);

create function mensageria_interna.enfileirar_confirmacao_agendamento(p_atendimento uuid, p_empresa uuid, p_unidade uuid)
returns void
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_elegivel record;
  v_evento_id uuid;
  v_ocorrencia text := 'atendimento:' || p_atendimento::text;
begin
  select g.id grupo_id, g.cliente_id, g.modalidade, g.data_operacional,
    g.horario_chegada_comprometido, a.pet_id, d.id destinatario_id,
    r.id regra_id, r.modelo_versao_id
  into v_elegivel
  from public.atendimentos a
  join public.grupos_agendamento g on g.id = a.grupo_agendamento_id
  join public.pets p on p.id = a.pet_id and p.cliente_id = g.cliente_id
  join mensageria_interna.clientes_unidades cu on cu.cliente_id = g.cliente_id
  join mensageria_interna.unidades u on (u.empresa_id, u.unidade_id) = (cu.empresa_id, cu.unidade_id)
  join public.mensageria_empresa c on c.id and c.gerar_confirmacao_agendamento
  join public.mensageria_destinatarios d on d.cliente_id = g.cliente_id and d.ativo and d.consentimento
  join public.mensageria_eventos_catalogo ec on ec.codigo = 'NOVO_AGENDAMENTO' and ec.status = 'definido' and ec.conectavel
  join public.mensageria_regras r on r.evento_codigo = ec.codigo and r.nome = 'padrao_sistema' and r.ativo
  join public.mensageria_modelo_versoes v on v.id = r.modelo_versao_id
  join public.mensageria_modelos m on m.id = v.modelo_id and m.ativo and m.contexto = 'agenda'
  left join public.mensageria_preferencias pref on pref.destinatario_id = d.id and pref.evento_codigo = r.evento_codigo
  where a.id = p_atendimento and a.status = 'agendado' and a.tipo_planejamento = 'regular'
    and g.origem = 'interno' and g.chave_idempotencia is not null
    and (u.empresa_id, u.unidade_id) = (p_empresa, p_unidade)
    and u.confirmacao_ativa and coalesce(pref.permitido, true)
    and d.telefone ~ '^\+[1-9][0-9]{7,14}$'
    and v.estado in ('padrao_sistema', 'publicada');

  if not found then
    return;
  end if;

  insert into public.mensageria_eventos (
    evento_codigo, chave_ocorrencia, cliente_id, pet_id, atendimento_id, empresa_id, unidade_id, contexto
  ) values (
    'NOVO_AGENDAMENTO', v_ocorrencia, v_elegivel.cliente_id, v_elegivel.pet_id, p_atendimento,
    p_empresa, p_unidade,
    jsonb_build_object(
      'grupo_agendamento_id', v_elegivel.grupo_id,
      'modalidade', v_elegivel.modalidade,
      'data_operacional', v_elegivel.data_operacional,
      'horario_chegada_comprometido', v_elegivel.horario_chegada_comprometido
    )
  ) on conflict (evento_codigo, chave_ocorrencia) do nothing
  returning id into v_evento_id;

  if v_evento_id is not null then
    insert into public.mensageria_mensagens (
      evento_id, regra_id, destinatario_id, modelo_versao_id, chave_comunicacao
    ) values (
      v_evento_id, v_elegivel.regra_id, v_elegivel.destinatario_id, v_elegivel.modelo_versao_id,
      'whatsapp:novo_agendamento:' || p_empresa || ':' || v_ocorrencia
    );
  end if;
end;
$$;

-- A Edge envia o UUID validado pelo Auth, fora do plano fornecido ao RPC
-- legado. Reutilizar a confirmação existente mantém reservas e fila no mesmo commit.
create function mensageria_interna.confirmar_agendamento(p_plano jsonb, p_operador uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_empresa uuid;
  v_unidade uuid;
  v_resultado jsonb;
begin
  select cu.empresa_id, cu.unidade_id into v_empresa, v_unidade
  from public.pets p
  join mensageria_interna.clientes_unidades cu on cu.cliente_id = p.cliente_id
  where p.id = p_plano#>>'{atendimento,petId}'
  for share of p, cu;

  if not exists (
    select 1 from auth.users u
    where u.id = p_operador and u.raw_app_meta_data->>'role' = 'internal'
  ) or (v_empresa is not null and not exists (
    select 1 from mensageria_interna.acessos_unidades au
    where (au.usuario_id, au.empresa_id, au.unidade_id) = (p_operador, v_empresa, v_unidade)
  )) then
    return jsonb_build_object('status', 'erro', 'codigo', 'SEM_ACESSO_A_UNIDADE',
      'mensagem', 'Operador sem acesso à unidade do agendamento.');
  end if;

  v_resultado := public.confirmar_agendamento_transacional(p_plano);
  if v_empresa is not null and v_resultado->>'codigo' = 'CONFIRMADO'
    and v_resultado->>'reutilizadoPorIdempotencia' = 'false' then
    perform mensageria_interna.enfileirar_confirmacao_agendamento(
      (v_resultado->>'atendimentoId')::uuid, v_empresa, v_unidade
    );
  end if;
  return v_resultado;
end;
$$;

create function mensageria_interna.cancelar_confirmacao_desatualizada()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  update public.mensageria_mensagens m
  set status = 'cancelada', cancelamento_motivo = case
        when new.status in ('cancelado', 'faltou') then new.status
        else 'agendamento_alterado'
      end,
      updated_at = statement_timestamp()
  from public.mensageria_eventos e
  where m.evento_id = e.id and e.evento_codigo = 'NOVO_AGENDAMENTO' and e.empresa_id is not null
    and e.atendimento_id = new.id and m.status = 'pendente' and m.status_meta is null;
  return new;
end;
$$;

create trigger mensageria_confirmacao_alterada
after update on public.atendimentos
for each row when (
  (old.status is distinct from new.status and new.status in ('cancelado', 'faltou'))
  or (old.grupo_agendamento_id, old.pet_id, old.inicio_planejado, old.horario_chegada_comprometido)
    is distinct from (new.grupo_agendamento_id, new.pet_id, new.inicio_planejado, new.horario_chegada_comprometido)
)
execute function mensageria_interna.cancelar_confirmacao_desatualizada();

create function mensageria_interna.cancelar_confirmacao_grupo_alterado()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  update public.mensageria_mensagens m
  set status = 'cancelada', cancelamento_motivo = 'agendamento_alterado', updated_at = statement_timestamp()
  from public.mensageria_eventos e
  join public.atendimentos a on a.id = e.atendimento_id
  where m.evento_id = e.id and e.evento_codigo = 'NOVO_AGENDAMENTO' and e.empresa_id is not null
    and a.grupo_agendamento_id = new.id and m.status = 'pendente' and m.status_meta is null;
  return new;
end;
$$;

create trigger mensageria_confirmacao_grupo_alterado
after update on public.grupos_agendamento
for each row when (
  (old.cliente_id, old.data_operacional, old.horario_chegada_comprometido, old.modalidade,
   old.taxidog_ciclo_id, old.taxidog_coleta_inicio_snapshot, old.taxidog_coleta_fim_snapshot)
  is distinct from
  (new.cliente_id, new.data_operacional, new.horario_chegada_comprometido, new.modalidade,
   new.taxidog_ciclo_id, new.taxidog_coleta_inicio_snapshot, new.taxidog_coleta_fim_snapshot)
)
execute function mensageria_interna.cancelar_confirmacao_grupo_alterado();

create function mensageria_interna.listar_confirmacoes(
  p_empresa uuid, p_unidade uuid, p_status text, p_limite integer,
  p_antes_em timestamptz, p_antes_id uuid
)
returns table (
  id uuid, empresa_id uuid, unidade_id uuid, atendimento_id uuid, grupo_agendamento_id uuid,
  cliente_id text, pet_id text, evento text, status text, status_meta text, status_meta_at timestamptz,
  cancelamento_motivo text, criado_em timestamptz, atualizado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_usuario uuid := auth.uid();
begin
  if v_usuario is null or auth.jwt()->'app_metadata'->>'role' is distinct from 'internal'
    or not exists (
      select 1 from mensageria_interna.acessos_unidades au
      join auth.users u on u.id = au.usuario_id and u.raw_app_meta_data->>'role' = 'internal'
      where au.usuario_id = v_usuario and au.empresa_id = p_empresa and au.unidade_id = p_unidade
    ) then
    raise exception 'SEM_ACESSO_A_UNIDADE' using errcode = '42501';
  end if;

  if p_limite is null or p_limite not between 1 and 100
    or (p_antes_em is null) <> (p_antes_id is null)
    or (p_status is not null and p_status not in (
      'pendente', 'processando', 'enviada', 'entregue', 'falha', 'resultado_incerto', 'cancelada'
    )) then
    raise exception 'FILTRO_INVALIDO' using errcode = '22023';
  end if;

  return query
  select m.id, e.empresa_id, e.unidade_id, e.atendimento_id,
    (e.contexto->>'grupo_agendamento_id')::uuid, e.cliente_id, e.pet_id, e.evento_codigo,
    s.estado, m.status_meta, m.status_meta_at, m.cancelamento_motivo, m.created_at, m.updated_at
  from public.mensageria_eventos e
  join public.mensageria_mensagens m on m.evento_id = e.id
  cross join lateral (select case
    when m.status_meta in ('delivered', 'read') then 'entregue'
    when m.status_meta = 'failed' or m.status = 'falhou' then 'falha'
    else m.status
  end as estado) s
  where e.evento_codigo = 'NOVO_AGENDAMENTO' and e.empresa_id = p_empresa and e.unidade_id = p_unidade
    and (p_status is null or s.estado = p_status)
    and (p_antes_em is null or (m.created_at, m.id) < (p_antes_em, p_antes_id))
  order by m.created_at desc, m.id desc
  limit p_limite;
end;
$$;

revoke all on all functions in schema mensageria_interna from public, anon, authenticated;
grant usage on schema mensageria_interna to authenticated;
grant execute on function mensageria_interna.listar_confirmacoes(uuid, uuid, text, integer, timestamptz, uuid)
  to authenticated;
grant execute on function mensageria_interna.confirmar_agendamento(jsonb, uuid) to service_role;

create function public.mensageria_confirmar_agendamento(p_plano jsonb, p_operador uuid)
returns jsonb
language sql
security invoker
set search_path = pg_catalog
as $$
  select mensageria_interna.confirmar_agendamento(p_plano, p_operador);
$$;

revoke all on function public.mensageria_confirmar_agendamento(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.mensageria_confirmar_agendamento(jsonb, uuid) to service_role;

create function public.mensageria_listar_confirmacoes(
  p_empresa uuid, p_unidade uuid, p_status text default null, p_limite integer default 30,
  p_antes_em timestamptz default null, p_antes_id uuid default null
)
returns table (
  id uuid, empresa_id uuid, unidade_id uuid, atendimento_id uuid, grupo_agendamento_id uuid,
  cliente_id text, pet_id text, evento text, status text, status_meta text, status_meta_at timestamptz,
  cancelamento_motivo text, criado_em timestamptz, atualizado_em timestamptz
)
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select * from mensageria_interna.listar_confirmacoes(
    p_empresa, p_unidade, p_status, p_limite, p_antes_em, p_antes_id
  );
$$;

revoke all on function public.mensageria_listar_confirmacoes(uuid, uuid, text, integer, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.mensageria_listar_confirmacoes(uuid, uuid, text, integer, timestamptz, uuid)
  to authenticated;

commit;
