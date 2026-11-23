import assert from 'node:assert/strict'
import {criarConsumidorSimulado,REF} from './handler.ts'
type Env={get:(key:string)=>string|undefined}
const origin='http://127.0.0.1:5173'
const base='https://'+REF+'.supabase.co'
const admin='11111111-1111-4111-8111-111111111111'
const jwt='x'.repeat(40)
const env:Env={get:key=>({
  HML_PROJECT_REF:REF,SUPABASE_URL:base,
  SUPABASE_SERVICE_ROLE_KEY:'test_backend_only',
  HML_OPERATOR_UUID:admin,HML_TEST_RECIPIENT_E164:'5531999573653'
} as Record<string,string>)[key]}
const called:string[]=[]
const fakeFetch=async (url:string|URL|Request):Promise<Response>=>{
  const uri=String(url);called.push(uri)
  if(uri.endsWith('/auth/v1/user'))return Response.json({
    id:admin,app_metadata:{role:'internal',whatsapp_admin:true}
  })
  if(uri.endsWith('/rest/v1/rpc/mensageria_hml_autorizar_operador'))
    return Response.json(true)
  if(uri.endsWith('/rest/v1/rpc/mensageria_hml_outbox_diagnosticar_reconciliacao'))
    return Response.json({
      status:'ok',reservas_antigas:0,indeterminadas:1,recusadas:0,
      aceitas:1,aceitas_sem_status:1,status_enviado:0,
      status_entregue:0,status_lido:0,status_falha:0,
      status_contraditorio:0,webhooks_sem_vinculo_outbox:2,
      reenvio_automatico_autorizado:false
    })
  if(uri.endsWith('/rest/v1/rpc/mensageria_hml_outbox_listar_pendentes'))
    return Response.json({status:'ok',itens:['22222222-2222-4222-8222-222222222222'],quantidade:1})
  assert.fail('Chamada externa inesperada: '+uri)
}
function request(body:unknown,token=jwt,origem=origin){
 return new Request(base+'/functions/v1/mensageria-outbox-hml',{
  method:'POST',headers:{origin:origem,authorization:'Bearer '+token},
  body:JSON.stringify(body)
 })
}
const handler=criarConsumidorSimulado(env,fakeFetch as typeof fetch)
let r=await handler(request({acao:'simular_lote',limite:1}))
assert.equal(r.status,200)
const data=await r.json()
assert.equal(data.status,'simulacao_somente_leitura')
assert.equal(data.elegiveis,1)
assert.equal(data.enviados,0)
assert.equal(data.reservados,0)
assert.equal(data.envio_automatico_habilitado,false)
assert.equal(called.filter(x=>x.endsWith('/rest/v1/rpc/mensageria_hml_outbox_listar_pendentes')).length,1)
// O handler autentica o administrador antes de negar qualquer ação proibida.
// Essas consultas /auth/v1/user e /rpc/...autorizar_operador são esperadas.
// A garantia de segurança relevante é: NENHUMA nova consulta à fila e
// NENHUMA chamada de escrita ou envio, mesmo quando a ação é bloqueada.
const chamadasDeFila=()=>called.filter(x=>
  x.endsWith('/rest/v1/rpc/mensageria_hml_outbox_diagnosticar_reconciliacao')||
  x.endsWith('/rest/v1/rpc/mensageria_hml_outbox_listar_pendentes')).length
const diag=await handler(request({acao:'diagnosticar_reconciliacao'}))
assert.equal(diag.status,200)
const numeros=await diag.json()
assert.equal(numeros.status,'diagnostico_somente_leitura')
assert.equal(numeros.indeterminadas,1)
assert.equal(numeros.aceitas_sem_status,1)
assert.equal(numeros.webhooks_sem_vinculo_outbox,2)
assert.equal(numeros.reenvio_automatico_autorizado,false)
assert.equal(numeros.numero,undefined,'Diagnóstico não deve expor telefone')
const prior=chamadasDeFila()
r=await handler(request({acao:'processar_lote',limite:1}))
assert.equal(r.status,503)
assert.equal((await r.json()).codigo,'ENVIO_INDISPONIVEL_NA_HOMOLOGACAO')
assert.equal(chamadasDeFila(),prior,'Processamento bloqueado não pode consultar a fila')
r=await handler(request({acao:'enviar'}))
assert.equal(r.status,503)
assert.equal(chamadasDeFila(),prior)
r=await handler(request({acao:'simular_lote',limite:20}))
assert.equal(r.status,400)
assert.equal(chamadasDeFila(),prior)
r=await handler(request({acao:'simular_lote'},'',origin))
assert.equal(r.status,403)
r=await handler(request({acao:'simular_lote'},jwt,'https://site-externo.example'))
assert.equal(r.status,403)
const errado:Env={get:key=>key==='HML_PROJECT_REF'?'fdnjhnzigveoypdkdwkq':env.get(key)}
r=await criarConsumidorSimulado(errado,fakeFetch as typeof fetch)(request({acao:'simular_lote'}))
assert.equal(r.status,503)
const ativado:Env={get:key=>key==='HML_OUTBOX_SEND_ENABLED'?'true':env.get(key)}
r=await criarConsumidorSimulado(ativado,fakeFetch as typeof fetch)(request({acao:'processar_lote'}))
assert.equal(r.status,503,'Flag acidental não permite envios')
assert.equal(chamadasDeFila(),prior,
 'Nenhuma ação bloqueada deve consultar novos itens da fila')
assert.ok(called.every(x=>
  x.endsWith('/auth/v1/user')||
  x.endsWith('/rest/v1/rpc/mensageria_hml_autorizar_operador')||
  x.endsWith('/rest/v1/rpc/mensageria_hml_outbox_listar_pendentes')||
  x.endsWith('/rest/v1/rpc/mensageria_hml_outbox_diagnosticar_reconciliacao')
),'Somente autenticação administrativa e consultas de leitura são permitidas')
assert.ok(called.every(x=>x.startsWith(base)),'Não pode acessar Meta ou produção')
assert.ok(called.every(x=>!/\/(messag|graph)/.test(x)),'Não pode enviar nada')
console.log('CONSUMIDOR OUTBOX HML - SIMULACAO SOMENTE LEITURA E ENVIO BLOQUEADO - PASS')
