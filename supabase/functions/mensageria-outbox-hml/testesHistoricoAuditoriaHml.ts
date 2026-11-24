import assert from 'node:assert/strict'
import {criarConsumidorSimulado,REF} from './handler.ts'
const base='https://'+REF+'.supabase.co'
const admin='11111111-1111-4111-8111-111111111111'
const t='22222222-2222-4222-8222-222222222222'
const t2='33333333-3333-4333-8333-333333333333'
const e1='44444444-4444-4444-8444-444444444444'
const e2='55555555-5555-4555-8555-555555555555'
const jwt='x'.repeat(40)
const data='2026-11-24T19:00:00Z'
const env={get:(k:string)=>({
 HML_PROJECT_REF:REF,SUPABASE_URL:base,SUPABASE_SERVICE_ROLE_KEY:'mock_backend',
 HML_OPERATOR_UUID:admin,HML_TEST_RECIPIENT_E164:'5511999990000'
} as Record<string,string>)[k]}
let resposta:unknown
let status=200
let auth=true
let chamadas=0
let esperado:unknown
let rota=''
const fakeFetch:typeof fetch=async(url,init)=>{
 const u=String(url)
 assert.ok(u.startsWith(base+'/'))
 if(u.endsWith('/auth/v1/user'))return Response.json({id:admin,app_metadata:{role:'internal',whatsapp_admin:true}})
 if(u.endsWith('/rpc/mensageria_hml_autorizar_operador'))return Response.json(auth)
 assert.equal(u,base+'/rest/v1/rpc/'+rota)
 assert.equal(new Headers(init?.headers).get('authorization'),'Bearer mock_backend')
 assert.deepEqual(JSON.parse(String(init?.body)),esperado)
 chamadas++
 return Response.json(resposta,{status})
}
const handler=criarConsumidorSimulado(env,fakeFetch)
async function call(body:unknown,code:number){
 const r=await handler(new Request(base+'/functions/v1/mensageria-outbox-hml',{
 method:'POST',headers:{origin:'http://127.0.0.1:5173',authorization:'Bearer '+jwt},
 body:JSON.stringify(body)
 }))
 assert.equal(r.status,code)
 return await r.json()
}
const noSend={reenvio_automatico_autorizado:false}
const root={evento_id:e1,tentativa_id:t,predecessor_id:null,versao:1,categoria:'resultado_indeterminado',
 decisao:'manter_em_investigacao',motivo:'evidencia_insuficiente',registrado_em:data}
const rev={...root,evento_id:e2,predecessor_id:e1,versao:2}
const hist={acao:'consultar_historico_auditoria_v2',tentativa_id:t,limite:20,antes_versao:null}
rota='mensageria_hml_historico_auditoria_v2'
esperado={p_operador:admin,p_tentativa:t,p_limite:20,p_antes_versao:null}
const vazio={status:'ok',tentativa_id:t,head_evento_id:null,head_versao:0,categoria_atual:'resultado_indeterminado',
 eventos:[],quantidade:0,proxima_antes_versao:null,...noSend}
