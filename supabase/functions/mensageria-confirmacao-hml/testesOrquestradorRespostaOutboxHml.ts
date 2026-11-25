import assert from 'node:assert/strict'
import {orquestrarRespostaHml,type OperacoesOutboxHml} from './orquestradorRespostaOutboxHml.ts'
import type {ContextoRespostaHml} from './respostaOutboxHml.ts'
const id='11111111-1111-4111-8111-111111111111'
const ctx:ContextoRespostaHml={
 eventoCodigo:'AGENDAMENTO_CONFIRMADO_WHATSAPP',
 statusAtendimento:'confirmado',statusConvite:'confirmado',
 modeloPublicado:true,
 textoModelo:'Obrigado, {{NOME_TUTOR}}! Confirmamos {{NOME_PET}} para {{DATA_AGENDAMENTO}} às {{HORARIO_AGENDAMENTO}}.',
 destinatarioE164:'+5511999999999',remetenteClique:'5511999999999',
 mensagemCliqueId:'wamid.hml.click-100001',
 inicioAtualIso:'2026-11-24T12:00:00Z',
 inicioConviteIso:'2026-11-24T12:00:00Z',
 cliqueRecebidoIso:'2026-11-22T22:00:00Z',
 agoraIso:'2026-11-22T22:00:05Z',
 nomeTutor:'Mariana',nomePet:'Thor',nomeEmpresa:'KAZA PET'
}
const auth={
 projeto:'jgtctzqieyorhvqxjbpk',
 envioHabilitado:true,
 expiraEm:'2026-11-22T22:02:00Z',
 agora:()=>new Date('2026-11-22T22:00:00Z')
}
const log:string[]=[]
const ops:OperacoesOutboxHml={
 async reservar(){log.push('reserva');return 'reservado'},
 async enviar(body){
  log.push('meta')
  assert.equal(body.context.message_id,ctx.mensagemCliqueId)
  assert.match(body.text.body,/Mariana/)
  return {status:200,messageId:'wamid.hml.ack-000001'}
 },
 async registrarAceite(){log.push('aceite');return true},
 async registrarRecusa(){log.push('recusa')},
 async registrarIndeterminado(){log.push('incerto')}
}
let r=await orquestrarRespostaHml(id,auth,ctx,ops)
assert.equal(r.estado,'aceito')
assert.deepEqual(log,['reserva','meta','aceite'])
log.length=0
r=await orquestrarRespostaHml(id,{...auth,envioHabilitado:false},ctx,ops)
assert.equal(r.estado,'bloqueado')
r=await orquestrarRespostaHml(id,{...auth,projeto:'fdnjhnzigveoypdkdwkq'},ctx,ops)
assert.equal(r.estado,'bloqueado')
r=await orquestrarRespostaHml(id,auth,{...ctx,modeloPublicado:false},ops)
assert.equal(r.estado,'bloqueado')
r=await orquestrarRespostaHml(id,auth,{...ctx,statusAtendimento:'cancelado'},ops)
assert.equal(r.estado,'bloqueado')
assert.deepEqual(log,[],'Não reservar ou enviar com autorização/contexto inválidos')
r=await orquestrarRespostaHml(id,auth,ctx,{
 ...ops,async reservar(){log.push('reserva');return 'ja_reservado'}
})
assert.equal(r.estado,'reservado_em_outro_processamento')
assert.deepEqual(log,['reserva'],'Não chamar a Meta quando já existe reserva')
log.length=0
r=await orquestrarRespostaHml(id,auth,ctx,{
 ...ops,async enviar(){log.push('meta');throw Error('timeout')}
})
assert.equal(r.estado,'indeterminado')
assert.deepEqual(log,['reserva','meta','incerto'])
log.length=0
r=await orquestrarRespostaHml(id,auth,ctx,{
 ...ops,async enviar(){log.push('meta');return {status:400}}
})
assert.equal(r.estado,'recusado')
assert.deepEqual(log,['reserva','meta','recusa'])
log.length=0
r=await orquestrarRespostaHml(id,auth,ctx,{
 ...ops,async registrarAceite(){log.push('aceite');return false}
})
assert.equal(r.estado,'aceito_sem_registro')
assert.deepEqual(log,['reserva','meta','aceite'])
log.length=0
let relogios=0
r=await orquestrarRespostaHml(id,{
 ...auth,agora:()=>{
  relogios++
  return new Date(relogios===1?'2026-11-22T22:00:00Z':'2026-11-22T22:03:00Z')
 }
},ctx,ops)
assert.equal(r.estado,'indeterminado')
assert.equal(r.codigo,'AUTORIZACAO_EXPIRADA_ANTES_POST')
assert.deepEqual(log,['reserva','incerto'])
console.log('OUTBOX HML - DESPACHO PÓS-COMMIT, AUTORIZAÇÃO, RETRIES E TIMEOUT - PASS')
