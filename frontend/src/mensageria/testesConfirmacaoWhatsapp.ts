import assert from 'node:assert/strict'
import { avaliarEscolhaAgendamento,extrairCliquesConfirmacao } from './confirmacaoWhatsapp.ts'
const escopo={wabaId:'377176189908880',phoneNumberId:'309132033809134'}
const token='KPAG1_12345678-1234-4234-8234-123456789012'
const originalId='wamid.HBg-original-1234'
const msg = (type:string,payload:string,extra:Record<string,unknown>={})=>({
 id:'wamid.HBg-click-1234',from:'553199573653',timestamp:'1795392000',
 type,context:{id:originalId},
 ...(type==='button'?{button:{payload,text:'Confirmar'}}:
    type==='interactive'?{interactive:{type:'button_reply',button_reply:{id:payload,title:'Confirmar'}}}:{}),
 ...extra,
})
const webhook=(mensagens:unknown[])=>({
 object:'whatsapp_business_account',
 entry:[{id:escopo.wabaId,changes:[{field:'messages',
  value:{metadata:{phone_number_id:escopo.phoneNumberId},messages:mensagens}}]}],
})
let achados=extrairCliquesConfirmacao(webhook([msg('button',token)]),escopo)
assert.equal(achados.length,1)
assert.equal(achados[0].token,token)
assert.equal(achados[0].formato,'template_quick_reply')
assert.equal(achados[0].mensagemOriginalId,originalId)
achados=extrairCliquesConfirmacao(webhook([msg('interactive',token)]),escopo)
assert.equal(achados.length,1)
assert.equal(achados[0].formato,'interactive_button_reply')
assert.equal(extrairCliquesConfirmacao(webhook([msg('text',token,{text:{body:'Confirmar'}})]),escopo).length,0)
assert.equal(extrairCliquesConfirmacao(webhook([msg('button','Confirmar')]),escopo).length,0)
assert.equal(extrairCliquesConfirmacao(webhook([msg('button',token,{from:'5599999999999999'})]),escopo).length,0)
assert.equal(extrairCliquesConfirmacao(webhook([msg('button',token,{context:{}})]),escopo).length,0)
assert.equal(extrairCliquesConfirmacao(webhook([msg('button',token),msg('button',token)]),escopo).length,1)
assert.equal(extrairCliquesConfirmacao(webhook([msg('button',token)]),{...escopo,wabaId:'99999'}).length,0)
assert.equal(extrairCliquesConfirmacao(webhook([msg('button',token)]),{...escopo,phoneNumberId:'99999'}).length,0)
assert.equal(extrairCliquesConfirmacao({object:'not_whatsapp',entry:[]},escopo).length,0)
assert.deepEqual(avaliarEscolhaAgendamento('confirmar','agendado'),{resultado:'confirmar',novoStatus:'confirmado'})
assert.deepEqual(avaliarEscolhaAgendamento('remarcar','agendado'),{resultado:'remarcacao_pendente',novoStatus:null})
for(const status of ['confirmado','recebido','em_atendimento','concluido','cancelado','faltou']){
  assert.deepEqual(avaliarEscolhaAgendamento('confirmar',status),{resultado:'conflito',novoStatus:null})
  assert.deepEqual(avaliarEscolhaAgendamento('remarcar',status),{resultado:'conflito',novoStatus:null})
}
console.log('CONFIRMACAO WHATSAPP HML - PARSER E TRANSICOES - PASS')