resposta=vazio
assert.deepEqual(await call(hist,200),vazio)
const completo={...vazio,head_evento_id:e2,head_versao:2,categoria_atual:null,eventos:[rev,root],quantidade:2}
resposta={...completo,segredo:'mock',eventos:[{...rev,operador_id:admin,telefone:'mock'},root]}
assert.deepEqual(await call(hist,200),completo)
console.log('01 historico vazio, inelegivel e projecao PASS')
esperado={p_operador:admin,p_tentativa:t,p_limite:1,p_antes_versao:null}
resposta={...completo,eventos:[rev],quantidade:1,proxima_antes_versao:2}
await call({...hist,limite:1},200)
esperado={p_operador:admin,p_tentativa:t,p_limite:1,p_antes_versao:2}
resposta={...completo,eventos:[root],quantidade:1,proxima_antes_versao:null}
await call({...hist,limite:1,antes_versao:2},200)
esperado={p_operador:admin,p_tentativa:t,p_limite:1,p_antes_versao:1}
resposta={...completo,eventos:[],quantidade:0,proxima_antes_versao:null}
await call({...hist,limite:1,antes_versao:1},200)
console.log('02 cursor e pagina final PASS')
esperado={p_operador:admin,p_tentativa:t,p_limite:20,p_antes_versao:null}
for(const mal of [null,{...completo,head_evento_id:e1},{...completo,head_versao:3},
 {...completo,eventos:[root,rev]},{...completo,eventos:[{...rev,predecessor_id:t2},root]},
 {...completo,eventos:[rev,{...root,tentativa_id:t2}]},
 {...completo,proxima_antes_versao:1},{...completo,reenvio_automatico_autorizado:true}]){
 resposta=mal
 assert.deepEqual(await call(hist,503),{codigo:'HISTORICO_NAO_VERIFICADO',...noSend})
}
resposta={status:'caso_nao_encontrado',...noSend}
await call(hist,404)
status=500;resposta={details:'mock-dado-sensivel'}
assert.deepEqual(await call(hist,503),{codigo:'HISTORICO_NAO_VERIFICADO',...noSend})
status=200
console.log('03 incoerencia, erro e ausencia PASS')
// UUIDs com letras para exercitar comparacao case-insensitive.
const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const c='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const d='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const primeiro={...root,evento_id:a}
const segundo={...rev,evento_id:b,predecessor_id:a}
const terceiro={...rev,evento_id:c,predecessor_id:b,versao:3}
const tres={...completo,head_evento_id:c,head_versao:3,eventos:[terceiro,segundo,primeiro],quantidade:3}
resposta=tres
assert.deepEqual(await call(hist,200),tres)
// A -> B -> A, com predecessores adjacentes coerentes.
for(const repetido of [a,a.toUpperCase()]){
 resposta={...tres,head_evento_id:a,eventos:[
  {...terceiro,evento_id:a},{...segundo,predecessor_id:repetido},{...primeiro,evento_id:repetido}
 ]}
 assert.deepEqual(await call(hist,503),{codigo:'HISTORICO_NAO_VERIFICADO',...noSend})
}
// Duplicidade interna que nao envolve a cabeca: C -> B -> A -> B.
const quatro={...tres,head_evento_id:d,head_versao:4,quantidade:4}
resposta={...quatro,eventos:[
 {...terceiro,evento_id:d,versao:4,predecessor_id:b},
 {...terceiro,evento_id:b,predecessor_id:a},
 {...segundo,evento_id:a,predecessor_id:b.toUpperCase()},
 {...primeiro,evento_id:b.toUpperCase()}
]}
assert.deepEqual(await call(hist,503),{codigo:'HISTORICO_NAO_VERIFICADO',...noSend})
// Pagina parcial com retorno ao evento ja visto ou a cabeca fora da pagina.
esperado={p_operador:admin,p_tentativa:t,p_limite:2,p_antes_versao:null}
resposta={...tres,eventos:[terceiro,segundo],quantidade:2,proxima_antes_versao:2}
await call({...hist,limite:2},200)
resposta={...tres,eventos:[terceiro,{...segundo,predecessor_id:c.toUpperCase()}],
 quantidade:2,proxima_antes_versao:2}
assert.deepEqual(await call({...hist,limite:2},503),{codigo:'HISTORICO_NAO_VERIFICADO',...noSend})
esperado={p_operador:admin,p_tentativa:t,p_limite:1,p_antes_versao:3}
resposta={...tres,eventos:[segundo],quantidade:1,proxima_antes_versao:2}
await call({...hist,limite:1,antes_versao:3},200)
for(const ev of [{...segundo,evento_id:c.toUpperCase()},{...segundo,predecessor_id:c.toUpperCase()}]){
 resposta={...tres,eventos:[ev],quantidade:1,proxima_antes_versao:2}
 assert.deepEqual(await call({...hist,limite:1,antes_versao:3},503),{codigo:'HISTORICO_NAO_VERIFICADO',...noSend})
}
console.log('06 unicidade de eventos e ciclos observaveis PASS')
const indice={acao:'listar_historico_auditoria_v2',limite:1,depois_tentativa:null}
rota='mensageria_hml_listar_historico_auditoria_v2'
esperado={p_operador:admin,p_limite:1,p_depois_tentativa:null}
const item={tentativa_id:t,head_evento_id:e2,head_versao:2,registrado_em:data}
const page={status:'ok',itens:[item],quantidade:1,proximo_depois_tentativa:t,...noSend}
resposta={...page,itens:[{...item,operador_id:admin}],token:'mock'}
assert.deepEqual(await call(indice,200),page)
esperado={p_operador:admin,p_limite:1,p_depois_tentativa:t}
resposta={...page,itens:[{...item,tentativa_id:t2}],proximo_depois_tentativa:null}
await call({...indice,depois_tentativa:t},200)
resposta=page
await call({...indice,depois_tentativa:t},503)
esperado={p_operador:admin,p_limite:1,p_depois_tentativa:null}
resposta={...page,proximo_depois_tentativa:t2}
await call(indice,503)
resposta={...page,itens:[],quantidade:0,proximo_depois_tentativa:null}
await call(indice,200)
console.log('04 indice, ordem, cursor e projecao PASS')
const antes=chamadas
for(const mal of [{...hist,limite:0},{...hist,limite:21},{...hist,antes_versao:2147483648},
 {...hist,antes_versao:undefined},{...hist,p_operador:admin},{...indice,depois_tentativa:'invalido'},
 {...indice,depois_tentativa:undefined}])await call(mal,400)
auth=false
await call(hist,403)
await call(indice,403)
assert.equal(chamadas,antes)
console.log('05 autorizacao e contrato fechado PASS')
