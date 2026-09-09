-- DIAGNOSTICO SOMENTE LEITURA — DEFAULT PRIVILEGES E MIGRATION 016

-- 1. Default privileges brutos, com ACL expandida.
select
  '01_default_acl_expandida' as secao,
  default_acl.oid as default_acl_oid,
  pg_get_userbyid(default_acl.defaclrole) as papel_responsavel,
  case
    when default_acl.defaclnamespace = 0 then '<todos os schemas>'
    else schema_item.nspname
  end as schema_afetado,
  case default_acl.defaclobjtype
    when 'r' then 'TABLES'
    when 'S' then 'SEQUENCES'
    when 'f' then 'FUNCTIONS'
    when 'T' then 'TYPES'
    when 'n' then 'SCHEMAS'
    else default_acl.defaclobjtype::text
  end as tipo_objeto,
  case
    when acl.grantee = 0 then 'PUBLIC'
    else pg_get_userbyid(acl.grantee)
  end as destinatario,
  acl.privilege_type as privilegio,
  acl.is_grantable,
  pg_get_userbyid(acl.grantor) as concedente,
  array(
    select alvo.nome
    from (
      values ('anon'), ('authenticated'), ('service_role')
    ) alvo(nome)
    where acl.grantee = 0
       or (
         to_regrole(alvo.nome) is not null
         and pg_has_role(to_regrole(alvo.nome), acl.grantee, 'USAGE')
       )
    order by alvo.nome
  ) as roles_auditados_afetados
from pg_default_acl default_acl
left join pg_namespace schema_item
  on schema_item.oid = default_acl.defaclnamespace
cross join lateral aclexplode(default_acl.defaclacl) acl
order by
  papel_responsavel,
  schema_afetado,
  tipo_objeto,
  destinatario,
  privilegio;

-- 2. Default privileges relevantes para novas tabelas no schema public.
select
  '02_defaults_tabelas_public' as secao,
  pg_get_userbyid(default_acl.defaclrole) as papel_responsavel,
  case
    when default_acl.defaclnamespace = 0 then '<todos os schemas>'
    else schema_item.nspname
  end as schema_afetado,
  case
    when acl.grantee = 0 then 'PUBLIC'
    else pg_get_userbyid(acl.grantee)
  end as destinatario,
  acl.privilege_type as privilegio,
  acl.is_grantable,
  array(
    select alvo.nome
    from (
      values ('anon'), ('authenticated'), ('service_role')
    ) alvo(nome)
    where acl.grantee = 0
       or (
         to_regrole(alvo.nome) is not null
         and pg_has_role(to_regrole(alvo.nome), acl.grantee, 'USAGE')
       )
    order by alvo.nome
  ) as roles_auditados_afetados
from pg_default_acl default_acl
left join pg_namespace schema_item
  on schema_item.oid = default_acl.defaclnamespace
cross join lateral aclexplode(default_acl.defaclacl) acl
where default_acl.defaclobjtype = 'r'
  and (
    default_acl.defaclnamespace = 0
    or schema_item.nspname = 'public'
  )
order by papel_responsavel, schema_afetado, destinatario, privilegio;

-- 3. Owners relevantes.
select
  '03_owners' as secao,
  'SCHEMA' as objeto_tipo,
  schema_item.nspname as objeto,
  pg_get_userbyid(schema_item.nspowner) as owner
from pg_namespace schema_item
where schema_item.nspname = 'public'

union all

select
  '03_owners' as secao,
  'TABLE' as objeto_tipo,
  format('%I.%I', schema_item.nspname, tabela.relname) as objeto,
  pg_get_userbyid(tabela.relowner) as owner
from pg_class tabela
join pg_namespace schema_item
  on schema_item.oid = tabela.relnamespace
where schema_item.nspname = 'public'
  and tabela.relkind in ('r', 'p')
  and tabela.relname in (
    'atendimento_servico_origens',
    'atendimento_servicos',
    'atendimentos',
    'atendimento_etapa_funcionarios',
    'atendimento_etapa_equipamentos',
    'agenda_versao_ocupacao'
  )
order by objeto_tipo, objeto;

-- 4. Relacionamentos e heranca entre os roles auditados.
select
  '04_roles_e_heranca' as secao,
  membro.rolname as membro,
  papel.rolname as papel_concedido,
  pg_get_userbyid(membership.grantor) as concedente,
  membership.admin_option,
  membro.rolinherit as membro_herda_privilegios,
  membro.rolbypassrls as membro_bypass_rls
