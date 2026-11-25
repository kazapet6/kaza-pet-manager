import assert from 'node:assert/strict'
import {criarTransporteMetaHml,type AmbienteMetaHml} from './transporteMetaHml.ts'
import type {EnvioTextoMeta} from '../mensageria-confirmacao-hml/respostaOutboxHml.ts'

const E164='5511999999999'
const phoneId='309132033809134'
const now=Date.parse('2026-11-23T18:00:00Z')
const envValues:Record<string,string>={
  HML_PROJECT_REF:'jgtctzqieyorhvqxjbpk',
  SUPABASE_URL:'https://jgtctzqieyorhvqxjbpk.supabase.co',
  HML_META_PHONE_NUMBER_ID:phoneId,
  HML_OUTBOX_SEND_ENABLED:'true',
  HML_OUTBOX_SEND_EXPIRES_AT:'2026-11-23T18:02:00Z',
  HML_TEST_RECIPIENT_E164:E164,
  HML_META_ACCESS_TOKEN:'MOCK_TOKEN_NUNCA_REAL_'+('x'.repeat(50))
}
const body:EnvioTextoMeta={
  messaging_product:'whatsapp',recipient_type:'individual',
  to:E164,type:'text',context:{message_id:'wamid.click-ficticio-12345'},
  text:{body:'Obrigado, Mariana! O banho de Thor está confirmado.',preview_url:false}
}
const ambiente:AmbienteMetaHml={get:n=>envValues[n]}
const mockAceite=()=>Response.json({
  messaging_product:'whatsapp',
  contacts:[{input:E164,wa_id:E164}],
  messages:[{id:'wamid.meta-aceitou-ficticio-54321'}]
})
let chamadas=0
const requisitar=async (url:string,init:RequestInit):Promise<Response>=>{
  chamadas++
  assert.equal(url,'https://graph.facebook.com/v27.0/'+phoneId+'/messages')
  assert.equal(init.method,'POST')
  assert.equal(init.redirect,'error')
  const headers=init.headers as Record<string,string>
  assert.equal(headers.authorization,'Bearer '+envValues.HML_META_ACCESS_TOKEN)
  assert.equal(headers['content-type'],'application/json')
  assert.deepEqual(JSON.parse(String(init.body)),body)
  return mockAceite()
}
const transporte=criarTransporteMetaHml({ambiente,requisitar,agora:()=>now})
const aceito=await transporte(body)
assert.deepEqual(aceito,{httpStatus:200,wamid:'wamid.meta-aceitou-ficticio-54321'})
assert.equal(chamadas,1)

for(const [nome,valor] of [
  ['HML_OUTBOX_SEND_ENABLED','false'],
  ['HML_PROJECT_REF','fdnjhnzigveoypdkdwkq'],
  ['SUPABASE_URL','https://fdnjhnzigveoypdkdwkq.supabase.co'],
  ['HML_META_PHONE_NUMBER_ID','11111111111'],
  ['HML_OUTBOX_SEND_EXPIRES_AT','2026-11-23T17:59:59Z'],
  ['HML_OUTBOX_SEND_EXPIRES_AT','2026-11-23T18:04:00Z'],
  ['HML_TEST_RECIPIENT_E164','5511888888888'],
  ['HML_META_ACCESS_TOKEN','curto']
] as const){
  const alterado:AmbienteMetaHml={get:n=>n===nome?valor:envValues[n]}
  const antes:number=chamadas
  let erro=false
  try{await criarTransporteMetaHml({ambiente:alterado,requisitar,agora:()=>now})(body)}
  catch{erro=true}
  assert.equal(erro,true,'Deveria bloquear '+nome)
  assert.equal(chamadas,antes,'Nunca chamar Meta com '+nome+' inválido')
}
for(const invalido of [
  {...body,to:'5511888888888'},
  {...body,context:{message_id:'id_nao_meta'}},
  {...body,text:{body:'',preview_url:false as const}},
  {...body,text:{body:'x'.repeat(4100),preview_url:false as const}},
  {...body,text:{body:'teste',preview_url:true as false}}
]){
  let erro=false
  const antes:number=chamadas
  try{await transporte(invalido as EnvioTextoMeta)}catch{erro=true}
  assert.equal(erro,true,'Corpo inválido deve ser bloqueado')
  assert.equal(chamadas,antes,'Corpo inválido não pode chegar à Meta')
}

let instante=0
const expirar=criarTransporteMetaHml({
  ambiente,requisitar,agora:()=>{
    instante++
    return instante===1?now:Date.parse('2026-11-23T18:03:00Z')
  }
})
let bloqueou=false
const antes=chamadas
try{await expirar(body)}catch{bloqueou=true}
assert.equal(bloqueou,true,'A autorização pode expirar antes do POST')
assert.equal(chamadas,antes)

const simular=async(response:()=>Promise<Response>)=>
  criarTransporteMetaHml({ambiente,
    requisitar:async()=>{chamadas++;return response()},
    agora:()=>now
  })(body)
let saida=await simular(async()=>Response.json({error:{code:131047}},{status:400}))
assert.deepEqual(saida,{httpStatus:400,wamid:null})
saida=await simular(async()=>Response.json({error:{message:'indisponivel'}},{status:503}))
assert.deepEqual(saida,{httpStatus:503,wamid:null})
saida=await simular(async()=>Response.json({messaging_product:'whatsapp',messages:[]}))
assert.deepEqual(saida,{httpStatus:200,wamid:null})
saida=await simular(async()=>Response.json({messaging_product:'whatsapp',
  contacts:[{input:'5511888888888'}],
  messages:[{id:'wamid.meta-aceitou-ficticio-54321'}]}))
assert.deepEqual(saida,{httpStatus:200,wamid:null},
  'Aceite para outro destinatário é indeterminado')
saida=await simular(async()=>Response.json({
  messaging_product:'whatsapp',
  contacts:[{input:E164,wa_id:'5511888888888'}],
  messages:[{id:'wamid.meta-aceitou-ficticio-54321'}]
}))
assert.equal(saida.wamid,'wamid.meta-aceitou-ficticio-54321',
  'Meta pode devolver wa_id diferente de input, sem trocar destino')
let incerto=false
try{
  await simular(async()=>{throw Error('rede cai depois do POST')})
}catch(e){
  incerto=(e instanceof Error && e.message==='META_RESPOSTA_INDETERMINADA')
}
assert.equal(incerto,true,'Timeout não pode gerar retry automático')
console.log('TRANSPORTE META HML - ALLOWLIST, MOCK, WAMID, ERROS E SEM RETRY - PASS')
