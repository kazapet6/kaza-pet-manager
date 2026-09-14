-- SOMENTE LEITURA. Não chama RPC, não modifica roles nem consome sequências.
-- Executar integralmente no SQL Editor como postgres, logo após aplicar 036,
-- antes de salvar lotes. Um único SELECT / result set. Não executado nesta entrega.
begin transaction isolation level repeatable read read only;
with
alvos(nome) as (values ('importacao_lotes'),('importacao_clientes_staging'),('importacao_pets_staging'),('importacao_mapeamentos')),
tabelas as (
 select a.nome,c.oid,c.relowner,c.relrowsecurity,c.relforcerowsecurity,c.relacl,
  (coalesce(u.rolsuper,false) or coalesce(u.rolbypassrls,false) or
   (pg_has_role(current_user,c.relowner,'USAGE') and not c.relforcerowsecurity)) as conta_sem_filtro_rls
 from alvos a left join pg_class c on c.oid=to_regclass('public.'||a.nome) and c.relkind='r'
 left join pg_roles u on u.rolname=current_user
),
funcoes_esperadas(assinatura,rpc) as (values
 ('public.importacao_exigir_internal()',false),('public.importacao_filtrar(jsonb,text[])',false),
 ('public.importacao_data_valida(text)',false),('public.importacao_validar(text,jsonb,text)',false),
 ('public.importacao_obter_lote(uuid)',true),('public.importacao_salvar_lote(jsonb)',true),
 ('public.importacao_promover_lote(uuid,integer,boolean)',true),('public.importacao_criar_raca(uuid,text,text,boolean)',true)
),
funcoes as (
 select e.*,p.oid,p.prosecdef,p.proowner,p.proacl,p.proconfig,p.prosrc,
  exists(select 1 from unnest(p.proconfig) v where replace(v,' ','')='search_path=pg_catalog,pg_temp') as caminho_ok
 from funcoes_esperadas e left join pg_proc p on p.oid=to_regprocedure(e.assinatura)
),
roles as (select n.nome,r.oid from (values('anon'),('authenticated'),('service_role')) n(nome) left join pg_roles r on r.rolname=n.nome),
operacoes(op) as (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')),
policies as (
 select t.nome,t.oid,p.polname,p.polcmd,p.polpermissive,p.polroles,pg_get_expr(p.polqual,p.polrelid) as expressao,
  p.polwithcheck is null as sem_with_check,
  lower(regexp_replace(pg_get_expr(p.polqual,p.polrelid),'[[:space:]()]|::text','','g')) as normalizada
 from tabelas t left join pg_policy p on p.polrelid=t.oid
),
contagens as (
 select t.nome,t.oid,t.conta_sem_filtro_rls,
 case when t.oid is not null and t.conta_sem_filtro_rls then
  ((xpath('/table/row/total/text()',query_to_xml(format('select count(*) as total from public.%I',t.nome),false,false,'')))[1]::text)::bigint
 else null end as total from tabelas t
),
linhas as (
 select '00_contexto'::text as secao,current_user::text as objeto,
  'Contagens exigem execução sem filtro RLS; não exporta PII nem tokens.'::text as detalhe,
  true as ok,jsonb_build_object('transacao_somente_leitura',current_setting('transaction_read_only'),'momento',transaction_timestamp()) as payload_json
 union all
 select '01_tabelas','public.'||nome,'Existência e RLS',oid is not null and relrowsecurity,
  jsonb_build_object('existe',oid is not null,'rls',relrowsecurity,'force_rls',relforcerowsecurity,'owner',pg_get_userbyid(relowner)) from tabelas
 union all
 select '02_policies','public.'||nome,'Exatamente uma policy SELECT internal com uid obrigatório',
  count(polname)=1 and bool_and(polname=nome||'_select_internal' and polcmd='r' and polpermissive
   and polroles=array[(select oid from pg_roles where rolname='authenticated')]::oid[]
   and sem_with_check and normalizada='auth.uidisnotnullandauth.jwt->''app_metadata''->>''role''=''internal'''),
  jsonb_build_object('policies',jsonb_agg(jsonb_build_object('nome',polname,'operacao',polcmd,'roles',polroles,'using',expressao,'permissiva',polpermissive)))
 from policies group by nome
 union all
 select '03_privilegios_tabelas','public.'||t.nome,r.nome||':'||o.op,
  t.oid is not null and r.oid is not null and
  has_table_privilege(r.oid,t.oid,o.op)=(r.nome='service_role' or (r.nome='authenticated' and o.op='SELECT')),
  jsonb_build_object('role',r.nome,'operacao',o.op,'permitido',has_table_privilege(r.oid,t.oid,o.op),'nota','SELECT authenticated ainda é filtrado por RLS; escrita interna somente RPC')
 from tabelas t cross join roles r cross join operacoes o
 union all
 select '03_public_tabelas','public.'||t.nome,'PUBLIC sem privilégios',
  t.oid is not null and not exists(select 1 from aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) a where a.grantee=0),
 jsonb_build_object('acl',t.relacl) from tabelas t
 union all
 select '03_anon_colunas','public.'||t.nome,'anon sem acesso por concessões de coluna',
  t.oid is not null and not exists(select 1 from pg_attribute c where c.attrelid=t.oid and c.attnum>0 and not c.attisdropped
   and has_column_privilege('anon',t.oid,c.attnum,'SELECT,INSERT,UPDATE,REFERENCES')),
  jsonb_build_object('nota','Inclui privilégios efetivos de coluna') from tabelas t
 union all
 select '03_privilegios_colunas','public.'||t.nome,r.nome||':sem concessão direta de escrita em colunas',
  t.oid is not null and not exists(select 1 from pg_attribute c cross join lateral aclexplode(c.attacl) a
   where c.attrelid=t.oid and not c.attisdropped and a.grantee in (0,r.oid) and a.privilege_type in ('INSERT','UPDATE','REFERENCES')),
  jsonb_build_object('role',r.nome) from tabelas t cross join roles r where r.nome in ('anon','authenticated')
 union all
 select '04_funcoes',assinatura,case when rpc then 'RPC SECURITY DEFINER' else 'Helper SECURITY INVOKER sem API pública' end,
  oid is not null and prosecdef=rpc and caminho_ok and (not rpc or position('perform public.importacao_exigir_internal();' in prosrc)>0),
  jsonb_build_object('existe',oid is not null,'security_definer',prosecdef,'configuracao',proconfig,'owner',pg_get_userbyid(proowner),'valida_internal',position('perform public.importacao_exigir_internal();' in prosrc)>0) from funcoes
 union all
 select '05_execucao_funcoes',f.assinatura,r.nome||':EXECUTE',
  f.oid is not null and r.oid is not null and has_function_privilege(r.oid,f.oid,'EXECUTE')=(f.rpc and r.nome in ('authenticated','service_role')),
  jsonb_build_object('permitido',has_function_privilege(r.oid,f.oid,'EXECUTE'),'nota','authenticated comum chama RPC, mas autorização no corpo rejeita antes de ler/gravar') from funcoes f cross join roles r
 union all
 select '05_public_funcoes',assinatura,'PUBLIC sem EXECUTE',oid is not null and not exists(select 1 from aclexplode(coalesce(proacl,acldefault('f',proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE'),jsonb_build_object('acl',proacl) from funcoes
 union all
 select '06_guard_internal',assinatura,'Guarda exige uid e app_metadata.role; exceção administrativa service_role',
  oid is not null and position('auth.uid() is null' in prosrc)>0 and position('''app_metadata''->>''role''' in prosrc)>0 and position('''internal''' in prosrc)>0 and position('''service_role''' in prosrc)>0,
  jsonb_build_object('definicao',prosrc) from funcoes where assinatura='public.importacao_exigir_internal()'
 union all
 select '07_contagens','public.'||nome,'Esperado zero imediatamente após migration',oid is not null and conta_sem_filtro_rls and total=0,
  jsonb_build_object('total',total,'contagem_sem_filtro_rls',conta_sem_filtro_rls) from contagens
 union all
 select '08_service_role','service_role','BYPASSRLS administrativo',coalesce((select rolbypassrls from pg_roles where rolname='service_role'),false),
  jsonb_build_object('bypassrls',(select rolbypassrls from pg_roles where rolname='service_role'))
 union all
 select '09_indices','public.'||t.nome,i.relname,ix.indisvalid and ix.indisready,jsonb_build_object('unique',ix.indisunique,'definicao',pg_get_indexdef(i.oid))
 from tabelas t join pg_index ix on ix.indrelid=t.oid join pg_class i on i.oid=ix.indexrelid
 union all
 select '10_constraints','public.'||t.nome,k.conname,k.convalidated,jsonb_build_object('tipo',k.contype,'definicao',pg_get_constraintdef(k.oid))
 from tabelas t join pg_constraint k on k.conrelid=t.oid
 union all
 select '11_triggers','public.'||t.nome,'Nenhum trigger de usuário criado pela 036',
  t.oid is not null and not exists(select 1 from pg_trigger g where g.tgrelid=t.oid and not g.tgisinternal),
  jsonb_build_object('triggers_usuario',(select jsonb_agg(g.tgname) from pg_trigger g where g.tgrelid=t.oid and not g.tgisinternal)) from tabelas t
 union all
 select '12_sequences','staging','Nenhuma sequência pertence às novas tabelas',
  not exists(select 1 from pg_depend d join tabelas t on t.oid=d.refobjid join pg_class c on c.oid=d.objid where c.relkind='S'),
  jsonb_build_object('nota','A 036 não cria/altera/resetta sequências CLI/PET; não chama nextval nesta consulta')
)
select secao,objeto,detalhe,coalesce(ok,false) as ok,payload_json from linhas order by secao,objeto,detalhe;
rollback;
