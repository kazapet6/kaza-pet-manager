-- SOMENTE LEITURA. A raça suspeita não é excluída por nenhum script desta entrega.
begin transaction read only;
with referencias as (
 select n.nspname,c.relname,a.attname,k.conname
 from pg_constraint k join pg_class c on c.oid=k.conrelid
 join pg_namespace n on n.oid=c.relnamespace
 cross join lateral unnest(k.conkey,k.confkey) cols(origem,destino)
 join pg_attribute a on a.attrelid=k.conrelid and a.attnum=cols.origem
 join pg_attribute alvo on alvo.attrelid=k.confrelid and alvo.attnum=cols.destino
 where k.contype='f' and k.confrelid='public.racas'::regclass and alvo.attname='id'
)
select format('%I.%I',r.nspname,r.relname) as tabela,r.attname as coluna,r.conname,x.total
from referencias r cross join lateral xmltable('/table/row'
 passing query_to_xml(format('select count(*) as total from %I.%I where %I = %L::uuid',
 r.nspname,r.relname,r.attname,'3c1f0f37-1877-4a31-9a4c-23517ba092ca'),true,false,'')
 columns total bigint path 'total') x order by tabela,coluna;
rollback;
