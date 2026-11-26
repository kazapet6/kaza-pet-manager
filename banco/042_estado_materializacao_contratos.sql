begin;

-- A materialização pertence ao Ciclo. NULL é reservado a históricos que não
-- podem ser classificados com segurança pela estrutura disponível.
alter table public.contrato_ciclos
  add column if not exists materializacao_estado text,
  add column if not exists materializacao_tentativas integer not null default 0,
  add column if not exists materializacao_ultima_tentativa_em timestamptz,
  add column if not exists materializacao_concluida_em timestamptz,
  add column if not exists materializacao_ultimo_codigo_erro text,
  add column if not exists materializacao_ultimo_erro text,
  add column if not exists materializacao_lease_token uuid,
  add column if not exists materializacao_lease_ate timestamptz,
  add column if not exists materializacao_versao bigint not null default 0,
  add column if not exists materializacao_ultimo_responsavel_id uuid;

alter table public.contrato_ciclos
  drop constraint if exists contrato_ciclos_materializacao_estado_042_check,
  add constraint contrato_ciclos_materializacao_estado_042_check check (
    materializacao_estado is null
    or materializacao_estado in ('pendente','materializando','materializado','erro')
  ),
  drop constraint if exists contrato_ciclos_materializacao_tentativas_042_check,
  add constraint contrato_ciclos_materializacao_tentativas_042_check check (
    materializacao_tentativas >= 0 and materializacao_versao >= 0
  ),
  drop constraint if exists contrato_ciclos_materializacao_lease_042_check,
  add constraint contrato_ciclos_materializacao_lease_042_check check (
    (materializacao_estado='materializando' and materializacao_lease_token is not null and materializacao_lease_ate is not null)
    or (materializacao_estado is distinct from 'materializando' and materializacao_lease_token is null and materializacao_lease_ate is null)
  ),
  drop constraint if exists contrato_ciclos_materializacao_resultado_042_check,
  add constraint contrato_ciclos_materializacao_resultado_042_check check (
    (materializacao_estado='materializado' and materializacao_concluida_em is not null
      and materializacao_ultimo_codigo_erro is null and materializacao_ultimo_erro is null)
    or (materializacao_estado='erro' and materializacao_concluida_em is null
      and nullif(btrim(materializacao_ultimo_codigo_erro),'') is not null
      and nullif(btrim(materializacao_ultimo_erro),'') is not null)
    or (materializacao_estado in ('pendente','materializando') and materializacao_concluida_em is null
      and materializacao_ultimo_codigo_erro is null and materializacao_ultimo_erro is null)
    or materializacao_estado is null
  );

comment on column public.contrato_ciclos.materializacao_estado is
'Estado durável da criação dos atendimentos do Ciclo. NULL identifica histórico não classificável com segurança.';
comment on column public.contrato_ciclos.materializacao_lease_token is
'Token efêmero que identifica a única execução autorizada a concluir a materialização.';
comment on column public.contrato_ciclos.materializacao_ultimo_erro is
'Mensagem operacional sanitizada; nunca deve receber payload, stack trace, token ou secret.';

create or replace function public.inicializar_materializacao_ciclo_042()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  if new.materializacao_estado is null then
    if new.estado in ('reservado','em_andamento') then
      new.materializacao_estado:='pendente';
    elsif new.estado='requer_revisao' then
      new.materializacao_estado:='erro';
      new.materializacao_ultimo_codigo_erro:='CICLO_REQUER_REVISAO';
      new.materializacao_ultimo_erro:='O horário do Ciclo precisa de revisão antes de criar os atendimentos.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists contrato_ciclos_inicializar_materializacao_042 on public.contrato_ciclos;
create trigger contrato_ciclos_inicializar_materializacao_042
before insert on public.contrato_ciclos
for each row execute function public.inicializar_materializacao_ciclo_042();

-- Backfill conservador: completos são comprováveis; pendentes são somente
-- Ciclos do modelo 30 ainda integralmente reservados. Outros históricos ficam NULL.
with contagem as (
  select c.id,
    count(o.id) as total,
    count(o.id) filter(where o.atendimento_id is not null and o.materializada_em is not null) as completas,
    count(o.id) filter(where o.estado='reservada' and o.atendimento_id is null and o.materializada_em is null) as reservadas,
    max(o.materializada_em) as concluida_em,
    ct.modelo_operacional_versao
  from public.contrato_ciclos c
  join public.contratos ct on ct.id=c.contrato_id
  left join public.contrato_ciclo_ocorrencias o on o.ciclo_id=c.id
  group by c.id,ct.modelo_operacional_versao
)
update public.contrato_ciclos c
set materializacao_estado=case
      when x.total>0 and x.completas=x.total then 'materializado'
      when x.modelo_operacional_versao=30 and x.total>0 and x.reservadas=x.total
        and c.estado in ('reservado','em_andamento') then 'pendente'
      when x.modelo_operacional_versao=30 and c.estado='requer_revisao' then 'erro'
      else null end,
    materializacao_concluida_em=case when x.total>0 and x.completas=x.total then x.concluida_em else null end,
    materializacao_ultimo_codigo_erro=case when x.modelo_operacional_versao=30 and c.estado='requer_revisao' then 'CICLO_REQUER_REVISAO' else null end,
    materializacao_ultimo_erro=case when x.modelo_operacional_versao=30 and c.estado='requer_revisao' then 'O horário do Ciclo precisa de revisão antes de criar os atendimentos.' else null end,
    materializacao_lease_token=null,
    materializacao_lease_ate=null
