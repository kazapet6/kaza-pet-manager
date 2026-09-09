-- DIAGNÓSTICO SOMENTE LEITURA — MIGRATION 015

-- 1. Existência da tabela.
select
  '01_tabela' as secao,
  'public.atendimento_servico_origens' as objeto_esperado,
  to_regclass('public.atendimento_servico_origens') is not null as encontrada,
  to_regclass('public.atendimento_servico_origens')::text as objeto_catalogo;

-- 2. Colunas, tipos, nulabilidade e defaults.
with colunas_esperadas(column_name, data_type, is_nullable) as (
  values
    ('atendimento_id', 'uuid', 'NO'),
    ('atendimento_servico_id', 'uuid', 'NO'),
    ('originado_por_atendimento_servico_id', 'uuid', 'NO'),
    ('created_at', 'timestamp with time zone', 'NO')
)
select
  '02_colunas' as secao,
  esperada.column_name as coluna_esperada,
  coluna.column_name is not null as encontrada,
  coluna.ordinal_position,
  coluna.data_type,
  coluna.udt_name,
  coluna.is_nullable,
  coluna.column_default,
  coluna.column_name is not null
    and coluna.data_type = esperada.data_type
    and coluna.is_nullable = esperada.is_nullable
    and (
      esperada.column_name <> 'created_at'
      or coluna.column_default is not null
    ) as estrutura_esperada
from colunas_esperadas esperada
left join information_schema.columns coluna
  on coluna.table_schema = 'public'
 and coluna.table_name = 'atendimento_servico_origens'
 and coluna.column_name = esperada.column_name
order by coluna.ordinal_position nulls last, esperada.column_name;

-- 3. Todas as constraints da nova tabela.
select
  '03_constraints' as secao,
  constraint_item.conname as constraint_nome,
  case constraint_item.contype
    when 'p' then 'PRIMARY KEY'
    when 'u' then 'UNIQUE'
    when 'c' then 'CHECK'
    when 'f' then 'FOREIGN KEY'
    when 'x' then 'EXCLUSION'
    else constraint_item.contype::text
  end as constraint_tipo,
  constraint_item.condeferrable as deferrable,
  constraint_item.condeferred as initially_deferred,
  constraint_item.convalidated as validada,
  referenced_schema.nspname as schema_referenciado,
  referenced_table.relname as tabela_referenciada,
  case constraint_item.confdeltype
    when 'a' then 'NO ACTION'
    when 'r' then 'RESTRICT'
    when 'c' then 'CASCADE'
    when 'n' then 'SET NULL'
    when 'd' then 'SET DEFAULT'
    else null
  end as on_delete,
  case constraint_item.confupdtype
    when 'a' then 'NO ACTION'
    when 'r' then 'RESTRICT'
    when 'c' then 'CASCADE'
    when 'n' then 'SET NULL'
    when 'd' then 'SET DEFAULT'
    else null
  end as on_update,
  pg_get_constraintdef(constraint_item.oid, true) as definicao
from pg_constraint constraint_item
join pg_class tabela on tabela.oid = constraint_item.conrelid
join pg_namespace schema_item on schema_item.oid = tabela.relnamespace
left join pg_class referenced_table
  on referenced_table.oid = constraint_item.confrelid
left join pg_namespace referenced_schema
  on referenced_schema.oid = referenced_table.relnamespace
where schema_item.nspname = 'public'
  and tabela.relname = 'atendimento_servico_origens'
order by constraint_tipo, constraint_item.conname;

-- 4. Certificação das constraints obrigatórias.
with constraints_esperadas(nome, tipo) as (
  values
    ('atendimento_servico_origens_pkey', 'p'),
    ('atendimento_servico_origens_distintos_check', 'c'),
    ('atendimento_servico_origens_filho_fkey', 'f'),
    ('atendimento_servico_origens_pai_fkey', 'f')
)
select
  '04_constraints_esperadas' as secao,
  esperada.nome as constraint_esperada,
  case esperada.tipo
    when 'p' then 'PRIMARY KEY'
    when 'c' then 'CHECK'
    when 'f' then 'FOREIGN KEY'
    else esperada.tipo
  end as tipo_esperado,
  constraint_item.oid is not null as encontrada,
  pg_get_constraintdef(constraint_item.oid, true) as definicao_real
