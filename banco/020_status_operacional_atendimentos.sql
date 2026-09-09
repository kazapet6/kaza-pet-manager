begin;

alter table public.atendimentos
  drop constraint if exists atendimentos_status_check;

alter table public.atendimentos
  add constraint atendimentos_status_check check (
    status in (
      'agendado', 'confirmado', 'recebido', 'em_atendimento',
      'aguardando_retirada', 'aguardando_entrega', 'concluido',
      'cancelado', 'faltou'
    )
  ),
  add column recebido_em timestamptz,
  add column iniciado_em timestamptz,
  add column finalizado_em timestamptz,
  add column concluido_em timestamptz;

create or replace function public.validar_transicao_status_atendimento()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_modalidade text;
  v_transicao_valida boolean := false;
begin
  if new.status = old.status then
    return new;
  end if;

  select grupo.modalidade into v_modalidade
  from public.grupos_agendamento grupo
  where grupo.id = new.grupo_agendamento_id;

  v_transicao_valida :=
    (old.status = 'agendado' and new.status in ('confirmado', 'recebido'))
    or (old.status = 'confirmado' and new.status = 'recebido')
    or (old.status = 'recebido' and new.status = 'em_atendimento')
    or (old.status = 'em_atendimento' and (
      (v_modalidade = 'normal' and new.status = 'aguardando_retirada')
      or (v_modalidade = 'taxidog' and new.status = 'aguardando_entrega')
    ))
    or (old.status = 'aguardando_retirada'
      and v_modalidade = 'normal' and new.status = 'concluido')
    or (old.status = 'aguardando_entrega'
      and v_modalidade = 'taxidog' and new.status = 'concluido');

  if not v_transicao_valida then
    raise exception 'Transicao de status do atendimento nao permitida.'
      using errcode = '23514';
  end if;

  if new.status = 'recebido' then
    new.recebido_em := coalesce(old.recebido_em, statement_timestamp());
  elsif new.status = 'em_atendimento' then
    new.iniciado_em := coalesce(old.iniciado_em, statement_timestamp());
  elsif new.status in ('aguardando_retirada', 'aguardando_entrega') then
    new.finalizado_em := coalesce(old.finalizado_em, statement_timestamp());
  elsif new.status = 'concluido' then
    new.concluido_em := coalesce(old.concluido_em, statement_timestamp());
  end if;

  return new;
end;
$$;

revoke all on function public.validar_transicao_status_atendimento()
  from public, anon, authenticated;

create trigger atendimentos_validar_transicao_status
before update of status on public.atendimentos
for each row execute function public.validar_transicao_status_atendimento();

-- Atualiza as três funções instaladas pela 008 sem reescrever sua lógica de
-- capacidade. A migration falha se a lista histórica esperada não existir.
do $$
declare
  v_funcao regprocedure;
  v_definicao text;
  v_atualizada text;
begin
  foreach v_funcao in array array[
    'public.validar_reserva_funcionario()'::regprocedure,
    'public.validar_capacidade_unidade_equipamento()'::regprocedure,
    'public.revalidar_reservas_ao_ativar_atendimento()'::regprocedure
  ]
  loop
    v_definicao := pg_get_functiondef(v_funcao);
    v_atualizada := regexp_replace(
      v_definicao,
      '''agendado'',\s*''confirmado'',\s*''aguardando_retirada'',\s*''aguardando_entrega''',
      '''agendado'', ''confirmado'', ''recebido'', ''em_atendimento'', ''aguardando_retirada'', ''aguardando_entrega''',
      'g'
    );
    if v_atualizada = v_definicao then
      raise exception 'Lista bloqueante nao encontrada em %.', v_funcao;
    end if;
    execute v_atualizada;
  end loop;
end;
$$;

-- A escrita operacional passa exclusivamente pela fronteira backend.
revoke insert, update, delete on table public.atendimentos
  from public, anon, authenticated;
drop policy if exists atendimentos_insert_sem_autenticacao
  on public.atendimentos;
drop policy if exists atendimentos_update_sem_autenticacao
  on public.atendimentos;
grant select, insert, update, delete on table public.atendimentos
  to service_role;

commit;