from contagem x
where x.id=c.id and c.materializacao_estado is null;

-- O hash passa a representar somente a intenção comercial estável.
alter table public.contrato_operacoes_idempotentes
  add column if not exists intencao_comercial jsonb;

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
  );
$$;

with snapshots as (
  select op.chave_idempotencia,jsonb_build_object(
    'clienteId',ct.cliente_id,
    'petId',ct.pet_id,
    'pacoteId',ct.pacote_id::text,
    'pacoteVersaoEsperada',ct.pacote_versao_snapshot,
    'valorContratado',ct.valor_contratado,
    'motivoAjusteValor',ct.motivo_ajuste_valor,
    'dataAncora',ct.data_ancora::text,
    'diaSemanaFixo',ct.dia_semana_fixo,
    'horarioFixo',to_char(ct.horario_fixo,'HH24:MI'),
    'modalidadeTransporte',ct.modalidade_transporte,
    'taxidogCicloId',ct.taxidog_ciclo_id::text,
    'funcionarioResponsavelId',c.funcionario_responsavel_padrao_id::text,
    'renovacaoAutomatica',ct.renovacao_automatica
  ) as intencao,c.id as ciclo_id
  from public.contrato_operacoes_idempotentes op
  join public.contratos ct on ct.id=op.contrato_id
  left join public.contrato_ciclos c on c.contrato_id=ct.id and c.numero=1
  where op.resposta is not null
)
update public.contrato_operacoes_idempotentes op
set intencao_comercial=s.intencao,
    hash_intencao=md5(s.intencao::text),
    resposta=op.resposta||jsonb_build_object('cicloId',s.ciclo_id)
from snapshots s where s.chave_idempotencia=op.chave_idempotencia;

comment on column public.contrato_operacoes_idempotentes.intencao_comercial is
'Intenção comercial canônica. Exclui versões, disponibilidade, planos e demais dados mutáveis da Agenda.';

