-- Migration 033: funcionário responsável autoritativo por atendimento e por ciclo.
-- Não aplicar automaticamente. Execute pelo fluxo controlado de migrations.

begin;

alter table public.atendimentos
  add column funcionario_responsavel_id uuid
  references public.funcionarios(id) on delete restrict;

alter table public.contrato_ciclos
  add column funcionario_responsavel_padrao_id uuid
  references public.funcionarios(id) on delete restrict;

create index atendimentos_funcionario_responsavel_inicio_idx
  on public.atendimentos(funcionario_responsavel_id, inicio_operacional_planejado)
  where funcionario_responsavel_id is not null;

create index contrato_ciclos_funcionario_responsavel_idx
  on public.contrato_ciclos(funcionario_responsavel_padrao_id)
  where funcionario_responsavel_padrao_id is not null;

-- Backfill conservador: somente um funcionário humano distinto em todas as etapas.
with candidatos as (
  select ae.atendimento_id, (array_agg(distinct aef.funcionario_id))[1] as funcionario_id
  from public.atendimento_etapas ae
  join public.atendimento_etapa_funcionarios aef on aef.atendimento_etapa_id=ae.id
  group by ae.atendimento_id
  having count(distinct aef.funcionario_id)=1
)
update public.atendimentos a
set funcionario_responsavel_id=c.funcionario_id
from candidatos c
where c.atendimento_id=a.id and a.funcionario_responsavel_id is null;

-- Um ciclo histórico só recebe padrão quando todos os atendimentos materializados
-- possuem responsável e esse responsável é único no ciclo.
with materializados as (
  select o.ciclo_id,
         (array_agg(distinct a.funcionario_responsavel_id) filter (where a.funcionario_responsavel_id is not null))[1] as funcionario_id,
         count(*) as total,
         count(a.funcionario_responsavel_id) as total_com_responsavel,
         count(distinct a.funcionario_responsavel_id) as distintos
  from public.contrato_ciclo_ocorrencias o
  join public.atendimentos a on a.id=o.atendimento_id
  group by o.ciclo_id
), candidatos as (
  select ciclo_id, funcionario_id from materializados
  where total=total_com_responsavel and distintos=1
)
update public.contrato_ciclos c
set funcionario_responsavel_padrao_id=x.funcionario_id
from candidatos x
where x.ciclo_id=c.id and c.funcionario_responsavel_padrao_id is null;

