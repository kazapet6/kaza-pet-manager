import assert from 'node:assert/strict'
import {montarRespostaDaOutbox,type ConsultarContexto} from './contextoOutboxBackendHml.ts'

const cfg={
 projeto:'jgtctzqieyorhvqxjbpk',
 outboxId:'11111111-1111-4111-8111-111111111111',
 chaveTentativa:'22222222-2222-4222-8222-222222222222',
 operadorId:'33333333-3333-4333-8333-333333333333',
 destinatarioPermitidoE164:'+5511999999999'
}
const valido={
 status:'pronto',
 eventoCodigo:'AGENDAMENTO_CONFIRMADO_WHATSAPP',
 statusAtendimento:'confirmado',
 statusConvite:'confirmado',
 modeloPublicado:true,
 textoModelo:'Obrigado, {{NOME_TUTOR}}! Confirmamos {NOME_PET} para {{DATA_AGENDAMENTO}} às {{HORARIO_AGENDAMENTO}}. {{NOME_EMPRESA}}',
 destinatarioE164:'+5511999999999',
 remetenteClique:'5511999999999',
 mensagemCliqueId:'wamid.hml.fake-click-000001',
 inicioAtualIso:'2026-11-25T12:00:00Z',
 inicioConviteIso:'2026-11-25T12:00:00Z',
 cliqueRecebidoIso:'2026-11-23T15:00:00Z',
 agoraIso:'2026-11-23T15:00:15Z',
 nomeTutor:'Mariana',nomePet:'Thor',nomeEmpresa:'KAZA PET'
}
let vezes=0
const consultar:ConsultarContexto=async params=>{
 vezes++
 assert.equal(params.p_outbox,cfg.outboxId)
 assert.equal(params.p_chave,cfg.chaveTentativa)
 assert.equal(params.p_operador,cfg.operadorId)
 assert.equal(params.p_destinatario_permitido,cfg.destinatarioPermitidoE164)
 return valido
}
const pronto=await montarRespostaDaOutbox(cfg,consultar)
assert.equal(pronto.status,'pronto')
if(pronto.status!=='pronto')throw Error('RESP_NAO_PREPARADA')
assert.equal(pronto.corpo.to,'5511999999999')
assert.equal(pronto.corpo.context.message_id,valido.mensagemCliqueId)
assert.match(pronto.corpo.text.body,/25\/11\/2026 às 09:00/)
assert.match(pronto.corpo.text.body,/Thor/)
assert.equal(vezes,1)

let antes=0
const nunca:ConsultarContexto=async()=>{antes++;throw Error('não chamar')}
for(const alteracao of [
 {...cfg,projeto:'fdnjhnzigveoypdkdwkq'},
 {...cfg,outboxId:'invalido'},
 {...cfg,destinatarioPermitidoE164:'5511999999999'},
]){
 const resultado=await montarRespostaDaOutbox(alteracao,nunca)
 assert.equal(resultado.status,'bloqueado')
}
assert.equal(antes,0,'Gates devem bloquear antes de acessar banco')

for(const dados of [
 {...valido,status:'contexto_nao_elegivel'},
 {...valido,statusAtendimento:'cancelado'},
 {...valido,statusConvite:'invalido'},
 {...valido,modeloPublicado:false},
 {...valido,destinatarioE164:'+5511888888888'},
 {...valido,inicioAtualIso:'2026-11-25T14:00:00Z'},
 {...valido,remetenteClique:'5511888888888'},
 {...valido,textoModelo:'Obrigado {{TAG_FUTURA}}'},
 {...valido,cliqueRecebidoIso:'2026-11-21T15:00:00Z'},
 {...valido,eventoCodigo:'REMARCACAO_SOLICITADA_WHATSAPP'},
]){
 const resultado=await montarRespostaDaOutbox(cfg,async()=>dados)
 assert.equal(resultado.status,'bloqueado',JSON.stringify(dados.status))
}
const queda=await montarRespostaDaOutbox(cfg,async()=>{throw Error('offline')})
assert.deepEqual(queda,{status:'bloqueado',codigo:'CONTEXTO_HML_INDISPONIVEL'})
console.log('OUTBOX HML - CONTEXTO BANCO, TAGS E AUTORIZACAO - PASS')
