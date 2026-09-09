begin;

-- 032 — cada linha de contrato_ciclo_ocorrencia_itens é uma unidade
-- comercial. O status operacional do atendimento continua sendo outro domínio.
alter table public.contrato_ciclo_ocorrencia_itens
  add column if not exists estado_comercial text,
  add column if not exists estado_comercial_versao bigint not null default 1,
  add column if not exists estado_comercial_atualizado_em timestamptz not null default now();

alter table public.contrato_ciclos
  add column if not exists encerramento_pendente boolean not null default false,
  add column if not exists versao_creditos bigint not null default 1;

alter table public.contrato_ciclo_ocorrencias
  drop constraint if exists contrato_ciclo_ocorrencias_estado_check,
  drop constraint if exists contrato_ciclo_ocorrencias_check1;
alter table public.contrato_ciclo_ocorrencias
  add constraint contrato_ciclo_ocorrencias_estado_check
    check (estado in ('reservada','materializada','concluida','cancelada','faltou')),
  add constraint contrato_ciclo_ocorrencias_vinculo_operacional_032_check
    check ((estado='reservada' and atendimento_id is null and materializada_em is null)
      or (estado in ('materializada','concluida','faltou') and atendimento_id is not null and materializada_em is not null)
      or estado='cancelada');

-- Não há inferência silenciosa de consumo legado. Um atendimento já concluído
-- antes da 032 exige revisão administrativa explícita.
update public.contrato_ciclo_ocorrencia_itens item
set estado_comercial = case
  when atendimento.id is null then 'reservado'
  when atendimento.status = 'concluido' then 'revisao_legado'
  when atendimento.status = 'faltou' then 'aguardando_decisao'
  when atendimento.status = 'cancelado' then 'disponivel'
  else 'reservado'
end
from public.contrato_ciclo_ocorrencias ocorrencia
left join public.atendimentos atendimento on atendimento.id=ocorrencia.atendimento_id
where ocorrencia.id=item.ocorrencia_id and item.estado_comercial is null;

alter table public.contrato_ciclo_ocorrencia_itens
  alter column estado_comercial set default 'reservado',
  alter column estado_comercial set not null,
  drop constraint if exists contrato_ciclo_ocorrencia_itens_estado_comercial_check,
  drop constraint if exists contrato_ciclo_ocorrencia_itens_versao_check;
alter table public.contrato_ciclo_ocorrencia_itens
  add constraint contrato_ciclo_ocorrencia_itens_estado_comercial_check
    check (estado_comercial in ('reservado','disponivel','aguardando_decisao','revisao_legado','consumido','perdido')),
  add constraint contrato_ciclo_ocorrencia_itens_versao_check
    check (estado_comercial_versao > 0);

create index if not exists contrato_creditos_ciclo_estado_032_idx
on public.contrato_ciclo_ocorrencia_itens(ciclo_id,estado_comercial);
create index if not exists contrato_creditos_item_estado_032_idx
on public.contrato_ciclo_ocorrencia_itens(contrato_item_id,estado_comercial);

create table if not exists public.atendimento_status_eventos (
  id uuid primary key default gen_random_uuid(),
  atendimento_id uuid not null references public.atendimentos(id) on delete restrict,
  status_anterior text,
  status_novo text not null,
  origem text not null check (origem=lower(btrim(origem)) and char_length(origem) between 1 and 60),
  responsavel_id uuid,
  motivo text,
  ocorrido_em timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default now(),
  check (status_anterior is null or status_anterior in ('agendado','confirmado','recebido','em_atendimento','aguardando_retirada','aguardando_entrega','concluido','cancelado','faltou')),
  check (status_novo in ('agendado','confirmado','recebido','em_atendimento','aguardando_retirada','aguardando_entrega','concluido','cancelado','faltou')),
  check (motivo is null or nullif(btrim(motivo),'') is not null)
);
create index if not exists atendimento_status_eventos_atendimento_032_idx
on public.atendimento_status_eventos(atendimento_id,ocorrido_em,id);