from pg_auth_members membership
join pg_roles membro on membro.oid = membership.member
join pg_roles papel on papel.oid = membership.roleid
where membro.rolname in ('anon', 'authenticated', 'service_role')
   or papel.rolname in ('anon', 'authenticated', 'service_role')
order by membro.rolname, papel.rolname;

-- 5. Atributos de seguranca dos roles auditados.
select
  '05_atributos_roles' as secao,
  role_item.rolname as papel,
  role_item.rolsuper as superuser,
  role_item.rolinherit as inherit,
  role_item.rolcreaterole as create_role,
  role_item.rolcreatedb as create_database,
  role_item.rolcanlogin as pode_login,
  role_item.rolbypassrls as bypass_rls
from pg_roles role_item
where role_item.rolname in ('anon', 'authenticated', 'service_role')
order by role_item.rolname;

-- 6. ACL explicita do schema public.
select
  '06_schema_public_acl' as secao,
  case
    when acl.grantee = 0 then 'PUBLIC'
    else pg_get_userbyid(acl.grantee)
  end as destinatario,
  acl.privilege_type as privilegio,
  acl.is_grantable,
  pg_get_userbyid(acl.grantor) as concedente
from pg_namespace schema_item
cross join lateral aclexplode(
  coalesce(schema_item.nspacl, acldefault('n', schema_item.nspowner))
) acl
where schema_item.nspname = 'public'
order by destinatario, privilegio;

-- 7. Privilegios efetivos no schema public.
with
roles_auditados(nome) as (
  values ('PUBLIC'), ('anon'), ('authenticated'), ('service_role')
),
privilegios(nome) as (
  values ('USAGE'), ('CREATE')
),
schema_public as (
  select schema_item.oid, schema_item.nspacl, schema_item.nspowner
  from pg_namespace schema_item
  where schema_item.nspname = 'public'
)
select
  '07_schema_public_efetivo' as secao,
  role_item.nome as papel,
  privilegio_item.nome as privilegio,
  case
    when role_item.nome = 'PUBLIC' then exists (
      select 1
      from aclexplode(
        coalesce(
          schema_public.nspacl,
          acldefault('n', schema_public.nspowner)
        )
      ) acl
      where acl.grantee = 0
        and upper(acl.privilege_type) = privilegio_item.nome
    )
    when to_regrole(role_item.nome) is null then null
    else has_schema_privilege(
      to_regrole(role_item.nome),
      schema_public.oid,
      privilegio_item.nome
    )
  end as possui_privilegio_efetivo
from schema_public
cross join roles_auditados role_item
cross join privilegios privilegio_item
order by role_item.nome, privilegio_item.nome;

-- 8. ACL explicita instalada na tabela corrigida pela 016.
select
  '08_origens_acl_explicita' as secao,
  case
    when acl.grantee = 0 then 'PUBLIC'
    else pg_get_userbyid(acl.grantee)
  end as destinatario,
  acl.privilege_type as privilegio,
  acl.is_grantable,
  pg_get_userbyid(acl.grantor) as concedente
from pg_class tabela
join pg_namespace schema_item
  on schema_item.oid = tabela.relnamespace
cross join lateral aclexplode(
  coalesce(tabela.relacl, acldefault('r', tabela.relowner))
) acl
where schema_item.nspname = 'public'
  and tabela.relname = 'atendimento_servico_origens'
order by destinatario, privilegio;

-- 9. Privilegios efetivos pos-016 na tabela corrigida.
with
roles_auditados(nome) as (
  values ('PUBLIC'), ('anon'), ('authenticated'), ('service_role')
),
privilegios(nome) as (
  values
    ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
    ('REFERENCES'), ('TRIGGER')
),
tabela_alvo as (
  select tabela.oid, tabela.relacl, tabela.relowner
  from pg_class tabela
  join pg_namespace schema_item
    on schema_item.oid = tabela.relnamespace
  where schema_item.nspname = 'public'
    and tabela.relname = 'atendimento_servico_origens'
)
select
  '09_origens_privilegios_efetivos' as secao,
  role_item.nome as papel,
  privilegio_item.nome as privilegio,
  case
    when role_item.nome = 'PUBLIC' then exists (
      select 1
      from aclexplode(
        coalesce(
          tabela_alvo.relacl,
          acldefault('r', tabela_alvo.relowner)
        )
      ) acl
      where acl.grantee = 0
        and upper(acl.privilege_type) = privilegio_item.nome
    )
    when to_regrole(role_item.nome) is null then null
    else has_table_privilege(
      to_regrole(role_item.nome),
      tabela_alvo.oid,
      privilegio_item.nome
    )
  end as possui_privilegio_efetivo