-- As RPCs abaixo preservam as garantias transacionais anteriores e passam a
-- persistir o responsável padrão na venda e a copiá-lo na renovação.
create or replace function public.confirmar_agendamento_transacional(
  p_plano jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_grupo jsonb;
  v_atendimento jsonb;
  v_servicos jsonb;
  v_origens jsonb;
  v_acrescimos jsonb;
  v_etapas jsonb;
  v_contribuicoes jsonb;
  v_funcionarios jsonb;
  v_equipamentos jsonb;
  v_supervisoes jsonb;
  v_esperas jsonb;
  v_grupo_id uuid := gen_random_uuid();
  v_atendimento_id uuid := gen_random_uuid();
  v_chave_idempotencia uuid;
  v_hash_requisicao text;
  v_versao_configuracao_plano bigint;
  v_versao_configuracao_atual bigint;
  v_versao_ocupacao_atual bigint;
  v_grupo_existente public.grupos_agendamento%rowtype;
  v_atendimento_existente public.atendimentos%rowtype;
  v_servico_legado_id uuid;
  v_total_servicos numeric(10, 2);
  v_total_informado numeric(10, 2);
  v_quantidade_solicitados integer;
  v_pai_incorreto boolean;
  v_preco_incoerente boolean;
  v_referencia_invalida boolean;
  v_duplicidade_invalida boolean;
  v_elemento_invalido boolean;
  v_lock_recurso bigint;
begin
  if p_plano is null or jsonb_typeof(p_plano) <> 'object' then
    return jsonb_build_object(
      'status', 'erro', 'codigo', 'PLANO_INVALIDO',
      'mensagem', 'O plano deve ser um objeto JSON.'
    );
  end if;

  v_grupo := p_plano -> 'grupo';
  v_atendimento := p_plano -> 'atendimento';
  v_servicos := coalesce(p_plano -> 'servicos', '[]'::jsonb);
  v_origens := coalesce(p_plano -> 'origens', '[]'::jsonb);
  v_acrescimos := coalesce(p_plano -> 'acrescimos', '[]'::jsonb);
  v_etapas := coalesce(p_plano -> 'etapas', '[]'::jsonb);
  v_contribuicoes := coalesce(p_plano -> 'contribuicoes', '[]'::jsonb);
  v_funcionarios := coalesce(p_plano -> 'funcionarios', '[]'::jsonb);
  v_equipamentos := coalesce(p_plano -> 'equipamentos', '[]'::jsonb);
  v_supervisoes := coalesce(p_plano -> 'supervisoes', '[]'::jsonb);
  v_esperas := coalesce(p_plano -> 'esperas', '[]'::jsonb);

  if v_grupo is null or jsonb_typeof(v_grupo) <> 'object'
    or v_atendimento is null or jsonb_typeof(v_atendimento) <> 'object'
    or jsonb_typeof(v_servicos) <> 'array'
    or jsonb_typeof(v_origens) <> 'array'
    or jsonb_typeof(v_acrescimos) <> 'array'
    or jsonb_typeof(v_etapas) <> 'array'
    or jsonb_typeof(v_contribuicoes) <> 'array'
    or jsonb_typeof(v_funcionarios) <> 'array'
    or jsonb_typeof(v_equipamentos) <> 'array'
    or jsonb_typeof(v_supervisoes) <> 'array'
    or jsonb_typeof(v_esperas) <> 'array'
  then
    return jsonb_build_object(
      'status', 'erro', 'codigo', 'PLANO_INVALIDO',
      'mensagem', 'As secoes obrigatorias do plano sao invalidas.'
    );
  end if;

  begin
    -- Arrays aceitam somente objetos. Isso evita que jsonb_to_recordset
    -- transforme um erro claro de contrato em falha interna inesperada.
    select exists (
      select 1
      from unnest(array[
        v_servicos, v_origens, v_acrescimos, v_etapas, v_contribuicoes,
        v_funcionarios, v_equipamentos, v_supervisoes, v_esperas
      ]) as colecoes(colecao)
      cross join lateral jsonb_array_elements(colecao) elementos(elemento)
      where jsonb_typeof(elemento) <> 'object'
    ) into v_elemento_invalido;

    if v_elemento_invalido then
      raise exception using errcode = 'PFP01',
        message = 'As colecoes do plano aceitam somente objetos.';
    end if;

    -- Classifica duplicidades relevantes antes que PKs/UNIQUEs precisem
    -- rejeitar o payload durante a persistencia.
    select
      (select count(*) <> count(distinct item.id)
       from jsonb_to_recordset(v_servicos) item(id uuid))
      or (select count(*) <> count(distinct item.servico_id)
          from jsonb_to_recordset(v_servicos) item(servico_id uuid))
      or (select count(*) <> count(distinct item.id)
          from jsonb_to_recordset(v_etapas) item(id uuid))
      or (select count(*) <> count(distinct item.id)
          from jsonb_to_recordset(v_equipamentos) item(id uuid))
      or exists (
        select 1
        from jsonb_to_recordset(v_origens) item(
          atendimento_servico_id uuid,
          originado_por_atendimento_servico_id uuid
        )
        group by item.atendimento_servico_id,
          item.originado_por_atendimento_servico_id
        having count(*) > 1
      )
    into v_duplicidade_invalida;

    if v_duplicidade_invalida then
      raise exception using errcode = 'PFP01',
        message = 'O plano possui IDs, servicos ou arestas duplicados.';
    end if;

    -- Fecha todas as referencias internas no proprio payload. IDs globais
    -- existentes no banco, mas ausentes do plano, nao sao aceitos.
    select
      exists (
        select 1
        from jsonb_to_recordset(v_etapas) item(
          atendimento_servico_id uuid
        )
        where not exists (
          select 1 from jsonb_to_recordset(v_servicos) alvo(id uuid)
          where alvo.id = item.atendimento_servico_id
        )
      )
      or exists (
        select 1
        from jsonb_to_recordset(v_funcionarios) item(
          atendimento_etapa_id uuid
        )
        where not exists (
          select 1 from jsonb_to_recordset(v_etapas) alvo(id uuid)
          where alvo.id = item.atendimento_etapa_id
        )
      )
      or exists (
        select 1
        from jsonb_to_recordset(v_equipamentos) item(
          atendimento_etapa_id uuid
        )
        where not exists (
          select 1 from jsonb_to_recordset(v_etapas) alvo(id uuid)
          where alvo.id = item.atendimento_etapa_id
        )
      )
      or exists (
        select 1
        from jsonb_to_recordset(v_supervisoes) item(
          atendimento_etapa_equipamento_id uuid
        )
        where not exists (
          select 1 from jsonb_to_recordset(v_equipamentos) alvo(id uuid)
          where alvo.id = item.atendimento_etapa_equipamento_id
        )
      )
      or exists (
        select 1
        from jsonb_to_recordset(v_esperas) item(
          etapa_anterior_id uuid, etapa_seguinte_id uuid
        )
        where (item.etapa_anterior_id is not null and not exists (
          select 1 from jsonb_to_recordset(v_etapas) alvo(id uuid)
          where alvo.id = item.etapa_anterior_id
        )) or (item.etapa_seguinte_id is not null and not exists (
          select 1 from jsonb_to_recordset(v_etapas) alvo(id uuid)
          where alvo.id = item.etapa_seguinte_id
        ))
      )
      or exists (
        select 1
        from jsonb_to_recordset(v_contribuicoes) item(
          atendimento_etapa_id uuid, atendimento_servico_id uuid
        )
        where not exists (
          select 1 from jsonb_to_recordset(v_etapas) alvo(id uuid)
          where alvo.id = item.atendimento_etapa_id
        ) or not exists (
          select 1 from jsonb_to_recordset(v_servicos) alvo(id uuid)
          where alvo.id = item.atendimento_servico_id
        )
      )
      or exists (
        select 1
        from jsonb_to_recordset(v_origens) item(
          atendimento_servico_id uuid,
          originado_por_atendimento_servico_id uuid
        )
        where not exists (
          select 1 from jsonb_to_recordset(v_servicos) alvo(id uuid)
          where alvo.id = item.atendimento_servico_id
        ) or not exists (
          select 1 from jsonb_to_recordset(v_servicos) alvo(id uuid)
          where alvo.id = item.originado_por_atendimento_servico_id
        )
      )
      or exists (
        select 1
        from jsonb_to_recordset(v_acrescimos) item(
          atendimento_servico_id uuid
        )
        where not exists (
          select 1 from jsonb_to_recordset(v_servicos) alvo(id uuid)
          where alvo.id = item.atendimento_servico_id
        )
      )
      or exists (
        select 1
        from jsonb_to_recordset(v_etapas) item(
          servico_etapa_id uuid, atendimento_servico_id uuid
        )
        join jsonb_to_recordset(v_servicos) servico(
          id uuid, servico_id uuid
        ) on servico.id = item.atendimento_servico_id
        where not exists (
          select 1
          from public.servico_etapas configurada
          where configurada.id = item.servico_etapa_id
            and configurada.servico_id = servico.servico_id
        )
      )
      or exists (
        select 1
        from jsonb_to_recordset(v_contribuicoes) item(
          atendimento_servico_id uuid, servico_etapa_origem_id uuid
        )
        join jsonb_to_recordset(v_servicos) servico(
          id uuid, servico_id uuid
        ) on servico.id = item.atendimento_servico_id
        where not exists (
          select 1
          from public.servico_etapas configurada
          where configurada.id = item.servico_etapa_origem_id
            and configurada.servico_id = servico.servico_id
        )
      )
    into v_referencia_invalida;

    if v_referencia_invalida then
      raise exception using errcode = 'PFP01',
        message = 'Uma referencia interna nao pertence ao plano atual.';
    end if;

    v_chave_idempotencia := (v_grupo ->> 'chaveIdempotencia')::uuid;
    v_hash_requisicao := v_grupo ->> 'hashRequisicao';
    v_versao_configuracao_plano :=
      (v_grupo ->> 'configuracaoVersao')::bigint;
    v_total_informado := (v_atendimento ->> 'valorCalculado')::numeric(10, 2);
  exception
    when sqlstate 'PFP01' or invalid_text_representation
      or sqlstate '22003' or sqlstate '22007' or sqlstate '22008'
      or sqlstate '22023'
    then
      return jsonb_build_object(
        'status', 'erro', 'codigo', 'PLANO_INVALIDO',
        'mensagem', 'A estrutura ou os valores do plano sao invalidos.'
      );
    when others then
      return jsonb_build_object(
        'status', 'erro', 'codigo', 'ERRO_INTERNO',
        'mensagem', 'A validacao estrutural nao pode ser concluida.'
      );
  end;

  if v_chave_idempotencia is null
    or v_hash_requisicao is null
    or v_hash_requisicao !~ '^[0-9a-f]{64}$'
    or v_versao_configuracao_plano is null
    or v_versao_configuracao_plano <= 0
    or v_total_informado is null
    or v_total_informado < 0
    or jsonb_array_length(v_servicos) = 0
    or jsonb_array_length(v_etapas) = 0
  then
    return jsonb_build_object(
      'status', 'erro', 'codigo', 'PLANO_INVALIDO',
      'mensagem', 'O plano nao possui os campos estruturais minimos.'
    );
  end if;

  -- Ordem global de locks:
  -- 1) idempotencia; 2) versao de configuracao; 3) recursos por hash;
  -- 4) inserts, cujos triggers reencontram locks ja pertencentes a transacao.
  perform pg_advisory_xact_lock(
    hashtextextended('idempotencia:' || v_chave_idempotencia::text, 0)
  );

  select item.*
  into v_grupo_existente
  from public.grupos_agendamento item
  where item.chave_idempotencia = v_chave_idempotencia;

  if found then
    if v_grupo_existente.hash_requisicao <> v_hash_requisicao then
      return jsonb_build_object(
        'status', 'erro', 'codigo', 'IDEMPOTENCIA_CONFLITANTE',
        'mensagem', 'A chave de idempotencia pertence a outra requisicao.'
      );
    end if;

    select item.*
    into v_atendimento_existente
    from public.atendimentos item
    where item.grupo_agendamento_id = v_grupo_existente.id
    order by item.created_at, item.id
    limit 1;

    if not found then
      return jsonb_build_object(
        'status', 'erro', 'codigo', 'ERRO_INTERNO',
        'mensagem', 'O resultado idempotente persistido esta incompleto.'
      );
    end if;

    select item.versao into v_versao_ocupacao_atual
    from public.agenda_versao_ocupacao item where item.id;

    return jsonb_build_object(
      'status', 'confirmado',
      'codigo', 'CONFIRMADO',
      'grupoAgendamentoId', v_grupo_existente.id,
      'atendimentoId', v_atendimento_existente.id,
      'statusAtendimento', v_atendimento_existente.status,
      'horarioConfirmado', v_grupo_existente.horario_chegada_comprometido,
      'conclusaoPrevista', v_atendimento_existente.conclusao_operacional_prevista,
      'valorFinal', v_atendimento_existente.valor_final,
      'versaoConfiguracao', v_grupo_existente.configuracao_versao,
      'versaoOcupacao', v_versao_ocupacao_atual,
      'reutilizadoPorIdempotencia', true
    );
  end if;

  select item.versao
  into v_versao_configuracao_atual
  from public.agenda_versao_configuracao item
  where item.id
  for share;

  if not found then
    return jsonb_build_object(
      'status', 'erro', 'codigo', 'ERRO_INTERNO',
      'mensagem', 'A versao de configuracao nao esta disponivel.'
    );
  end if;

  if v_versao_configuracao_atual <> v_versao_configuracao_plano then
    return jsonb_build_object(
      'status', 'erro', 'codigo', 'CONFIGURACAO_ALTERADA',
      'mensagem', 'A configuracao mudou desde o recalculo do plano.',
      'versaoConfiguracaoPlano', v_versao_configuracao_plano,
      'versaoConfiguracaoAtual', v_versao_configuracao_atual
    );
  end if;

  begin
    -- Pre-adquire exatamente os advisory locks usados pelos triggers da 008,
    -- em ordem numerica unica, eliminando inversao entre planos multi-recurso.
    for v_lock_recurso in
    select distinct recurso.lock_id
    from (
      select hashtextextended(item.funcionario_id::text, 0) as lock_id
      from jsonb_to_recordset(v_funcionarios) as item(funcionario_id uuid)
      union
      select hashtextextended(item.equipamento_unidade_id::text, 0)
      from jsonb_to_recordset(v_equipamentos)
        as item(equipamento_unidade_id uuid)
    ) recurso
    order by recurso.lock_id
    loop
      perform pg_advisory_xact_lock(v_lock_recurso);
    end loop;

    select count(*) filter (where item.origem = 'solicitado')::integer
    into v_quantidade_solicitados
    from jsonb_to_recordset(v_servicos) as item(
      id uuid, servico_id uuid, ordem integer, origem text
    );

    if v_quantidade_solicitados = 0 then
      raise exception using errcode = 'PFP01',
        message = 'O plano nao possui servico solicitado.';
    end if;

    select item.servico_id
    into v_servico_legado_id
    from jsonb_to_recordset(v_servicos) as item(
      id uuid, servico_id uuid, ordem integer, origem text
    )
    where item.origem = 'solicitado'
    order by item.ordem, item.id
    limit 1;

    -- O pai canonico singular e o pai direto de menor (ordem, id).
    select exists (
      select 1
      from jsonb_to_recordset(v_servicos) filho(
        id uuid, ordem integer, origem text, pai_canonico_id uuid
      )
      where (filho.origem = 'dependencia')
        and (
          filho.pai_canonico_id is null
          or filho.pai_canonico_id is distinct from (
          select pai.id
          from jsonb_to_recordset(v_origens) aresta(
            atendimento_servico_id uuid,
            originado_por_atendimento_servico_id uuid
          )
          join jsonb_to_recordset(v_servicos) pai(id uuid, ordem integer)
            on pai.id = aresta.originado_por_atendimento_servico_id
          where aresta.atendimento_servico_id = filho.id
          order by pai.ordem, pai.id
          limit 1
        )
        )
    ) into v_pai_incorreto;

    if v_pai_incorreto then
      raise exception using errcode = 'PFP01',
        message = 'O pai canonico nao segue a ordem deterministica.';
    end if;

    -- Confere somente a aritmetica materializada. As regras que decidiram
    -- quais acrescimos se aplicam continuam pertencendo a precificacao TS.
    select exists (
      select 1
      from jsonb_to_recordset(v_servicos) item(
        id uuid, preco_base_snapshot numeric, valor_calculado numeric,
        valor_final numeric
      )
      where item.valor_calculado <> item.preco_base_snapshot + coalesce((
        select sum(acrescimo.acrescimo_valor)
        from jsonb_to_recordset(v_acrescimos) acrescimo(
          atendimento_servico_id uuid, tipo text, acrescimo_valor numeric
        )
        where acrescimo.atendimento_servico_id = item.id
          and acrescimo.tipo = 'preco'
      ), 0)
        or item.valor_final <> item.valor_calculado
    ) into v_preco_incoerente;

    if v_preco_incoerente then
      raise exception using errcode = 'PFP01',
        message = 'Os valores materializados dos servicos sao incoerentes.';
    end if;

    select coalesce(sum(item.valor_final), 0)::numeric(10, 2)
    into v_total_servicos
    from jsonb_to_recordset(v_servicos) as item(valor_final numeric);

    if v_total_servicos <> v_total_informado
      or v_total_informado <> (v_atendimento ->> 'valorFinal')::numeric(10, 2)
    then
      raise exception using errcode = 'PFP01',
        message = 'O total do atendimento diverge da soma dos servicos.';
    end if;

    insert into public.grupos_agendamento (
      id, cliente_id, modalidade, origem, data_operacional,
      horario_chegada_comprometido, janela_transporte_id,
      retirada_prevista, observacoes,
      taxidog_ciclo_id, taxidog_ciclo_nome_snapshot,
      taxidog_ciclo_ordem_snapshot, taxidog_coleta_inicio_snapshot,
      taxidog_coleta_fim_snapshot, taxidog_conclusao_limite_snapshot,
      chave_idempotencia, hash_requisicao, configuracao_versao
    ) values (
      v_grupo_id, v_grupo ->> 'clienteId', v_grupo ->> 'modalidade', 'interno',
      (v_grupo ->> 'dataOperacional')::date,
      (v_grupo ->> 'horarioChegadaComprometido')::timestamptz,
      null, (v_grupo ->> 'retiradaPrevista')::timestamptz,
      coalesce(v_grupo ->> 'observacoes', ''),
      (v_grupo ->> 'taxidogCicloId')::uuid,
      v_grupo ->> 'taxidogCicloNomeSnapshot',
      (v_grupo ->> 'taxidogCicloOrdemSnapshot')::integer,
      (v_grupo ->> 'taxidogColetaInicioSnapshot')::time,
      (v_grupo ->> 'taxidogColetaFimSnapshot')::time,
      (v_grupo ->> 'taxidogConclusaoLimiteSnapshot')::time,
      v_chave_idempotencia, v_hash_requisicao, v_versao_configuracao_plano
    );

    insert into public.atendimentos (
      id, pet_id, servico_id, inicio_planejado, status, transporte,
      janela_transporte_id, valor_transporte, observacoes,
      grupo_agendamento_id, horario_chegada_comprometido,
      inicio_operacional_planejado, conclusao_operacional_prevista,
      retirada_prevista, tipo_planejamento, preferencia_funcionario,
      funcionario_preferido_id, funcionario_responsavel_id, pet_nome_snapshot, pet_especie_snapshot,
      pet_raca_id_snapshot, pet_raca_nome_snapshot, pet_sexo_snapshot,
      pet_porte_snapshot, pet_pelagem_snapshot, pet_peso_snapshot,
      pet_temperamento_snapshot, valor_calculado, desconto_valor,
      valor_manual, valor_final, alteracao_valor_autorizada
    ) values (
      v_atendimento_id, v_atendimento ->> 'petId', v_servico_legado_id,
      (v_atendimento ->> 'inicioOperacionalPlanejado')::timestamptz,
      'agendado', (v_grupo ->> 'modalidade') = 'taxidog', null, 0,
      coalesce(v_atendimento ->> 'observacoes', ''), v_grupo_id,
      (v_grupo ->> 'horarioChegadaComprometido')::timestamptz,
      (v_atendimento ->> 'inicioOperacionalPlanejado')::timestamptz,
      (v_atendimento ->> 'conclusaoOperacionalPrevista')::timestamptz,
      (v_grupo ->> 'retiradaPrevista')::timestamptz, 'regular',
      v_atendimento ->> 'preferenciaFuncionario',
      (v_atendimento ->> 'funcionarioPreferidoId')::uuid,
      (v_atendimento ->> 'funcionarioResponsavelId')::uuid,
      v_atendimento ->> 'petNomeSnapshot',
      v_atendimento ->> 'petEspecieSnapshot',
      (v_atendimento ->> 'petRacaIdSnapshot')::uuid,
      v_atendimento ->> 'petRacaNomeSnapshot',
      v_atendimento ->> 'petSexoSnapshot',
      v_atendimento ->> 'petPorteSnapshot',
      v_atendimento ->> 'petPelagemSnapshot',
      (v_atendimento ->> 'petPesoSnapshot')::numeric,
      v_atendimento ->> 'petTemperamentoSnapshot', v_total_servicos, 0,
      null, v_total_servicos, false
    );

    insert into public.atendimento_servicos (
      id, atendimento_id, servico_id, ordem, origem,
      originado_por_atendimento_servico_id, nome_snapshot,
      preco_base_snapshot, valor_calculado, desconto_valor,
      valor_manual, valor_final, alteracao_valor_autorizada, ativo
    )
    select item.id, v_atendimento_id, item.servico_id, item.ordem,
      item.origem, item.pai_canonico_id, item.nome_snapshot,
      item.preco_base_snapshot, item.valor_calculado, 0, null,
      item.valor_final, false, true
    from jsonb_to_recordset(v_servicos) as item(
      id uuid, servico_id uuid, ordem integer, origem text,
      pai_canonico_id uuid, nome_snapshot text,
      preco_base_snapshot numeric, valor_calculado numeric,
      valor_final numeric
    );

    insert into public.atendimento_servico_origens (
      atendimento_id, atendimento_servico_id,
      originado_por_atendimento_servico_id
    )
    select v_atendimento_id, item.atendimento_servico_id,
      item.originado_por_atendimento_servico_id
    from jsonb_to_recordset(v_origens) as item(
      atendimento_servico_id uuid,
      originado_por_atendimento_servico_id uuid
    );

    insert into public.atendimento_servico_acrescimos (
      id, atendimento_servico_id, tipo, criterio, regra_preco_id,
      modificador_id, descricao_snapshot, valor_referencia_snapshot,
      acrescimo_valor, acrescimo_minutos
    )
    select item.id, item.atendimento_servico_id, item.tipo, item.criterio,
      item.regra_preco_id, item.modificador_id, item.descricao_snapshot,
      item.valor_referencia_snapshot, item.acrescimo_valor,
      item.acrescimo_minutos
    from jsonb_to_recordset(v_acrescimos) as item(
      id uuid, atendimento_servico_id uuid, tipo text, criterio text,
      regra_preco_id uuid, modificador_id uuid, descricao_snapshot text,
      valor_referencia_snapshot text, acrescimo_valor numeric,
      acrescimo_minutos integer
    );

    insert into public.atendimento_etapas (
      id, atendimento_id, servico_etapa_id, inicio_planejado,
      fim_planejado, atendimento_servico_id, nome_snapshot,
      ordem_snapshot, duracao_minutos_snapshot, recursos_snapshot
    )
    select item.id, v_atendimento_id, item.servico_etapa_id,
      item.inicio_planejado, item.fim_planejado,
      item.atendimento_servico_id, item.nome_snapshot,
      item.ordem_snapshot, item.duracao_minutos_snapshot,
      item.recursos_snapshot
    from jsonb_to_recordset(v_etapas) as item(
      id uuid, servico_etapa_id uuid, inicio_planejado timestamptz,
      fim_planejado timestamptz, atendimento_servico_id uuid,
      nome_snapshot text, ordem_snapshot integer,
      duracao_minutos_snapshot integer, recursos_snapshot jsonb
    );

    insert into public.atendimento_etapa_contribuicoes (
      id, atendimento_id, atendimento_etapa_id, atendimento_servico_id,
      servico_etapa_origem_id, ordem, etapa_nome_snapshot,
      duracao_base_snapshot, duracao_calculada_snapshot,
      recursos_snapshot, habilitacoes_snapshot
    )
    select item.id, v_atendimento_id, item.atendimento_etapa_id,
      item.atendimento_servico_id, item.servico_etapa_origem_id,
      item.ordem, item.etapa_nome_snapshot, item.duracao_base_snapshot,
      item.duracao_calculada_snapshot, item.recursos_snapshot,
      item.habilitacoes_snapshot
    from jsonb_to_recordset(v_contribuicoes) as item(
      id uuid, atendimento_etapa_id uuid, atendimento_servico_id uuid,
      servico_etapa_origem_id uuid, ordem integer,
      etapa_nome_snapshot text, duracao_base_snapshot integer,
      duracao_calculada_snapshot integer, recursos_snapshot jsonb,
      habilitacoes_snapshot jsonb
    );

    begin
      insert into public.atendimento_etapa_funcionarios (
        id, atendimento_etapa_id, funcionario_id,
        inicio_planejado, fim_planejado
      )
      select item.id, item.atendimento_etapa_id, item.funcionario_id,
        item.inicio_planejado, item.fim_planejado
      from jsonb_to_recordset(v_funcionarios) as item(
        id uuid, atendimento_etapa_id uuid, funcionario_id uuid,
        inicio_planejado timestamptz, fim_planejado timestamptz
      )
      order by hashtextextended(item.funcionario_id::text, 0), item.id;
    exception when raise_exception then
      raise exception using errcode = 'PFR01',
        message = 'Conflito ao reservar funcionario.';
    end;

    begin
      insert into public.atendimento_etapa_equipamentos (
        id, atendimento_etapa_id, equipamento_unidade_id,
        inicio_planejado, fim_planejado, porte_snapshot, sexo_snapshot
      )
      select item.id, item.atendimento_etapa_id,
        item.equipamento_unidade_id, item.inicio_planejado,
        item.fim_planejado, v_atendimento ->> 'petPorteSnapshot',
        v_atendimento ->> 'petSexoSnapshot'
      from jsonb_to_recordset(v_equipamentos) as item(
        id uuid, atendimento_etapa_id uuid,
        equipamento_unidade_id uuid, inicio_planejado timestamptz,
        fim_planejado timestamptz
      )
      order by hashtextextended(item.equipamento_unidade_id::text, 0), item.id;
    exception when raise_exception then
      raise exception using errcode = 'PFR01',
        message = 'Conflito ao reservar equipamento.';
    end;

    insert into public.atendimento_etapa_equipamento_supervisoes (
      id, atendimento_etapa_equipamento_id, funcionario_id, inicio, fim
    )
    select item.id, item.atendimento_etapa_equipamento_id,
      item.funcionario_id, item.inicio, item.fim
    from jsonb_to_recordset(v_supervisoes) as item(
      id uuid, atendimento_etapa_equipamento_id uuid,
      funcionario_id uuid, inicio timestamptz, fim timestamptz
    );

    insert into public.atendimento_esperas (
      id, atendimento_id, etapa_anterior_id, etapa_seguinte_id,
      inicio, fim, motivo
    )
    select item.id, v_atendimento_id, item.etapa_anterior_id,
      item.etapa_seguinte_id, item.inicio, item.fim, item.motivo
    from jsonb_to_recordset(v_esperas) as item(
      id uuid, etapa_anterior_id uuid, etapa_seguinte_id uuid,
      inicio timestamptz, fim timestamptz, motivo text
    );

    -- Faz as constraints de cobertura dispararem dentro do bloco atomico,
    -- permitindo converter a falha em PLANO_INVALIDO sem commit parcial.
    begin
      set constraints public.atend_equip_validar_cobertura_supervisao,
        public.atend_equip_supervisao_validar_cobertura immediate;
    exception when raise_exception then
      raise exception using errcode = 'PFP01',
        message = 'A cobertura de supervisao do plano e invalida.';
    end;
    set constraints public.atend_equip_validar_cobertura_supervisao,
      public.atend_equip_supervisao_validar_cobertura deferred;

  exception
    when sqlstate 'PFR01' then
      return jsonb_build_object(
        'status', 'erro', 'codigo', 'CONFLITO_RECURSO',
        'mensagem', sqlerrm
      );
    when sqlstate 'PFP01' then
      return jsonb_build_object(
        'status', 'erro', 'codigo', 'PLANO_INVALIDO',
        'mensagem', sqlerrm
      );
    when unique_violation or foreign_key_violation or check_violation
      or not_null_violation or invalid_text_representation
      or sqlstate '22003' or sqlstate '22007' or sqlstate '22008'
      or sqlstate '22023'
    then
      return jsonb_build_object(
        'status', 'erro', 'codigo', 'PLANO_INVALIDO',
        'mensagem', 'O plano viola uma invariante estrutural.'
      );
    when others then
      return jsonb_build_object(
        'status', 'erro', 'codigo', 'ERRO_INTERNO',
        'mensagem', 'A confirmacao nao pode ser concluida.'
      );
  end;

  select item.versao into v_versao_ocupacao_atual
  from public.agenda_versao_ocupacao item where item.id;

  return jsonb_build_object(
    'status', 'confirmado',
    'codigo', 'CONFIRMADO',
    'grupoAgendamentoId', v_grupo_id,
    'atendimentoId', v_atendimento_id,
    'statusAtendimento', 'agendado',
    'horarioConfirmado', v_grupo ->> 'horarioChegadaComprometido',
    'conclusaoPrevista', v_atendimento ->> 'conclusaoOperacionalPrevista',
    'valorFinal', v_total_servicos,
    'versaoConfiguracao', v_versao_configuracao_atual,
    'versaoOcupacao', v_versao_ocupacao_atual,
    'reutilizadoPorIdempotencia', false
  );