create table if not exists public.contrato_credito_eventos (
  id uuid primary key default gen_random_uuid(),
  ocorrencia_id uuid not null,
  contrato_item_id uuid not null,
  ciclo_id uuid not null references public.contrato_ciclos(id) on delete restrict,
  atendimento_id uuid references public.atendimentos(id) on delete restrict,
  estado_anterior text,
  estado_novo text not null,
  tipo text not null check (tipo=lower(btrim(tipo)) and char_length(tipo) between 1 and 60),
  responsavel_id uuid,
  motivo text,
  ocorrido_em timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default now(),
  foreign key(ocorrencia_id,contrato_item_id)
    references public.contrato_ciclo_ocorrencia_itens(ocorrencia_id,contrato_item_id) on delete restrict,
  check (estado_anterior is null or estado_anterior in ('reservado','disponivel','aguardando_decisao','revisao_legado','consumido','perdido')),
  check (estado_novo in ('reservado','disponivel','aguardando_decisao','revisao_legado','consumido','perdido')),
  check (motivo is null or nullif(btrim(motivo),'') is not null)
);
create index if not exists contrato_credito_eventos_item_032_idx
on public.contrato_credito_eventos(ocorrencia_id,contrato_item_id,ocorrido_em,id);
create index if not exists contrato_credito_eventos_ciclo_032_idx
on public.contrato_credito_eventos(ciclo_id,ocorrido_em,id);

create table if not exists public.contrato_credito_operacoes_idempotentes (
  chave_idempotencia uuid primary key,
  usuario_id uuid not null,
  operacao text not null,
  hash_intencao text not null,
  resposta jsonb not null check(jsonb_typeof(resposta)='object'),
  created_at timestamptz not null default now()
);

insert into public.atendimento_status_eventos(atendimento_id,status_anterior,status_novo,origem)
select distinct ocorrencia.atendimento_id,null,atendimento.status,'migracao_032'
from public.contrato_ciclo_ocorrencias ocorrencia
join public.atendimentos atendimento on atendimento.id=ocorrencia.atendimento_id
where ocorrencia.atendimento_id is not null
  and not exists(select 1 from public.atendimento_status_eventos evento where evento.atendimento_id=ocorrencia.atendimento_id);

insert into public.contrato_credito_eventos(
  ocorrencia_id,contrato_item_id,ciclo_id,atendimento_id,estado_anterior,estado_novo,tipo,responsavel_id,motivo)
select item.ocorrencia_id,item.contrato_item_id,item.ciclo_id,ocorrencia.atendimento_id,null,item.estado_comercial,
  case item.estado_comercial when 'revisao_legado' then 'credito_revisao_legado' else 'credito_inicializado' end,
  ciclo.criado_por,
  case when item.estado_comercial='revisao_legado' then 'Atendimento concluído antes da fonte autoritativa de consumo 032; nenhuma baixa foi inferida.' end
from public.contrato_ciclo_ocorrencia_itens item
join public.contrato_ciclo_ocorrencias ocorrencia on ocorrencia.id=item.ocorrencia_id
join public.contrato_ciclos ciclo on ciclo.id=item.ciclo_id
where not exists(
  select 1 from public.contrato_credito_eventos evento
  where evento.ocorrencia_id=item.ocorrencia_id and evento.contrato_item_id=item.contrato_item_id
);

create or replace function public.impedir_mutacao_evento_credito_032()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  raise exception 'Histórico de crédito é append-only.' using errcode='23514';
end;$$;

drop trigger if exists atendimento_status_eventos_append_only_032 on public.atendimento_status_eventos;
create trigger atendimento_status_eventos_append_only_032
before update or delete on public.atendimento_status_eventos
for each row execute function public.impedir_mutacao_evento_credito_032();
drop trigger if exists contrato_credito_eventos_append_only_032 on public.contrato_credito_eventos;
create trigger contrato_credito_eventos_append_only_032
before update or delete on public.contrato_credito_eventos
for each row execute function public.impedir_mutacao_evento_credito_032();

