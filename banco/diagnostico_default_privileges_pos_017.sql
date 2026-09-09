-- DIAGNOSTICO SOMENTE LEITURA — DEFAULT PRIVILEGES POS-MIGRATION 017

-- 1. Defaults de tabelas do owner postgres que podem afetar public.
select
  '01_defaults_postgres' as secao,
  pg_get_userbyid(default_acl.defaclrole) as owner_criador,
  case
    when default_acl.defaclnamespace = 0 then '<GLOBAL>'
    else schema_item.nspname
  end as schema_afetado,
  case
    when acl.grantee = 0 then 'PUBLIC'
    else pg_get_userbyid(acl.grantee)
  end as destinatario,
  upper(acl.privilege_type) as privilegio,
  acl.is_grantable,
  pg_get_userbyid(acl.grantor) as concedente
from pg_default_acl default_acl
left join pg_namespace schema_item
  on schema_item.oid = default_acl.defaclnamespace
cross join lateral aclexplode(default_acl.defaclacl) acl
where default_acl.defaclrole = to_regrole('postgres')
  and default_acl.defaclobjtype = 'r'
  and (
    default_acl.defaclnamespace = 0
    or schema_item.nspname = 'public'
  )
order by schema_afetado, destinatario, privilegio;

-- 2. Defaults de supabase_admin apenas para comparacao; a 017 nao os altera.
select
  '02_defaults_supabase_admin' as secao,
  pg_get_userbyid(default_acl.defaclrole) as owner_criador,
  case
    when default_acl.defaclnamespace = 0 then '<GLOBAL>'
    else schema_item.nspname
  end as schema_afetado,
  case
    when acl.grantee = 0 then 'PUBLIC'
    else pg_get_userbyid(acl.grantee)
  end as destinatario,
  upper(acl.privilege_type) as privilegio,
  acl.is_grantable,
  pg_get_userbyid(acl.grantor) as concedente
from pg_default_acl default_acl
left join pg_namespace schema_item
  on schema_item.oid = default_acl.defaclnamespace
cross join lateral aclexplode(default_acl.defaclacl) acl
where default_acl.defaclrole = to_regrole('supabase_admin')
  and default_acl.defaclobjtype = 'r'
  and (
    default_acl.defaclnamespace = 0
    or schema_item.nspname = 'public'
  )
order by schema_afetado, destinatario, privilegio;

-- 3. Resumo dos defaults aplicaveis a futuras tabelas postgres/public.
with defaults_aplicaveis as (
  select
    acl.grantee,
    case
      when acl.grantee = 0 then 'PUBLIC'
      else pg_get_userbyid(acl.grantee)
    end as destinatario,
    upper(acl.privilege_type) as privilegio
  from pg_default_acl default_acl
  left join pg_namespace schema_item
    on schema_item.oid = default_acl.defaclnamespace
  cross join lateral aclexplode(default_acl.defaclacl) acl
  where default_acl.defaclrole = to_regrole('postgres')
    and default_acl.defaclobjtype = 'r'
    and (
      default_acl.defaclnamespace = 0
      or schema_item.nspname = 'public'
    )
), estado as (
  select
    exists (
      select 1 from defaults_aplicaveis
      where destinatario = 'PUBLIC'
    ) as public_possui_privilegio,
    exists (
      select 1 from defaults_aplicaveis
      where destinatario = 'anon' and privilegio = 'SELECT'
    ) as anon_select,
    exists (
      select 1 from defaults_aplicaveis
      where destinatario = 'anon'
        and privilegio in (
          'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
        )
    ) as anon_escrita,
    exists (
      select 1 from defaults_aplicaveis
      where destinatario = 'authenticated' and privilegio = 'SELECT'
    ) as authenticated_select,
    exists (
      select 1 from defaults_aplicaveis
      where destinatario = 'authenticated'
        and privilegio in (
          'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
        )
    ) as authenticated_escrita,
    exists (
      select 1 from defaults_aplicaveis
      where destinatario = 'service_role' and privilegio = 'SELECT'
    ) as service_role_select,
    exists (
      select 1 from defaults_aplicaveis
      where destinatario = 'service_role' and privilegio = 'INSERT'
    ) as service_role_insert,
    exists (
      select 1 from defaults_aplicaveis
      where destinatario = 'service_role' and privilegio = 'UPDATE'
    ) as service_role_update,
    exists (
      select 1 from defaults_aplicaveis
      where destinatario = 'service_role' and privilegio = 'DELETE'
    ) as service_role_delete
)
select
  '03_resumo_final' as secao,
  not estado.public_possui_privilegio as public_sem_privilegios,
  estado.anon_select,
  estado.anon_escrita,
  estado.authenticated_select,
  estado.authenticated_escrita,
  estado.service_role_select,
  estado.service_role_insert,
  estado.service_role_update,
  estado.service_role_delete,
  estado.anon_escrita or estado.authenticated_escrita
    or estado.public_possui_privilegio as risco_para_tabelas_futuras,
  case
    when not estado.public_possui_privilegio
      and not estado.anon_escrita
      and not estado.authenticated_escrita
      and estado.service_role_select
      and estado.service_role_insert
      and estado.service_role_update
      and estado.service_role_delete
    then 'DEFAULT PRIVILEGES SEGUROS'
    else 'REVISAR DEFAULT PRIVILEGES'
  end as resultado
from estado;
