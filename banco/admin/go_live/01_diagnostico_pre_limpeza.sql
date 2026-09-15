-- Diagnóstico consolidado e estritamente somente leitura após a Migration 039.
-- Produz UM ÚNICO result set para exportação pelo Supabase SQL Editor.
begin transaction isolation level repeatable read read only;

with
escopo(nome, acao, classe) as (
  values
  ('atendimento_esperas', 'limpar', 'operacional'),
  ('atendimento_etapa_contribuicoes', 'limpar', 'operacional'),
  ('atendimento_etapa_equipamento_supervisoes', 'limpar', 'operacional'),
  ('atendimento_etapa_equipamentos', 'limpar', 'operacional'),
  ('atendimento_etapa_funcionarios', 'limpar', 'operacional'),
  ('atendimento_etapas', 'limpar', 'operacional'),
  ('atendimento_financeiro', 'limpar', 'operacional'),
  ('atendimento_ocorrencias', 'limpar', 'operacional'),
  ('atendimento_recebimentos', 'limpar', 'operacional'),
  ('atendimento_recomendacoes_retorno', 'limpar', 'operacional'),
  ('atendimento_remarcacoes', 'limpar', 'operacional'),
  ('atendimento_servico_acrescimos', 'limpar', 'operacional'),
  ('atendimento_servico_origens', 'limpar', 'operacional'),
  ('atendimento_servicos', 'limpar', 'operacional'),
  ('atendimento_status_eventos', 'limpar', 'operacional'),
  ('atendimentos', 'limpar', 'operacional'),
  ('contrato_ciclo_ocorrencia_itens', 'limpar', 'operacional'),
  ('contrato_ciclo_ocorrencias', 'limpar', 'operacional'),
  ('contrato_ciclos', 'limpar', 'operacional'),
  ('contrato_credito_eventos', 'limpar', 'operacional'),
  ('contrato_credito_operacoes_idempotentes', 'limpar', 'operacional'),
  ('contrato_eventos', 'limpar', 'operacional'),
  ('contrato_item_regras_aplicadas', 'limpar', 'operacional'),
  ('contrato_itens', 'limpar', 'operacional'),
  ('contrato_operacoes_idempotentes', 'limpar', 'operacional'),
  ('contratos', 'limpar', 'operacional'),
  ('grupos_agendamento', 'limpar', 'operacional'),
  ('pets', 'limpar', 'cadastro_operacional'),
  ('clientes', 'limpar', 'cadastro_operacional'),
  ('agenda_versao_configuracao', 'preservar', 'configuracao'),
  ('agenda_versao_ocupacao', 'preservar', 'configuracao'),
  ('configuracao_agenda', 'preservar', 'configuracao'),
  ('equipamento_perfil_itens', 'preservar', 'equipamento'),
  ('equipamento_perfis_capacidade', 'preservar', 'equipamento'),
  ('equipamento_unidades', 'preservar', 'equipamento'),
  ('equipamentos', 'preservar', 'equipamento'),
  ('estabelecimento_blocos', 'preservar', 'agenda_configuracao'),
  ('estabelecimento_excecao_blocos', 'preservar', 'agenda_configuracao'),
  ('estabelecimento_excecoes', 'preservar', 'agenda_configuracao'),
  ('funcionario_etapas', 'preservar', 'funcionario'),
  ('funcionario_intervalos', 'preservar', 'funcionario'),
  ('funcionario_jornadas', 'preservar', 'funcionario'),
  ('funcionario_servicos', 'preservar', 'funcionario'),
  ('funcionarios', 'preservar', 'funcionario'),
  ('janelas_transporte', 'preservar', 'taxidog'),
  ('pacote_operacoes_idempotentes', 'preservar', 'pacote_configuracao'),
  ('pacote_servico_regras_preco', 'preservar', 'pacote_configuracao'),
  ('pacote_servicos', 'preservar', 'pacote_configuracao'),
  ('pacotes', 'preservar', 'pacote_configuracao'),
  ('raca_sinonimos', 'preservar', 'catalogo'),
  ('racas', 'preservar', 'catalogo'),
  ('servico_acoplamentos', 'preservar', 'servico'),
  ('servico_dependencias', 'preservar', 'servico'),
  ('servico_especies', 'preservar', 'servico'),
  ('servico_etapa_recursos', 'preservar', 'servico'),
  ('servico_etapas', 'preservar', 'servico'),
  ('servico_modificadores', 'preservar', 'servico'),
  ('servico_portes', 'preservar', 'servico'),
  ('servico_racas_bloqueadas', 'preservar', 'servico'),
  ('servico_regras_preco', 'preservar', 'preco'),
  ('servicos', 'preservar', 'servico'),
  ('taxidog_ciclo_dias', 'preservar', 'taxidog'),
  ('taxidog_ciclos', 'preservar', 'taxidog'),
  ('unidades_periodo', 'preservar', 'configuracao'),
  ('importacao_lotes', 'preservar', 'importacao_staging'),
  ('importacao_clientes_staging', 'preservar', 'importacao_staging'),
  ('importacao_pets_staging', 'preservar', 'importacao_staging'),
  ('importacao_mapeamentos', 'preservar', 'importacao_staging')
),
tabelas_public as (
  select c.oid, c.relname as nome
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
),
contagens as (
  select e.nome,
         e.acao,
         e.classe,
         x.total,
         x.assinatura
  from escopo e
  join tabelas_public t on t.nome = e.nome
  cross join lateral xmltable(
    '/table/row'
    passing query_to_xml(
      format(
        'select count(*) as total, md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), ''[]''::jsonb)::text) as assinatura from public.%I x',
        e.nome
      ),
      true,
      false,
      ''
    )
    columns
      total bigint path 'total',
      assinatura text path 'assinatura'
  ) x
),
sequencias_esperadas(nome, tabela) as (
  values
    ('clientes_codigo_seq', 'clientes'),
    ('pets_codigo_seq', 'pets')
),
sequencias_estado as (
  select e.nome,
         e.tabela,
         x.last_value,
         x.is_called,
         pg_get_serial_sequence(format('public.%I', e.tabela), 'id') as associada
  from sequencias_esperadas e
  join pg_catalog.pg_class c
    on c.relnamespace = 'public'::regnamespace
   and c.relkind = 'S'
   and c.relname = e.nome
  cross join lateral xmltable(
    '/table/row'
    passing query_to_xml(
      format('select last_value, is_called from public.%I', e.nome),
      true,
      false,
      ''
    )
    columns
      last_value bigint path 'last_value',
      is_called boolean path 'is_called'
  ) x
),
resultados(secao, objeto, valor_atual, valor_esperado, ok, detalhe) as (
  select
    'inventario',
    'tabelas_public_total',
    (select count(*)::text from tabelas_public),
    '68',
    (select count(*) = 68 from tabelas_public),
    'Total de tabelas ordinárias/particionadas no schema public'

  union all
  select
    'inventario',
    'tabelas_operacionais_manifesto',
    count(*)::text,
    '29',
    count(*) = 29,
    'Tabelas classificadas para limpeza'
  from escopo
  where acao = 'limpar'

  union all
  select
    'inventario',
    'tabelas_preservadas_manifesto',
    count(*)::text,
    '39',
    count(*) = 39,
    'Tabelas estruturais e de staging preservadas'
  from escopo
  where acao = 'preservar'

  union all
  select
    'inventario',
    'tabelas_public_inesperadas',
    count(*)::text,
    '0',
    count(*) = 0,
    coalesce(string_agg(t.nome, ', ' order by t.nome), 'nenhuma')
  from tabelas_public t
  where not exists (select 1 from escopo e where e.nome = t.nome)

  union all
  select
    'inventario',
    'tabelas_manifesto_ausentes',
    count(*)::text,
    '0',
    count(*) = 0,
    coalesce(string_agg(e.nome, ', ' order by e.nome), 'nenhuma')
  from escopo e
  where not exists (select 1 from tabelas_public t where t.nome = e.nome)

  union all
  select 'staging', 'lotes_abertos',
         count(*)::text, '1', count(*) = 1,
         'status diferente de concluido/cancelado e completed_at nulo'
  from public.importacao_lotes
  where status not in ('concluido', 'cancelado') and completed_at is null

  union all
  select 'staging', 'clientes_staging',
         count(*)::text, '329', count(*) = 329,
         'Total de linhas de clientes preservadas'
  from public.importacao_clientes_staging

  union all
  select 'staging', 'clientes_importar',
         count(*)::text, '328', count(*) = 328,
         'Decisão do operador'
  from public.importacao_clientes_staging
  where decisao_operador = 'importar'

  union all
  select 'staging', 'clientes_ignorar',
         count(*)::text, '1', count(*) = 1,
         'Decisão do operador'
  from public.importacao_clientes_staging
  where decisao_operador = 'ignorar'

  union all
  select 'staging', 'pets_staging',
         count(*)::text, '383', count(*) = 383,
         'Total de linhas de pets preservadas'
  from public.importacao_pets_staging

  union all
  select 'staging', 'pets_importar',
         count(*)::text, '381', count(*) = 381,
         'Decisão do operador'
  from public.importacao_pets_staging
  where decisao_operador = 'importar'

  union all
  select 'staging', 'pets_ignorar',
         count(*)::text, '2', count(*) = 2,
         'Decisão do operador'
  from public.importacao_pets_staging
  where decisao_operador = 'ignorar'

  union all
  select 'staging', 'mapeamentos',
         count(*)::text, '0', count(*) = 0,
         'Nenhuma promoção/importação realizada'
  from public.importacao_mapeamentos

  union all
  select 'staging', 'ids_promovidos',
         sum(total)::text, '0', sum(total) = 0,
         'cliente_id_criado, cliente_id_resolvido ou pet_id_criado preenchido'
  from (
    select count(*) as total
    from public.importacao_clientes_staging
    where cliente_id_criado is not null
    union all
    select count(*)
    from public.importacao_pets_staging
    where cliente_id_resolvido is not null or pet_id_criado is not null
  ) promovidos

  union all
  select 'staging', 'linhas_ja_importado',
         sum(total)::text, '0', sum(total) = 0,
         'Status de validação de clientes e pets'
  from (
    select count(*) as total
    from public.importacao_clientes_staging
    where status_validacao = 'ja_importado'
    union all
    select count(*)
    from public.importacao_pets_staging
    where status_validacao = 'ja_importado'
  ) importados

  union all
  select 'staging', 'lotes_concluidos',
         count(*)::text, '0', count(*) = 0,
         'status concluido ou completed_at preenchido'
  from public.importacao_lotes
  where status = 'concluido' or completed_at is not null

  union all
  select
    'dados_operacionais',
    e.nome,
    coalesce(c.total::text, 'AUSENTE'),
    'tabela presente; alvo pós-limpeza=0',
    c.total is not null,
    'Contagem atual anterior à limpeza'
  from escopo e
  left join contagens c on c.nome = e.nome
  where e.acao = 'limpar'

  union all
  select
    'preservacao_estrutural',
    e.nome,
    coalesce(c.total::text, 'AUSENTE'),
    'preservar exatamente',
    c.total is not null,
    case
      when c.assinatura is null then 'tabela ausente'
      else 'md5_json_canonico=' || c.assinatura || '; classe=' || e.classe
    end
  from escopo e
  left join contagens c on c.nome = e.nome
  where e.acao = 'preservar'

  union all
  select
    'sequences',
    e.nome,
    case
      when s.nome is null then 'AUSENTE'
      else format('last_value=%s; is_called=%s', s.last_value, s.is_called)
    end,
    'sequência presente e associada ao ID; leitura sem nextval',
    s.nome is not null
      and s.associada = format('public.%I', e.nome),
    case
      when s.nome is null then 'sequência ausente'
      else 'tabela=' || e.tabela || '; associada=' || coalesce(s.associada, 'null')
    end
  from sequencias_esperadas e
  left join sequencias_estado s on s.nome = e.nome

  union all
  select
    'seguranca',
    'auth_no_escopo',
    count(*)::text,
    '0',
    count(*) = 0,
    'O diagnóstico e a limpeza classificam somente objetos de public'
  from escopo
  where nome like 'auth.%' or classe = 'auth'

  union all
  select
    'seguranca',
    'importacao_no_conjunto_limpeza',
    count(*)::text,
    '0',
    count(*) = 0,
    'Todas as tabelas importacao_* devem estar classificadas como preservar'
  from escopo
  where nome like 'importacao\_%' escape '\' and acao = 'limpar'

  union all
  select
    'seguranca',
    'acoes_cascade_no_manifesto',
    count(*)::text,
    '0',
    count(*) = 0,
    'O manifesto consolidado admite somente limpar ou preservar; limpeza usa RESTRICT'
  from escopo
  where acao = 'cascade'

  union all
  select
    'dependencias_fk',
    con.conname,
    con.conrelid::regclass::text || ' -> ' || con.confrelid::regclass::text,
    'revisar antes da limpeza',
    true,
    pg_get_constraintdef(con.oid, true)
  from pg_catalog.pg_constraint con
  where con.contype = 'f'
    and (
      con.conrelid in (select oid from tabelas_public)
      or con.confrelid in (select oid from tabelas_public)
    )

  union all
  select
    'triggers_delete_truncate',
    t.tgname,
    t.tgrelid::regclass::text,
    'revisar antes da limpeza',
    true,
    pg_get_triggerdef(t.oid, true)
  from pg_catalog.pg_trigger t
  where not t.tgisinternal
    and t.tgrelid in (select oid from tabelas_public)
    and ((t.tgtype::integer & 8) > 0 or (t.tgtype::integer & 32) > 0)
)
select secao, objeto, valor_atual, valor_esperado, ok, detalhe
from resultados
order by
  case secao
    when 'inventario' then 1
    when 'staging' then 2
    when 'dados_operacionais' then 3
    when 'preservacao_estrutural' then 4
    when 'sequences' then 5
    when 'seguranca' then 6
    when 'dependencias_fk' then 7
    when 'triggers_delete_truncate' then 8
    else 9
  end,
  objeto;

rollback;
