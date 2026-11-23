import assert from 'node:assert/strict'
import {criarAdaptadorRpcOutboxHml} from './adaptadorRpcOutboxHml.ts'
import {executarUmAgradecimentoHml} from './orquestradorDespachoHml.ts'
import {criarTransporteMetaHml} from './transporteMetaHml.ts'
import type {EnvioTextoMeta} from '../mensageria-confirmacao-hml/respostaOutboxHml.ts'

const HML='jgtctzqieyorhvqxjbpk'
const BASE='https://'+HML+'.supabase.co'
const admin='22222222-2222-4222-8222-222222222222'
const outbox='11111111-1111-4111-8111-111111111111'
const chave='33333333-3333-4333-8333-333333333333'
const numero='5511999999999'
const agora=new Date('2026-11-23T18:00:00Z')
const config={
  projeto:HML,operadorId:admin,permitidoE164:numero,envioHabilitado:true,
  autorizacaoExpiraIso:'2026-11-23T18:01:00Z',
  agora:()=>agora,chaveAleatoria:()=>chave
}
const fakeContexto={
 status:'pronto',eventoCodigo:'AGENDAMENTO_CONFIRMADO_WHATSAPP',
 statusAtendimento:'confirmado',statusConvite:'confirmado',modeloPublicado:true,
 textoModelo:'Olá, {{NOME_TUTOR}}! Obrigado por confirmar {{NOME_PET}} para {{DATA_AGENDAMENTO}} às {{HORARIO_AGENDAMENTO}}. {{NOME_EMPRESA}}',
 destinatarioE164:'+'+numero,remetenteClique:numero,
 mensagemCliqueId:'wamid.click-ficticio-0001',
 inicioAtualIso:'2026-11-25T12:00:00Z',
 inicioConviteIso:'2026-11-25T12:00:00Z',
 cliqueRecebidoIso:'2026-11-23T17:59:55Z',
 agoraIso:'2026-11-23T18:00:00Z',
 nomeTutor:'Mariana',nomePet:'Thor',nomeEmpresa:'KAZA PET'
}
const vars:Record<string,string>={
 HML_PROJECT_REF:HML,SUPABASE_URL:BASE,HML_OUTBOX_RPC_ENABLED:'true',
 SUPABASE_SERVICE_ROLE_KEY:'CHAVE_FICTICIA_SERVIDOR_'+('x'.repeat(70)),
 HML_OPERATOR_UUID:admin,HML_TEST_RECIPIENT_E164:numero
}
const env={get:(name:string)=>vars[name]}
let chamadas:string[]=[]
let aceites=0
let reservou=false
let finalizado=''
let bancoFalha=false
let contexto:any=fakeContexto
let metaFalha=false

async function fakeRPC(url:string,init:RequestInit):Promise<Response>{
  assert.ok(url.startsWith(BASE+'/rest/v1/rpc/'),'Não chamar produção, Graph Meta ou outro domínio')
  assert.equal(init.method,'POST')
  assert.equal(init.redirect,'error')
  const hdr=init.headers as Record<string,string>
  assert.equal(hdr.apikey,vars.SUPABASE_SERVICE_ROLE_KEY)
  assert.equal(hdr.authorization,'Bearer '+vars.SUPABASE_SERVICE_ROLE_KEY)
  const body=JSON.parse(String(init.body))
  const fn=url.split('/').at(-1)
  chamadas.push(String(fn))
  if(bancoFalha)return Response.json({erro:'indisponivel'},{status:503})
  switch(fn){
    case 'mensageria_hml_outbox_listar_pendentes':
      assert.deepEqual(body,{p_operador:admin,p_limite:1})
      return Response.json({status:'ok',itens:[outbox],quantidade:1})
    case 'mensageria_hml_outbox_reservar':
      assert.deepEqual(body,{p_outbox:outbox,p_chave:chave,p_operador:admin})
      if(reservou)return Response.json({status:'ja_reservado'})
      reservou=true
      return Response.json({status:'reservado'})
    case 'mensageria_hml_outbox_contexto':
      assert.deepEqual(body,{
        p_outbox:outbox,p_chave:chave,p_operador:admin,
        p_destinatario_permitido:'+'+numero
      })
      return Response.json(contexto)
    case 'mensageria_hml_outbox_finalizar':
      assert.equal(body.p_outbox,outbox)
      assert.equal(body.p_chave,chave)
      assert.equal(body.p_operador,admin)
      finalizado=body.p_resultado
      if(body.p_resultado==='aceito_meta'){
        assert.equal(body.p_wamid,'wamid.meta-aceite-ficticio-0001')
        assert.equal(body.p_codigo,null)
      }
      return Response.json({status:body.p_resultado})
    default:
      assert.fail('RPC nao aprovada')
  }
}
async function fakeMeta(body:EnvioTextoMeta){
  aceites++
  if(metaFalha)throw Error('TIMEOUT_DE_REDE_SIMULADO')
  assert.equal(body.to,numero)
  assert.equal(body.context.message_id,fakeContexto.mensagemCliqueId)
  assert.match(body.text.body,/Mariana/)
  assert.match(body.text.body,/25\/11\/2026 às 09:00/)
  return {httpStatus:200,wamid:'wamid.meta-aceite-ficticio-0001'}
}
const newAdapter=()=>{
  return criarAdaptadorRpcOutboxHml({
    ambiente:env,requisitar:fakeRPC,enviar:fakeMeta
  })
}
const reset=()=>{
  chamadas=[];aceites=0;reservou=false;finalizado=''
  bancoFalha=false;contexto=fakeContexto;metaFalha=false
}

