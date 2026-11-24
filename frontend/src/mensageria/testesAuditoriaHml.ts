import assert from 'node:assert/strict'
import {registroValido,reciboValido,rejeicaoDefinitiva,lerDiario,snapshotCoincide} from './auditoriaHml.ts'
import type {Registro} from './auditoriaHml.ts'
const p:Registro={
 acao:'registrar_decisao_auditoria',tentativa_id:'11111111-1111-4111-8111-111111111111',
 categoria:'resultado_indeterminado',decisao:'manter_em_investigacao',motivo:'evidencia_insuficiente',
 chave_idempotencia:'22222222-2222-4222-8222-222222222222',confirmar_registro:true
}
assert.equal(registroValido(JSON.parse(JSON.stringify(p))),true)
for(const v of [null,[],{...p,p_operador:p.tentativa_id},{...p,motivo:'texto livre'},
 {...p,confirmar_registro:false},{...p,categoria:'__proto__'},
 {...p,decisao:'reenviar'},{...p,tentativa_id:'invalida'},{...p,chave_idempotencia:null}]){
 assert.equal(registroValido(v),false)
}
console.log('01 contrato fechado PASS')
const r={status:'registrado',evento_id:'33333333-3333-4333-8333-333333333333',
 tentativa_id:p.tentativa_id,categoria:p.categoria,decisao:p.decisao,motivo:p.motivo,
 registrado_em:'2026-11-24T18:00:00Z',reenvio_automatico_autorizado:false}
assert.equal(reciboValido(r,p),true)
assert.equal(reciboValido({...r,status:'ja_registrado'},p),true)
for(const v of [null,{...r,status:'ok'},{...r,evento_id:null},{...r,registrado_em:'invalida'},
 {...r,tentativa_id:r.evento_id},{...r,decisao:'registrar_revisao_sem_reenvio'},
 {...r,categoria:'reserva_antiga'},{...r,motivo:'revisao_realizada'},
 {...r,reenvio_automatico_autorizado:true}]){
 assert.equal(reciboValido(v,p),false)
}
console.log('02 recibo correlacionado PASS')
for(const codigo of ['caso_nao_elegivel','categoria_desatualizada']){
 assert.equal(rejeicaoDefinitiva(409,{codigo,reenvio_automatico_autorizado:false}),true)
 assert.equal(rejeicaoDefinitiva(503,{codigo,reenvio_automatico_autorizado:false}),false)
}
for(const codigo of ['conflito_idempotencia','nao_autorizado','REGISTRO_NAO_VERIFICADO']){
 assert.equal(rejeicaoDefinitiva(409,{codigo,reenvio_automatico_autorizado:false}),false)
}
assert.equal(rejeicaoDefinitiva(409,{codigo:'caso_nao_elegivel',reenvio_automatico_autorizado:true}),false)
assert.equal(rejeicaoDefinitiva(409,null),false)
console.log('03 rejeicao definitiva e incerteza PASS')

const pendente=JSON.stringify({estado:'pendente',registro:p})
const resolvido=JSON.stringify({estado:'resolvido',chave_idempotencia:p.chave_idempotencia})
assert.equal(lerDiario(null),null)
assert.deepEqual(lerDiario(pendente),{estado:'pendente',registro:p})
assert.deepEqual(lerDiario(resolvido),{estado:'resolvido',chave_idempotencia:p.chave_idempotencia})
for(const raw of ['{','null','{}',JSON.stringify(p),
 JSON.stringify({estado:'pendente',registro:{...p,confirmar_registro:false}}),
 JSON.stringify({estado:'resolvido',chave_idempotencia:null}),
 JSON.stringify({estado:'resolvido',chave_idempotencia:p.chave_idempotencia,extra:true})
]){
 assert.throws(()=>lerDiario(raw))
}
assert.equal(snapshotCoincide(null,null),true)
assert.equal(snapshotCoincide(null,pendente),false)
assert.equal(snapshotCoincide(pendente,pendente),true)
assert.equal(snapshotCoincide(pendente,resolvido),false)
assert.equal(snapshotCoincide(resolvido,null),false)
assert.equal(snapshotCoincide(null,resolvido),false)
assert.equal(snapshotCoincide(resolvido,JSON.stringify({estado:'resolvido',chave_idempotencia:p.tentativa_id})),false)
console.log('04 diario compartilhado e snapshot PASS')