from tabela_alvo
cross join roles_auditados role_item
cross join privilegios privilegio_item
order by role_item.nome, privilegio_item.nome;

-- 10. RLS e policies da tabela corrigida.
select
  '10_origens_rls_policies' as secao,
  tabela.relrowsecurity as rls_habilitada,
  tabela.relforcerowsecurity as rls_forcada,
  policy_item.policyname as policy_nome,
  policy_item.permissive,
  policy_item.roles,
  policy_item.cmd as comando,
  policy_item.qual as using_expression,
  policy_item.with_check as with_check_expression
from pg_class tabela
join pg_namespace schema_item
  on schema_item.oid = tabela.relnamespace
left join pg_policies policy_item
  on policy_item.schemaname = schema_item.nspname
 and policy_item.tablename = tabela.relname
where schema_item.nspname = 'public'
  and tabela.relname = 'atendimento_servico_origens'
order by policy_item.policyname;

-- 11. Comparacao com tabelas operacionais existentes.
with
tabelas_auditadas(nome) as (
  values
    ('atendimento_servico_origens'),
    ('atendimento_servicos'),
    ('atendimentos'),
    ('atendimento_etapa_funcionarios'),
    ('atendimento_etapa_equipamentos'),
    ('agenda_versao_ocupacao')
),
roles_auditados(nome) as (
  values ('PUBLIC'), ('anon'), ('authenticated'), ('service_role')
),
privilegios(nome) as (
  values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
),
tabelas as (
  select tabela.oid, tabela.relname, tabela.relacl, tabela.relowner
  from pg_class tabela
  join pg_namespace schema_item
    on schema_item.oid = tabela.relnamespace
  join tabelas_auditadas auditada
    on auditada.nome = tabela.relname
  where schema_item.nspname = 'public'
    and tabela.relkind in ('r', 'p')
)
select
  '11_comparacao_tabelas' as secao,
  tabelas.relname as tabela,
  role_item.nome as papel,
  privilegio_item.nome as privilegio,
  case
    when role_item.nome = 'PUBLIC' then exists (
      select 1
      from aclexplode(
        coalesce(tabelas.relacl, acldefault('r', tabelas.relowner))
      ) acl
      where acl.grantee = 0
        and upper(acl.privilege_type) = privilegio_item.nome
    )
    when to_regrole(role_item.nome) is null then null
    else has_table_privilege(
      to_regrole(role_item.nome),
      tabelas.oid,
      privilegio_item.nome
    )
  end as possui_privilegio_efetivo
from tabelas
cross join roles_auditados role_item
cross join privilegios privilegio_item
order by tabelas.relname, role_item.nome, privilegio_item.nome;