reset()
const ops=newAdapter()
assert.equal(ops.configurado(),true)
let result=await executarUmAgradecimentoHml(config,ops)
assert.deepEqual({estado:result.estado,aceitosMeta:result.aceitosMeta,entregues:result.entregues},
 {estado:'aceito',aceitosMeta:1,entregues:0})
assert.deepEqual(chamadas,[
 'mensageria_hml_outbox_listar_pendentes',
 'mensageria_hml_outbox_reservar',
 'mensageria_hml_outbox_contexto',
 'mensageria_hml_outbox_finalizar'
])
assert.equal(finalizado,'aceito_meta')
assert.equal(aceites,1)

// A repetição do evento não pode efetuar outro POST Meta.
chamadas=[]
result=await executarUmAgradecimentoHml(config,ops)
assert.equal(result.estado,'concorrencia')
assert.equal(aceites,1)
assert.deepEqual(chamadas,[
 'mensageria_hml_outbox_listar_pendentes',
 'mensageria_hml_outbox_reservar'
])

reset()
contexto={...fakeContexto,statusAtendimento:'cancelado'}
result=await executarUmAgradecimentoHml(config,newAdapter())
assert.equal(result.estado,'preparo_bloqueado')
assert.equal(finalizado,'indeterminado')
assert.equal(aceites,0)

reset()
metaFalha=true
result=await executarUmAgradecimentoHml(config,newAdapter())
assert.equal(result.estado,'indeterminado')
assert.equal(finalizado,'indeterminado')
assert.equal(aceites,1)

reset()
bancoFalha=true
result=await executarUmAgradecimentoHml(config,newAdapter())
assert.equal(result.estado,'bloqueado')
assert.equal(aceites,0)
assert.equal(chamadas.length,1)

reset()
const original=vars.HML_OUTBOX_RPC_ENABLED
vars.HML_OUTBOX_RPC_ENABLED='false'
assert.equal(newAdapter().configurado(),false)
result=await executarUmAgradecimentoHml(config,newAdapter())
assert.equal(result.estado,'bloqueado')
assert.deepEqual(chamadas,[])
assert.equal(aceites,0)
vars.HML_OUTBOX_RPC_ENABLED=original

reset()
const p=vars.HML_PROJECT_REF
vars.HML_PROJECT_REF='fdnjhnzigveoypdkdwkq'
result=await executarUmAgradecimentoHml(config,newAdapter())
assert.equal(result.estado,'bloqueado')
assert.deepEqual(chamadas,[])
assert.equal(aceites,0)
vars.HML_PROJECT_REF=p

reset()
const wrong=await executarUmAgradecimentoHml({...config,envioHabilitado:false},newAdapter())
assert.equal(wrong.estado,'bloqueado')
assert.deepEqual(chamadas,[])
assert.equal(aceites,0)

// Validação local sem RPC: proteção também se aplica a acesso direto ao adapter.
let rejeitou=false
try{
  await newAdapter().contexto({
    p_outbox:outbox,p_chave:chave,p_operador:admin,
    p_destinatario_permitido:'+5511888888888'
  })
}catch{rejeitou=true}
assert.equal(rejeitou,true)
assert.deepEqual(chamadas,[])


// Integração real entre os módulos implementados, mas com TODA a rede
// simulada. A função transportadora conhece o URL da Meta, o mock valida
// o payload, e nenhuma requisição de verdade é executada.
reset()
vars.HML_OUTBOX_SEND_ENABLED='true'
vars.HML_OUTBOX_SEND_EXPIRES_AT='2026-11-23T18:01:30Z'
vars.HML_META_PHONE_NUMBER_ID='309132033809134'
vars.HML_META_ACCESS_TOKEN='TOKEN_FICTICIO_TESTE_'+('z'.repeat(70))
const logRede:string[]=[]
const transporte=criarTransporteMetaHml({
  ambiente:env,agora:()=>agora.getTime(),
  requisitar:async(url,opts)=>{
    logRede.push(url)
    assert.equal(url,'https://graph.facebook.com/v27.0/309132033809134/messages')
    assert.equal(opts.method,'POST')
    assert.equal((opts.headers as Record<string,string>).authorization,
      'Bearer '+vars.HML_META_ACCESS_TOKEN)
    const payload=JSON.parse(String(opts.body))
    assert.equal(payload.to,numero)
    assert.equal(payload.context.message_id,fakeContexto.mensagemCliqueId)
    return Response.json({
      messaging_product:'whatsapp',
      contacts:[{input:numero,wa_id:numero}],
      messages:[{id:'wamid.meta-aceite-ficticio-0001'}]
    })
  }
})
const integrado=criarAdaptadorRpcOutboxHml({
  ambiente:env,requisitar:fakeRPC,
  enviar:transporte
})
result=await executarUmAgradecimentoHml(config,integrado)
assert.equal(result.estado,'aceito')
assert.equal(result.aceitosMeta,1)
assert.equal(result.entregues,0)
assert.deepEqual(logRede,[
 'https://graph.facebook.com/v27.0/309132033809134/messages'
])
assert.equal(finalizado,'aceito_meta')
assert.deepEqual(chamadas,[
 'mensageria_hml_outbox_listar_pendentes',
 'mensageria_hml_outbox_reservar',
 'mensageria_hml_outbox_contexto',
 'mensageria_hml_outbox_finalizar'
])
delete vars.HML_OUTBOX_SEND_ENABLED
delete vars.HML_OUTBOX_SEND_EXPIRES_AT
delete vars.HML_META_PHONE_NUMBER_ID
delete vars.HML_META_ACCESS_TOKEN

console.log('OUTBOX HML - RPCS E TRANSPORTE MOCK INTEGRADOS, SEM ENVIO REAL - PASS')
