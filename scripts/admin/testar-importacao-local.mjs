// PostgreSQL embutido, apenas memória: nunca usa URL ou credencial remota.
// Uso: node --experimental-strip-types scripts/admin/testar-importacao-local.mjs <diretorio-runtime> [inventario.json] [clientes.csv] [pets.csv]
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { analisarArquivos, resumo } from '../../frontend/src/importacao/modelo.ts'
import { aplicarInequivocas } from '../../frontend/src/importacao/grupos.ts'
const require = createRequire(pathToFileURL(resolve(process.argv[2], 'package.json')))
const { PGlite } = require('@electric-sql/pglite')
const db = new PGlite()
const uid='11111111-1111-4111-8111-111111111111', race='22222222-2222-4222-8222-222222222222'
const schemaFixture=`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
insert into auth.users values('${uid}');
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
grant usage on schema public,auth to anon,authenticated,service_role;
grant execute on all functions in schema auth to anon,authenticated,service_role;
create sequence public.clientes_codigo_seq;
create table public.clientes(id text primary key default ('CLI-'||lpad(nextval('public.clientes_codigo_seq')::text,6,'0')),nome text not null check(length(btrim(nome))>0),whatsapp text not null check(length(btrim(whatsapp))>0),endereco text not null default '',bairro text not null default '',cidade text not null default '',observacoes text not null default '',created_at timestamptz not null default now());
alter sequence public.clientes_codigo_seq owned by public.clientes.id;
create table public.racas(id uuid primary key default gen_random_uuid(),nome text not null,especie text not null check(especie in ('cao','gato')),ativo boolean not null default true,fonte_referencia text,unique(id,especie));
create unique index racas_nome on public.racas(especie,lower(btrim(nome)));
create table public.raca_sinonimos(id uuid primary key default gen_random_uuid(),raca_id uuid references public.racas(id),nome text not null,especie text not null,ativo boolean not null default true);
insert into public.racas(id,nome,especie) values('${race}','SRD','cao');
create sequence public.pets_codigo_seq;
create table public.pets(id text primary key default ('PET-'||lpad(nextval('public.pets_codigo_seq')::text,6,'0')),cliente_id text not null references public.clientes(id),nome text not null check(length(btrim(nome))>0),especie text not null check(especie in ('cao','gato')),raca_id uuid not null,sexo text not null check(sexo in ('macho','femea')),porte text not null check(porte in ('mini','pequeno','medio','grande','gigante')),pelagem text not null default 'curta' check(pelagem in ('curta','media','longa')),temperamento text not null default 'calmo' check(temperamento in ('calmo','moderado','dificil')),castrado boolean not null default false,data_nascimento text not null default '',peso numeric(7,2) check(peso>=0),cor text not null default '',observacoes text not null default '',created_at timestamptz not null default now(),foreign key(raca_id,especie) references public.racas(id,especie));
alter sequence public.pets_codigo_seq owned by public.pets.id;
`
await db.exec(schemaFixture)
await db.exec(readFileSync('banco/035_seguranca_clientes_pets_campos_cadastro.sql','utf8'))
const snapshotSql="select jsonb_build_object('clientes',(select jsonb_agg(c) from public.clientes c),'pets',(select jsonb_agg(p) from public.pets p),'racas',(select jsonb_agg(r) from public.racas r),'cli_seq',(select jsonb_build_object('last_value',s.last_value,'is_called',s.is_called) from public.clientes_codigo_seq s),'pet_seq',(select jsonb_build_object('last_value',s.last_value,'is_called',s.is_called) from public.pets_codigo_seq s)) as estado"
const antesMigration=(await db.query(snapshotSql)).rows[0].estado
await db.exec(readFileSync('banco/036_importacao_clientes_pets_staging.sql','utf8'))
await db.exec(readFileSync('banco/037_preservar_duplicidades_importacao_staging.sql','utf8'))
assert.deepEqual((await db.query(snapshotSql)).rows[0].estado,antesMigration)
if(process.argv[3]){
 const inventory={}
 for(const [k,q] of Object.entries({
  constraints:"select c.relname as tabela,k.conname as nome,pg_get_constraintdef(k.oid) as definicao from pg_constraint k join pg_class c on c.oid=k.conrelid where c.relnamespace='public'::regnamespace and c.relname like 'importacao_%' order by 1,2",
  not_null:"select c.relname as tabela,string_agg(a.attname,', ' order by a.attnum) as colunas from pg_attribute a join pg_class c on c.oid=a.attrelid where c.relnamespace='public'::regnamespace and c.relname like 'importacao_%' and c.relkind='r' and a.attnum>0 and a.attnotnull group by c.relname order by 1",
  indices:"select tablename as tabela,indexname as nome,indexdef as definicao from pg_indexes where schemaname='public' and tablename like 'importacao_%' order by 1,2",
  funcoes:"select p.proname,pg_get_function_identity_arguments(p.oid) as argumentos,p.prosecdef,p.proconfig,p.proacl::text as acl from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'importacao_%' order by 1"
 }))inventory[k]=(await db.query(q)).rows
 writeFileSync(process.argv[3],JSON.stringify(inventory,null,2))
}
let total=0
async function test(nome,f){await f();total++;console.log('OK '+nome)}
async function perfil(role,interno=false){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role,sub:uid,app_metadata:interno?{role:'internal'}:{}})]);await db.exec('set role '+role)}
async function rpc(name,args){const ph=args.map((_,i)=>'$'+(i+1)).join(',');return (await db.query(`select public.${name}(${ph}) as r`,args)).rows[0].r}
const linha=(id,resolvido,pet=false)=>({external_id:id,linha_original:2,original:pet?{id,nome:'Pet sintético',clienteId:'c'}:{id,nome:'Cliente sintético',telefone:'11999999999',senha:'NAO_PERSISTIR',tenantId:'NAO_PERSISTIR'},resolvido,decisao_operador:'importar',erros:[],avisos:['NAO_PERSISTIR']})
const perfilPet={nome:'Pet sintético',especie:'cao',raca_id:race,sexo:'macho',porte:'pequeno',pelagem:'curta',temperamento:'calmo',castrado:false,data_nascimento:'',peso:'',cor:'',observacoes:''}
const doc=(origem='teste')=>({id:crypto.randomUUID(),origem,revisao:0,arquivos:['clientes.csv','pets.csv'],clientes:[linha('c',{nome:'Cliente sintético',whatsapp:'11999999999'})],pets:[linha('p',{...perfilPet},true)]})
await test('migration executa e todas as 4 tabelas possuem RLS',async()=>{const r=await db.query("select count(*)::int as n from pg_class where relnamespace='public'::regnamespace and relname in ('importacao_lotes','importacao_clientes_staging','importacao_pets_staging','importacao_mapeamentos') and relrowsecurity");assert.equal(r.rows[0].n,4)})
await test('aplicar 036 preserva dados e estado das sequences CLI/PET',async()=>{assert.deepEqual((await db.query(snapshotSql)).rows[0].estado,antesMigration)})
await test('anon bloqueado em tabelas e RPC',async()=>{await perfil('anon');await assert.rejects(db.query('select * from public.importacao_lotes'));await assert.rejects(rpc('importacao_salvar_lote',[doc()]));await db.exec('reset role')})
await test('authenticated sem internal não lê linhas nem chama promoção',async()=>{await perfil('authenticated');assert.equal((await db.query('select * from public.importacao_lotes')).rows.length,0);await assert.rejects(rpc('importacao_salvar_lote',[doc()]));await db.exec('reset role')})
let saved
await test('internal salva staging e credenciais são descartadas no backend',async()=>{await perfil('authenticated',true);saved=await rpc('importacao_salvar_lote',[doc()]);assert.equal(saved.status,'pronto');assert(!JSON.stringify(saved).includes('NAO_PERSISTIR'));assert.equal((await db.query('select * from public.clientes')).rows.length,0);await assert.rejects(db.query("insert into public.importacao_lotes(id,origem) values(gen_random_uuid(),'invasao')"))})
await test('revisão concorrente é rejeitada',async()=>{await assert.rejects(rpc('importacao_salvar_lote',[{...saved,revisao:0}]))})
await test('promoção gera CLI/PET e vínculo externo correto',async()=>{saved=await rpc('importacao_promover_lote',[saved.id,saved.revisao,true]);assert.equal(saved.status,'concluido');assert.equal(saved.clientes[0].internal_id,'CLI-000001');assert.equal(saved.pets[0].internal_id,'PET-000001');assert.equal((await db.query('select cliente_id from public.pets')).rows[0].cliente_id,'CLI-000001')})
await test('repetição mesma RPC e mesmo external_id em outro lote não duplicam',async()=>{await rpc('importacao_promover_lote',[saved.id,1,true]);const second=await rpc('importacao_salvar_lote',[doc()]);assert.equal(second.clientes[0].internal_id,'CLI-000001');await rpc('importacao_promover_lote',[second.id,second.revisao,true]);assert.equal((await db.query('select * from public.pets')).rows.length,1)})
await test('pendências e ausência de castrado nunca usam defaults',async()=>{const d=doc('pendente');d.clientes[0].resolvido.whatsapp='';for(const k of ['sexo','porte','pelagem','temperamento','raca_id','castrado'])d.pets[0].resolvido[k]=null;const s=await rpc('importacao_salvar_lote',[d]);assert.equal(s.status,'pendente_revisao');assert(s.clientes[0].erros.includes('WhatsApp pendente'));for(const k of ['sexo','porte','pelagem','temperamento','castrado'])assert(s.pets[0].erros.includes(k+' pendente'));const p=await rpc('importacao_promover_lote',[s.id,s.revisao,true]);assert.equal(p.status,'pendente_revisao');assert.equal((await db.query('select * from public.pets')).rows.length,1)})
await test('órfão permanece em staging e não é promovido',async()=>{const d=doc('orfao');d.pets[0].original.clienteId='ausente';const s=await rpc('importacao_salvar_lote',[d]);assert(s.pets[0].erros.some(e=>e.includes('Tutor pendente')));const p=await rpc('importacao_promover_lote',[s.id,s.revisao,true]);assert.equal(p.pets[0].internal_id,null)})
await test('originais imutáveis e ID externo duplicado bloqueados',async()=>{const d=doc('imutavel');let s=await rpc('importacao_salvar_lote',[d]);s.clientes[0].original.nome='Outro';await assert.rejects(rpc('importacao_salvar_lote',[s]));const d2=doc('duplicado');d2.clientes.push({...d2.clientes[0]});await assert.rejects(rpc('importacao_salvar_lote',[d2]))})
await test('falha impeditiva reverte cliente, pet, mapa e status juntos',async()=>{const s=await rpc('importacao_salvar_lote',[doc('falha')]);await db.exec('reset role');await db.exec("create function public.falha_teste() returns trigger language plpgsql as $$ begin raise exception 'falha sintética'; end; $$; create trigger falha before insert on public.pets for each row execute function public.falha_teste();");const antes=(await db.query('select count(*)::int as n from public.clientes')).rows[0].n;await perfil('authenticated',true);await assert.rejects(rpc('importacao_promover_lote',[s.id,s.revisao,true]));assert.equal((await db.query('select count(*)::int as n from public.clientes')).rows[0].n,antes);const reread=await rpc('importacao_obter_lote',[s.id]);assert.equal(reread.status,'pronto');assert.equal(reread.clientes[0].internal_id,null);await db.exec('reset role; drop trigger falha on public.pets; drop function public.falha_teste();');await perfil('authenticated',true)})
await test('service_role preservado',async()=>{await perfil('service_role');const s=await rpc('importacao_salvar_lote',[doc('servico')]);assert.equal(s.status,'pronto');assert((await db.query('select * from public.importacao_lotes')).rows.length>0)})
await test('revisão ausente e listas inválidas não contornam validação',async()=>{
 await perfil('authenticated',true);const s=await rpc('importacao_salvar_lote',[doc('revisao-nula')]);
 await assert.rejects(rpc('importacao_salvar_lote',[{...s,revisao:null}]));await assert.rejects(rpc('importacao_promover_lote',[s.id,null,true]));
 const d=doc('lista-invalida');delete d.pets;await assert.rejects(rpc('importacao_salvar_lote',[d]));
})
await test('duplicidades avisam sem bloquear ou fundir',async()=>{
 const d=doc('avisos');d.clientes.push({...linha('c2',{...d.clientes[0].resolvido}),linha_original:3});
 const s=await rpc('importacao_salvar_lote',[d]);assert(s.clientes.every(c=>c.avisos.includes('telefone: POSSIVEL_DUPLICIDADE')&&c.avisos.includes('nome+telefone: POSSIVEL_DUPLICIDADE')));
 const p=await rpc('importacao_promover_lote',[s.id,s.revisao,true]);assert.equal(p.resultado.clientes_criados,2);assert.notEqual(p.clientes[0].internal_id,p.clientes[1].internal_id);
})
await test('pet existente de outro tutor não pode ser associado',async()=>{
 const d=doc('existente-errado');d.pets[0].decisao_operador='existente';d.pets[0].resolvido={existente_id:'PET-000001'};
 const s=await rpc('importacao_salvar_lote',[d]);const p=await rpc('importacao_promover_lote',[s.id,s.revisao,true]);
 assert.equal(p.pets[0].internal_id,null);assert(p.pets[0].erros.includes('Pet existente pertence a outro tutor'));
})
await test('lote parcial pode ser retomado sem recriar cliente',async()=>{
 const d=doc('retomar');d.pets[0].resolvido.temperamento=null;let s=await rpc('importacao_salvar_lote',[d]);s=await rpc('importacao_promover_lote',[s.id,s.revisao,true]);
 assert.equal(s.status,'pendente_revisao');const cli=s.clientes[0].internal_id;s.pets[0].resolvido.temperamento='moderado';
 s=await rpc('importacao_salvar_lote',[s]);s=await rpc('importacao_promover_lote',[s.id,s.revisao,true]);assert.equal(s.status,'concluido');assert.equal(s.clientes[0].internal_id,cli);assert.equal(s.resultado.clientes_criados,1);assert.equal(s.resultado.pets_criados,1);
})
await test('criar raça exige confirmação e bloqueia nome 2',async()=>{
 const s=await rpc('importacao_salvar_lote',[doc('raca')]);await assert.rejects(rpc('importacao_criar_raca',[s.id,'Teste','cao',false]));await assert.rejects(rpc('importacao_criar_raca',[s.id,'2','cao',true]));
 const id=await rpc('importacao_criar_raca',[s.id,'Raça sintética','cao',true]);assert.match(id,/^[a-f0-9-]{36}$/);await assert.rejects(rpc('importacao_criar_raca',[s.id,'Raça sintética','cao',true]));
 const l=await rpc('importacao_obter_lote',[s.id]);assert.equal(l.revisao,s.revisao+1);
})
await test('RLS mantém dados existentes invisíveis para não interno',async()=>{
 await perfil('authenticated');for(const t of ['importacao_lotes','importacao_clientes_staging','importacao_pets_staging','importacao_mapeamentos'])assert.equal((await db.query('select * from public.'+t)).rows.length,0);
 await assert.rejects(rpc('importacao_obter_lote',[saved.id]));await perfil('anon');for(const t of ['importacao_lotes','importacao_clientes_staging','importacao_pets_staging','importacao_mapeamentos'])await assert.rejects(db.query('select * from public.'+t));
})
await test('ACL separa SELECT/INSERT/UPDATE/DELETE e helpers não são API',async()=>{
 await db.exec('reset role');for(const role of ['anon','authenticated','service_role'])for(const table of ['importacao_lotes','importacao_clientes_staging','importacao_pets_staging','importacao_mapeamentos'])for(const op of ['SELECT','INSERT','UPDATE','DELETE']){
  const r=await db.query('select has_table_privilege($1,$2,$3) as permitido',[role,'public.'+table,op]);assert.equal(r.rows[0].permitido,role==='service_role'||(role==='authenticated'&&op==='SELECT'));
 }
 for(const role of ['anon','authenticated','service_role'])for(const fn of ['importacao_exigir_internal()','importacao_filtrar(jsonb,text[])','importacao_data_valida(text)','importacao_validar(text,jsonb,text)','importacao_normalizar_duplicidade(text)'])assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') as permitido",[role,'public.'+fn])).rows[0].permitido,false);
 const funcs=await db.query("select prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace and proname like 'importacao_%'");assert.equal(funcs.rows.length,9);assert.equal(funcs.rows.filter(f=>f.prosecdef).length,4);assert(funcs.rows.every(f=>f.proconfig.includes('search_path=pg_catalog, pg_temp')));
})
await test('internal sem uid não lê staging nem executa RPCs',async()=>{
 await perfil('authenticated',true);await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',app_metadata:{role:'internal'}})]);
 assert.equal((await db.query('select * from public.importacao_lotes')).rows.length,0);await assert.rejects(rpc('importacao_obter_lote',[saved.id]));await assert.rejects(rpc('importacao_salvar_lote',[doc('sem-uid')]));await assert.rejects(rpc('importacao_promover_lote',[saved.id,1,true]));await assert.rejects(rpc('importacao_criar_raca',[saved.id,'Nome','cao',true]));
})
await test('raça rejeita null, variações óbvias e sinônimo aprovado',async()=>{
 await perfil('authenticated',true);const s=await rpc('importacao_salvar_lote',[doc('raca-canonica')]);await assert.rejects(rpc('importacao_criar_raca',[s.id,null,'cao',true]));await assert.rejects(rpc('importacao_criar_raca',[s.id,'Nome',null,true]));
 await rpc('importacao_criar_raca',[s.id,'Água  Teste','cao',true]);for(const nome of ['agua-teste',' ÁGUA TESTE ','agua—teste'])await assert.rejects(rpc('importacao_criar_raca',[s.id,nome,'cao',true]));
 await db.exec('reset role');await db.query('insert into public.raca_sinonimos(raca_id,nome,especie) values($1,$2,$3)',[race,'Alias existente','cao']);await perfil('authenticated',true);await assert.rejects(rpc('importacao_criar_raca',[s.id,'alias-existente','cao',true]));
})
await test('tabela temporária não sombreia consulta SECURITY DEFINER',async()=>{
 await db.exec('reset role; create temp table importacao_lotes(id uuid); create temp table clientes(id text);');await perfil('authenticated',true);assert.equal((await rpc('importacao_obter_lote',[saved.id])).id,saved.id);
 await db.exec('reset role; drop table pg_temp.importacao_lotes; drop table pg_temp.clientes;');
})
await test('falha no meio da migration reverte todos os objetos novos',async()=>{
 const isolado=new PGlite();try{await isolado.exec(schemaFixture);await isolado.exec(readFileSync('banco/035_seguranca_clientes_pets_campos_cadastro.sql','utf8'));
 const sql=readFileSync('banco/036_importacao_clientes_pets_staging.sql','utf8').replace('create index importacao_mapeamentos_lote_idx','select 1/0;\ncreate index importacao_mapeamentos_lote_idx');await assert.rejects(isolado.exec(sql));await isolado.exec('rollback');assert.equal((await isolado.query("select count(*)::int as n from pg_class where relnamespace='public'::regnamespace and relname like 'importacao_%'")).rows[0].n,0);
 }finally{await isolado.close()}
})
if(process.argv[4]&&process.argv[5])await test('CSVs reais preservam preview, avisos, decisões e resoluções após salvar/reabrir',async()=>{
 const catalogo=[{id:race,nome:'Sem raça definida (SRD)',especie:'cao',ativo:true,sinonimos:['SRD - Sem Raça Definida']}]
 let preview=analisarArquivos(readFileSync(process.argv[4],'utf8'),readFileSync(process.argv[5],'utf8'),catalogo,'regressao-real', ['clientes.csv','pets.csv'])
 preview=aplicarInequivocas(preview,catalogo)
 const resumoAntes=resumo(preview)
 assert.equal(resumoAntes.clientes,329);assert.equal(resumoAntes.pets,383);assert.equal(resumoAntes.vinculos,383);assert.equal(resumoAntes.clientesPendentes,1);assert.equal(resumoAntes.petsPendentes,383);assert.equal(resumoAntes.racasPendentes,297);assert.equal(resumoAntes.duplicidades,4)
 await perfil('authenticated',true);const salvo=await rpc('importacao_salvar_lote',[preview]);const reaberto=await rpc('importacao_obter_lote',[salvo.id])
 const forma=l=>['clientes','pets'].flatMap(tipo=>l[tipo].map(x=>({tipo,external_id:x.external_id,avisos:[...x.avisos].sort(),decisao:x.decisao_operador,resolvido:x.resolvido})))
 const canon=v=>Array.isArray(v)?v.map(canon):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canon(x)])):v
 const estatisticas=l=>Object.fromEntries(['clientes','pets'].map(tipo=>[tipo,{linhas:l[tipo].filter(x=>x.avisos.some(a=>a.includes('DUPLICIDADE'))).length,categorias:l[tipo].flatMap(x=>x.avisos.filter(a=>a.includes('DUPLICIDADE'))).reduce((a,x)=>(a[x]=(a[x]||0)+1,a),{})}]))
 if(JSON.stringify(canon(forma(preview)))!==JSON.stringify(canon(forma(salvo))))throw new Error('Salvar alterou avisos, decisões ou resoluções do preview real: '+JSON.stringify({preview:estatisticas(preview),salvo:estatisticas(salvo)}))
 if(JSON.stringify(canon(forma(salvo)))!==JSON.stringify(canon(forma(reaberto))))throw new Error('Reabrir alterou avisos, decisões ou resoluções do lote real salvo')
 assert.deepEqual(resumo(salvo),resumoAntes);assert.deepEqual(resumo(reaberto),resumoAntes);assert.equal(salvo.status,reaberto.status)

 const legado=new PGlite();try{
  await legado.exec(schemaFixture);await legado.exec(readFileSync('banco/035_seguranca_clientes_pets_campos_cadastro.sql','utf8'));await legado.exec(readFileSync('banco/036_importacao_clientes_pets_staging.sql','utf8'))
  const claims=JSON.stringify({role:'authenticated',sub:uid,app_metadata:{role:'internal'}});await legado.query("select set_config('request.jwt.claims',$1,false)",[claims]);await legado.exec('set role authenticated')
  const salvarLegado=async l=>(await legado.query('select public.importacao_salvar_lote($1) as r',[l])).rows[0].r
  const antigo=await salvarLegado({...preview,id:crypto.randomUUID(),origem:'regressao-lote-ja-salvo'});assert.equal(resumo(antigo).duplicidades,2)
  await legado.exec('reset role');await legado.exec(readFileSync('banco/037_preservar_duplicidades_importacao_staging.sql','utf8'));await legado.query("select set_config('request.jwt.claims',$1,false)",[claims]);await legado.exec('set role authenticated')
  const reparado=await salvarLegado(antigo);const reparadoReaberto=(await legado.query('select public.importacao_obter_lote($1) as r',[reparado.id])).rows[0].r
  assert.equal(resumo(reparado).duplicidades,4);assert.equal(resumo(reparadoReaberto).duplicidades,4)
  if(JSON.stringify(canon(forma(antigo).map(x=>({...x,avisos:[]}))))!==JSON.stringify(canon(forma(reparado).map(x=>({...x,avisos:[]})))))throw new Error('Ressalvar lote anterior alterou decisões ou resoluções')
 }finally{await legado.close()}
})
await db.close()
await test('ausência da 035 aborta antes de criar staging',async()=>{
 const isolado=new PGlite();try{await isolado.exec(schemaFixture);await assert.rejects(isolado.exec(readFileSync('banco/036_importacao_clientes_pets_staging.sql','utf8')),/Dependência incompatível/);await isolado.exec('rollback');assert.equal((await isolado.query("select count(*)::int as n from pg_class where relnamespace='public'::regnamespace and relname like 'importacao_%'")).rows[0].n,0)}finally{await isolado.close()}
})
console.log(total+' testes PostgreSQL isolados aprovados; zero conexão remota.')
