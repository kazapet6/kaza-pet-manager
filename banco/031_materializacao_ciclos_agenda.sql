begin;

-- A ocorrência é a autoridade do vínculo. Este índice também impede que um
-- mesmo atendimento seja atribuído acidentalmente a duas ocorrências.
create unique index if not exists contrato_ocorrencia_atendimento_unico_031_idx
on public.contrato_ciclo_ocorrencias(atendimento_id)
where atendimento_id is not null;

create or replace function public.materializar_ciclo_contrato(
  p_ciclo_id uuid,
  p_usuario_id uuid,
  p_materializacoes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare
  v_ciclo public.contrato_ciclos%rowtype;
  v_contrato public.contratos%rowtype;
  v_ocorrencia public.contrato_ciclo_ocorrencias%rowtype;
  v_item jsonb;
  v_plano jsonb;
  v_resposta jsonb;
  v_falha jsonb;
  v_atendimentos jsonb := '[]'::jsonb;
  v_total integer;
  v_materializadas integer;
  v_ids_contratados uuid[];
  v_ids_solicitados uuid[];
  v_modalidade_esperada text;
begin
  if p_ciclo_id is null or p_usuario_id is null
    or jsonb_typeof(p_materializacoes) <> 'array' then
    return jsonb_build_object('status','invalido','codigo','INTENCAO_INVALIDA',
      'mensagem','A intenção de materialização é inválida.');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ciclo:materializar:'||p_ciclo_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('agenda:ocupacao',0));

  select * into v_ciclo from public.contrato_ciclos
  where id=p_ciclo_id for update;
  if not found then
    return jsonb_build_object('status','invalido','codigo','CICLO_NAO_ENCONTRADO',
      'mensagem','Ciclo não encontrado.');
  end if;
  select * into v_contrato from public.contratos
  where id=v_ciclo.contrato_id for share;

  if v_ciclo.estado='requer_revisao' then
    return jsonb_build_object('status','invalido','codigo','CICLO_REQUER_REVISAO',
      'mensagem','Resolva o horário do Ciclo antes de materializar a Agenda.');
  end if;
  if v_ciclo.estado not in ('reservado','em_andamento') then
    return jsonb_build_object('status','invalido','codigo','CICLO_NAO_MATERIALIZAVEL',
      'mensagem','O estado atual do Ciclo não permite criar a Agenda.');
  end if;

  if v_ciclo.modalidade_transporte_pretendida = 'taxidog' then
    v_modalidade_esperada := 'taxidog';
  else
    v_modalidade_esperada := 'normal';
  end if;

  perform 1 from public.contrato_ciclo_ocorrencias
  where ciclo_id=p_ciclo_id order by ordem for update;
  select count(*),count(*) filter(where atendimento_id is not null)
  into v_total,v_materializadas
  from public.contrato_ciclo_ocorrencias where ciclo_id=p_ciclo_id;
  if v_total=0 then
    return jsonb_build_object('status','invalido','codigo','CICLO_SEM_OCORRENCIAS',
      'mensagem','O Ciclo não possui ocorrências reservadas.');
  end if;
  if v_materializadas=v_total then
    select coalesce(jsonb_agg(jsonb_build_object(
      'ocorrenciaId',id,'atendimentoId',atendimento_id) order by ordem),'[]'::jsonb)
    into v_atendimentos from public.contrato_ciclo_ocorrencias where ciclo_id=p_ciclo_id;
    return jsonb_build_object('status','materializado','cicloId',p_ciclo_id,
      'atendimentos',v_atendimentos,'reutilizado',true);
  end if;
  if v_materializadas<>0 or exists(
    select 1 from public.contrato_ciclo_ocorrencias
    where ciclo_id=p_ciclo_id and (estado<>'reservada' or atendimento_id is not null)
  ) then
    return jsonb_build_object('status','conflito','codigo','CICLO_PARCIALMENTE_MATERIALIZADO',
      'mensagem','O Ciclo possui estado parcial incompatível com a operação atômica.');
  end if;
  if jsonb_array_length(p_materializacoes)<>v_total
    or (select count(distinct value->>'ocorrenciaId') from jsonb_array_elements(p_materializacoes))<>v_total then
    return jsonb_build_object('status','invalido','codigo','OCORRENCIAS_INCOMPLETAS',
      'mensagem','A materialização deve conter exatamente todas as ocorrências do Ciclo.');
  end if;

  begin
    for v_item in select value from jsonb_array_elements(p_materializacoes) loop
      select * into v_ocorrencia from public.contrato_ciclo_ocorrencias
      where id=(v_item->>'ocorrenciaId')::uuid and ciclo_id=p_ciclo_id for update;
      if not found then
        v_falha:=jsonb_build_object('status','invalido','codigo','OCORRENCIA_INVALIDA',
          'mensagem','Uma ocorrência não pertence ao Ciclo.');
        raise exception using errcode='PCM01',message='materializacao abortada';
      end if;
      v_plano:=v_item->'plano';
      if jsonb_typeof(v_plano)<>'object' then
        v_falha:=jsonb_build_object('status','invalido','codigo','PLANO_INVALIDO',
          'mensagem','O plano de uma ocorrência é inválido.');
        raise exception using errcode='PCM01',message='materializacao abortada';
      end if;

      select array_agg(distinct i.servico_id order by i.servico_id)
      into v_ids_contratados
      from public.contrato_ciclo_ocorrencia_itens oi
      join public.contrato_itens i on i.id=oi.contrato_item_id
      where oi.ocorrencia_id=v_ocorrencia.id;
      select array_agg(distinct (s->>'servico_id')::uuid order by (s->>'servico_id')::uuid)
      into v_ids_solicitados
      from jsonb_array_elements(coalesce(v_plano->'servicos','[]'::jsonb)) s
      where s->>'origem'='solicitado';
      if (v_ids_contratados is null)
        or (v_ids_solicitados is distinct from v_ids_contratados)
        or ((v_plano #>> '{atendimento,petId}') is distinct from v_contrato.pet_id)
        or ((v_plano #>> '{grupo,dataOperacional}')::date is distinct from v_ocorrencia.data_operacional)
        or ((v_plano #>> '{atendimento,inicioOperacionalPlanejado}')::timestamptz is distinct from v_ocorrencia.inicio_operacional)
        or ((v_plano #>> '{atendimento,conclusaoOperacionalPrevista}')::timestamptz is distinct from v_ocorrencia.conclusao_prevista)
        or ((v_plano #>> '{grupo,modalidade}') is distinct from v_modalidade_esperada)
        or (nullif(v_plano #>> '{grupo,taxidogCicloId}', '')::uuid is distinct from v_ocorrencia.taxidog_ciclo_id)
      then
        v_falha:=jsonb_build_object('status','invalido','codigo','PLANO_DIVERGENTE',
          'mensagem','O plano não representa a ocorrência contratual reservada.');
        raise exception using errcode='PCM01',message='materializacao abortada';
      end if;

      v_resposta:=public.confirmar_agendamento_transacional(v_plano);
      if v_resposta->>'status'<>'confirmado' then
        v_falha:=jsonb_build_object('status','conflito',
          'codigo',coalesce(v_resposta->>'codigo','CONFIRMACAO_FALHOU'),
          'mensagem',coalesce(v_resposta->>'mensagem','A ocorrência deixou de estar disponível.'));
        raise exception using errcode='PCM01',message='materializacao abortada';
      end if;
      perform public.vincular_ocorrencia_ciclo_atendimento(
        v_ocorrencia.id,(v_resposta->>'atendimentoId')::uuid);
      v_atendimentos:=v_atendimentos||jsonb_build_array(jsonb_build_object(
        'ocorrenciaId',v_ocorrencia.id,'atendimentoId',v_resposta->>'atendimentoId'));
    end loop;
  exception when sqlstate 'PCM01' then
    return v_falha||jsonb_build_object('cicloId',p_ciclo_id);
  end;

  insert into public.contrato_eventos(contrato_id,tipo,detalhes,registrado_por)
  values(v_ciclo.contrato_id,'ciclo_materializado',jsonb_build_object(
    'cicloId',p_ciclo_id,'quantidadeAtendimentos',v_total),p_usuario_id);
  return jsonb_build_object('status','materializado','cicloId',p_ciclo_id,
    'atendimentos',v_atendimentos,'reutilizado',false);
exception
  when invalid_text_representation or sqlstate '22023' then
    return jsonb_build_object('status','invalido','codigo','INTENCAO_INVALIDA',
      'mensagem','A intenção de materialização contém valores inválidos.');
end;
$$;

alter function public.materializar_ciclo_contrato(uuid,uuid,jsonb) owner to postgres;
revoke all on function public.materializar_ciclo_contrato(uuid,uuid,jsonb)
from public,anon,authenticated;
grant execute on function public.materializar_ciclo_contrato(uuid,uuid,jsonb)
to service_role;

comment on function public.materializar_ciclo_contrato(uuid,uuid,jsonb) is
'Troca atomicamente todas as reservas virtuais de um Ciclo por atendimentos criados pela confirmação oficial; retry retorna os vínculos existentes.';

commit;