create or replace function public.recalcular_encerramento_ciclo_032(
  p_ciclo_id uuid,
  p_usuario_id uuid
) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_ciclo public.contrato_ciclos%rowtype;
  v_todas_ocorrencias_encerradas boolean;
  v_possui_saldo_ou_pendencia boolean;
begin
  select * into v_ciclo from public.contrato_ciclos where id=p_ciclo_id for update;
  if not found then return; end if;

  select coalesce(bool_and(estado in ('concluida','cancelada','faltou')),false)
  into v_todas_ocorrencias_encerradas
  from public.contrato_ciclo_ocorrencias where ciclo_id=p_ciclo_id;

  select exists(
    select 1 from public.contrato_ciclo_ocorrencia_itens
    where ciclo_id=p_ciclo_id and estado_comercial not in ('consumido','perdido')
  ) into v_possui_saldo_ou_pendencia;

  if v_todas_ocorrencias_encerradas then
    update public.contrato_ciclos set
      estado='concluido', concluido_em=coalesce(concluido_em,statement_timestamp()),
      encerramento_pendente=v_possui_saldo_ou_pendencia, versao_creditos=versao_creditos+1
    where id=p_ciclo_id;
    if v_ciclo.estado<>'concluido' then
      insert into public.contrato_eventos(contrato_id,tipo,detalhes,registrado_por)
      values(v_ciclo.contrato_id,
        case when v_possui_saldo_ou_pendencia then 'ciclo_encerramento_pendente' else 'ciclo_concluido' end,
        jsonb_build_object('cicloId',p_ciclo_id),p_usuario_id);
    elsif v_ciclo.encerramento_pendente and not v_possui_saldo_ou_pendencia then
      insert into public.contrato_eventos(contrato_id,tipo,detalhes,registrado_por)
      values(v_ciclo.contrato_id,'ciclo_encerramento_resolvido',
        jsonb_build_object('cicloId',p_ciclo_id),p_usuario_id);
    end if;
  elsif v_ciclo.estado='concluido' then
    update public.contrato_ciclos set encerramento_pendente=true,versao_creditos=versao_creditos+1
    where id=p_ciclo_id;
  elsif v_ciclo.estado='reservado' then
    update public.contrato_ciclos set estado='em_andamento',versao_creditos=versao_creditos+1
    where id=p_ciclo_id;
  end if;
end;$$;

create or replace function public.sincronizar_creditos_status_atendimento_032()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_ocorrencia public.contrato_ciclo_ocorrencias%rowtype;
  v_credito public.contrato_ciclo_ocorrencia_itens%rowtype;
  v_usuario uuid;
  v_origem text;
  v_motivo text;
  v_estado_novo text;
  v_tipo text;
