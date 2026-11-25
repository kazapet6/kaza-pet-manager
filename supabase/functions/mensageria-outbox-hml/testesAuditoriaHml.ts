import assert from 'node:assert/strict'
import {criarConsumidorSimulado,REF} from './handler.ts'
const base='https://'+REF+'.supabase.co'
const admin='11111111-1111-4111-8111-111111111111'
const tentativa='22222222-2222-4222-8222-222222222222'
const chave='33333333-3333-4333-8333-333333333333'
const evento='44444444-4444-4444-8444-444444444444'
const origin='http://127.0.0.1:5173'
const jwt='x'.repeat(40)
const env={get:(k:string)=>({
  HML_PROJECT_REF:REF,SUPABASE_URL:base,
  SUPABASE_SERVICE_ROLE_KEY:'test_backend_only',
  HML_OPERATOR_UUID:admin,HML_TEST_RECIPIENT_E164:'5511999990000',
  HML_OUTBOX_SEND_ENABLED:'true'
} as Record<string,string>)[k]}
const payload={
  acao:'registrar_decisao_auditoria_v2',tentativa_id:tentativa,predecessor_id:null,
  categoria:'resultado_indeterminado',decisao:'manter_em_investigacao',
  motivo:'evidencia_insuficiente',chave_idempotencia:chave,confirmar_registro:true
}
const sucesso={
  status:'registrado',evento_id:evento,tentativa_id:tentativa,predecessor_id:null,versao:1,
  categoria:payload.categoria,decisao:payload.decisao,motivo:payload.motivo,
  registrado_em:'2026-11-24T18:00:00Z',reenvio_automatico_autorizado:false
}
let auth=true,session=true,escritas=0
let rpc:unknown=sucesso
let erroTransporte=false
const calls:string[]=[]
const fakeFetch:typeof fetch=async (url,init)=>{
  const u=String(url)
  calls.push(u)
  assert.ok(u.startsWith(base+'/'))
  const headers=new Headers(init?.headers)
  if(u.endsWith('/auth/v1/user')){
    assert.equal(headers.get('authorization'),'Bearer '+jwt)
    return Response.json({id:auth?admin:tentativa,app_metadata:{role:'internal',whatsapp_admin:true}})
  }
  if(u.endsWith('/rpc/mensageria_hml_autorizar_operador')){
    assert.equal(headers.get('authorization'),'Bearer '+jwt)
    assert.deepEqual(JSON.parse(String(init?.body)),{p_expected:admin})
    return Response.json(session)
  }
  if(u.endsWith('/rpc/mensageria_hml_registrar_decisao_auditoria_v2')){
    escritas++
    assert.equal(headers.get('authorization'),'Bearer test_backend_only')
    assert.deepEqual(JSON.parse(String(init?.body)),{
      p_operador:admin,p_tentativa:tentativa,p_categoria:payload.categoria,
      p_decisao:payload.decisao,p_motivo:payload.motivo,p_chave:chave,p_predecessor:null
    })
    if(erroTransporte)throw Error('timeout')
    return Response.json(rpc)
  }
  assert.fail('Destino inesperado')
}
const handler=criarConsumidorSimulado(env,fakeFetch)
function request(body:unknown,token=jwt,origem=origin){
  return new Request(base+'/functions/v1/mensageria-outbox-hml',{
    method:'POST',headers:{origin:origem,authorization:'Bearer '+token},
    body:JSON.stringify(body)
  })
}
async function check(body:unknown,code:number,token=jwt,origem=origin){
  const r=await handler(request(body,token,origem))
  assert.equal(r.status,code)
  return await r.json()
}
assert.deepEqual(await check(payload,200),sucesso)
rpc={...sucesso,status:'ja_registrado',operador_id:admin,telefone:'synthetic',wamid:'synthetic'}
assert.deepEqual(await check(payload,200),{...sucesso,status:'ja_registrado'})
assert.equal(escritas,2)
console.log('01 registro e replay com resposta minima PASS')
const antes=escritas
for(const invalido of [
 {...payload,p_operador:admin},{...payload,telefone:'synthetic'},
 {...payload,confirmar_registro:false},{...payload,confirmar_registro:undefined},
 {...payload,tentativa_id:'invalido'},{...payload,chave_idempotencia:'invalida'},
 {...payload,categoria:'outra'},{...payload,decisao:'reenviar'},
 {...payload,motivo:null},{...payload,motivo:'texto livre'},
 {...payload,predecessor_id:undefined},{...payload,predecessor_id:'invalido'}
]) await check(invalido,400)
assert.equal(escritas,antes)
console.log('02 entradas invalidas e campos extras PASS')
auth=false
await check(payload,403)
auth=true;session=false
await check(payload,403)
session=true
await check(payload,403,'')
await check(payload,403,jwt,'https://invalid.example')
assert.equal(escritas,antes)
console.log('03 operador e sessao negados PASS')
for(const [status,code] of [
 ['nao_autorizado',403],['entrada_invalida',400],['conflito_idempotencia',409],
 ['categoria_desatualizada',409],['caso_nao_elegivel',409],
 ['predecessor_desatualizado',409],['isolamento_invalido',503]
] as const){
  rpc={status,reenvio_automatico_autorizado:false,segredo:'synthetic'}
  assert.deepEqual(await check(payload,code),{codigo:status,reenvio_automatico_autorizado:false})
}
console.log('04 rejeicoes da RPC PASS')
for(const resposta of [
 null,{...sucesso,reenvio_automatico_autorizado:true},{...sucesso,evento_id:null},
 {...sucesso,tentativa_id:evento},{...sucesso,decisao:'reenviar'},
 {...sucesso,categoria:null},{...sucesso,motivo:'outro'},
 {...sucesso,registrado_em:'invalido'},{...sucesso,status:'desconhecido'},
 {...sucesso,predecessor_id:chave},{...sucesso,versao:2},{...sucesso,versao:0}
]){
  rpc=resposta
  assert.deepEqual(await check(payload,503),{
    codigo:'REGISTRO_NAO_VERIFICADO',reenvio_automatico_autorizado:false
  })
}
console.log('05 resposta invalida ou perigosa PASS')
erroTransporte=true
const antesTimeout=escritas
await check(payload,503)
assert.equal(escritas,antesTimeout+1)
erroTransporte=false
console.log('06 timeout sem retry automatico PASS')
const antesBloqueio=escritas
for(const acao of ['enviar','processar_lote']){
  assert.equal((await check({acao},503)).codigo,'ENVIO_INDISPONIVEL_NA_HOMOLOGACAO')
}
assert.deepEqual(await check({...payload,acao:'registrar_decisao_auditoria'},503),{
  codigo:'VERSAO_AUDITORIA_OBSOLETA',reenvio_automatico_autorizado:false
})
assert.equal(escritas,antesBloqueio)
const envErrado={get:(k:string)=>k==='HML_PROJECT_REF'?'invalid-project':env.get(k)}
const antesProjeto=calls.length
assert.equal((await criarConsumidorSimulado(envErrado,fakeFetch)(request(payload))).status,503)
assert.equal(calls.length,antesProjeto)
console.log('07 envio e projeto incorreto bloqueados PASS')
console.log('AUDITORIA EDGE HML - 7 GRUPOS PASS')
