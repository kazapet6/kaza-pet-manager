-- Diagnóstico estritamente somente leitura para o estado após a Migration 039.
-- Execute e exporte os resultados para armazenamento privado fora do Git.
begin transaction isolation level repeatable read read only;

-- 1. Inventário e contagens atuais de todas as tabelas públicas.
select c.relname as tabela,
       c.relrowsecurity as rls,
       x.total
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
cross join lateral xmltable(
  '/table/row'
  passing query_to_xml(format('select count(*) as total from public.%I', c.relname), true, false, '')
  columns total bigint path 'total'
) x
where n.nspname = 'public' and c.relkind in ('r', 'p')
order by c.relname;

-- 2. FKs diretas entre tabelas públicas e referências do staging.
select con.conname,
       con.conrelid::regclass::text as origem,
       con.confrelid::regclass::text as destino,
       pg_get_constraintdef(con.oid, true) as definicao
from pg_catalog.pg_constraint con
where con.contype = 'f'
  and (
    con.conrelid in (
      select oid from pg_catalog.pg_class
       where relnamespace = 'public'::regnamespace
    )
    or con.confrelid in (
      select oid from pg_catalog.pg_class
       where relnamespace = 'public'::regnamespace
    )
  )
order by origem, con.conname;

-- 3. Triggers DELETE/TRUNCATE que podem afetar a limpeza.
select t.tgrelid::regclass::text as tabela,
       t.tgname,
       pg_get_triggerdef(t.oid, true) as definicao
from pg_catalog.pg_trigger t
where not t.tgisinternal
  and t.tgrelid in (
    select oid from pg_catalog.pg_class
     where relnamespace = 'public'::regnamespace
  )
  and ((t.tgtype::integer & 8) > 0 or (t.tgtype::integer & 32) > 0)
order by tabela, t.tgname;

-- 4. Estado agregado do lote, sem expor PII.
select 'lotes' as secao,
       count(*) as total,
       count(*) filter (where status = 'concluido' or completed_at is not null) as promovidos,
       count(*) filter (where status <> 'concluido' and completed_at is null) as nao_promovidos
from public.importacao_lotes
union all
select 'clientes_staging',
       count(*),
       count(*) filter (where status_validacao = 'ja_importado' or cliente_id_criado is not null),
       count(*) filter (where status_validacao <> 'ja_importado' and cliente_id_criado is null)
from public.importacao_clientes_staging
union all
select 'pets_staging',
       count(*),
       count(*) filter (
         where status_validacao = 'ja_importado'
            or pet_id_criado is not null
            or cliente_id_resolvido is not null
       ),
       count(*) filter (
         where status_validacao <> 'ja_importado'
           and pet_id_criado is null
           and cliente_id_resolvido is null
       )
from public.importacao_pets_staging
union all
select 'mapeamentos', count(*), count(*), 0
from public.importacao_mapeamentos;

select 'clientes' as entidade, decisao_operador, status_validacao, count(*) as total
from public.importacao_clientes_staging
group by decisao_operador, status_validacao
union all
select 'pets', decisao_operador, status_validacao, count(*)
from public.importacao_pets_staging
group by decisao_operador, status_validacao
order by entidade, decisao_operador, status_validacao;

-- 5. Assinaturas canônicas para comparar staging antes/depois sem exportar linhas.
select 'importacao_lotes' as tabela,
       count(*) as total,
       md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), '[]'::jsonb)::text) as assinatura
from public.importacao_lotes x
union all
select 'importacao_clientes_staging', count(*),
       md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), '[]'::jsonb)::text)
from public.importacao_clientes_staging x
union all
select 'importacao_pets_staging', count(*),
       md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), '[]'::jsonb)::text)
from public.importacao_pets_staging x
union all
select 'importacao_mapeamentos', count(*),
       md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), '[]'::jsonb)::text)
from public.importacao_mapeamentos x;

-- 6. Sequências e defaults; a consulta não chama nextval.
select c.table_name,
       c.column_name,
       c.column_default,
       pg_get_serial_sequence(format('%I.%I', c.table_schema, c.table_name), c.column_name) as sequencia
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in ('clientes', 'pets')
  and c.column_name = 'id'
order by c.table_name;

select seq.relname as sequencia,
       s.seqstart,
       s.seqincrement,
       s.seqmin,
       s.seqmax,
       s.seqcache,
       s.seqcycle
from pg_catalog.pg_sequence s
join pg_catalog.pg_class seq on seq.oid = s.seqrelid
where s.seqrelid in (
  'public.clientes_codigo_seq'::regclass,
  'public.pets_codigo_seq'::regclass
)
order by seq.relname;

-- 7. Contagens estruturais mínimas que não podem desaparecer.
select 'funcionarios' as objeto, count(*) as total from public.funcionarios
union all select 'funcionario_jornadas', count(*) from public.funcionario_jornadas
union all select 'funcionario_servicos', count(*) from public.funcionario_servicos
union all select 'servicos', count(*) from public.servicos
union all select 'servico_regras_preco', count(*) from public.servico_regras_preco
union all select 'racas', count(*) from public.racas
union all select 'equipamentos', count(*) from public.equipamentos
union all select 'janelas_transporte', count(*) from public.janelas_transporte
union all select 'pacotes', count(*) from public.pacotes
order by objeto;

rollback;