from constraints_esperadas esperada
left join pg_constraint constraint_item
  on constraint_item.conname = esperada.nome
 and constraint_item.contype = esperada.tipo
 and constraint_item.conrelid =
   to_regclass('public.atendimento_servico_origens')
order by esperada.nome;

-- 5. Integridade composta: filho e pai no mesmo atendimento.
select
  '05_integridade_composta' as secao,
  constraint_item.conname as constraint_nome,
  pg_get_constraintdef(constraint_item.oid, true) as definicao,
  constraint_item.confrelid = to_regclass('public.atendimento_servicos')
    and constraint_item.confdeltype = 'c'
    as referencia_esperada_com_delete_cascade
from pg_constraint constraint_item
where constraint_item.conrelid =
    to_regclass('public.atendimento_servico_origens')
  and constraint_item.conname in (
    'atendimento_servico_origens_filho_fkey',
    'atendimento_servico_origens_pai_fkey'
  )
order by constraint_item.conname;

-- 6. Índices, incluindo o índice automático da PK.
select
  '06_indices' as secao,
  indice.schemaname as table_schema,
  indice.tablename as tabela,
  indice.indexname as indice_nome,
  indice.indexdef as definicao,
  indice.indexname in (
    'atendimento_servico_origens_atendimento_filho_idx',
    'atendimento_servico_origens_pai_filho_idx'
  ) as indice_explicito_da_015,
  indice.indexname = 'atendimento_servico_origens_pkey'
    as indice_da_primary_key
from pg_indexes indice
where indice.schemaname = 'public'
  and indice.tablename = 'atendimento_servico_origens'
order by indice.indexname;

-- 7. Certificação dos índices explícitos.
with indices_esperados(nome) as (
  values
    ('atendimento_servico_origens_atendimento_filho_idx'),
    ('atendimento_servico_origens_pai_filho_idx')
)
select
  '07_indices_esperados' as secao,
  esperada.nome as indice_esperado,
  indice.indexname is not null as encontrado,
  indice.indexdef as definicao
from indices_esperados esperada
left join pg_indexes indice
  on indice.schemaname = 'public'
 and indice.tablename = 'atendimento_servico_origens'
 and indice.indexname = esperada.nome
order by esperada.nome;

-- 8. Estado de Row Level Security.
select
  '08_rls' as secao,
  schema_item.nspname as table_schema,
  tabela.relname as tabela,
  tabela.relrowsecurity as rls_habilitada,
  tabela.relforcerowsecurity as rls_forcada
from pg_class tabela
join pg_namespace schema_item on schema_item.oid = tabela.relnamespace
where schema_item.nspname = 'public'
  and tabela.relname = 'atendimento_servico_origens';

-- 9. Policies.
select
  '09_policies' as secao,
  policy_item.schemaname as table_schema,
  policy_item.tablename as tabela,
  policy_item.policyname as policy_nome,
  policy_item.permissive,
  policy_item.roles,
  policy_item.cmd as comando,
  policy_item.qual as using_expression,
  policy_item.with_check as with_check_expression
from pg_policies policy_item
where policy_item.schemaname = 'public'
  and policy_item.tablename = 'atendimento_servico_origens'
order by policy_item.policyname;

-- 10. Certificação da policy esperada.
select
  '10_policy_esperada' as secao,
  'atendimento_servico_origens_select' as policy_esperada,
  exists (
    select 1
    from pg_policies policy_item
    where policy_item.schemaname = 'public'
      and policy_item.tablename = 'atendimento_servico_origens'
      and policy_item.policyname = 'atendimento_servico_origens_select'
      and policy_item.cmd = 'SELECT'
      and policy_item.roles @> array['anon', 'authenticated']::name[]
  ) as encontrada_com_roles_e_comando_esperados;