end;
$$;

alter function public.confirmar_agendamento_transacional(jsonb)
  owner to postgres;

revoke all on function public.confirmar_agendamento_transacional(jsonb)
  from public, anon, authenticated;

grant execute on function public.confirmar_agendamento_transacional(jsonb)
  to service_role;


-- Venda e renovação preservam o responsável padrão do Ciclo.
create or replace function public.vender_contrato(p_intencao jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_chave uuid;v_usuario uuid;v_hash text;v_existente public.contrato_operacoes_idempotentes%rowtype;v_pacote public.pacotes%rowtype;v_pet public.pets%rowtype;v_contrato_id uuid;v_item jsonb;v_regra jsonb;v_item_id uuid;v_resposta jsonb;v_ciclo_id uuid;v_ocorrencia jsonb;v_ocorrencia_id uuid;v_ocupacao bigint;v_configuracao bigint;v_item_ref jsonb;
begin
 v_chave=(p_intencao->>'chaveIdempotencia')::uuid;v_usuario=(p_intencao->>'usuarioId')::uuid;v_hash=md5((p_intencao-'usuarioId')::text);perform pg_advisory_xact_lock(hashtextextended(v_chave::text,0));perform pg_advisory_xact_lock(hashtextextended('agenda:ocupacao',0));select versao into v_ocupacao from public.agenda_versao_ocupacao where id=true for update;select versao into v_configuracao from public.agenda_versao_configuracao where id=true;if v_ocupacao<>(p_intencao->>'ocupacaoAgendaVersao')::bigint or v_configuracao<>(p_intencao->>'configuracaoAgendaVersao')::bigint then return jsonb_build_object('status','conflito','codigo','DISPONIBILIDADE_ALTERADA','mensagem','A disponibilidade ou a configuração mudou. Consulte novamente antes de vender.');end if;if jsonb_typeof(p_intencao->'ocorrencias')<>'array' or jsonb_array_length(p_intencao->'ocorrencias')=0 then return jsonb_build_object('status','invalido','codigo','CICLO_SEM_RESERVAS','mensagem','A venda exige um primeiro Ciclo integralmente validado pelo Motor.');end if;select * into v_existente from public.contrato_operacoes_idempotentes where chave_idempotencia=v_chave for update;
 if found then if v_existente.usuario_id<>v_usuario or v_existente.hash_intencao<>v_hash then return jsonb_build_object('status','conflito','codigo','IDEMPOTENCIA_DIVERGENTE','mensagem','A chave de repetição já foi utilizada por outra venda.');end if;if v_existente.resposta is not null then return v_existente.resposta;end if;else insert into public.contrato_operacoes_idempotentes(chave_idempotencia,usuario_id,hash_intencao)values(v_chave,v_usuario,v_hash);end if;
 select * into v_pacote from public.pacotes where id=(p_intencao->>'pacoteId')::uuid for update;if not found or not v_pacote.ativo then return jsonb_build_object('status','invalido','codigo','PACOTE_INDISPONIVEL','mensagem','O Pacote não está disponível para venda.');end if;if v_pacote.versao<>(p_intencao->>'pacoteVersaoEsperada')::bigint then return jsonb_build_object('status','conflito','codigo','PACOTE_ALTERADO','mensagem','O Pacote mudou. Faça uma nova simulação antes de confirmar.');end if;
 select * into v_pet from public.pets where id=p_intencao->>'petId' for update;if not found or v_pet.cliente_id<>p_intencao->>'clienteId' then return jsonb_build_object('status','invalido','codigo','CLIENTE_PET_INCOMPATIVEL','mensagem','O pet não pertence ao cliente selecionado.');end if;if jsonb_build_object('nome',v_pet.nome,'especie',v_pet.especie,'racaId',v_pet.raca_id,'porte',v_pet.porte,'pelagem',v_pet.pelagem,'peso',v_pet.peso,'temperamento',v_pet.temperamento)<>(p_intencao->'petPerfilEsperado') then return jsonb_build_object('status','conflito','codigo','PERFIL_PET_ALTERADO','mensagem','O perfil do pet mudou. Revise os preços antes de confirmar.');end if;
 if not exists(select 1 from public.funcionarios where id=(p_intencao->>'funcionarioResponsavelId')::uuid and ativo) then return jsonb_build_object('status','invalido','codigo','FUNCIONARIO_INVALIDO','mensagem','Escolha um funcionário responsável ativo.');end if;
 insert into public.contratos(cliente_id,pet_id,pacote_id,pacote_versao_snapshot,pacote_nome_snapshot,pet_nome_snapshot,pet_especie_snapshot,pet_raca_id_snapshot,pet_raca_nome_snapshot,pet_porte_snapshot,pet_pelagem_snapshot,pet_peso_snapshot,pet_temperamento_snapshot,data_ancora,dia_semana_fixo,horario_fixo,timezone_snapshot,modalidade_transporte,taxidog_ciclo_id,configuracao_agenda_versao_snapshot,renovacao_automatica,valor_avulso_equivalente_snapshot,valor_pacote_calculado_snapshot,valor_contratado,motivo_ajuste_valor,valor_ajustado_por,criado_por,status,modelo_operacional_versao)
 values(p_intencao->>'clienteId',p_intencao->>'petId',v_pacote.id,v_pacote.versao,v_pacote.nome,p_intencao#>>'{petSnapshot,nome}',p_intencao#>>'{petSnapshot,especie}',(p_intencao#>>'{petSnapshot,racaId}')::uuid,p_intencao#>>'{petSnapshot,racaNome}',p_intencao#>>'{petSnapshot,porte}',p_intencao#>>'{petSnapshot,pelagem}',nullif(p_intencao#>>'{petSnapshot,peso}','')::numeric,p_intencao#>>'{petSnapshot,temperamento}',(p_intencao->>'dataAncora')::date,(p_intencao->>'diaSemanaFixo')::smallint,(p_intencao->>'horarioFixo')::time,p_intencao->>'timezone',p_intencao->>'modalidadeTransporte',nullif(p_intencao->>'taxidogCicloId','')::uuid,(p_intencao->>'configuracaoAgendaVersao')::bigint,(p_intencao->>'renovacaoAutomatica')::boolean,(p_intencao->>'totalAvulso')::numeric,(p_intencao->>'totalPacote')::numeric,(p_intencao->>'valorContratado')::numeric,nullif(p_intencao->>'motivoAjusteValor',''),case when (p_intencao->>'valorContratado')::numeric<>(p_intencao->>'totalPacote')::numeric then v_usuario else null end,v_usuario,'ativo',30) returning id into v_contrato_id;
 for v_item in select value from jsonb_array_elements(p_intencao->'itens') loop
  insert into public.contrato_itens(contrato_id,pacote_servico_id_origem,servico_id,servico_nome_snapshot,ordem_snapshot,quantidade_por_ciclo,intervalo_quantidade,intervalo_unidade,offset_inicial_quantidade,offset_inicial_unidade,preco_avulso_base_unitario_snapshot,preco_avulso_unitario_snapshot,preco_pacote_base_unitario_snapshot,preco_pacote_unitario_calculado_snapshot,total_avulso_snapshot,total_pacote_calculado_snapshot,desconto_percentual_snapshot)
  values(v_contrato_id,(v_item->>'pacoteServicoId')::uuid,(v_item->>'servicoId')::uuid,v_item->>'servicoNome',(v_item->>'ordem')::int,(v_item->>'quantidadePorCiclo')::int,(v_item->>'intervaloQuantidade')::int,v_item->>'intervaloUnidade',(v_item->>'offsetInicialQuantidade')::int,v_item->>'offsetInicialUnidade',(v_item->>'precoAvulsoBaseUnitario')::numeric,(v_item->>'precoAvulsoUnitario')::numeric,(v_item->>'precoPacoteBaseUnitario')::numeric,(v_item->>'precoPacoteUnitario')::numeric,(v_item->>'totalAvulso')::numeric,(v_item->>'totalPacote')::numeric,(v_item->>'descontoPercentual')::numeric) returning id into v_item_id;
  for v_regra in select value from jsonb_array_elements(v_item->'regras') loop insert into public.contrato_item_regras_aplicadas(contrato_item_id,origem,regra_servico_id_origem,regra_pacote_id_origem,ordem,criterio,descricao_snapshot,valor_referencia_snapshot,acrescimo_valor_snapshot)values(v_item_id,v_regra->>'origem',nullif(v_regra->>'regraServicoId','')::uuid,nullif(v_regra->>'regraPacoteId','')::uuid,(v_regra->>'ordem')::int,v_regra->>'criterio',v_regra->>'descricao',v_regra->>'referencia',(v_regra->>'acrescimoValor')::numeric);end loop;
 end loop;
 insert into public.contrato_ciclos(contrato_id,numero,estado,situacao_financeira,data_ancora_pretendida,dia_semana_pretendido,horario_pretendido,modalidade_transporte_pretendida,taxidog_ciclo_id_pretendido,funcionario_responsavel_padrao_id,configuracao_agenda_versao,ocupacao_agenda_versao,criado_por)
 values(v_contrato_id,1,'reservado','pendente',(p_intencao->>'dataAncora')::date,(p_intencao->>'diaSemanaFixo')::smallint,(p_intencao->>'horarioFixo')::time,p_intencao->>'modalidadeTransporte',nullif(p_intencao->>'taxidogCicloId','')::uuid,(p_intencao->>'funcionarioResponsavelId')::uuid,(p_intencao->>'configuracaoAgendaVersao')::bigint,v_ocupacao,v_usuario) returning id into v_ciclo_id;
 for v_ocorrencia in select value from jsonb_array_elements(p_intencao->'ocorrencias') loop
  insert into public.contrato_ciclo_ocorrencias(ciclo_id,ordem,data_operacional,horario_apresentado,inicio_operacional,conclusao_prevista,taxidog_ciclo_id,plano_operacional)
  values(v_ciclo_id,(v_ocorrencia->>'ordem')::int,(v_ocorrencia->>'data')::date,(v_ocorrencia->>'horarioApresentado')::time,(((v_ocorrencia->>'data')::date+(v_ocorrencia->>'inicioOperacional')::time) at time zone (p_intencao->>'timezone')),(((v_ocorrencia->>'data')::date+(v_ocorrencia->>'conclusaoPrevista')::time) at time zone (p_intencao->>'timezone')),nullif(v_ocorrencia->>'taxidogCicloId','')::uuid,v_ocorrencia->'plano') returning id into v_ocorrencia_id;
  for v_item_ref in select value from jsonb_array_elements(v_ocorrencia->'itens') loop
   insert into public.contrato_ciclo_ocorrencia_itens(ocorrencia_id,ciclo_id,contrato_item_id,ordinal_no_item)
   select v_ocorrencia_id,v_ciclo_id,id,(v_item_ref->>'ordinal')::int from public.contrato_itens where contrato_id=v_contrato_id and servico_id=(v_item_ref->>'servicoId')::uuid;
  end loop;
 end loop;
 update public.agenda_versao_ocupacao set versao=versao+1,updated_at=statement_timestamp() where id=true;
 insert into public.contrato_eventos(contrato_id,tipo,detalhes,registrado_por)values(v_contrato_id,'contrato_criado',jsonb_build_object('chaveIdempotencia',v_chave),v_usuario);v_resposta=jsonb_build_object('status','criado','contratoId',v_contrato_id);update public.contrato_operacoes_idempotentes set contrato_id=v_contrato_id,resposta=v_resposta,concluido_em=statement_timestamp() where chave_idempotencia=v_chave;return v_resposta;
end;$$;
revoke all on function public.vender_contrato(jsonb) from public,anon,authenticated;grant execute on function public.vender_contrato(jsonb) to service_role;

-- Chamado por uma Edge que acabou de recalcular o próximo Ciclo no Motor.
-- A ausência de capacidade não impede a renovação: cria a pendência sem reserva.
create or replace function public.renovar_ciclo_contrato(p_intencao jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_contrato public.contratos%rowtype;v_atual public.contrato_ciclos%rowtype;v_novo uuid;v_numero int;v_usuario uuid;v_disponivel boolean;v_manual boolean;v_responsavel uuid;v_ocupacao bigint;v_o jsonb;v_oid uuid;v_ref jsonb;
begin
 v_usuario=(p_intencao->>'usuarioId')::uuid;v_disponivel=(p_intencao->>'disponivel')::boolean;
 perform pg_advisory_xact_lock(hashtextextended('contrato:'||(p_intencao->>'contratoId'),0));perform pg_advisory_xact_lock(hashtextextended('agenda:ocupacao',0));
 select * into v_contrato from public.contratos where id=(p_intencao->>'contratoId')::uuid for update;
 if not found then return jsonb_build_object('status','invalido','codigo','CONTRATO_NAO_ENCONTRADO');end if;
 select * into v_atual from public.contrato_ciclos where contrato_id=v_contrato.id order by numero desc limit 1 for update;
 if not found or v_atual.estado<>'concluido' then return jsonb_build_object('status','invalido','codigo','CICLO_ATUAL_NAO_CONCLUIDO');end if;
 if exists(select 1 from public.contrato_ciclos where contrato_id=v_contrato.id and estado in('reservado','requer_revisao','em_andamento')) then return jsonb_build_object('status','conflito','codigo','CICLO_ABERTO_EXISTENTE');end if;
 if not v_contrato.renovacao_automatica and coalesce((p_intencao->>'renovacaoManual')::boolean,false)=false then return jsonb_build_object('status','sem_renovacao');end if;
 v_manual=coalesce((p_intencao->>'renovacaoManual')::boolean,false);
 v_responsavel=case when v_manual and nullif(p_intencao->>'funcionarioResponsavelId','') is not null then (p_intencao->>'funcionarioResponsavelId')::uuid else v_atual.funcionario_responsavel_padrao_id end;
 if nullif(p_intencao->>'funcionarioResponsavelId','')::uuid is distinct from v_responsavel then return jsonb_build_object('status','invalido','codigo','RESPONSAVEL_NAO_REVALIDADO');end if;
 v_disponivel=v_disponivel and v_responsavel is not null;v_numero=v_atual.numero+1;select versao into v_ocupacao from public.agenda_versao_ocupacao where id=true for update;
 if v_disponivel and v_ocupacao<>(p_intencao->>'ocupacaoAgendaVersao')::bigint then return jsonb_build_object('status','conflito','codigo','DISPONIBILIDADE_ALTERADA');end if;
 insert into public.contrato_ciclos(contrato_id,numero,estado,situacao_financeira,data_ancora_pretendida,dia_semana_pretendido,horario_pretendido,modalidade_transporte_pretendida,taxidog_ciclo_id_pretendido,funcionario_responsavel_padrao_id,configuracao_agenda_versao,ocupacao_agenda_versao,motivo_revisao,criado_por)
 values(v_contrato.id,v_numero,case when v_disponivel then 'reservado' else 'requer_revisao' end,'pendente',(p_intencao->>'dataAncora')::date,(p_intencao->>'diaSemanaFixo')::smallint,(p_intencao->>'horarioFixo')::time,p_intencao->>'modalidadeTransporte',nullif(p_intencao->>'taxidogCicloId','')::uuid,v_responsavel,nullif(p_intencao->>'configuracaoAgendaVersao','')::bigint,case when v_disponivel then v_ocupacao else null end,case when v_disponivel then null else coalesce(nullif(btrim(p_intencao->>'motivoRevisao'),''),'A rotina anterior não possui mais capacidade.') end,v_usuario) returning id into v_novo;
 if v_disponivel then
  if jsonb_typeof(p_intencao->'ocorrencias')<>'array' or jsonb_array_length(p_intencao->'ocorrencias')=0 then raise exception 'CICLO_SEM_RESERVAS';end if;
  for v_o in select value from jsonb_array_elements(p_intencao->'ocorrencias') loop
   insert into public.contrato_ciclo_ocorrencias(ciclo_id,ordem,data_operacional,horario_apresentado,inicio_operacional,conclusao_prevista,taxidog_ciclo_id,plano_operacional)
   values(v_novo,(v_o->>'ordem')::int,(v_o->>'data')::date,(v_o->>'horarioApresentado')::time,(((v_o->>'data')::date+(v_o->>'inicioOperacional')::time) at time zone v_contrato.timezone_snapshot),(((v_o->>'data')::date+(v_o->>'conclusaoPrevista')::time) at time zone v_contrato.timezone_snapshot),nullif(v_o->>'taxidogCicloId','')::uuid,v_o->'plano') returning id into v_oid;
   for v_ref in select value from jsonb_array_elements(v_o->'itens') loop insert into public.contrato_ciclo_ocorrencia_itens(ocorrencia_id,ciclo_id,contrato_item_id,ordinal_no_item)select v_oid,v_novo,id,(v_ref->>'ordinal')::int from public.contrato_itens where contrato_id=v_contrato.id and servico_id=(v_ref->>'servicoId')::uuid;end loop;
  end loop;
  update public.agenda_versao_ocupacao set versao=versao+1,updated_at=statement_timestamp() where id=true;
 end if;
 insert into public.contrato_eventos(contrato_id,tipo,detalhes,registrado_por)values(v_contrato.id,case when v_disponivel then 'ciclo_renovado' else 'renovacao_requer_revisao' end,jsonb_build_object('cicloId',v_novo,'numero',v_numero),v_usuario);
 return jsonb_build_object('status',case when v_disponivel then 'reservado' else 'requer_revisao' end,'cicloId',v_novo,'numero',v_numero);
end;$$;
revoke all on function public.renovar_ciclo_contrato(jsonb) from public,anon,authenticated;grant execute on function public.renovar_ciclo_contrato(jsonb) to service_role;


commit;
