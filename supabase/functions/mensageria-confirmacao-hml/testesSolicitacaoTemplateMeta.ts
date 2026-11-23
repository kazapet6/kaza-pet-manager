import assert from 'node:assert/strict'
import { NOME_TEMPLATE_HML, prepararSolicitacaoTemplateMeta } from './solicitacaoTemplateMeta.ts'
const payload=prepararSolicitacaoTemplateMeta()
assert.equal(payload.name,NOME_TEMPLATE_HML)
assert.equal(payload.language,'pt_BR')
assert.equal(payload.category,'UTILITY')
assert.equal(payload.parameter_format,'POSITIONAL')
assert.equal(payload.components.length,2)
const body=payload.components[0]
const buttons=payload.components[1]
assert.equal(body.type,'BODY')
assert.equal(buttons.type,'BUTTONS')
if(body.type!=='BODY'||buttons.type!=='BUTTONS')throw Error('COMPONENTES_INVALIDOS')
assert.deepEqual(buttons.buttons.map(b=>b.text),['Confirmar','Remarcar'])
assert.deepEqual(buttons.buttons.map(b=>b.type),['QUICK_REPLY','QUICK_REPLY'])
assert.equal((body.text.match(/{{[1-4]}}/g)??[]).length,4)
assert.equal(body.example.body_text[0].length,4)
assert.ok(!JSON.stringify(payload).includes('https://'), 'Portal de remarcação é futuro')
console.log('META TEMPLATE - UTILITY PT_BR + 2 QUICK REPLIES - PASS')
