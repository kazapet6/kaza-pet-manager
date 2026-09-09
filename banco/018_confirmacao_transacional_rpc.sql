begin;

-- Persiste um plano que ja foi recalculado e precificado pelo backend
-- confiavel. A funcao nao e Motor: ela valida a forma e as somas do plano,
-- coordena concorrencia e deixa FKs, checks e triggers protegerem o dominio.
--
-- Contrato: grupo e atendimento sao objetos; servicos, origens, acrescimos,
-- etapas, contribuicoes, funcionarios, equipamentos, supervisoes e esperas
-- sao arrays. Os nomes escalares de grupo/atendimento usam camelCase. Nos
-- arrays, os nomes sao os nomes SQL declarados em cada jsonb_to_recordset.
-- IDs das linhas novas sao UUIDs gerados pelo backend e servem somente para
-- ligar o plano internamente; a funcao e executavel apenas pela service_role.
create or replace function public.confirmar_agendamento_transacional(
  p_plano jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  grupo jsonb;
  atendimento jsonb;
  servicos jsonb;
  origens jsonb;
  acrescimos jsonb;
  etapas jsonb;
  contribuicoes jsonb;
  funcionarios jsonb;
  equipamentos jsonb;
  supervisoes jsonb;
  esperas jsonb;
  grupo_id uuid := gen_random_uuid();
  atendimento_id uuid := gen_random_uuid();
  chave_idempotencia uuid;
  hash_requisicao text;
  versao_configuracao_plano bigint;
  versao_configuracao_atual bigint;
  versao_ocupacao_atual bigint;
  grupo_existente public.grupos_agendamento%rowtype;
  atendimento_existente public.atendimentos%rowtype;
  servico_legado_id uuid;
  total_servicos numeric(10, 2);
  total_informado numeric(10, 2);
  quantidade_solicitados integer;
  pai_incorreto boolean;
  preco_incoerente boolean;
  referencia_invalida boolean;
  duplicidade_invalida boolean;
  elemento_invalido boolean;
  lock_recurso bigint;
begin
  if p_plano is null or jsonb_typeof(p_plano) <> 'object' then
    return jsonb_build_object(
      'status', 'erro', 'codigo', 'PLANO_INVALIDO',
      'mensagem', 'O plano deve ser um objeto JSON.'
    );
  end if;

  grupo := p_plano -> 'grupo';
  atendimento := p_plano -> 'atendimento';
  servicos := coalesce(p_plano -> 'servicos', '[]'::jsonb);
  origens := coalesce(p_plano -> 'origens', '[]'::jsonb);
  acrescimos := coalesce(p_plano -> 'acrescimos', '[]'::jsonb);
  etapas := coalesce(p_plano -> 'etapas', '[]'::jsonb);
  contribuicoes := coalesce(p_plano -> 'contribuicoes', '[]'::jsonb);
  funcionarios := coalesce(p_plano -> 'funcionarios', '[]'::jsonb);
  equipamentos := coalesce(p_plano -> 'equipamentos', '[]'::jsonb);
  supervisoes := coalesce(p_plano -> 'supervisoes', '[]'::jsonb);
  esperas := coalesce(p_plano -> 'esperas', '[]'::jsonb);

  if grupo is null or jsonb_typeof(grupo) <> 'object'
    or atendimento is null or jsonb_typeof(atendimento) <> 'object'
    or jsonb_typeof(servicos) <> 'array'
    or jsonb_typeof(origens) <> 'array'
    or jsonb_typeof(acrescimos) <> 'array'
    or jsonb_typeof(etapas) <> 'array'
    or jsonb_typeof(contribuicoes) <> 'array'
    or jsonb_typeof(funcionarios) <> 'array'
    or jsonb_typeof(equipamentos) <> 'array'
    or jsonb_typeof(supervisoes) <> 'array'
    or jsonb_typeof(esperas) <> 'array'
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
        servicos, origens, acrescimos, etapas, contribuicoes,
        funcionarios, equipamentos, supervisoes, esperas
      ]) as colecoes(colecao)
      cross join lateral jsonb_array_elements(colecao) elementos(elemento)
      where jsonb_typeof(elemento) <> 'object'
    ) into elemento_invalido;

    if elemento_invalido then
      raise exception using errcode = 'PFP01',
        message = 'As colecoes do plano aceitam somente objetos.';
    end if;

    -- Classifica duplicidades relevantes antes que PKs/UNIQUEs precisem
    -- rejeitar o payload durante a persistencia.
    select
      (select count(*) <> count(distinct item.id)
       from jsonb_to_recordset(servicos) item(id uuid))
      or (select count(*) <> count(distinct item.servico_id)
          from jsonb_to_recordset(servicos) item(servico_id uuid))
      or (select count(*) <> count(distinct item.id)
          from jsonb_to_recordset(etapas) item(id uuid))
      or (select count(*) <> count(distinct item.id)
          from jsonb_to_recordset(equipamentos) item(id uuid))
      or exists (
        select 1
        from jsonb_to_recordset(origens) item(
          atendimento_servico_id uuid,
          originado_por_atendimento_servico_id uuid
        )
        group by item.atendimento_servico_id,
          item.originado_por_atendimento_servico_id
        having count(*) > 1
      )
    into duplicidade_invalida;

    if duplicidade_invalida then
      raise exception using errcode = 'PFP01',
        message = 'O plano possui IDs, servicos ou arestas duplicados.';
    end if;

    -- Fecha todas as referencias internas no proprio payload. IDs globais
    -- existentes no banco, mas ausentes do plano, nao sao aceitos.
    select
      exists (
        select 1
        from jsonb_to_recordset(etapas) item(
          atendimento_servico_id uuid
        )
        where not exists (
          select 1 from jsonb_to_recordset(servicos) alvo(id uuid)
          where alvo.id = item.atendimento_servico_id
        )
      )
      or exists (
        select 1
        from jsonb_to_recordset(funcionarios) item(
          atendimento_etapa_id uuid
        )
        where not exists (
          select 1 from jsonb_to_recordset(etapas) alvo(id uuid)
          where alvo.id = item.atendimento_etapa_id
        )
      )
      or exists (
        select 1
        from jsonb_to_recordset(equipamentos) item(
          atendimento_etapa_id uuid
        )
        where not exists (
          select 1 from jsonb_to_recordset(etapas) alvo(id uuid)
          where alvo.id = item.atendimento_etapa_id
        )
      )
      or exists (
        select 1
        from jsonb_to_recordset(supervisoes) item(
          atendimento_etapa_equipamento_id uuid
        )
        where not exists (
          select 1 from jsonb_to_recordset(equipamentos) alvo(id uuid)
          where alvo.id = item.atendimento_etapa_equipamento_id
        )
      )
      or exists (
        select 1
        from jsonb_to_recordset(esperas) item(
          etapa_anterior_id uuid, etapa_seguinte_id uuid
        )
        where (item.etapa_anterior_id is not null and not exists (
          select 1 from jsonb_to_recordset(etapas) alvo(id uuid)
          where alvo.id = item.etapa_anterior_id
        )) or (item.etapa_seguinte_id is not null and not exists (
          select 1 from jsonb_to_recordset(etapas) alvo(id uuid)
          where alvo.id = item.etapa_seguinte_id
        ))
      )
      or exists (
        select 1
        from jsonb_to_recordset(contribuicoes) item(
          atendimento_etapa_id uuid, atendimento_servico_id uuid
        )
        where not exists (
          select 1 from jsonb_to_recordset(etapas) alvo(id uuid)
          where alvo.id = item.atendimento_etapa_id
        ) or not exists (
          select 1 from jsonb_to_recordset(servicos) alvo(id uuid)
          where alvo.id = item.atendimento_servico_id
        )
      )
      or exists (
        select 1
        from jsonb_to_recordset(origens) item(
          atendimento_servico_id uuid,
          originado_por_atendimento_servico_id uuid
        )
        where not exists (
          select 1 from jsonb_to_recordset(servicos) alvo(id uuid)
          where alvo.id = item.atendimento_servico_id
        ) or not exists (
          select 1 from jsonb_to_recordset(servicos) alvo(id uuid)
          where alvo.id = item.originado_por_atendimento_servico_id
        )
      )
      or exists (
        select 1
        from jsonb_to_recordset(acrescimos) item(
          atendimento_servico_id uuid
        )
        where not exists (
          select 1 from jsonb_to_recordset(servicos) alvo(id uuid)
          where alvo.id = item.atendimento_servico_id
        )
      )
      or exists (
        select 1
        from jsonb_to_recordset(etapas) item(
          servico_etapa_id uuid, atendimento_servico_id uuid
        )
        join jsonb_to_recordset(servicos) servico(
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
        from jsonb_to_recordset(contribuicoes) item(
          atendimento_servico_id uuid, servico_etapa_origem_id uuid
        )
        join jsonb_to_recordset(servicos) servico(
          id uuid, servico_id uuid
        ) on servico.id = item.atendimento_servico_id
        where not exists (
          select 1
          from public.servico_etapas configurada
          where configurada.id = item.servico_etapa_origem_id
            and configurada.servico_id = servico.servico_id
        )
      )
    into referencia_invalida;

    if referencia_invalida then
      raise exception using errcode = 'PFP01',
        message = 'Uma referencia interna nao pertence ao plano atual.';
    end if;

    chave_idempotencia := (grupo ->> 'chaveIdempotencia')::uuid;
    hash_requisicao := grupo ->> 'hashRequisicao';
    versao_configuracao_plano :=
      (grupo ->> 'configuracaoVersao')::bigint;
    total_informado := (atendimento ->> 'valorCalculado')::numeric(10, 2);
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

  if chave_idempotencia is null
    or hash_requisicao is null
    or hash_requisicao !~ '^[0-9a-f]{64}$'
    or versao_configuracao_plano is null
    or versao_configuracao_plano <= 0
    or total_informado is null
    or total_informado < 0
    or jsonb_array_length(servicos) = 0
    or jsonb_array_length(etapas) = 0
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
    hashtextextended('idempotencia:' || chave_idempotencia::text, 0)
  );

  select item.*
  into grupo_existente
  from public.grupos_agendamento item
  where item.chave_idempotencia = chave_idempotencia;

  if found then
    if grupo_existente.hash_requisicao <> hash_requisicao then
      return jsonb_build_object(
        'status', 'erro', 'codigo', 'IDEMPOTENCIA_CONFLITANTE',
        'mensagem', 'A chave de idempotencia pertence a outra requisicao.'
      );
    end if;

    select item.*
    into atendimento_existente
    from public.atendimentos item
    where item.grupo_agendamento_id = grupo_existente.id
    order by item.created_at, item.id
    limit 1;

    if not found then
      return jsonb_build_object(
        'status', 'erro', 'codigo', 'ERRO_INTERNO',
        'mensagem', 'O resultado idempotente persistido esta incompleto.'
      );
    end if;

    select item.versao into versao_ocupacao_atual
    from public.agenda_versao_ocupacao item where item.id;

    return jsonb_build_object(
      'status', 'confirmado',
      'codigo', 'CONFIRMADO',
      'grupoAgendamentoId', grupo_existente.id,
      'atendimentoId', atendimento_existente.id,
      'statusAtendimento', atendimento_existente.status,
      'horarioConfirmado', grupo_existente.horario_chegada_comprometido,
      'conclusaoPrevista', atendimento_existente.conclusao_operacional_prevista,
      'valorFinal', atendimento_existente.valor_final,
      'versaoConfiguracao', grupo_existente.configuracao_versao,
      'versaoOcupacao', versao_ocupacao_atual,
      'reutilizadoPorIdempotencia', true
    );
  end if;

  select item.versao
  into versao_configuracao_atual
  from public.agenda_versao_configuracao item
  where item.id
  for share;

  if not found then
    return jsonb_build_object(
      'status', 'erro', 'codigo', 'ERRO_INTERNO',
      'mensagem', 'A versao de configuracao nao esta disponivel.'
    );
  end if;

  if versao_configuracao_atual <> versao_configuracao_plano then
    return jsonb_build_object(
      'status', 'erro', 'codigo', 'CONFIGURACAO_ALTERADA',
      'mensagem', 'A configuracao mudou desde o recalculo do plano.',
      'versaoConfiguracaoPlano', versao_configuracao_plano,
      'versaoConfiguracaoAtual', versao_configuracao_atual
    );
  end if;

  begin
    -- Pre-adquire exatamente os advisory locks usados pelos triggers da 008,
    -- em ordem numerica unica, eliminando inversao entre planos multi-recurso.
    for lock_recurso in
    select distinct recurso.lock_id
    from (
      select hashtextextended(item.funcionario_id::text, 0) as lock_id
      from jsonb_to_recordset(funcionarios) as item(funcionario_id uuid)
      union
      select hashtextextended(item.equipamento_unidade_id::text, 0)
      from jsonb_to_recordset(equipamentos)
        as item(equipamento_unidade_id uuid)
    ) recurso
    order by recurso.lock_id
    loop
      perform pg_advisory_xact_lock(lock_recurso);
    end loop;

    select count(*) filter (where item.origem = 'solicitado')::integer
    into quantidade_solicitados
    from jsonb_to_recordset(servicos) as item(
      id uuid, servico_id uuid, ordem integer, origem text
    );

    if quantidade_solicitados = 0 then
      raise exception using errcode = 'PFP01',
        message = 'O plano nao possui servico solicitado.';
    end if;

    select item.servico_id
    into servico_legado_id
    from jsonb_to_recordset(servicos) as item(
      id uuid, servico_id uuid, ordem integer, origem text
    )
    where item.origem = 'solicitado'
    order by item.ordem, item.id
    limit 1;

    -- O pai canonico singular e o pai direto de menor (ordem, id).
    select exists (
      select 1
      from jsonb_to_recordset(servicos) filho(
        id uuid, ordem integer, origem text, pai_canonico_id uuid
      )
      where (filho.origem = 'dependencia')
        and (
          filho.pai_canonico_id is null
          or filho.pai_canonico_id is distinct from (
          select pai.id
          from jsonb_to_recordset(origens) aresta(
            atendimento_servico_id uuid,
            originado_por_atendimento_servico_id uuid
          )
          join jsonb_to_recordset(servicos) pai(id uuid, ordem integer)
            on pai.id = aresta.originado_por_atendimento_servico_id
          where aresta.atendimento_servico_id = filho.id
          order by pai.ordem, pai.id
          limit 1
        )
        )
    ) into pai_incorreto;

    if pai_incorreto then
      raise exception using errcode = 'PFP01',
        message = 'O pai canonico nao segue a ordem deterministica.';
    end if;

    -- Confere somente a aritmetica materializada. As regras que decidiram
    -- quais acrescimos se aplicam continuam pertencendo a precificacao TS.
    select exists (
      select 1
      from jsonb_to_recordset(servicos) item(
        id uuid, preco_base_snapshot numeric, valor_calculado numeric,
        valor_final numeric
      )
      where item.valor_calculado <> item.preco_base_snapshot + coalesce((
        select sum(acrescimo.acrescimo_valor)
        from jsonb_to_recordset(acrescimos) acrescimo(
          atendimento_servico_id uuid, tipo text, acrescimo_valor numeric
        )
        where acrescimo.atendimento_servico_id = item.id
          and acrescimo.tipo = 'preco'
      ), 0)
        or item.valor_final <> item.valor_calculado
    ) into preco_incoerente;

    if preco_incoerente then
      raise exception using errcode = 'PFP01',
        message = 'Os valores materializados dos servicos sao incoerentes.';
    end if;

    select coalesce(sum(item.valor_final), 0)::numeric(10, 2)
    into total_servicos
    from jsonb_to_recordset(servicos) as item(valor_final numeric);

    if total_servicos <> total_informado
      or total_informado <> (atendimento ->> 'valorFinal')::numeric(10, 2)
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
      grupo_id, grupo ->> 'clienteId', grupo ->> 'modalidade', 'interno',
      (grupo ->> 'dataOperacional')::date,
      (grupo ->> 'horarioChegadaComprometido')::timestamptz,
      null, (grupo ->> 'retiradaPrevista')::timestamptz,
      coalesce(grupo ->> 'observacoes', ''),
      (grupo ->> 'taxidogCicloId')::uuid,
      grupo ->> 'taxidogCicloNomeSnapshot',
      (grupo ->> 'taxidogCicloOrdemSnapshot')::integer,
      (grupo ->> 'taxidogColetaInicioSnapshot')::time,
      (grupo ->> 'taxidogColetaFimSnapshot')::time,
      (grupo ->> 'taxidogConclusaoLimiteSnapshot')::time,
      chave_idempotencia, hash_requisicao, versao_configuracao_plano
    );

    insert into public.atendimentos (
      id, pet_id, servico_id, inicio_planejado, status, transporte,
      janela_transporte_id, valor_transporte, observacoes,
      grupo_agendamento_id, horario_chegada_comprometido,
      inicio_operacional_planejado, conclusao_operacional_prevista,
      retirada_prevista, tipo_planejamento, preferencia_funcionario,
      funcionario_preferido_id, pet_nome_snapshot, pet_especie_snapshot,
      pet_raca_id_snapshot, pet_raca_nome_snapshot, pet_sexo_snapshot,
      pet_porte_snapshot, pet_pelagem_snapshot, pet_peso_snapshot,
      pet_temperamento_snapshot, valor_calculado, desconto_valor,
      valor_manual, valor_final, alteracao_valor_autorizada
    ) values (
      atendimento_id, atendimento ->> 'petId', servico_legado_id,
      (atendimento ->> 'inicioOperacionalPlanejado')::timestamptz,
      'agendado', (grupo ->> 'modalidade') = 'taxidog', null, 0,
      coalesce(atendimento ->> 'observacoes', ''), grupo_id,
      (grupo ->> 'horarioChegadaComprometido')::timestamptz,
      (atendimento ->> 'inicioOperacionalPlanejado')::timestamptz,
      (atendimento ->> 'conclusaoOperacionalPrevista')::timestamptz,
      (grupo ->> 'retiradaPrevista')::timestamptz, 'regular',
      atendimento ->> 'preferenciaFuncionario',
      (atendimento ->> 'funcionarioPreferidoId')::uuid,
      atendimento ->> 'petNomeSnapshot',
      atendimento ->> 'petEspecieSnapshot',
      (atendimento ->> 'petRacaIdSnapshot')::uuid,
      atendimento ->> 'petRacaNomeSnapshot',
      atendimento ->> 'petSexoSnapshot',
      atendimento ->> 'petPorteSnapshot',
      atendimento ->> 'petPelagemSnapshot',
      (atendimento ->> 'petPesoSnapshot')::numeric,
      atendimento ->> 'petTemperamentoSnapshot', total_servicos, 0,
      null, total_servicos, false
    );

    insert into public.atendimento_servicos (
      id, atendimento_id, servico_id, ordem, origem,
      originado_por_atendimento_servico_id, nome_snapshot,
      preco_base_snapshot, valor_calculado, desconto_valor,
      valor_manual, valor_final, alteracao_valor_autorizada, ativo
    )
    select item.id, atendimento_id, item.servico_id, item.ordem,
      item.origem, item.pai_canonico_id, item.nome_snapshot,
      item.preco_base_snapshot, item.valor_calculado, 0, null,
      item.valor_final, false, true
    from jsonb_to_recordset(servicos) as item(
      id uuid, servico_id uuid, ordem integer, origem text,
      pai_canonico_id uuid, nome_snapshot text,
      preco_base_snapshot numeric, valor_calculado numeric,
      valor_final numeric
    );

    insert into public.atendimento_servico_origens (
      atendimento_id, atendimento_servico_id,
      originado_por_atendimento_servico_id
    )
    select atendimento_id, item.atendimento_servico_id,
      item.originado_por_atendimento_servico_id
    from jsonb_to_recordset(origens) as item(
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
    from jsonb_to_recordset(acrescimos) as item(
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
    select item.id, atendimento_id, item.servico_etapa_id,
      item.inicio_planejado, item.fim_planejado,
      item.atendimento_servico_id, item.nome_snapshot,
      item.ordem_snapshot, item.duracao_minutos_snapshot,
      item.recursos_snapshot
    from jsonb_to_recordset(etapas) as item(
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
    select item.id, atendimento_id, item.atendimento_etapa_id,
      item.atendimento_servico_id, item.servico_etapa_origem_id,
      item.ordem, item.etapa_nome_snapshot, item.duracao_base_snapshot,
      item.duracao_calculada_snapshot, item.recursos_snapshot,
      item.habilitacoes_snapshot
    from jsonb_to_recordset(contribuicoes) as item(
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
      from jsonb_to_recordset(funcionarios) as item(
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
        item.fim_planejado, atendimento ->> 'petPorteSnapshot',
        atendimento ->> 'petSexoSnapshot'
      from jsonb_to_recordset(equipamentos) as item(
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
    from jsonb_to_recordset(supervisoes) as item(
      id uuid, atendimento_etapa_equipamento_id uuid,
      funcionario_id uuid, inicio timestamptz, fim timestamptz
    );

    insert into public.atendimento_esperas (
      id, atendimento_id, etapa_anterior_id, etapa_seguinte_id,
      inicio, fim, motivo
    )
    select item.id, atendimento_id, item.etapa_anterior_id,
      item.etapa_seguinte_id, item.inicio, item.fim, item.motivo
    from jsonb_to_recordset(esperas) as item(
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

  select item.versao into versao_ocupacao_atual
  from public.agenda_versao_ocupacao item where item.id;

  return jsonb_build_object(
    'status', 'confirmado',
    'codigo', 'CONFIRMADO',
    'grupoAgendamentoId', grupo_id,
    'atendimentoId', atendimento_id,
    'statusAtendimento', 'agendado',
    'horarioConfirmado', grupo ->> 'horarioChegadaComprometido',
    'conclusaoPrevista', atendimento ->> 'conclusaoOperacionalPrevista',
    'valorFinal', total_servicos,
    'versaoConfiguracao', versao_configuracao_atual,
    'versaoOcupacao', versao_ocupacao_atual,
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

commit;
