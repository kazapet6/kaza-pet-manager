-- Ensaio manual após aplicar 035 em banco ISOLADO com registros sintéticos.
-- Não executado nesta entrega. Nenhum INSERT/UPDATE/DELETE.
begin transaction read only;
select current_user, rolbypassrls from pg_roles where rolname='service_role';
select table_name,grantee,privilege_type from information_schema.table_privileges
where table_schema='public' and table_name in ('clientes','pets')
order by table_name,grantee,privilege_type;
select * from pg_policies where schemaname='public' and tablename in ('clientes','pets');
select has_table_privilege('anon','public.clientes','SELECT') as anon_le_clientes,
 has_table_privilege('anon','public.pets','SELECT') as anon_le_pets,
 has_table_privilege('anon','public.clientes','INSERT') as anon_cria_clientes,
 has_table_privilege('anon','public.pets','UPDATE') as anon_edita_pets;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","app_metadata":{}}',true);
select 'authenticated_sem_internal' as perfil,
 (select count(*) from public.clientes) as clientes, (select count(*) from public.pets) as pets;
select set_config('request.jwt.claims','{"role":"authenticated","app_metadata":{"role":"internal"}}',true);
select 'internal' as perfil,
 (select count(*) from public.clientes) as clientes, (select count(*) from public.pets) as pets;
reset role;
rollback;