begin
  if new.status=old.status then return new; end if;
  select * into v_ocorrencia from public.contrato_ciclo_ocorrencias
  where atendimento_id=new.id for update;
  if not found then return new; end if;

  v_usuario:=nullif(current_setting('kaza.credito_usuario_id',true),'')::uuid;
  v_origem:=coalesce(nullif(current_setting('kaza.credito_origem',true),''),'alteracao_status');
  v_motivo:=nullif(current_setting('kaza.credito_motivo',true),'');
  if v_usuario is null then
    raise exception 'Alteração de atendimento contratual exige contexto administrativo.' using errcode='23514';
  end if;

  insert into public.atendimento_status_eventos(
    atendimento_id,status_anterior,status_novo,origem,responsavel_id,motivo)
  values(new.id,old.status,new.status,v_origem,v_usuario,v_motivo);

  update public.contrato_ciclo_ocorrencias set
    estado=case new.status when 'concluido' then 'concluida' when 'cancelado' then 'cancelada' when 'faltou' then 'faltou' else 'materializada' end,
    concluida_em=case when new.status='concluido' then coalesce(concluida_em,statement_timestamp()) else null end
  where id=v_ocorrencia.id;

  for v_credito in
    select * from public.contrato_ciclo_ocorrencia_itens
    where ocorrencia_id=v_ocorrencia.id for update
  loop
    v_estado_novo:=null; v_tipo:=null;
    if new.status='concluido' and v_credito.estado_comercial in ('reservado','disponivel') then
      v_estado_novo:='consumido'; v_tipo:='atendimento_concluido';
    elsif new.status='faltou' and v_credito.estado_comercial='reservado' then
      v_estado_novo:='aguardando_decisao'; v_tipo:='falta_aguardando_decisao';
    elsif new.status='cancelado' and v_credito.estado_comercial='reservado' then
      v_estado_novo:='disponivel'; v_tipo:='atendimento_cancelado_credito_liberado';
    elsif old.status='concluido' and v_origem='reversao_conclusao'
      and v_credito.estado_comercial='consumido' then
      v_estado_novo:='reservado'; v_tipo:='reversao_conclusao';
    end if;
    if v_estado_novo is not null then
      update public.contrato_ciclo_ocorrencia_itens set
        estado_comercial=v_estado_novo,
        estado_comercial_versao=estado_comercial_versao+1,
        estado_comercial_atualizado_em=statement_timestamp()
      where ocorrencia_id=v_credito.ocorrencia_id and contrato_item_id=v_credito.contrato_item_id;
      insert into public.contrato_credito_eventos(
        ocorrencia_id,contrato_item_id,ciclo_id,atendimento_id,estado_anterior,estado_novo,tipo,responsavel_id,motivo)
      values(v_credito.ocorrencia_id,v_credito.contrato_item_id,v_credito.ciclo_id,new.id,
        v_credito.estado_comercial,v_estado_novo,v_tipo,v_usuario,v_motivo);
    end if;
  end loop;
  perform public.recalcular_encerramento_ciclo_032(v_ocorrencia.ciclo_id,v_usuario);
  return new;
end;$$;

drop trigger if exists atendimentos_sincronizar_creditos_032 on public.atendimentos;
create trigger atendimentos_sincronizar_creditos_032
after update of status on public.atendimentos
for each row execute function public.sincronizar_creditos_status_atendimento_032();

