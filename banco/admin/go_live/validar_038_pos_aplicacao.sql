-- SOMENTE LEITURA. Não chama RPC, não altera dados, roles, catálogo ou sequences.
-- Execute integralmente no SQL Editor depois da 038. Produz um único result set.
begin transaction isolation level repeatable read read only;

with
funcoes_esperadas(assinatura,security_definer) as (values
 ('public.importacao_sugestoes_racas_seguras()',false),
 ('public.importacao_resolver_racas_lote(uuid,integer,jsonb,boolean)',true)
),
funcoes as (
 select e.*,p.oid,p.prosecdef,p.proowner,p.proacl,p.proconfig,p.prosrc,
  exists(select 1 from unnest(p.proconfig) c where replace(c,' ','')='search_path=pg_catalog,pg_temp') as search_path_seguro
 from funcoes_esperadas e left join pg_proc p on p.oid=to_regprocedure(e.assinatura)
),
roles(nome,oid) as (
 select v.nome,r.oid from (values('anon'),('authenticated'),('service_role')) v(nome)
 left join pg_roles r on r.rolname=v.nome
),
lote_atual as (
 select l.* from public.importacao_lotes l
 where l.status not in ('concluido','cancelado')
 order by ((select count(*) from public.importacao_clientes_staging c where c.lote_id=l.id)
  +(select count(*) from public.importacao_pets_staging p where p.lote_id=l.id)) desc,l.created_at desc limit 1
),
decisoes as (
 select
  (select count(*) from public.importacao_clientes_staging c join lote_atual l on l.id=c.lote_id where c.decisao_operador='ignorar') as clientes_ignorados,
  (select count(*) from public.importacao_pets_staging p join lote_atual l on l.id=p.lote_id where p.decisao_operador='ignorar') as pets_ignorados,
  exists(
   select 1 from public.importacao_clientes_staging c join lote_atual l on l.id=c.lote_id
   where c.decisao_operador='ignorar' and coalesce(c.original->>'cep','')='' and coalesce(c.original->>'endereco','')=''
    and (select count(*) from public.importacao_pets_staging p where p.lote_id=c.lote_id and p.external_cliente_id=c.external_id)=2
    and not exists(select 1 from public.importacao_pets_staging p where p.lote_id=c.lote_id and p.external_cliente_id=c.external_id
     and (p.decisao_operador<>'ignorar' or coalesce(p.original->>'especie','')<>'' or coalesce(p.original->>'raca','')<>''))
  ) as trio_ignorado_preservado
),
resolucoes_esperadas(nome,especie) as (values
 ('Shih Tzu','cao'),('Yorkshire Terrier','cao'),('Sem raça definida (SRD)','cao'),('Sem raça definida (SRD)','gato')
),
resolucoes as (
 select e.nome,e.especie,count(p.*)::integer as pets_resolvidos
 from resolucoes_esperadas e left join public.racas r on r.nome=e.nome and r.especie=e.especie and r.ativo and r.nome<>'2'
 left join public.importacao_pets_staging p on p.lote_id=(select id from lote_atual)
  and p.decisao_operador='importar' and p.pet_id_criado is null and p.resolvido->>'raca_id'=r.id::text and p.resolvido->>'especie'=e.especie
 group by e.nome,e.especie
),
linhas as (
 select '00_contexto'::text secao,'transação'::text objeto,'Consulta executada em transação somente leitura.'::text detalhe,
  current_setting('transaction_read_only')='on' as ok,
  jsonb_build_object('somente_leitura',current_setting('transaction_read_only'),'momento',transaction_timestamp()) payload_json
 union all
 select '01_objetos',assinatura,case when security_definer then 'RPC SECURITY DEFINER.' else 'Helper SECURITY INVOKER.' end,
  oid is not null and prosecdef=security_definer and search_path_seguro,
  jsonb_build_object('existe',oid is not null,'security_definer',prosecdef,'owner',pg_get_userbyid(proowner),'configuracao',proconfig)
 from funcoes
 union all
 select '02_autorizacao','public.importacao_resolver_racas_lote',r.nome||': EXECUTE efetivo',
  f.oid is not null and r.oid is not null and has_function_privilege(r.oid,f.oid,'EXECUTE')=(r.nome in ('authenticated','service_role')),
  jsonb_build_object('role',r.nome,'execute',has_function_privilege(r.oid,f.oid,'EXECUTE'))
 from funcoes f cross join roles r where f.assinatura='public.importacao_resolver_racas_lote(uuid,integer,jsonb,boolean)'
 union all
 select '02_autorizacao','public.importacao_resolver_racas_lote','PUBLIC sem EXECUTE',
  f.oid is not null and not exists(select 1 from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE'),
  jsonb_build_object('acl',f.proacl)
 from funcoes f where f.assinatura='public.importacao_resolver_racas_lote(uuid,integer,jsonb,boolean)'
 union all
 select '02_autorizacao','public.importacao_resolver_racas_lote','Guarda interna e confirmação explícita no corpo',
  f.oid is not null and position('perform public.importacao_exigir_internal();' in f.prosrc)>0
   and position('p_confirmar is distinct from true' in f.prosrc)>0,
  jsonb_build_object('guarda_internal',position('perform public.importacao_exigir_internal();' in f.prosrc)>0,'confirmacao_explicita',position('p_confirmar is distinct from true' in f.prosrc)>0)
 from funcoes f where f.assinatura='public.importacao_resolver_racas_lote(uuid,integer,jsonb,boolean)'
 union all
 select '03_helper','public.importacao_sugestoes_racas_seguras','Helper não exposto à API',
  f.oid is not null and not exists(select 1 from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a where a.privilege_type='EXECUTE' and a.grantee in (0,(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated'),(select oid from pg_roles where rolname='service_role'))),
  jsonb_build_object('acl',f.proacl)
 from funcoes f where f.assinatura='public.importacao_sugestoes_racas_seguras()'
 union all
 select '04_revalidacao','public.importacao_resolver_racas_lote','Backend revalida lote, revisão, grupo, espécie, decisão e quantidade',
  f.oid is not null and position('l.revisao is distinct from p_revisao' in f.prosrc)>0
   and position('p.decisao_operador=''importar''' in f.prosrc)>0
   and position('p.resolvido->>''especie''=especie_alvo' in f.prosrc)>0
   and position('from public.importacao_sugestoes_racas_seguras()' in f.prosrc)>0
   and position('atual is distinct from esperado' in f.prosrc)>0,
  jsonb_build_object('usa_allowlist_backend',position('from public.importacao_sugestoes_racas_seguras()' in f.prosrc)>0,'valida_revisao',position('l.revisao is distinct from p_revisao' in f.prosrc)>0,'valida_decisao',position('p.decisao_operador=''importar''' in f.prosrc)>0)
 from funcoes f where f.assinatura='public.importacao_resolver_racas_lote(uuid,integer,jsonb,boolean)'
 union all
 select '05_escrita','public.importacao_resolver_racas_lote','Somente catálogo de raças, staging de pets e metadados do lote são escritos',
  f.oid is not null and position('insert into public.racas' in lower(f.prosrc))>0
   and position('update public.importacao_pets_staging' in lower(f.prosrc))>0
   and position('update public.importacao_lotes' in lower(f.prosrc))>0
   and position('execute ' in lower(f.prosrc))=0,
  jsonb_build_object('tabelas_permitidas',jsonb_build_array('public.racas','public.importacao_pets_staging','public.importacao_lotes'),'sql_dinamico',position('execute ' in lower(f.prosrc))>0)
 from funcoes f where f.assinatura='public.importacao_resolver_racas_lote(uuid,integer,jsonb,boolean)'
 union all
 select '05_escrita','public.pets','RPC sem INSERT, UPDATE, DELETE ou TRUNCATE em public.pets',
  f.oid is not null and position('insert into public.pets' in lower(f.prosrc))=0 and position('update public.pets' in lower(f.prosrc))=0
   and position('delete from public.pets' in lower(f.prosrc))=0 and position('truncate public.pets' in lower(f.prosrc))=0,
  jsonb_build_object('total_atual',(select count(*) from public.pets),'nota','A contagem é um snapshot; a garantia vem da ausência de escrita no corpo instalado e do fato de a migration conter somente DDL de funções/ACL.')
 from funcoes f where f.assinatura='public.importacao_resolver_racas_lote(uuid,integer,jsonb,boolean)'
 union all
 select '05_escrita','demais domínios','RPC sem escrita em clientes, atendimentos, contratos, preços, pacotes ou Motor',
  f.oid is not null and not exists(select 1 from (values
   ('insert into public.clientes'),('update public.clientes'),('delete from public.clientes'),
   ('insert into public.atendimentos'),('update public.atendimentos'),('delete from public.atendimentos'),
   ('insert into public.contratos'),('update public.contratos'),('delete from public.contratos'),
   ('insert into public.pacotes'),('update public.pacotes'),('delete from public.pacotes'),
   ('insert into public.precos'),('update public.precos'),('delete from public.precos')
  ) proibido(fragmento) where position(proibido.fragmento in lower(f.prosrc))>0),
  jsonb_build_object('verificacao','corpo efetivamente instalado; staging com prefixo importacao_ não é confundido com tabela operacional')
 from funcoes f where f.assinatura='public.importacao_resolver_racas_lote(uuid,integer,jsonb,boolean)'
 union all
 select '06_lote_atual','public.importacao_lotes','Lote aberto mais recente disponível para validação',
  exists(select 1 from lote_atual),
  coalesce((select jsonb_build_object('id',id,'status',status,'revisao',revisao,'racas_criadas',racas_criadas,'created_at',created_at) from lote_atual),jsonb_build_object('nota','Nenhum lote aberto encontrado'))
 union all
 select '07_decisoes','cliente e dois pets ignorados','Decisão ignorada estrutural previamente validada permanece no lote',
  coalesce(d.trio_ignorado_preservado,false),
  jsonb_build_object('clientes_ignorados',d.clientes_ignorados,'pets_ignorados',d.pets_ignorados,'trio_estrutural_preservado',d.trio_ignorado_preservado)
 from decisoes d
 union all
 select '07_decisoes',nome||' / '||especie,'Resolução canônica existente preservada no staging',
  pets_resolvidos>0,jsonb_build_object('pets_resolvidos',pets_resolvidos)
 from resolucoes
)
select secao,objeto,detalhe,coalesce(ok,false) as ok,payload_json
from linhas order by secao,objeto,detalhe;

rollback;