-- 11. Privilégios efetivos da tabela.
with
roles_auditados(role_name) as (
  values ('PUBLIC'), ('anon'), ('authenticated'), ('service_role')
),
privilegios(privilegio) as (
  values
    ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
    ('REFERENCES'), ('TRIGGER')
),
tabela as (
  select classe.oid, classe.relname, classe.relacl, classe.relowner
  from pg_class classe
  join pg_namespace schema_item on schema_item.oid = classe.relnamespace
  where schema_item.nspname = 'public'
    and classe.relname = 'atendimento_servico_origens'
)
select
  '11_grants' as secao,
  tabela.relname as tabela,
  role_item.role_name as role_auditado,
  privilegio_item.privilegio,
  case
    when role_item.role_name = 'PUBLIC' then exists (
      select 1
      from aclexplode(
        coalesce(tabela.relacl, acldefault('r', tabela.relowner))
      ) acl
      where acl.grantee = 0
        and upper(acl.privilege_type) = privilegio_item.privilegio
    )
    when to_regrole(role_item.role_name) is null then null
    else has_table_privilege(
      to_regrole(role_item.role_name),
      tabela.oid,
      privilegio_item.privilegio
    )
  end as possui_privilegio_efetivo,
  role_item.role_name = 'PUBLIC'
    or to_regrole(role_item.role_name) is not null as role_existe
from tabela
cross join roles_auditados role_item
cross join privilegios privilegio_item
order by role_item.role_name, privilegio_item.privilegio;

-- 12. Estado dos dados e ausência de backfill especulativo.
select
  '12_estado_dados' as secao,
  (
    select count(*) from public.atendimento_servico_origens
  ) as arestas_diretas_persistidas,
  (
    select count(*)
    from public.atendimento_servicos
    where originado_por_atendimento_servico_id is not null
  ) as vinculos_singulares_legados,
  (
    select count(*)
    from public.atendimento_servicos
    where origem = 'dependencia'
  ) as servicos_dependencia_existentes,
  (
    select count(*)
    from public.atendimento_servicos
    where origem = 'solicitado'
  ) as servicos_solicitados_existentes;

-- 13. Verificações de integridade dos dados existentes.
select
  '13_integridade_dados' as secao,
  count(*) filter (where filho.atendimento_id is null)
    as arestas_com_filho_ausente,
  count(*) filter (where pai.atendimento_id is null)
    as arestas_com_pai_ausente,
  count(*) filter (
    where origem.atendimento_servico_id =
      origem.originado_por_atendimento_servico_id
  ) as autociclos,
  count(*) filter (
    where filho.atendimento_id is distinct from origem.atendimento_id
       or pai.atendimento_id is distinct from origem.atendimento_id
  ) as arestas_com_atendimento_inconsistente
from public.atendimento_servico_origens origem
left join public.atendimento_servicos filho
  on filho.id = origem.atendimento_servico_id
 and filho.atendimento_id = origem.atendimento_id
left join public.atendimento_servicos pai
  on pai.id = origem.originado_por_atendimento_servico_id
 and pai.atendimento_id = origem.atendimento_id;

-- 14. Duplicidades de arestas.
select
  '14_duplicidades' as secao,
  origem.atendimento_servico_id,
  origem.originado_por_atendimento_servico_id,
  count(*) as quantidade
from public.atendimento_servico_origens origem
group by
  origem.atendimento_servico_id,
  origem.originado_por_atendimento_servico_id
having count(*) > 1
order by
  origem.atendimento_servico_id,
  origem.originado_por_atendimento_servico_id;

