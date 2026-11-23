import assert from 'node:assert/strict'
import { prepararTemplateConfirmacaoHml } from './templateConfirmacao.ts'
const destino='+5511999999999'
const dados={
  destinoE164:destino,permitidoE164:'5511999999999',
  templateNome:'confirmacao_agendamento_kaza',idioma:'pt_BR' as const,
  parametros:['Mariana','Thor','24/11','09:00']
}
const p=await prepararTemplateConfirmacaoHml(dados)
assert.equal(p.corpoApi.messaging_product,'whatsapp')
assert.equal(p.corpoApi.to,'5511999999999')
assert.equal(p.corpoApi.type,'template')
assert.equal(p.corpoApi.template.language.code,'pt_BR')
assert.equal(p.corpoApi.template.components.length,3)
const c=p.corpoApi.template.components
assert.equal(c[0].type,'body')
assert.equal(c[1].type,'button')
assert.equal(c[2].type,'button')
if(c[1].type!=='button'||c[2].type!=='button')throw Error('BOTAO_AUSENTE')
assert.equal(c[1].index,'0')
assert.equal(c[2].index,'1')
assert.equal(c[1].sub_type,'quick_reply')
assert.equal(c[2].sub_type,'quick_reply')
assert.equal(c[1].parameters[0].payload,p.segredoConfirmar)
assert.equal(c[2].parameters[0].payload,p.segredoRemarcar)
assert.notEqual(p.segredoConfirmar,p.segredoRemarcar)
assert.match(p.segredoConfirmar,/^KPAG1_[0-9a-f-]{36}$/)
assert.match(p.hashConfirmar,/^[0-9a-f]{64}$/)
assert.match(p.hashRemarcar,/^[0-9a-f]{64}$/)
assert.notEqual(p.hashConfirmar,p.hashRemarcar)
assert.ok(!JSON.stringify(p.corpoApi).includes('https://'), 'Sem links externos no template de confirmação')
const nova=await prepararTemplateConfirmacaoHml(dados)
assert.notEqual(nova.segredoConfirmar,p.segredoConfirmar)
await assert.rejects(()=>prepararTemplateConfirmacaoHml({...dados,permitidoE164:'+5511888888888'}),
 /DESTINATARIO_NAO_AUTORIZADO/)
await assert.rejects(()=>prepararTemplateConfirmacaoHml({...dados,templateNome:'Template Invalido'}),
 /TEMPLATE_INVALIDO/)
await assert.rejects(()=>prepararTemplateConfirmacaoHml({...dados,parametros:['']}),
 /PARAMETROS_INVALIDOS/)
console.log('TEMPLATE WHATSAPP HML - 2 QUICK REPLIES E TOKENS UNICOS - PASS')