create or replace function public.consultar_venda_contrato_idempotente_042(p_intencao jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_chave uuid;
  v_usuario uuid;
  v_comercial jsonb;
  v_existente public.contrato_operacoes_idempotentes%rowtype;
begin
  v_chave:=(p_intencao->>'chaveIdempotencia')::uuid;
  v_usuario:=(p_intencao->>'usuarioId')::uuid;
  v_comercial:=public.normalizar_intencao_comercial_venda_042(p_intencao);
  select * into v_existente from public.contrato_operacoes_idempotentes
  where chave_idempotencia=v_chave;
  if not found then return jsonb_build_object('status','nova'); end if;
  if v_existente.usuario_id<>v_usuario
    or v_existente.intencao_comercial is distinct from v_comercial then
    return jsonb_build_object('status','conflito','codigo','IDEMPOTENCIA_DIVERGENTE',
      'mensagem','A chave de repetição já foi utilizada por outra venda.');
  end if;
  if v_existente.resposta is null or v_existente.contrato_id is null then
    return jsonb_build_object('status','processando','codigo','VENDA_EM_PROCESSAMENTO',
      'mensagem','A venda ainda está sendo confirmada.');
  end if;
  return v_existente.resposta||jsonb_build_object('reutilizado',true);
exception when invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('status','invalido','codigo','INTENCAO_INVALIDA','mensagem','Dados da venda inválidos.');
end;
$$;

create or replace function public.vender_contrato(p_intencao jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_chave uuid; v_usuario uuid; v_hash text; v_comercial jsonb;
  v_existente public.contrato_operacoes_idempotentes%rowtype;
  v_pacote public.pacotes%rowtype; v_pet public.pets%rowtype;
  v_contrato_id uuid; v_item jsonb; v_regra jsonb; v_item_id uuid;
  v_resposta jsonb; v_ciclo_id uuid; v_ocorrencia jsonb; v_ocorrencia_id uuid;
  v_ocupacao bigint; v_configuracao bigint; v_item_ref jsonb;
begin
  v_chave:=(p_intencao->>'chaveIdempotencia')::uuid;
  v_usuario:=(p_intencao->>'usuarioId')::uuid;
  v_comercial:=public.normalizar_intencao_comercial_venda_042(p_intencao);
  v_hash:=md5(v_comercial::text);
  perform pg_advisory_xact_lock(hashtextextended('venda:'||v_chave::text,0));
  select * into v_existente from public.contrato_operacoes_idempotentes
  where chave_idempotencia=v_chave for update;
  if found then
    if v_existente.usuario_id<>v_usuario
      or v_existente.intencao_comercial is distinct from v_comercial then
      return jsonb_build_object('status','conflito','codigo','IDEMPOTENCIA_DIVERGENTE',
        'mensagem','A chave de repetição já foi utilizada por outra venda.');
    end if;
    if v_existente.resposta is not null then
      return v_existente.resposta||jsonb_build_object('reutilizado',true);
    end if;
    return jsonb_build_object('status','processando','codigo','VENDA_EM_PROCESSAMENTO',
      'mensagem','A venda ainda está sendo confirmada.');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('agenda:ocupacao',0));
  select versao into v_ocupacao from public.agenda_versao_ocupacao where id=true for update;
  select versao into v_configuracao from public.agenda_versao_configuracao where id=true;
  if v_ocupacao<>(p_intencao->>'ocupacaoAgendaVersao')::bigint
    or v_configuracao<>(p_intencao->>'configuracaoAgendaVersao')::bigint then
    return jsonb_build_object('status','conflito','codigo','DISPONIBILIDADE_ALTERADA',
      'mensagem','A disponibilidade ou a configuração mudou. Consulte novamente antes de vender.');
  end if;
  if jsonb_typeof(p_intencao->'ocorrencias')<>'array'
    or jsonb_array_length(p_intencao->'ocorrencias')=0 then
    return jsonb_build_object('status','invalido','codigo','CICLO_SEM_RESERVAS',
      'mensagem','A venda exige um primeiro Ciclo integralmente validado pelo Motor.');
  end if;
  insert into public.contrato_operacoes_idempotentes(
    chave_idempotencia,usuario_id,hash_intencao,intencao_comercial)
  values(v_chave,v_usuario,v_hash,v_comercial);

  select * into v_pacote from public.pacotes
  where id=(p_intencao->>'pacoteId')::uuid for update;
  if not found or not v_pacote.ativo then
    return jsonb_build_object('status','invalido','codigo','PACOTE_INDISPONIVEL','mensagem','O Pacote não está disponível para venda.');
  end if;
  if v_pacote.versao<>(p_intencao->>'pacoteVersaoEsperada')::bigint then
    return jsonb_build_object('status','conflito','codigo','PACOTE_ALTERADO','mensagem','O Pacote mudou. Faça uma nova simulação antes de confirmar.');
  end if;
  select * into v_pet from public.pets where id=p_intencao->>'petId' for update;
  if not found or v_pet.cliente_id<>p_intencao->>'clienteId' then
    return jsonb_build_object('status','invalido','codigo','CLIENTE_PET_INCOMPATIVEL','mensagem','O pet não pertence ao cliente selecionado.');
  end if;
  if jsonb_build_object('nome',v_pet.nome,'especie',v_pet.especie,'racaId',v_pet.raca_id,
      'porte',v_pet.porte,'pelagem',v_pet.pelagem,'peso',v_pet.peso,'temperamento',v_pet.temperamento)
    <>(p_intencao->'petPerfilEsperado') then
    return jsonb_build_object('status','conflito','codigo','PERFIL_PET_ALTERADO','mensagem','O perfil do pet mudou. Revise os preços antes de confirmar.');
  end if;
  if not exists(select 1 from public.funcionarios
    where id=(p_intencao->>'funcionarioResponsavelId')::uuid and ativo) then
    return jsonb_build_object('status','invalido','codigo','FUNCIONARIO_INVALIDO','mensagem','Escolha um funcionário responsável ativo.');
  end if;

  insert into public.contratos(
    cliente_id,pet_id,pacote_id,pacote_versao_snapshot,pacote_nome_snapshot,
    pet_nome_snapshot,pet_especie_snapshot,pet_raca_id_snapshot,pet_raca_nome_snapshot,
    pet_porte_snapshot,pet_pelagem_snapshot,pet_peso_snapshot,pet_temperamento_snapshot,
    data_ancora,dia_semana_fixo,horario_fixo,timezone_snapshot,modalidade_transporte,
    taxidog_ciclo_id,configuracao_agenda_versao_snapshot,renovacao_automatica,
    valor_avulso_equivalente_snapshot,valor_pacote_calculado_snapshot,valor_contratado,
    motivo_ajuste_valor,valor_ajustado_por,criado_por,status,modelo_operacional_versao)
  values(
    p_intencao->>'clienteId',p_intencao->>'petId',v_pacote.id,v_pacote.versao,v_pacote.nome,
    p_intencao#>>'{petSnapshot,nome}',p_intencao#>>'{petSnapshot,especie}',
    (p_intencao#>>'{petSnapshot,racaId}')::uuid,p_intencao#>>'{petSnapshot,racaNome}',
    p_intencao#>>'{petSnapshot,porte}',p_intencao#>>'{petSnapshot,pelagem}',
    nullif(p_intencao#>>'{petSnapshot,peso}','')::numeric,p_intencao#>>'{petSnapshot,temperamento}',
    (p_intencao->>'dataAncora')::date,(p_intencao->>'diaSemanaFixo')::smallint,
    (p_intencao->>'horarioFixo')::time,p_intencao->>'timezone',p_intencao->>'modalidadeTransporte',
    nullif(p_intencao->>'taxidogCicloId','')::uuid,(p_intencao->>'configuracaoAgendaVersao')::bigint,
    (p_intencao->>'renovacaoAutomatica')::boolean,(p_intencao->>'totalAvulso')::numeric,
    (p_intencao->>'totalPacote')::numeric,(p_intencao->>'valorContratado')::numeric,
    nullif(p_intencao->>'motivoAjusteValor',''),
    case when (p_intencao->>'valorContratado')::numeric<>(p_intencao->>'totalPacote')::numeric then v_usuario else null end,
    v_usuario,'ativo',30)
  returning id into v_contrato_id;

  for v_item in select value from jsonb_array_elements(p_intencao->'itens') loop
    insert into public.contrato_itens(
      contrato_id,pacote_servico_id_origem,servico_id,servico_nome_snapshot,ordem_snapshot,
      quantidade_por_ciclo,intervalo_quantidade,intervalo_unidade,offset_inicial_quantidade,
      offset_inicial_unidade,preco_avulso_base_unitario_snapshot,preco_avulso_unitario_snapshot,
      preco_pacote_base_unitario_snapshot,preco_pacote_unitario_calculado_snapshot,
      total_avulso_snapshot,total_pacote_calculado_snapshot,desconto_percentual_snapshot)
    values(
      v_contrato_id,(v_item->>'pacoteServicoId')::uuid,(v_item->>'servicoId')::uuid,
      v_item->>'servicoNome',(v_item->>'ordem')::int,(v_item->>'quantidadePorCiclo')::int,
      (v_item->>'intervaloQuantidade')::int,v_item->>'intervaloUnidade',
      (v_item->>'offsetInicialQuantidade')::int,v_item->>'offsetInicialUnidade',
      (v_item->>'precoAvulsoBaseUnitario')::numeric,(v_item->>'precoAvulsoUnitario')::numeric,
      (v_item->>'precoPacoteBaseUnitario')::numeric,(v_item->>'precoPacoteUnitario')::numeric,
      (v_item->>'totalAvulso')::numeric,(v_item->>'totalPacote')::numeric,
      (v_item->>'descontoPercentual')::numeric)
    returning id into v_item_id;
    for v_regra in select value from jsonb_array_elements(v_item->'regras') loop
      insert into public.contrato_item_regras_aplicadas(
        contrato_item_id,origem,regra_servico_id_origem,regra_pacote_id_origem,ordem,
        criterio,descricao_snapshot,valor_referencia_snapshot,acrescimo_valor_snapshot)
      values(v_item_id,v_regra->>'origem',nullif(v_regra->>'regraServicoId','')::uuid,
        nullif(v_regra->>'regraPacoteId','')::uuid,(v_regra->>'ordem')::int,
        v_regra->>'criterio',v_regra->>'descricao',v_regra->>'referencia',
        (v_regra->>'acrescimoValor')::numeric);
    end loop;
  end loop;

  insert into public.contrato_ciclos(
    contrato_id,numero,estado,situacao_financeira,data_ancora_pretendida,
    dia_semana_pretendido,horario_pretendido,modalidade_transporte_pretendida,
    taxidog_ciclo_id_pretendido,funcionario_responsavel_padrao_id,
    configuracao_agenda_versao,ocupacao_agenda_versao,criado_por,materializacao_estado)
  values(v_contrato_id,1,'reservado','pendente',(p_intencao->>'dataAncora')::date,
    (p_intencao->>'diaSemanaFixo')::smallint,(p_intencao->>'horarioFixo')::time,
    p_intencao->>'modalidadeTransporte',nullif(p_intencao->>'taxidogCicloId','')::uuid,
    (p_intencao->>'funcionarioResponsavelId')::uuid,(p_intencao->>'configuracaoAgendaVersao')::bigint,
    v_ocupacao,v_usuario,'pendente') returning id into v_ciclo_id;

  for v_ocorrencia in select value from jsonb_array_elements(p_intencao->'ocorrencias') loop
    insert into public.contrato_ciclo_ocorrencias(
      ciclo_id,ordem,data_operacional,horario_apresentado,inicio_operacional,
      conclusao_prevista,taxidog_ciclo_id,plano_operacional)
    values(v_ciclo_id,(v_ocorrencia->>'ordem')::int,(v_ocorrencia->>'data')::date,
      (v_ocorrencia->>'horarioApresentado')::time,
      (((v_ocorrencia->>'data')::date+(v_ocorrencia->>'inicioOperacional')::time) at time zone (p_intencao->>'timezone')),
      (((v_ocorrencia->>'data')::date+(v_ocorrencia->>'conclusaoPrevista')::time) at time zone (p_intencao->>'timezone')),
      nullif(v_ocorrencia->>'taxidogCicloId','')::uuid,v_ocorrencia->'plano')
    returning id into v_ocorrencia_id;
    for v_item_ref in select value from jsonb_array_elements(v_ocorrencia->'itens') loop
      insert into public.contrato_ciclo_ocorrencia_itens(
        ocorrencia_id,ciclo_id,contrato_item_id,ordinal_no_item)
      select v_ocorrencia_id,v_ciclo_id,id,(v_item_ref->>'ordinal')::int
      from public.contrato_itens
      where contrato_id=v_contrato_id and servico_id=(v_item_ref->>'servicoId')::uuid;
    end loop;
  end loop;
  update public.agenda_versao_ocupacao
  set versao=versao+1,updated_at=statement_timestamp() where id=true;
  insert into public.contrato_eventos(contrato_id,tipo,detalhes,registrado_por)
  values(v_contrato_id,'contrato_criado',jsonb_build_object('chaveIdempotencia',v_chave),v_usuario);
  v_resposta:=jsonb_build_object('status','criado','contratoId',v_contrato_id,'cicloId',v_ciclo_id);
  update public.contrato_operacoes_idempotentes
  set contrato_id=v_contrato_id,resposta=v_resposta,concluido_em=statement_timestamp()
  where chave_idempotencia=v_chave;
  return v_resposta;
exception when invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('status','invalido','codigo','INTENCAO_INVALIDA','mensagem','Dados da venda inválidos.');
end;
$$;

create or replace function public.assumir_materializacao_ciclo_042(
  p_ciclo_id uuid,p_usuario_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_ciclo public.contrato_ciclos%rowtype;
  v_token uuid;
  v_total integer;
  v_materializadas integer;
  v_atendimentos jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('ciclo:materializar:'||p_ciclo_id::text,0));
  select * into v_ciclo from public.contrato_ciclos where id=p_ciclo_id for update;
  if not found then
    return jsonb_build_object('status','invalido','codigo','CICLO_NAO_ENCONTRADO','mensagem','Ciclo não encontrado.');
  end if;
  perform 1 from public.contrato_ciclo_ocorrencias where ciclo_id=p_ciclo_id order by ordem for update;
  select count(*),count(*) filter(where atendimento_id is not null)
  into v_total,v_materializadas from public.contrato_ciclo_ocorrencias where ciclo_id=p_ciclo_id;
  if v_total>0 and v_materializadas=v_total then
    select coalesce(jsonb_agg(jsonb_build_object('ocorrenciaId',id,'atendimentoId',atendimento_id) order by ordem),'[]'::jsonb)
    into v_atendimentos from public.contrato_ciclo_ocorrencias where ciclo_id=p_ciclo_id;
    update public.contrato_ciclos set
      materializacao_estado='materializado',materializacao_concluida_em=coalesce(materializacao_concluida_em,statement_timestamp()),
      materializacao_ultimo_codigo_erro=null,materializacao_ultimo_erro=null,
      materializacao_lease_token=null,materializacao_lease_ate=null,materializacao_versao=materializacao_versao+1
    where id=p_ciclo_id;
    return jsonb_build_object('status','materializado','cicloId',p_ciclo_id,'atendimentos',v_atendimentos,'reutilizado',true);
  end if;
  if v_ciclo.materializacao_estado='materializando'
    and v_ciclo.materializacao_lease_ate>statement_timestamp() then
    return jsonb_build_object('status','materializando','codigo','MATERIALIZACAO_EM_ANDAMENTO',
      'mensagem','Os atendimentos deste Ciclo já estão sendo preparados.','cicloId',p_ciclo_id);
  end if;
  if v_ciclo.estado='requer_revisao' then
    update public.contrato_ciclos set materializacao_estado='erro',
      materializacao_ultimo_codigo_erro='CICLO_REQUER_REVISAO',
      materializacao_ultimo_erro='O horário do Ciclo precisa de revisão antes de criar os atendimentos.',
      materializacao_concluida_em=null,materializacao_lease_token=null,materializacao_lease_ate=null,
      materializacao_versao=materializacao_versao+1 where id=p_ciclo_id;
    return jsonb_build_object('status','erro','codigo','CICLO_REQUER_REVISAO',
      'mensagem','O horário do Ciclo precisa de revisão antes de criar os atendimentos.','cicloId',p_ciclo_id);
  end if;
  if v_ciclo.estado not in ('reservado','em_andamento') then
    return jsonb_build_object('status','invalido','codigo','CICLO_NAO_MATERIALIZAVEL',
      'mensagem','O estado atual do Ciclo não permite criar os atendimentos.','cicloId',p_ciclo_id);
  end if;
  if v_total=0 or v_materializadas<>0 then
    update public.contrato_ciclos set materializacao_estado='erro',
      materializacao_ultimo_codigo_erro=case when v_total=0 then 'CICLO_SEM_OCORRENCIAS' else 'CICLO_PARCIALMENTE_MATERIALIZADO' end,
      materializacao_ultimo_erro=case when v_total=0 then 'O Ciclo não possui ocorrências reservadas.' else 'O Ciclo possui uma combinação inesperada de ocorrências.' end,
      materializacao_concluida_em=null,materializacao_lease_token=null,materializacao_lease_ate=null,
      materializacao_versao=materializacao_versao+1 where id=p_ciclo_id;
    return jsonb_build_object('status','erro','codigo',case when v_total=0 then 'CICLO_SEM_OCORRENCIAS' else 'CICLO_PARCIALMENTE_MATERIALIZADO' end,
      'mensagem',case when v_total=0 then 'O Ciclo não possui ocorrências reservadas.' else 'O Ciclo possui uma combinação inesperada de ocorrências.' end,'cicloId',p_ciclo_id);
  end if;
  v_token:=gen_random_uuid();
  update public.contrato_ciclos set
    materializacao_estado='materializando',materializacao_tentativas=materializacao_tentativas+1,
    materializacao_ultima_tentativa_em=statement_timestamp(),materializacao_concluida_em=null,
    materializacao_ultimo_codigo_erro=null,materializacao_ultimo_erro=null,
    materializacao_lease_token=v_token,materializacao_lease_ate=statement_timestamp()+interval '5 minutes',
    materializacao_versao=materializacao_versao+1,materializacao_ultimo_responsavel_id=p_usuario_id
  where id=p_ciclo_id;
  return jsonb_build_object('status','assumida','cicloId',p_ciclo_id,'token',v_token,
    'tentativa',v_ciclo.materializacao_tentativas+1);
end;
$$;

create or replace function public.registrar_erro_materializacao_ciclo_042(
  p_ciclo_id uuid,p_token uuid,p_codigo text,p_mensagem text
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_codigo text; v_mensagem text;
begin
  v_codigo:=left(upper(regexp_replace(coalesce(nullif(btrim(p_codigo),''),'MATERIALIZACAO_INDISPONIVEL'),'[^A-Z0-9_]+','_','g')),80);
  v_mensagem:=left(coalesce(nullif(btrim(p_mensagem),''),'Não foi possível criar os atendimentos deste Ciclo.'),240);
  update public.contrato_ciclos set
    materializacao_estado='erro',materializacao_concluida_em=null,
    materializacao_ultimo_codigo_erro=v_codigo,materializacao_ultimo_erro=v_mensagem,
    materializacao_lease_token=null,materializacao_lease_ate=null,
    materializacao_versao=materializacao_versao+1
  where id=p_ciclo_id and materializacao_estado='materializando' and materializacao_lease_token=p_token;
  if not found then
    return jsonb_build_object('status','conflito','codigo','LEASE_MATERIALIZACAO_INVALIDO',
      'mensagem','Esta tentativa não controla mais a materialização do Ciclo.','cicloId',p_ciclo_id);
  end if;
  return jsonb_build_object('status','erro','codigo',v_codigo,'mensagem',v_mensagem,'cicloId',p_ciclo_id);
end;
$$;

create or replace function public.materializar_ciclo_contrato(
  p_ciclo_id uuid,p_usuario_id uuid,p_materializacoes jsonb,p_token uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_ciclo public.contrato_ciclos%rowtype; v_contrato public.contratos%rowtype;
  v_ocorrencia public.contrato_ciclo_ocorrencias%rowtype; v_item jsonb; v_plano jsonb;
  v_resposta jsonb; v_falha jsonb; v_atendimentos jsonb:='[]'::jsonb;
  v_total integer; v_materializadas integer; v_ids_contratados uuid[]; v_ids_solicitados uuid[];
  v_modalidade_esperada text;
begin
  if p_ciclo_id is null or p_usuario_id is null or p_token is null
    or jsonb_typeof(p_materializacoes)<>'array' then
    return jsonb_build_object('status','invalido','codigo','INTENCAO_INVALIDA','mensagem','A intenção de materialização é inválida.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ciclo:materializar:'||p_ciclo_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('agenda:ocupacao',0));
  select * into v_ciclo from public.contrato_ciclos where id=p_ciclo_id for update;
  if not found then return jsonb_build_object('status','invalido','codigo','CICLO_NAO_ENCONTRADO','mensagem','Ciclo não encontrado.'); end if;
  if v_ciclo.materializacao_estado<>'materializando' or v_ciclo.materializacao_lease_token is distinct from p_token then
    return jsonb_build_object('status','conflito','codigo','LEASE_MATERIALIZACAO_INVALIDO',
      'mensagem','Esta tentativa não controla mais a materialização do Ciclo.','cicloId',p_ciclo_id);
  end if;
  select * into v_contrato from public.contratos where id=v_ciclo.contrato_id for share;
  v_modalidade_esperada:=case when v_ciclo.modalidade_transporte_pretendida='taxidog' then 'taxidog' else 'normal' end;
  perform 1 from public.contrato_ciclo_ocorrencias where ciclo_id=p_ciclo_id order by ordem for update;
  select count(*),count(*) filter(where atendimento_id is not null) into v_total,v_materializadas
  from public.contrato_ciclo_ocorrencias where ciclo_id=p_ciclo_id;
  if v_total=0 or v_materializadas<>0
    or jsonb_array_length(p_materializacoes)<>v_total
    or (select count(distinct value->>'ocorrenciaId') from jsonb_array_elements(p_materializacoes))<>v_total then
    return public.registrar_erro_materializacao_ciclo_042(p_ciclo_id,p_token,
      case when v_total=0 then 'CICLO_SEM_OCORRENCIAS' when v_materializadas<>0 then 'CICLO_PARCIALMENTE_MATERIALIZADO' else 'OCORRENCIAS_INCOMPLETAS' end,
      case when v_total=0 then 'O Ciclo não possui ocorrências reservadas.' when v_materializadas<>0 then 'O Ciclo possui uma combinação inesperada de ocorrências.' else 'A materialização deve conter exatamente todas as ocorrências do Ciclo.' end);
  end if;
  begin
    for v_item in select value from jsonb_array_elements(p_materializacoes) loop
      select * into v_ocorrencia from public.contrato_ciclo_ocorrencias
      where id=(v_item->>'ocorrenciaId')::uuid and ciclo_id=p_ciclo_id for update;
      if not found then
        v_falha:=jsonb_build_object('codigo','OCORRENCIA_INVALIDA','mensagem','Uma ocorrência não pertence ao Ciclo.');
        raise exception using errcode='PCM01',message='materializacao abortada';
      end if;
      v_plano:=v_item->'plano';
      if jsonb_typeof(v_plano)<>'object' then
        v_falha:=jsonb_build_object('codigo','PLANO_INVALIDO','mensagem','O plano de uma ocorrência é inválido.');
        raise exception using errcode='PCM01',message='materializacao abortada';
      end if;
      select array_agg(distinct i.servico_id order by i.servico_id) into v_ids_contratados
      from public.contrato_ciclo_ocorrencia_itens oi join public.contrato_itens i on i.id=oi.contrato_item_id
      where oi.ocorrencia_id=v_ocorrencia.id;
      select array_agg(distinct (s->>'servico_id')::uuid order by (s->>'servico_id')::uuid) into v_ids_solicitados
      from jsonb_array_elements(coalesce(v_plano->'servicos','[]'::jsonb)) s where s->>'origem'='solicitado';
      if v_ids_contratados is null or v_ids_solicitados is distinct from v_ids_contratados
        or (v_plano#>>'{atendimento,petId}') is distinct from v_contrato.pet_id
        or (v_plano#>>'{grupo,dataOperacional}')::date is distinct from v_ocorrencia.data_operacional
        or (v_plano#>>'{atendimento,inicioOperacionalPlanejado}')::timestamptz is distinct from v_ocorrencia.inicio_operacional
        or (v_plano#>>'{atendimento,conclusaoOperacionalPrevista}')::timestamptz is distinct from v_ocorrencia.conclusao_prevista
        or (v_plano#>>'{grupo,modalidade}') is distinct from v_modalidade_esperada
        or nullif(v_plano#>>'{grupo,taxidogCicloId}','')::uuid is distinct from v_ocorrencia.taxidog_ciclo_id then
        v_falha:=jsonb_build_object('codigo','PLANO_DIVERGENTE','mensagem','O plano não representa a ocorrência contratual reservada.');
        raise exception using errcode='PCM01',message='materializacao abortada';
      end if;
      v_resposta:=public.confirmar_agendamento_transacional(v_plano);
      if v_resposta->>'status'<>'confirmado' then
        v_falha:=jsonb_build_object('codigo',coalesce(v_resposta->>'codigo','CONFIRMACAO_FALHOU'),
          'mensagem',coalesce(v_resposta->>'mensagem','A ocorrência deixou de estar disponível.'));
        raise exception using errcode='PCM01',message='materializacao abortada';
      end if;
      perform public.vincular_ocorrencia_ciclo_atendimento(v_ocorrencia.id,(v_resposta->>'atendimentoId')::uuid);
      v_atendimentos:=v_atendimentos||jsonb_build_array(jsonb_build_object(
        'ocorrenciaId',v_ocorrencia.id,'atendimentoId',v_resposta->>'atendimentoId'));
    end loop;
  exception when sqlstate 'PCM01' then
    return public.registrar_erro_materializacao_ciclo_042(
      p_ciclo_id,p_token,v_falha->>'codigo',v_falha->>'mensagem');
  end;
  update public.contrato_ciclos set
    materializacao_estado='materializado',materializacao_concluida_em=statement_timestamp(),
    materializacao_ultimo_codigo_erro=null,materializacao_ultimo_erro=null,
    materializacao_lease_token=null,materializacao_lease_ate=null,
    materializacao_versao=materializacao_versao+1
  where id=p_ciclo_id and materializacao_lease_token=p_token;
  insert into public.contrato_eventos(contrato_id,tipo,detalhes,registrado_por)
  values(v_ciclo.contrato_id,'ciclo_materializado',jsonb_build_object(
    'cicloId',p_ciclo_id,'quantidadeAtendimentos',v_total),p_usuario_id);
  return jsonb_build_object('status','materializado','cicloId',p_ciclo_id,
    'atendimentos',v_atendimentos,'reutilizado',false);
exception when invalid_text_representation or sqlstate '22023' then
  return public.registrar_erro_materializacao_ciclo_042(
    p_ciclo_id,p_token,'INTENCAO_INVALIDA','A intenção de materialização contém valores inválidos.');
end;
$$;

-- Compatibilidade segura durante o go-live: a assinatura anterior também usa
-- a máquina de estados e nunca materializa sem adquirir o lease.
create or replace function public.materializar_ciclo_contrato(
  p_ciclo_id uuid,p_usuario_id uuid,p_materializacoes jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_claim jsonb;
begin
  v_claim:=public.assumir_materializacao_ciclo_042(p_ciclo_id,p_usuario_id);
  if v_claim->>'status'<>'assumida' then return v_claim; end if;
  return public.materializar_ciclo_contrato(
    p_ciclo_id,p_usuario_id,p_materializacoes,(v_claim->>'token')::uuid);
end;
$$;

alter function public.vender_contrato(jsonb) owner to postgres;
alter function public.consultar_venda_contrato_idempotente_042(jsonb) owner to postgres;
alter function public.assumir_materializacao_ciclo_042(uuid,uuid) owner to postgres;
alter function public.registrar_erro_materializacao_ciclo_042(uuid,uuid,text,text) owner to postgres;
alter function public.materializar_ciclo_contrato(uuid,uuid,jsonb,uuid) owner to postgres;
alter function public.materializar_ciclo_contrato(uuid,uuid,jsonb) owner to postgres;

revoke all on function public.normalizar_intencao_comercial_venda_042(jsonb) from public,anon,authenticated;
revoke all on function public.vender_contrato(jsonb) from public,anon,authenticated;
revoke all on function public.consultar_venda_contrato_idempotente_042(jsonb) from public,anon,authenticated;
revoke all on function public.assumir_materializacao_ciclo_042(uuid,uuid) from public,anon,authenticated;
revoke all on function public.registrar_erro_materializacao_ciclo_042(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.materializar_ciclo_contrato(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.materializar_ciclo_contrato(uuid,uuid,jsonb) from public,anon,authenticated;

grant execute on function public.vender_contrato(jsonb) to service_role;
grant execute on function public.consultar_venda_contrato_idempotente_042(jsonb) to service_role;
grant execute on function public.assumir_materializacao_ciclo_042(uuid,uuid) to service_role;
grant execute on function public.registrar_erro_materializacao_ciclo_042(uuid,uuid,text,text) to service_role;
grant execute on function public.materializar_ciclo_contrato(uuid,uuid,jsonb,uuid) to service_role;
grant execute on function public.materializar_ciclo_contrato(uuid,uuid,jsonb) to service_role;

comment on function public.materializar_ciclo_contrato(uuid,uuid,jsonb,uuid) is
'Materializa atomicamente todas as ocorrências do Ciclo e conclui o estado durável sob lease exclusivo.';

commit;