-- 15. Resumo automático estrutural.
with
tabela_obrigatoria as (
  select to_regclass('public.atendimento_servico_origens') is not null
    as encontrada
),
colunas_obrigatorias as (
  select count(*)::integer as quantidade
  from information_schema.columns coluna
  where coluna.table_schema = 'public'
    and coluna.table_name = 'atendimento_servico_origens'
    and (
      (coluna.column_name = 'atendimento_id'
        and coluna.data_type = 'uuid'
        and coluna.is_nullable = 'NO')
      or (coluna.column_name = 'atendimento_servico_id'
        and coluna.data_type = 'uuid'
        and coluna.is_nullable = 'NO')
      or (coluna.column_name = 'originado_por_atendimento_servico_id'
        and coluna.data_type = 'uuid'
        and coluna.is_nullable = 'NO')
      or (coluna.column_name = 'created_at'
        and coluna.data_type = 'timestamp with time zone'
        and coluna.is_nullable = 'NO'
        and coluna.column_default is not null)
    )
),
constraints_obrigatorias as (
  select count(*)::integer as quantidade
  from pg_constraint constraint_item
  where constraint_item.conrelid =
      to_regclass('public.atendimento_servico_origens')
    and (
      (constraint_item.conname = 'atendimento_servico_origens_pkey'
        and constraint_item.contype = 'p')
      or (constraint_item.conname =
          'atendimento_servico_origens_distintos_check'
        and constraint_item.contype = 'c')
      or (constraint_item.conname =
          'atendimento_servico_origens_filho_fkey'
        and constraint_item.contype = 'f'
        and constraint_item.confrelid =
          to_regclass('public.atendimento_servicos')
        and constraint_item.confdeltype = 'c')
      or (constraint_item.conname =
          'atendimento_servico_origens_pai_fkey'
        and constraint_item.contype = 'f'
        and constraint_item.confrelid =
          to_regclass('public.atendimento_servicos')
        and constraint_item.confdeltype = 'c')
    )
),
indices_obrigatorios as (
  select count(*)::integer as quantidade
  from pg_indexes indice
  where indice.schemaname = 'public'
    and indice.tablename = 'atendimento_servico_origens'
    and indice.indexname in (
      'atendimento_servico_origens_atendimento_filho_idx',
      'atendimento_servico_origens_pai_filho_idx'
    )
),
rls_obrigatoria as (
  select coalesce(bool_and(tabela.relrowsecurity), false) as habilitada
  from pg_class tabela
  join pg_namespace schema_item on schema_item.oid = tabela.relnamespace
  where schema_item.nspname = 'public'
    and tabela.relname = 'atendimento_servico_origens'
),
policy_obrigatoria as (
  select exists (
    select 1
    from pg_policies policy_item
    where policy_item.schemaname = 'public'
      and policy_item.tablename = 'atendimento_servico_origens'
      and policy_item.policyname = 'atendimento_servico_origens_select'
      and policy_item.cmd = 'SELECT'
      and policy_item.roles @> array['anon', 'authenticated']::name[]
  ) as encontrada
),
grants_frontend as (
  select
    has_table_privilege(
      'anon', 'public.atendimento_servico_origens', 'SELECT'
    ) as anon_select,
    has_table_privilege(
      'authenticated', 'public.atendimento_servico_origens', 'SELECT'
    ) as authenticated_select,
    has_table_privilege(
      'anon', 'public.atendimento_servico_origens', 'INSERT'
    ) or has_table_privilege(
      'anon', 'public.atendimento_servico_origens', 'UPDATE'
    ) or has_table_privilege(
      'anon', 'public.atendimento_servico_origens', 'DELETE'
    ) as anon_escrita,
    has_table_privilege(
      'authenticated', 'public.atendimento_servico_origens', 'INSERT'
    ) or has_table_privilege(
      'authenticated', 'public.atendimento_servico_origens', 'UPDATE'
    ) or has_table_privilege(
      'authenticated', 'public.atendimento_servico_origens', 'DELETE'
    ) as authenticated_escrita
),
dados as (
  select count(*) as arestas_persistidas
  from public.atendimento_servico_origens
)
select
  tabela_obrigatoria.encontrada as tabela_encontrada,
  colunas_obrigatorias.quantidade as colunas_encontradas,
  constraints_obrigatorias.quantidade as constraints_encontradas,
  indices_obrigatorios.quantidade as indices_encontrados,
  rls_obrigatoria.habilitada as rls_habilitada,
  policy_obrigatoria.encontrada as policy_encontrada,
  grants_frontend.anon_select,
  grants_frontend.authenticated_select,
  grants_frontend.anon_escrita,
  grants_frontend.authenticated_escrita,
  dados.arestas_persistidas,
  case
    when tabela_obrigatoria.encontrada
      and colunas_obrigatorias.quantidade = 4
      and constraints_obrigatorias.quantidade = 4
      and indices_obrigatorios.quantidade = 2
      and rls_obrigatoria.habilitada
      and policy_obrigatoria.encontrada
      and grants_frontend.anon_select
      and grants_frontend.authenticated_select
      and not grants_frontend.anon_escrita
      and not grants_frontend.authenticated_escrita
    then 'ESTRUTURA COMPATÍVEL COM A MIGRATION 015'
    else 'REVISAR RESULTADOS DO DIAGNÓSTICO'
  end as resultado
from tabela_obrigatoria
cross join colunas_obrigatorias
cross join constraints_obrigatorias
cross join indices_obrigatorios
cross join rls_obrigatoria
cross join policy_obrigatoria
cross join grants_frontend
cross join dados;
