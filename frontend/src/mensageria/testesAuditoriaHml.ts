import assert from 'node:assert/strict'
import {registroValido,reciboValido,rejeicaoDefinitiva,lerDiario,snapshotCoincide,historicoValido,unirHistorico,indiceValido,historicoPermiteRegistro} from './auditoriaHml.ts'
import type {Registro} from './auditoriaHml.ts'
const p:Registro={
 acao:'registrar_decisao_auditoria_v2',predecessor_id:null,tentativa_id:'11111111-1111-4111-8111-111111111111',
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
 tentativa_id:p.tentativa_id,categoria:p.categoria,decisao:p.decisao,motivo:p.motivo,predecessor_id:null,versao:1,
 registrado_em:'2026-11-24T18:00:00Z',reenvio_automatico_autorizado:false}
assert.equal(reciboValido(r,p,1),true)
assert.equal(reciboValido({...r,status:'ja_registrado'},p,1),true)
for(const v of [null,{...r,status:'ok'},{...r,evento_id:null},{...r,registrado_em:'invalida'},
 {...r,tentativa_id:r.evento_id},{...r,decisao:'registrar_revisao_sem_reenvio'},
 {...r,categoria:'reserva_antiga'},{...r,motivo:'revisao_realizada'},
 {...r,reenvio_automatico_autorizado:true},{...r,versao:2},{...r,predecessor_id:r.evento_id}]){
 assert.equal(reciboValido(v,p,1),false)
}
console.log('02 recibo correlacionado PASS')
for(const codigo of ['caso_nao_elegivel','categoria_desatualizada','predecessor_desatualizado']){
 assert.equal(rejeicaoDefinitiva(409,{codigo,reenvio_automatico_autorizado:false}),true)
 assert.equal(rejeicaoDefinitiva(503,{codigo,reenvio_automatico_autorizado:false}),false)
}
for(const codigo of ['conflito_idempotencia','nao_autorizado','REGISTRO_NAO_VERIFICADO']){
 assert.equal(rejeicaoDefinitiva(409,{codigo,reenvio_automatico_autorizado:false}),false)
}
assert.equal(rejeicaoDefinitiva(409,{codigo:'caso_nao_elegivel',reenvio_automatico_autorizado:true}),false)
assert.equal(rejeicaoDefinitiva(409,null),false)
console.log('03 rejeicao definitiva e incerteza PASS')

const pendente=JSON.stringify({estado:'pendente',registro:p,versao_esperada:1})
const resolvido=JSON.stringify({estado:'resolvido',chave_idempotencia:p.chave_idempotencia})
assert.equal(lerDiario(null),null)
assert.deepEqual(lerDiario(pendente),{estado:'pendente',registro:p,versao_esperada:1})
assert.deepEqual(lerDiario(resolvido),{estado:'resolvido',chave_idempotencia:p.chave_idempotencia})
for(const raw of ['{','null','{}',JSON.stringify(p),
 JSON.stringify({estado:'pendente',registro:{...p,confirmar_registro:false},versao_esperada:1}),
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

assert.throws(()=>lerDiario(JSON.stringify({estado:'pendente',registro:p})))
assert.throws(()=>lerDiario(JSON.stringify({estado:'pendente',registro:p,versao_esperada:2})))
assert.equal(registroValido({...p,predecessor_id:undefined}),false)
assert.equal(registroValido({...p,acao:'registrar_decisao_auditoria'}),false)
const e1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const e2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const e3='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const raiz={evento_id:e1,tentativa_id:p.tentativa_id,predecessor_id:null,versao:1,
 categoria:p.categoria,decisao:p.decisao,motivo:p.motivo,registrado_em:r.registrado_em}
const segundo={...raiz,evento_id:e2,predecessor_id:e1,versao:2}
const terceiro={...raiz,evento_id:e3,predecessor_id:e2,versao:3}
const base={status:'ok',tentativa_id:p.tentativa_id,head_evento_id:e3,head_versao:3,
 categoria_atual:p.categoria,reenvio_automatico_autorizado:false}
const pagina={...base,eventos:[terceiro,segundo],quantidade:2,proxima_antes_versao:2}
const anterior={...base,eventos:[raiz],quantidade:1,proxima_antes_versao:null}
assert.ok(historicoValido(pagina,p.tentativa_id,2,null))
assert.ok(historicoValido(anterior,p.tentativa_id,2,2))
assert.equal(unirHistorico(pagina,anterior)?.quantidade,3)
assert.equal(unirHistorico(pagina,{...anterior,head_versao:4}),null)
assert.equal(unirHistorico(pagina,{...anterior,categoria_atual:null}),null)
assert.equal(unirHistorico(pagina,{...anterior,eventos:[{...raiz,evento_id:e2.toUpperCase()}]}),null)
assert.equal(historicoValido({...pagina,head_evento_id:e2},p.tentativa_id,2,null),false)
assert.equal(historicoValido({...pagina,eventos:[terceiro,{...segundo,predecessor_id:e3}]},p.tentativa_id,2,null),false)
assert.equal(historicoPermiteRegistro(pagina,{tentativa_id:p.tentativa_id,categoria:p.categoria,reservado_em:r.registrado_em}),true)
assert.equal(historicoPermiteRegistro({...pagina,categoria_atual:null},{tentativa_id:p.tentativa_id,categoria:p.categoria,reservado_em:r.registrado_em}),false)
const item={tentativa_id:p.tentativa_id,head_evento_id:e3,head_versao:3,registrado_em:r.registrado_em}
const idx={status:'ok',itens:[item],quantidade:1,proximo_depois_tentativa:null,reenvio_automatico_autorizado:false}
assert.equal(indiceValido(idx,10,null),true)
assert.equal(indiceValido(idx,10,p.tentativa_id),false)
console.log('05 predecessor, historico e paginacao PASS')
