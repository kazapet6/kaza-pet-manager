import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql=readFileSync(new URL('../banco/039_pets_incompletos_importacao.sql',import.meta.url),'utf8').replaceAll('\r','')
const validar=readFileSync(new URL('../banco/admin/go_live/validar_039_pos_aplicacao.sql',import.meta.url),'utf8').replaceAll('\r','')
let total=0
function t(nome,fn){fn();total++;console.log(`OK ${nome}`)}
t('sete campos perdem NOT NULL',()=>{for(const c of ['especie','raca_id','sexo','porte','pelagem','temperamento','castrado'])assert.match(sql,new RegExp(`alter column ${c} drop not null`))})
t('defaults artificiais removidos',()=>{for(const c of ['pelagem','temperamento','castrado'])assert.match(sql,new RegExp(`alter column ${c} drop default`))})
t('raça exige espécie e FK não é removida',()=>{assert.match(sql,/check \(raca_id is null or especie is not null\)/);assert.doesNotMatch(sql,/drop constraint.*raca/i)})
t('sem atualização de dados existentes',()=>{assert.doesNotMatch(sql,/update public\.pets|delete from|truncate|drop table|drop column/i)})
t('promoção preserva nulls sem defaults',()=>{assert.match(sql,/nullif\(n->>'raca_id',''\)::uuid/);assert.match(sql,/jsonb_typeof\(n->'castrado'\)='boolean'[\s\S]*else null/);assert.match(sql,/n->>'peso'[\s\S]*then \(n->>'peso'\)::numeric else null/);assert.doesNotMatch(sql,/\bSRD\b|coalesce\(n->>'pelagem','curta'\)|coalesce\(n->>'temperamento','calmo'\)/i)})
t('RPC mantém autorização e search_path',()=>{assert.match(sql,/security definer set search_path=pg_catalog,pg_temp/);assert.match(sql,/revoke all on function public\.importacao_promover_lote[\s\S]*from public,anon,authenticated/);assert.match(sql,/to authenticated,service_role/)})
t('transação completa',()=>{assert.match(sql,/^begin;/m);assert.match(sql,/commit;\s*$/)})
t('validação pós aplicação é read only e única',()=>{assert.match(validar,/set transaction read only/);assert.match(validar,/rollback;/);assert.doesNotMatch(validar,/\b(insert|update|delete|truncate|alter|create|drop)\b/i)})
console.log(`${total} testes estruturais da Migration 039 aprovados.`)
