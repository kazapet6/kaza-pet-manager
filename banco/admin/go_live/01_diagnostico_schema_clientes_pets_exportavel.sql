-- Executar o arquivo inteiro no SQL Editor; exportar o único resultado como CSV.
-- Nenhum dado pessoal de clientes/pets é exportado: somente metadados, contagens,
-- valores distintos dos cinco campos solicitados e catálogo de raças/sinônimos.
-- As contagens exatas abrangem todas as tabelas public e dependentes por FK.
-- Podem demorar em bases grandes; não são estimativas.
-- query_to_xml executa exclusivamente SELECTs construídos abaixo com identificadores
-- escapados por format(%I). Não executa defaults nem funções de triggers.
-- Funções chamadas indiretamente por SQL dinâmico dentro de rotinas não podem ser
-- descobertas integralmente por pg_depend: revisar as definições exportadas.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

WITH RECURSIVE
alvos AS (
  SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('clientes','pets') AND c.relkind IN ('r','p')
),
-- UNION, sem ALL, termina mesmo quando o grafo de FKs tem ciclos.
dependentes(oid) AS (
  SELECT oid FROM alvos
  UNION
  SELECT k.conrelid FROM pg_constraint k JOIN dependentes d ON d.oid=k.confrelid
  WHERE k.contype='f'
),
escopo AS (
  SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
  UNION SELECT oid FROM dependentes
),
tabelas AS (
  SELECT c.*, n.nspname, format('%I.%I',n.nspname,c.relname) AS objeto
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.oid IN (SELECT oid FROM escopo)
),
sequencias AS (
  SELECT DISTINCT s.oid, ns.nspname, s.relname
  FROM pg_class s JOIN pg_namespace ns ON ns.oid=s.relnamespace
  WHERE s.relkind='S' AND (
    EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass
      AND d.objid=s.oid AND d.refclassid='pg_class'::regclass
      AND d.refobjid IN (SELECT oid FROM escopo) AND d.deptype IN ('a','i'))
    OR EXISTS (SELECT 1 FROM pg_depend d JOIN pg_attrdef a ON a.oid=d.objid
      WHERE d.classid='pg_attrdef'::regclass AND d.refclassid='pg_class'::regclass
        AND d.refobjid=s.oid AND a.adrelid IN (SELECT oid FROM escopo))
  )
),
-- SQLs dinâmicos estritamente de leitura. Nenhum nome vem de input do operador.
consultas AS (
  SELECT '12_CONTAGENS'::text AS secao, t.objeto,
    'Contagem exata visível ao executor; conferir RLS e privilégios'::text AS detalhe,
    CASE WHEN has_table_privilege(t.oid,'SELECT') THEN
      format('SELECT jsonb_build_object(''total'',count(*)) AS payload FROM %I.%I',t.nspname,t.relname)
    ELSE NULL END AS sql_leitura
  FROM tabelas t
  UNION ALL
  SELECT '13_CATALOGO_RACAS',t.objeto,'Catálogo completo para correspondência exata',
    CASE WHEN has_table_privilege(t.oid,'SELECT') THEN
      format('SELECT jsonb_build_object(''id'',to_jsonb(r)->''id'',''nome'',to_jsonb(r)->''nome'',
        ''especie'',to_jsonb(r)->''especie'',''ativo'',to_jsonb(r)->''ativo'',
        ''status'',to_jsonb(r)->''status'',''raca_id'',to_jsonb(r)->''raca_id'') AS payload
        FROM %I.%I r',t.nspname,t.relname)
    ELSE NULL END
  FROM tabelas t WHERE t.nspname='public' AND t.relname IN ('racas','raca_sinonimos')
  UNION ALL
  SELECT '14_VALORES_OBSERVADOS',t.objeto||'.'||a.attname,
    'Valores observados, não definição de enum nem inferência de regra',
    CASE WHEN has_table_privilege(t.oid,'SELECT') THEN
      format('SELECT jsonb_build_object(''valor'',%I,''quantidade'',count(*)) AS payload
        FROM %I.%I GROUP BY %I',a.attname,t.nspname,t.relname,a.attname)
    ELSE NULL END
  FROM tabelas t JOIN pg_attribute a ON a.attrelid=t.oid
  WHERE t.nspname='public' AND t.relname='pets' AND NOT a.attisdropped AND a.attnum>0
    AND a.attname IN ('especie','sexo','porte','pelagem','temperamento')
),
resultado(secao,objeto,detalhe,payload_json) AS (
  SELECT '00_CONTEXTO','diagnostico','Snapshot e visibilidade',jsonb_build_object(
    'data',transaction_timestamp(),'database',current_database(),'executor',current_user,
    'versao_postgresql',current_setting('server_version'),
    'transaction_read_only',current_setting('transaction_read_only'),
    'row_security',current_setting('row_security'),
    'alvos_encontrados',(SELECT count(*) FROM alvos),
    'limite','Contagens e information_schema respeitam privilégios; funções com SQL dinâmico exigem revisão manual.')
  UNION ALL
  SELECT '00_ALVOS',format('public.%I',nome),'Existência da tabela',
    jsonb_build_object('existe',to_regclass(format('public.%I',nome)) IS NOT NULL)
  FROM (VALUES ('clientes'),('pets'),('racas'),('raca_sinonimos')) x(nome)
  UNION ALL
  SELECT '01_COLUNAS',t.objeto,a.attname,jsonb_build_object(
    'posicao',a.attnum,'nome',a.attname,'tipo',format_type(a.atttypid,a.atttypmod),
    'nullable',NOT a.attnotnull,'default',pg_get_expr(ad.adbin,ad.adrelid),
    'identity',a.attidentity,'generated',a.attgenerated,
    'sequencia_associada',pg_get_serial_sequence(t.objeto,a.attname))
  FROM tabelas t JOIN pg_attribute a ON a.attrelid=t.oid
  LEFT JOIN pg_attrdef ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum
  WHERE a.attnum>0 AND NOT a.attisdropped
  UNION ALL
  SELECT CASE WHEN k.contype='p' THEN '03_PRIMARY_KEYS' WHEN k.contype='f' THEN '04_FOREIGN_KEYS'
    ELSE '05_CONSTRAINTS' END,k.conrelid::regclass::text,k.conname,jsonb_build_object(
    'tipo',k.contype,'definicao',pg_get_constraintdef(k.oid,true),
    'origem',k.conrelid::regclass::text,'destino',nullif(k.confrelid,0)::regclass::text,
    'colunas_origem',(SELECT jsonb_agg(a.attname ORDER BY u.ord)
      FROM unnest(k.conkey) WITH ORDINALITY u(num,ord)
      JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=u.num),
    'colunas_destino',(SELECT jsonb_agg(a.attname ORDER BY u.ord)
      FROM unnest(k.confkey) WITH ORDINALITY u(num,ord)
      JOIN pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=u.num),
    'on_delete',CASE k.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
      WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END,
    'on_update',CASE k.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
      WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END,
    'deferrable',k.condeferrable,'initially_deferred',k.condeferred,'validada',k.convalidated)
  FROM pg_constraint k WHERE k.conrelid IN (SELECT oid FROM escopo)
    OR k.confrelid IN (SELECT oid FROM escopo)
  UNION ALL
  SELECT '05_NOT_NULL',t.objeto,a.attname,jsonb_build_object('definicao',format('%I NOT NULL',a.attname))
  FROM tabelas t JOIN pg_attribute a ON a.attrelid=t.oid
  WHERE a.attnum>0 AND NOT a.attisdropped AND a.attnotnull
  UNION ALL
  SELECT '06_INDICES',t.objeto,i.indexrelid::regclass::text,jsonb_build_object(
    'unique',i.indisunique,'primary',i.indisprimary,'valido',i.indisvalid,
    'definicao',pg_get_indexdef(i.indexrelid),'predicado',pg_get_expr(i.indpred,i.indrelid),
    'colunas_expressoes',(SELECT jsonb_agg(pg_get_indexdef(i.indexrelid,s,true) ORDER BY s)
      FROM generate_series(1,i.indnatts::integer) s))
  FROM tabelas t JOIN pg_index i ON i.indrelid=t.oid
  UNION ALL
  SELECT '07_TRIGGERS',t.objeto,g.tgname,jsonb_build_object(
    'interno',g.tgisinternal,'habilitado',g.tgenabled,'definicao',pg_get_triggerdef(g.oid,true),
    'timing',CASE WHEN (g.tgtype::integer & 2)>0 THEN 'BEFORE'
      WHEN (g.tgtype::integer & 64)>0 THEN 'INSTEAD OF' ELSE 'AFTER' END,
    'eventos',array_remove(ARRAY[
      CASE WHEN (g.tgtype::integer & 4)>0 THEN 'INSERT' END,
      CASE WHEN (g.tgtype::integer & 8)>0 THEN 'DELETE' END,
      CASE WHEN (g.tgtype::integer & 16)>0 THEN 'UPDATE' END,
      CASE WHEN (g.tgtype::integer & 32)>0 THEN 'TRUNCATE' END],NULL),
    'funcao',g.tgfoid::regprocedure::text,'definicao_funcao',pg_get_functiondef(g.tgfoid))
  FROM tabelas t JOIN pg_trigger g ON g.tgrelid=t.oid
  UNION ALL
  SELECT '08_RLS',t.objeto,'Estado de RLS',jsonb_build_object(
    'habilitado',t.relrowsecurity,'forcado',t.relforcerowsecurity,'owner',pg_get_userbyid(t.relowner))
  FROM tabelas t
  UNION ALL
  SELECT '08_POLICIES',format('%I.%I',p.schemaname,p.tablename),p.policyname,to_jsonb(p)
  FROM pg_policies p JOIN tabelas t ON t.nspname=p.schemaname AND t.relname=p.tablename
  UNION ALL
  SELECT '09_PRIVILEGIOS',format('%I.%I',p.table_schema,p.table_name),p.grantee||':'||p.privilege_type,to_jsonb(p)
  FROM information_schema.table_privileges p
  WHERE p.table_schema='public' AND p.table_name IN ('clientes','pets')
  UNION ALL
  SELECT '09_PRIVILEGIOS_COLUNAS',format('%I.%I',p.table_schema,p.table_name),p.column_name,to_jsonb(p)
  FROM information_schema.column_privileges p
  WHERE p.table_schema='public' AND p.table_name IN ('clientes','pets')
  UNION ALL
  SELECT '10_SEQUENCIAS',format('%I.%I',s.nspname,s.relname),'Definição; nextval não é executado',
    jsonb_build_object('tipo',format_type(q.seqtypid,NULL),'inicio',q.seqstart,'incremento',q.seqincrement,
      'minimo',q.seqmin,'maximo',q.seqmax,'cache',q.seqcache,'ciclo',q.seqcycle,
      'dependencias',(SELECT jsonb_agg(jsonb_build_object('tipo',d.deptype,
        'referencia',pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid)))
        FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=s.oid))
  FROM sequencias s JOIN pg_sequence q ON q.seqrelid=s.oid
  UNION ALL
  SELECT '10_FUNCOES_DEFAULT',t.objeto,a.attname,jsonb_build_object(
    'funcao',p.oid::regprocedure::text,'definicao',pg_get_functiondef(p.oid))
  FROM tabelas t JOIN pg_attrdef ad ON ad.adrelid=t.oid
  JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=ad.adnum
  JOIN pg_depend d ON d.classid='pg_attrdef'::regclass AND d.objid=ad.oid
    AND d.refclassid='pg_proc'::regclass
  JOIN pg_proc p ON p.oid=d.refobjid AND p.prokind IN ('f','p')
  UNION ALL
  SELECT '11_DEPENDENCIAS_FK',t.objeto,'Dependência direta ou transitiva de clientes/pets',
    jsonb_build_object('alvo',t.oid IN (SELECT oid FROM alvos),
      'dependente_por_fk',t.oid IN (SELECT oid FROM dependentes))
  FROM tabelas t
  UNION ALL
  SELECT '11_DEPENDENCIAS_CATALOGO',pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid),
    pg_describe_object(d.classid,d.objid,d.objsubid),jsonb_build_object('tipo',d.deptype)
  FROM pg_depend d WHERE d.refclassid='pg_class'::regclass AND d.refobjid IN (SELECT oid FROM escopo)
  UNION ALL
  SELECT '11_FUNCOES_APLICACAO',p.oid::regprocedure::text,
    'Definição para revisão de efeitos indiretos e SQL dinâmico',
    jsonb_build_object('security_definer',p.prosecdef,'configuracao',p.proconfig,
      'definicao',pg_get_functiondef(p.oid))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prokind IN ('f','p')
  UNION ALL
  SELECT '14_ENUMS_DOMINIOS',t.objeto,a.attname,jsonb_build_object(
    'tipo',format_type(a.atttypid,a.atttypmod),'tipo_base',format_type(ty.typbasetype,NULL),
    'valores_enum',(SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
      FROM pg_enum e WHERE e.enumtypid IN (ty.oid,ty.typbasetype)),
    'domain_not_null',ty.typnotnull,'domain_default',ty.typdefault,
    'domain_constraints',(SELECT jsonb_agg(pg_get_constraintdef(k.oid,true))
      FROM pg_constraint k WHERE k.contypid=ty.oid))
  FROM tabelas t JOIN pg_attribute a ON a.attrelid=t.oid
  JOIN pg_type ty ON ty.oid=a.atttypid
  WHERE a.attnum>0 AND NOT a.attisdropped AND t.oid IN (SELECT oid FROM alvos)
  UNION ALL
  SELECT c.secao,c.objeto,c.detalhe,x.payload::jsonb
  FROM consultas c CROSS JOIN LATERAL XMLTABLE('/table/row'
    PASSING query_to_xml(COALESCE(c.sql_leitura,
      'SELECT jsonb_build_object(''indisponivel'',''Sem privilégio SELECT'') AS payload'),true,false,'')
    COLUMNS payload text PATH 'payload') x
)
SELECT secao,objeto,detalhe,payload_json::text AS payload_json
FROM resultado
ORDER BY secao,objeto,detalhe,payload_json::text;

ROLLBACK;