create or replace function public.alterar_status_atendimento_com_creditos(p_intencao jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_atendimento public.atendimentos%rowtype;
  v_id uuid; v_usuario uuid; v_esperado text; v_novo text; v_acao text;
begin
  v_id:=(p_intencao->>'atendimentoId')::uuid;
  v_usuario:=(p_intencao->>'usuarioId')::uuid;
  v_esperado:=p_intencao->>'statusEsperado';
  v_acao:=nullif(p_intencao->>'acao','');
  v_novo:=case v_acao when 'cancelar' then 'cancelado' when 'registrar_falta' then 'faltou' else p_intencao->>'novoStatus' end;
  if v_id is null or v_usuario is null or v_esperado is null or v_novo is null then
    return jsonb_build_object('status','invalido','codigo','INTENCAO_INVALIDA','mensagem','Intenção inválida.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('atendimento:status:'||v_id::text,0));
  select * into v_atendimento from public.atendimentos where id=v_id for update;
  if not found then return jsonb_build_object('status','invalido','codigo','ATENDIMENTO_NAO_ENCONTRADO','mensagem','Atendimento não encontrado.'); end if;
  if v_atendimento.status=v_novo then
    return jsonb_build_object('status','atualizado','atendimentoId',v_id,'statusAnterior',v_esperado,'statusAtual',v_novo,'reutilizado',true);
  end if;
  if v_atendimento.status<>v_esperado then
    return jsonb_build_object('status','conflito','codigo','STATUS_ALTERADO','mensagem','O status deste atendimento foi alterado em outra operação.','statusAtual',v_atendimento.status);
  end if;
  if v_atendimento.status='concluido'
    or (v_acao='registrar_falta' and v_atendimento.status not in ('agendado','confirmado'))
    or (v_acao='cancelar' and v_atendimento.status not in ('agendado','confirmado','recebido','em_atendimento','aguardando_retirada','aguardando_entrega'))
    or (v_acao is null and (v_atendimento.status not in ('agendado','confirmado','recebido','em_atendimento','aguardando_retirada','aguardando_entrega')
      or v_novo not in ('agendado','confirmado','recebido','em_atendimento','aguardando_retirada','aguardando_entrega','concluido'))) then
    return jsonb_build_object('status','invalido','codigo','TRANSICAO_INVALIDA','mensagem','Esta alteração não é permitida para o status atual.');
  end if;
  perform set_config('kaza.credito_usuario_id',v_usuario::text,true);
  perform set_config('kaza.credito_origem',coalesce(v_acao,'alteracao_status'),true);
  perform set_config('kaza.credito_motivo','',true);
  update public.atendimentos set status=v_novo where id=v_id;
  return jsonb_build_object('status','atualizado','atendimentoId',v_id,'statusAnterior',v_esperado,'statusAtual',v_novo,'reutilizado',false);
exception when raise_exception or check_violation then
  return jsonb_build_object('status','conflito','codigo','STATUS_ALTERADO','mensagem','A disponibilidade operacional mudou durante a alteração.','statusAtual',v_atendimento.status);
when invalid_text_representation then
  return jsonb_build_object('status','invalido','codigo','INTENCAO_INVALIDA','mensagem','Intenção de status inválida.');
end;$$;

create or replace function public.reverter_conclusao_atendimento(p_intencao jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_atendimento public.atendimentos%rowtype;
  v_grupo public.grupos_agendamento%rowtype;
  v_chave uuid; v_usuario uuid; v_id uuid; v_destino text; v_motivo text; v_hash text; v_resposta jsonb;
  v_existente public.contrato_credito_operacoes_idempotentes%rowtype;
begin
  v_chave:=(p_intencao->>'chaveIdempotencia')::uuid; v_usuario:=(p_intencao->>'usuarioId')::uuid;
  v_id:=(p_intencao->>'atendimentoId')::uuid; v_destino:=p_intencao->>'statusDestino'; v_motivo:=nullif(btrim(p_intencao->>'motivo'),'');
  if v_chave is null or v_usuario is null or v_id is null or v_motivo is null
    or v_destino not in ('agendado','confirmado','recebido','em_atendimento','aguardando_retirada','aguardando_entrega') then
    return jsonb_build_object('status','invalido','codigo','INTENCAO_INVALIDA','mensagem','Informe motivo e status de destino válidos.');
  end if;
  v_hash:=md5((p_intencao-'chaveIdempotencia')::text);
  perform pg_advisory_xact_lock(hashtextextended('credito:operacao:'||v_chave::text,0));
  select * into v_existente from public.contrato_credito_operacoes_idempotentes where chave_idempotencia=v_chave;
  if found then
    if v_existente.hash_intencao<>v_hash then return jsonb_build_object('status','invalido','codigo','IDEMPOTENCIA_CONFLITANTE','mensagem','A chave pertence a outra operação.'); end if;
    return v_existente.resposta;
  end if;
  select * into v_atendimento from public.atendimentos where id=v_id for update;
  if not found or v_atendimento.status<>'concluido' then
    return jsonb_build_object('status','invalido','codigo','ATENDIMENTO_NAO_CONCLUIDO','mensagem','O atendimento não está concluído.');
  end if;
  if not exists(select 1 from public.contrato_ciclo_ocorrencias where atendimento_id=v_id) then
    return jsonb_build_object('status','invalido','codigo','ATENDIMENTO_SEM_CONTRATO','mensagem','O atendimento não pertence a um Ciclo de Contrato.');
  end if;
  select * into v_grupo from public.grupos_agendamento where id=v_atendimento.grupo_agendamento_id;
  if (v_grupo.modalidade='taxidog' and v_destino='aguardando_retirada')
    or (v_grupo.modalidade<>'taxidog' and v_destino='aguardando_entrega') then
    return jsonb_build_object('status','invalido','codigo','STATUS_INCOMPATIVEL_MODALIDADE','mensagem','O status escolhido não é compatível com a modalidade.');
  end if;
  perform set_config('kaza.credito_usuario_id',v_usuario::text,true);
  perform set_config('kaza.credito_origem','reversao_conclusao',true);
  perform set_config('kaza.credito_motivo',v_motivo,true);
  update public.atendimentos set status=v_destino where id=v_id;
  v_resposta:=jsonb_build_object('status','revertido','atendimentoId',v_id,'statusAtual',v_destino);
  insert into public.contrato_credito_operacoes_idempotentes(chave_idempotencia,usuario_id,operacao,hash_intencao,resposta)
  values(v_chave,v_usuario,'reverter_conclusao',v_hash,v_resposta);
  return v_resposta;
exception when invalid_text_representation then
  return jsonb_build_object('status','invalido','codigo','INTENCAO_INVALIDA','mensagem','Intenção de reversão inválida.');
end;$$;

create or replace function public.decidir_credito_contrato(p_intencao jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_credito public.contrato_ciclo_ocorrencia_itens%rowtype;
  v_ocorrencia public.contrato_ciclo_ocorrencias%rowtype;
  v_ciclo public.contrato_ciclos%rowtype;
  v_chave uuid; v_usuario uuid; v_ocorrencia_id uuid; v_item_id uuid; v_versao bigint;
  v_operacao text; v_decisao text; v_motivo text; v_hash text; v_novo text; v_tipo text; v_resposta jsonb;
  v_existente public.contrato_credito_operacoes_idempotentes%rowtype;
begin
  v_chave:=(p_intencao->>'chaveIdempotencia')::uuid; v_usuario:=(p_intencao->>'usuarioId')::uuid;
  v_ocorrencia_id:=(p_intencao->>'ocorrenciaId')::uuid; v_item_id:=(p_intencao->>'contratoItemId')::uuid;
  v_versao:=(p_intencao->>'versaoEsperada')::bigint; v_operacao:=p_intencao->>'operacao';
  v_decisao:=p_intencao->>'decisao'; v_motivo:=nullif(btrim(p_intencao->>'motivo'),'');
  if v_chave is null or v_usuario is null or v_ocorrencia_id is null or v_item_id is null or v_versao is null
    or v_operacao not in ('decidir_falta','corrigir_decisao','decidir_encerramento')
    or v_decisao not in ('perder','preservar') or v_motivo is null then
    return jsonb_build_object('status','invalido','codigo','INTENCAO_INVALIDA','mensagem','Decisão administrativa inválida.');
  end if;
  v_hash:=md5((p_intencao-'chaveIdempotencia')::text);
  perform pg_advisory_xact_lock(hashtextextended('credito:operacao:'||v_chave::text,0));
  select * into v_existente from public.contrato_credito_operacoes_idempotentes where chave_idempotencia=v_chave;
  if found then
    if v_existente.hash_intencao<>v_hash then return jsonb_build_object('status','invalido','codigo','IDEMPOTENCIA_CONFLITANTE','mensagem','A chave pertence a outra operação.'); end if;
    return v_existente.resposta;
  end if;
  select * into v_credito from public.contrato_ciclo_ocorrencia_itens
  where ocorrencia_id=v_ocorrencia_id and contrato_item_id=v_item_id for update;
  if not found then return jsonb_build_object('status','invalido','codigo','CREDITO_NAO_ENCONTRADO','mensagem','Crédito não encontrado.'); end if;
  if v_credito.estado_comercial_versao<>v_versao then
    return jsonb_build_object('status','conflito','codigo','VERSAO_DIVERGENTE','mensagem','O crédito foi alterado por outra sessão.');
  end if;
  select * into v_ocorrencia from public.contrato_ciclo_ocorrencias where id=v_ocorrencia_id;
  select * into v_ciclo from public.contrato_ciclos where id=v_credito.ciclo_id for update;
  if v_operacao='decidir_falta' and (v_credito.estado_comercial<>'aguardando_decisao'
    or not exists(select 1 from public.atendimentos where id=v_ocorrencia.atendimento_id and status='faltou')) then
    return jsonb_build_object('status','invalido','codigo','DECISAO_FALTA_INDISPONIVEL','mensagem','Este crédito não aguarda decisão de falta.');
  elsif v_operacao='corrigir_decisao' and v_credito.estado_comercial not in ('perdido','disponivel') then
    return jsonb_build_object('status','invalido','codigo','CORRECAO_INDISPONIVEL','mensagem','O estado atual não permite corrigir a decisão.');
  elsif v_operacao='corrigir_decisao' and not exists(
    select 1 from public.contrato_credito_eventos evento
    where evento.ocorrencia_id=v_ocorrencia_id and evento.contrato_item_id=v_item_id
      and evento.tipo in ('credito_perdido_falta','credito_preservado_falta',
        'credito_perdido_encerramento','credito_preservado_encerramento','credito_corrigido_admin')
  ) then
    return jsonb_build_object('status','invalido','codigo','CORRECAO_INDISPONIVEL','mensagem','Não existe decisão administrativa anterior para corrigir.');
  elsif v_operacao='decidir_encerramento' and (not v_ciclo.encerramento_pendente or v_credito.estado_comercial<>'disponivel') then
    return jsonb_build_object('status','invalido','codigo','ENCERRAMENTO_INDISPONIVEL','mensagem','Este crédito não pertence a um encerramento pendente.');
  elsif v_operacao='decidir_encerramento' and exists(
    select 1 from public.contrato_credito_eventos evento
    where evento.ocorrencia_id=v_ocorrencia_id and evento.contrato_item_id=v_item_id
      and evento.tipo in ('credito_perdido_encerramento','credito_preservado_encerramento')
  ) then
    return jsonb_build_object('status','invalido','codigo','DECISAO_JA_REGISTRADA','mensagem','Este crédito já recebeu uma decisão de encerramento; use a correção administrativa.');
  end if;
  v_novo:=case v_decisao when 'perder' then 'perdido' else 'disponivel' end;
  if v_operacao='corrigir_decisao' and v_novo=v_credito.estado_comercial then
    return jsonb_build_object('status','invalido','codigo','DECISAO_SEM_ALTERACAO','mensagem','Escolha um destino diferente do estado atual.');
  end if;
  v_tipo:=case v_operacao
    when 'decidir_falta' then case v_decisao when 'perder' then 'credito_perdido_falta' else 'credito_preservado_falta' end
    when 'corrigir_decisao' then 'credito_corrigido_admin'
    else case v_decisao when 'perder' then 'credito_perdido_encerramento' else 'credito_preservado_encerramento' end end;
  update public.contrato_ciclo_ocorrencia_itens set estado_comercial=v_novo,
    estado_comercial_versao=estado_comercial_versao+1,estado_comercial_atualizado_em=statement_timestamp()
  where ocorrencia_id=v_ocorrencia_id and contrato_item_id=v_item_id;
  insert into public.contrato_credito_eventos(
    ocorrencia_id,contrato_item_id,ciclo_id,atendimento_id,estado_anterior,estado_novo,tipo,responsavel_id,motivo)
  values(v_ocorrencia_id,v_item_id,v_credito.ciclo_id,v_ocorrencia.atendimento_id,
    v_credito.estado_comercial,v_novo,v_tipo,v_usuario,v_motivo);
  perform public.recalcular_encerramento_ciclo_032(v_credito.ciclo_id,v_usuario);
  v_resposta:=jsonb_build_object('status','atualizado','ocorrenciaId',v_ocorrencia_id,
    'contratoItemId',v_item_id,'estadoComercial',v_novo,'versao',v_versao+1);
  insert into public.contrato_credito_operacoes_idempotentes(chave_idempotencia,usuario_id,operacao,hash_intencao,resposta)
  values(v_chave,v_usuario,v_operacao,v_hash,v_resposta);
  return v_resposta;
exception when invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('status','invalido','codigo','INTENCAO_INVALIDA','mensagem','Decisão administrativa inválida.');
end;$$;

-- A criação de cada unidade comercial passa a registrar sua origem. A trigger
-- é instalada depois do backfill para não duplicar os eventos de migração.
create or replace function public.inicializar_credito_contrato_032()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_usuario uuid; v_atendimento uuid;
begin
  select criado_por into v_usuario from public.contrato_ciclos where id=new.ciclo_id;
  select atendimento_id into v_atendimento from public.contrato_ciclo_ocorrencias where id=new.ocorrencia_id;
  insert into public.contrato_credito_eventos(
    ocorrencia_id,contrato_item_id,ciclo_id,atendimento_id,estado_anterior,estado_novo,tipo,responsavel_id)
  values(new.ocorrencia_id,new.contrato_item_id,new.ciclo_id,v_atendimento,null,new.estado_comercial,'credito_reservado',v_usuario);
  return new;
end;$$;
drop trigger if exists contrato_credito_inicializar_032 on public.contrato_ciclo_ocorrencia_itens;
create trigger contrato_credito_inicializar_032
after insert on public.contrato_ciclo_ocorrencia_itens
for each row execute function public.inicializar_credito_contrato_032();

update public.contrato_ciclos ciclo set encerramento_pendente=true
where ciclo.estado='concluido' and exists(
  select 1 from public.contrato_ciclo_ocorrencia_itens item
  where item.ciclo_id=ciclo.id and item.estado_comercial not in ('consumido','perdido')
);

alter table public.atendimento_status_eventos enable row level security;
alter table public.contrato_credito_eventos enable row level security;
alter table public.contrato_credito_operacoes_idempotentes enable row level security;
revoke all on public.atendimento_status_eventos,public.contrato_credito_eventos,
  public.contrato_credito_operacoes_idempotentes from public,anon,authenticated;
grant select on public.atendimento_status_eventos,public.contrato_credito_eventos to authenticated;
grant select,insert on public.atendimento_status_eventos,public.contrato_credito_eventos to service_role;
grant select,insert on public.contrato_credito_operacoes_idempotentes to service_role;
drop policy if exists atendimento_status_eventos_select_internal_032 on public.atendimento_status_eventos;
create policy atendimento_status_eventos_select_internal_032 on public.atendimento_status_eventos
for select to authenticated using((auth.jwt()->'app_metadata'->>'role')='internal');
drop policy if exists contrato_credito_eventos_select_internal_032 on public.contrato_credito_eventos;
create policy contrato_credito_eventos_select_internal_032 on public.contrato_credito_eventos
for select to authenticated using((auth.jwt()->'app_metadata'->>'role')='internal');

revoke all on function public.alterar_status_atendimento_com_creditos(jsonb),
  public.reverter_conclusao_atendimento(jsonb),public.decidir_credito_contrato(jsonb),
  public.recalcular_encerramento_ciclo_032(uuid,uuid)
from public,anon,authenticated;
grant execute on function public.alterar_status_atendimento_com_creditos(jsonb),
  public.reverter_conclusao_atendimento(jsonb),public.decidir_credito_contrato(jsonb)
to service_role;

comment on column public.contrato_ciclo_ocorrencia_itens.estado_comercial is
  'Estado comercial autoritativo da unidade contratada; independente do status operacional do atendimento.';
comment on table public.contrato_credito_eventos is
  'Histórico append-only de todas as decisões e transições de cada unidade comercial.';
comment on table public.atendimento_status_eventos is
  'Histórico append-only usado também para sugerir com segurança o destino de uma reversão de conclusão.';
comment on column public.contrato_ciclos.encerramento_pendente is
  'Indica Ciclo operacionalmente encerrado com crédito ainda disponível ou aguardando decisão; não transfere saldo.';

commit;
