begin;
set transaction read only;

with verificacoes as (
  select 'pets_colunas_nullable' secao,
    count(*)=7 and bool_and(is_nullable='YES') ok,
    jsonb_object_agg(column_name,jsonb_build_object('nullable',is_nullable,'default',column_default) order by column_name) detalhe
  from information_schema.columns
  where table_schema='public' and table_name='pets'
    and column_name=any(array['especie','raca_id','sexo','porte','pelagem','temperamento','castrado'])
  union all
  select 'defaults_artificiais_ausentes',
    count(*)=3 and bool_and(column_default is null),
    jsonb_object_agg(column_name,column_default order by column_name)
  from information_schema.columns where table_schema='public' and table_name='pets'
    and column_name=any(array['pelagem','temperamento','castrado'])
  union all
  select 'check_raca_especie', count(*)=1,
    coalesce(jsonb_agg(pg_get_constraintdef(oid)), '[]')
  from pg_constraint where conrelid='public.pets'::regclass and conname='pets_raca_exige_especie_check' and contype='c' and convalidated
  union all
  select 'checks_canonicos_preservados', count(*)=5 and bool_and(presente),
    jsonb_object_agg(campo,presente order by campo)
  from (
    select campo,exists(
      select 1 from pg_constraint
      where conrelid='public.pets'::regclass and contype='c'
        and pg_get_constraintdef(oid) ilike '%'||campo||'%'
        and (campo<>'especie' or (pg_get_constraintdef(oid) ilike '%cao%' and pg_get_constraintdef(oid) ilike '%gato%'))
        and (campo<>'sexo' or (pg_get_constraintdef(oid) ilike '%macho%' and pg_get_constraintdef(oid) ilike '%femea%'))
        and (campo<>'porte' or (pg_get_constraintdef(oid) ilike '%mini%' and pg_get_constraintdef(oid) ilike '%pequeno%' and pg_get_constraintdef(oid) ilike '%medio%' and pg_get_constraintdef(oid) ilike '%grande%' and pg_get_constraintdef(oid) ilike '%gigante%'))
        and (campo<>'pelagem' or (pg_get_constraintdef(oid) ilike '%curta%' and pg_get_constraintdef(oid) ilike '%media%' and pg_get_constraintdef(oid) ilike '%longa%'))
        and (campo<>'temperamento' or (pg_get_constraintdef(oid) ilike '%calmo%' and pg_get_constraintdef(oid) ilike '%moderado%' and pg_get_constraintdef(oid) ilike '%dificil%'))
    ) presente
    from unnest(array['especie','sexo','porte','pelagem','temperamento']) campo
  ) checks
  union all
  select 'fk_raca_especie_preservada', count(*)=1,
    coalesce(jsonb_agg(pg_get_constraintdef(oid)), '[]')
  from pg_constraint where conrelid='public.pets'::regclass and contype='f'
    and confrelid='public.racas'::regclass and pg_get_constraintdef(oid) like '%(raca_id, especie)%'
  union all
  select 'rpcs_importacao', count(*)=2,
    coalesce(jsonb_agg(jsonb_build_object('nome',p.proname,'security_definer',p.prosecdef,'search_path',p.proconfig) order by p.proname),'[]')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.oid=any(array[to_regprocedure('public.importacao_validar(text,jsonb,text)'),to_regprocedure('public.importacao_promover_lote(uuid,integer,boolean)')])
  union all
  select 'rpc_validar_039',
    not p.prosecdef and p.provolatile='s'
      and p.proconfig=array['search_path=pg_catalog, pg_temp']
      and p.prosrc like '%v is not null%'
      and p.prosrc like '%espécie obrigatória quando a raça é informada%'
      and p.prosrc not ilike '%coalesce(n->>''pelagem'',''curta'')%'
      and p.prosrc not ilike '%coalesce(n->>''temperamento'',''calmo'')%',
    jsonb_build_object('security_definer',p.prosecdef,'volatilidade',p.provolatile,'search_path',p.proconfig)
  from pg_proc p where p.oid=to_regprocedure('public.importacao_validar(text,jsonb,text)')
  union all
  select 'rpc_promover_039',
    p.prosecdef and p.proconfig=array['search_path=pg_catalog, pg_temp']
      and p.prosrc like '%nullif(n->>''especie'','''')%'
      and p.prosrc like '%jsonb_typeof(n->''castrado'')=''boolean''%'
      and p.prosrc like '%else null end%'
      and p.prosrc not ilike '%SRD%',
    jsonb_build_object('security_definer',p.prosecdef,'search_path',p.proconfig)
  from pg_proc p where p.oid=to_regprocedure('public.importacao_promover_lote(uuid,integer,boolean)')
  union all
  select 'acl_promover',
    not has_function_privilege('anon','public.importacao_promover_lote(uuid,integer,boolean)','EXECUTE')
      and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')
      and has_function_privilege('authenticated','public.importacao_promover_lote(uuid,integer,boolean)','EXECUTE')
      and has_function_privilege('service_role','public.importacao_promover_lote(uuid,integer,boolean)','EXECUTE'),
    jsonb_build_object('anon',has_function_privilege('anon','public.importacao_promover_lote(uuid,integer,boolean)','EXECUTE'),'public',exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE'),'authenticated',has_function_privilege('authenticated','public.importacao_promover_lote(uuid,integer,boolean)','EXECUTE'),'service_role',has_function_privilege('service_role','public.importacao_promover_lote(uuid,integer,boolean)','EXECUTE'))
  from pg_proc p where p.oid=to_regprocedure('public.importacao_promover_lote(uuid,integer,boolean)')
  union all
  select 'acl_validar_helper',
    not has_function_privilege('anon','public.importacao_validar(text,jsonb,text)','EXECUTE')
      and not has_function_privilege('authenticated','public.importacao_validar(text,jsonb,text)','EXECUTE')
      and not has_function_privilege('service_role','public.importacao_validar(text,jsonb,text)','EXECUTE')
      and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE'),
    jsonb_build_object('anon',has_function_privilege('anon','public.importacao_validar(text,jsonb,text)','EXECUTE'),'authenticated',has_function_privilege('authenticated','public.importacao_validar(text,jsonb,text)','EXECUTE'),'service_role',has_function_privilege('service_role','public.importacao_validar(text,jsonb,text)','EXECUTE'))
  from pg_proc p where p.oid=to_regprocedure('public.importacao_validar(text,jsonb,text)')
  union all
  select 'lote_e_decisoes_preservados',
    coalesce(bool_and(c.original is not null and c.resolvido is not null and c.avisos is not null) filter(where c.lote_id is not null),true)
      and coalesce(bool_and(p.original is not null and p.resolvido is not null and p.avisos is not null) filter(where p.lote_id is not null),true)
      and not exists(select 1 from public.importacao_clientes_staging where decisao_operador not in ('importar','ignorar','existente'))
      and not exists(select 1 from public.importacao_pets_staging where decisao_operador not in ('importar','ignorar','existente')),
    jsonb_build_object('lotes',count(distinct l.id),'clientes_staging',count(distinct (c.lote_id,c.external_id)),'pets_staging',count(distinct (p.lote_id,p.external_id)),
      'decisoes_clientes',coalesce((select jsonb_object_agg(decisao_operador,qtd) from (select decisao_operador,count(*) qtd from public.importacao_clientes_staging group by decisao_operador) x),'{}'),
      'decisoes_pets',coalesce((select jsonb_object_agg(decisao_operador,qtd) from (select decisao_operador,count(*) qtd from public.importacao_pets_staging group by decisao_operador) x),'{}'))
  from public.importacao_lotes l
  left join public.importacao_clientes_staging c on c.lote_id=l.id
  left join public.importacao_pets_staging p on p.lote_id=l.id
  union all
  select 'dominios_nao_relacionados',
    not exists(select 1 from (values('public.atendimentos'),('public.contratos'),('public.pacotes'),('public.servicos'),('public.servico_regras_preco')) v(nome) where position(nome in lower(p.prosrc))>0),
    jsonb_build_object('rpc','importacao_promover_lote','dominios_proibidos',jsonb_build_array('atendimentos','contratos','pacotes','servicos','servico_regras_preco'))
  from pg_proc p where p.oid=to_regprocedure('public.importacao_promover_lote(uuid,integer,boolean)')
)
select secao,ok,detalhe from verificacoes order by secao;

rollback;
