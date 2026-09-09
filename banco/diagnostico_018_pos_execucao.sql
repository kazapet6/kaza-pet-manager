-- DIAGNOSTICO SOMENTE LEITURA — MIGRATION 018

-- 1. Existencia, owner, SECURITY DEFINER e configuracao da funcao.
select
  '01_funcao' as secao,
  to_regprocedure(
    'public.confirmar_agendamento_transacional(jsonb)'
  ) is not null as existe,
  pg_get_userbyid(funcao.proowner) as owner,
  funcao.prosecdef as security_definer,
  funcao.proconfig as configuracoes,
  pg_get_function_identity_arguments(funcao.oid) as argumentos,
  pg_get_function_result(funcao.oid) as retorno
from pg_proc funcao
join pg_namespace schema_item on schema_item.oid = funcao.pronamespace
where schema_item.nspname = 'public'
  and funcao.proname = 'confirmar_agendamento_transacional'
  and pg_get_function_identity_arguments(funcao.oid) = 'p_plano jsonb';

-- 2. ACL explicita da RPC.
select
  '02_acl_explicita' as secao,
  case
    when acl.grantee = 0 then 'PUBLIC'
    else pg_get_userbyid(acl.grantee)
  end as destinatario,
  acl.privilege_type as privilegio,
  acl.is_grantable,
  pg_get_userbyid(acl.grantor) as concedente
from pg_proc funcao
join pg_namespace schema_item on schema_item.oid = funcao.pronamespace
cross join lateral aclexplode(
  coalesce(funcao.proacl, acldefault('f', funcao.proowner))
) acl
where schema_item.nspname = 'public'
  and funcao.proname = 'confirmar_agendamento_transacional'
  and pg_get_function_identity_arguments(funcao.oid) = 'p_plano jsonb'
order by destinatario, privilegio;

-- 3. EXECUTE efetivo. Nao executa a funcao operacional.
with funcao as (
  select to_regprocedure(
    'public.confirmar_agendamento_transacional(jsonb)'
  ) as oid
)
select
  '03_execute_efetivo' as secao,
  has_function_privilege(
    'anon', funcao.oid, 'EXECUTE'
  ) as anon_execute,
  has_function_privilege(
    'authenticated', funcao.oid, 'EXECUTE'
  ) as authenticated_execute,
  has_function_privilege(
    'service_role', funcao.oid, 'EXECUTE'
  ) as service_role_execute,
  exists (
    select 1
    from pg_proc item
    cross join lateral aclexplode(
      coalesce(item.proacl, acldefault('f', item.proowner))
    ) acl
    where item.oid = funcao.oid
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) as public_execute
from funcao;

-- 4. Certificacao estatica da definicao instalada.
with definicao as (
  select lower(pg_get_functiondef(funcao.oid)) as sql,
    funcao.proconfig
  from pg_proc funcao
  join pg_namespace schema_item on schema_item.oid = funcao.pronamespace
  where schema_item.nspname = 'public'
    and funcao.proname = 'confirmar_agendamento_transacional'
    and pg_get_function_identity_arguments(funcao.oid) = 'p_plano jsonb'
)
select
  '04_invariantes_definicao' as secao,
  proconfig = array['search_path=pg_catalog']::text[]
    as search_path_seguro,
  strpos(sql, 'pg_advisory_xact_lock') > 0 as possui_advisory_locks,
  strpos(sql, 'for share') > 0 as protege_versao_configuracao,
  strpos(sql, 'idempotencia_conflitante') > 0
    as trata_idempotencia_conflitante,
  strpos(sql, 'reutilizadoporidempotencia'', true') > 0
    as trata_retry_idempotente,
  strpos(sql, 'referencia_invalida') > 0
    as valida_referencias_internas,
  strpos(sql, 'duplicidade_invalida') > 0
    as valida_duplicidades,
  strpos(sql, 'order by pai.ordem, pai.id') > 0
    as pai_canonico_deterministico,
  strpos(sql, 'sum(item.valor_final)') > 0
    as recalcula_total_financeiro,
  strpos(sql, 'set constraints public.atend_equip') > 0
    as forca_supervisao_imediata
from definicao;

-- 5. Matriz dos testes pos-execucao. Os itens REQUER_* nao sao simulados por
-- esta auditoria somente leitura e precisam de plano real/duas sessoes.
select *
from (
  values
    (1, 'RPC existe', 'CATALOGO'),
    (2, 'SECURITY DEFINER/search_path/grants', 'CATALOGO'),
    (3, 'anon nao executa', 'CATALOGO'),
    (4, 'authenticated nao executa', 'CATALOGO'),
    (5, 'service_role executa', 'CATALOGO'),
    (6, 'configuracao obsoleta', 'REQUER_CHAMADA_CONTROLADA'),
    (7, 'payload invalido', 'REQUER_CHAMADA_CONTROLADA'),
    (8, 'confirmacao valida', 'REQUER_PLANO_REAL_COM_ROLLBACK'),
    (9, 'retry idempotente', 'REQUER_PLANO_REAL_COM_ROLLBACK'),
    (10, 'idempotencia conflitante', 'REQUER_PLANO_REAL_COM_ROLLBACK'),
    (11, 'rollback integral', 'REQUER_PLANO_REAL_COM_ROLLBACK'),
    (12, 'concorrencia de funcionario', 'REQUER_DUAS_SESSOES'),
    (13, 'concorrencia de equipamento', 'REQUER_DUAS_SESSOES'),
    (14, 'capacidade compartilhada', 'REQUER_DUAS_SESSOES'),
    (15, 'supervisao', 'REQUER_PLANO_REAL_COM_ROLLBACK'),
    (16, 'TaxiDog', 'REQUER_PLANO_REAL_COM_ROLLBACK'),
    (17, 'proveniencia multipla', 'REQUER_PLANO_REAL_COM_ROLLBACK'),
    (18, 'contribuicao acoplada', 'REQUER_PLANO_REAL_COM_ROLLBACK'),
    (19, 'financeiro', 'REQUER_PLANO_REAL_COM_ROLLBACK'),
    (20, 'versao de ocupacao', 'REQUER_PLANO_REAL_COM_ROLLBACK')
) teste(numero, teste, cobertura)
order by numero;

-- 6. Resumo catalogal final.
with funcao as (
  select item.*
  from pg_proc item
  where item.oid = to_regprocedure(
    'public.confirmar_agendamento_transacional(jsonb)'
  )
), estado as (
  select
    exists (select 1 from funcao) as existe,
    coalesce((select prosecdef from funcao), false) as security_definer,
    coalesce((
      select proconfig = array['search_path=pg_catalog']::text[]
      from funcao
    ), false) as search_path_seguro,
    coalesce((select not has_function_privilege(
      'anon', funcao.oid, 'EXECUTE'
    ) from funcao), false) as anon_bloqueado,
    coalesce((select not has_function_privilege(
      'authenticated', funcao.oid, 'EXECUTE'
    ) from funcao), false) as authenticated_bloqueado,
    coalesce((select has_function_privilege(
      'service_role', funcao.oid, 'EXECUTE'
    ) from funcao), false) as service_role_liberada
)
select
  '06_resumo_final' as secao,
  estado.*,
  case
    when existe and security_definer and search_path_seguro
      and anon_bloqueado and authenticated_bloqueado
      and service_role_liberada
    then 'ESTRUTURA RPC 018 COMPATIVEL'
    else 'REVISAR ESTRUTURA RPC 018'
  end as resultado
from estado;