-- 12. Resumo final.
with
seguranca_016 as (
  select
    has_table_privilege(
      'anon', 'public.atendimento_servico_origens', 'SELECT'
    ) as anon_select,
    has_table_privilege(
      'anon', 'public.atendimento_servico_origens', 'INSERT'
    ) as anon_insert,
    has_table_privilege(
      'anon', 'public.atendimento_servico_origens', 'UPDATE'
    ) as anon_update,
    has_table_privilege(
      'anon', 'public.atendimento_servico_origens', 'DELETE'
    ) as anon_delete,
    has_table_privilege(
      'authenticated', 'public.atendimento_servico_origens', 'SELECT'
    ) as authenticated_select,
    has_table_privilege(
      'authenticated', 'public.atendimento_servico_origens', 'INSERT'
    ) as authenticated_insert,
    has_table_privilege(
      'authenticated', 'public.atendimento_servico_origens', 'UPDATE'
    ) as authenticated_update,
    has_table_privilege(
      'authenticated', 'public.atendimento_servico_origens', 'DELETE'
    ) as authenticated_delete,
    has_table_privilege(
      'service_role', 'public.atendimento_servico_origens', 'SELECT'
    ) as service_role_select,
    has_table_privilege(
      'service_role', 'public.atendimento_servico_origens', 'INSERT'
    ) as service_role_insert,
    has_table_privilege(
      'service_role', 'public.atendimento_servico_origens', 'UPDATE'
    ) as service_role_update,
    has_table_privilege(
      'service_role', 'public.atendimento_servico_origens', 'DELETE'
    ) as service_role_delete
),
defaults_tabelas as (
  select
    pg_get_userbyid(default_acl.defaclrole) as papel_responsavel,
    case
      when default_acl.defaclnamespace = 0 then '<todos os schemas>'
      else schema_item.nspname
    end as schema_afetado,
    case
      when acl.grantee = 0 then 'PUBLIC'
      else pg_get_userbyid(acl.grantee)
    end as destinatario,
    upper(acl.privilege_type) as privilegio,
    acl.grantee
  from pg_default_acl default_acl
  left join pg_namespace schema_item
    on schema_item.oid = default_acl.defaclnamespace
  cross join lateral aclexplode(default_acl.defaclacl) acl
  where default_acl.defaclobjtype = 'r'
    and (
      default_acl.defaclnamespace = 0
      or schema_item.nspname = 'public'
    )
),
defaults_problematicos as (
  select distinct
    defaults_tabelas.papel_responsavel,
    defaults_tabelas.schema_afetado,
    defaults_tabelas.destinatario,
    defaults_tabelas.privilegio
  from defaults_tabelas
  where defaults_tabelas.privilegio in (
    'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
  )
    and case
      when defaults_tabelas.grantee = 0 then true
      else
        pg_has_role(
          to_regrole('anon'), defaults_tabelas.grantee, 'USAGE'
        )
        or pg_has_role(
          to_regrole('authenticated'), defaults_tabelas.grantee, 'USAGE'
        )
    end
),
resumo_defaults as (
  select
    exists (select 1 from defaults_problematicos)
      as possui_defaults_problematicos,
    coalesce(
      string_agg(
        distinct defaults_problematicos.papel_responsavel,
        ', ' order by defaults_problematicos.papel_responsavel
      ),
      '<nenhum>'
    ) as roles_responsaveis,
    coalesce(
      string_agg(
        distinct format(
          '%s:%s:%s',
          defaults_problematicos.schema_afetado,
          defaults_problematicos.destinatario,
          defaults_problematicos.privilegio
        ),
        ', '
      ),
      '<nenhum>'
    ) as defaults_problematicos_encontrados
  from defaults_problematicos
),
estado as (
  select
    seguranca_016.*,
    seguranca_016.anon_select
      and not seguranca_016.anon_insert
      and not seguranca_016.anon_update
      and not seguranca_016.anon_delete
      and seguranca_016.authenticated_select
      and not seguranca_016.authenticated_insert
      and not seguranca_016.authenticated_update
      and not seguranca_016.authenticated_delete
      and seguranca_016.service_role_select
      and seguranca_016.service_role_insert
      and seguranca_016.service_role_update
      and seguranca_016.service_role_delete
      as migration_016_segura
  from seguranca_016
)
select
  '12_resumo_final' as secao,
  estado.migration_016_segura,
  estado.anon_select,
  estado.anon_insert,
  estado.anon_update,
  estado.anon_delete,
  estado.authenticated_select,
  estado.authenticated_insert,
  estado.authenticated_update,
  estado.authenticated_delete,
  estado.service_role_select,
  estado.service_role_insert,
  estado.service_role_update,
  estado.service_role_delete,
  resumo_defaults.possui_defaults_problematicos,
  resumo_defaults.roles_responsaveis,
  resumo_defaults.defaults_problematicos_encontrados,
  resumo_defaults.possui_defaults_problematicos
    as risco_para_tabelas_futuras,
  case
    when not estado.migration_016_segura
      then 'REVISAR RESULTADOS DO DIAGNOSTICO'
    when resumo_defaults.possui_defaults_problematicos
      then '016 SEGURA — DEFAULT PRIVILEGES EXIGEM CORRECAO'
    else '016 SEGURA — SEM DEFAULT PRIVILEGES PROBLEMATICOS'
  end as resultado
from estado
cross join resumo_defaults;
