import assert from 'node:assert/strict'
import {orquestrarConviteHml,type OperacoesConvite} from './orquestradorConviteHml.ts'
const ctx={
  atendimentoId:'11111111-1111-4111-8111-111111111111',
  destinoE164:'+5511999999999',parametros:['Mariana','Thor','24/11/2026','09:00'],
  templateAprovadoNome:'kaza_confirmacao_agendamento_hml'
}
const auth={
  projectRef:'jgtctzqieyorhvqxjbpk',
  envioHabilitado:true,
  destinatarioPermitidoE164:'+5511999999999',
  relogio:()=>new Date('2026-11-22T23:00:00Z'),
  expiraEm:'2026-11-22T23:02:00Z'
}
const logs:string[]=[]
const ops:OperacoesConvite={
 async preparar(args) {
   logs.push('preparo')
   assert.match(args.hashConfirmar,/^[0-9a-f]{64}$/)
   assert.match(args.hashRemarcar,/^[0-9a-f]{64}$/)
   assert.notEqual(args.hashConfirmar,args.hashRemarcar)
   return {status:'preparado',convite_id:'22222222-2222-4222-8222-222222222222'}
 },
 async enviar(body) {
   logs.push('meta')
   assert.equal(body.template.components[1].type,'button')
   assert.equal(body.template.components[2].type,'button')
   assert.equal(body.to,'5511999999999')
   return {httpStatus:200,messageId:'wamid.hml.fake-accepted-1234567'}
 },
 async vincular(input) {
   logs.push('vinculo')
   assert.match(input.messageId,/^wamid\./)
   return {status:'vinculado'}
 },
 async abandonar(){logs.push('abandono');return {status:'abandonado'}}
}
let r=await orquestrarConviteHml(auth,ctx,ops)
assert.equal(r.estado,'vinculado')
assert.deepEqual(logs,['preparo','meta','vinculo'])
logs.length=0
r=await orquestrarConviteHml({...auth,envioHabilitado:false},ctx,ops)
assert.equal(r.estado,'bloqueado')
r=await orquestrarConviteHml({...auth,projectRef:'fdnjhnzigveoypdkdwkq'},ctx,ops)
assert.equal(r.estado,'bloqueado')
r=await orquestrarConviteHml({...auth,expiraEm:'2026-11-22T23:04:00Z'},ctx,ops)
assert.equal(r.estado,'bloqueado')
r=await orquestrarConviteHml(auth,{...ctx,destinoE164:'+5511888888888'},ops)
assert.equal(r.estado,'bloqueado')
r=await orquestrarConviteHml(auth,{...ctx,templateAprovadoNome:'template_nao_aprovado'},ops)
assert.equal(r.estado,'bloqueado')
assert.deepEqual(logs,[],'Bloqueios devem ocorrer antes de reservar ou enviar')
const existentes:OperacoesConvite={...ops,async preparar(){logs.push('preparo');return {status:'ja_preparado'}}}
r=await orquestrarConviteHml(auth,ctx,existentes)
assert.equal(r.estado,'preparo_repetido')
assert.deepEqual(logs,['preparo'])
logs.length=0
const rejeitada:OperacoesConvite={...ops,async enviar(){logs.push('meta');return {httpStatus:400}}}
r=await orquestrarConviteHml(auth,ctx,rejeitada)
assert.equal(r.estado,'meta_rejeitada')
assert.deepEqual(logs,['preparo','meta','abandono'])
logs.length=0
// A janela pode vencer DURANTE a reserva: revalidar antes do POST.
logs.length=0
let consultasRelogio=0
const expirouDuranteReserva={
  ...auth,
  relogio:()=> {
    consultasRelogio++
    return new Date(consultasRelogio===1?'2026-11-22T23:00:00Z':'2026-11-22T23:03:00Z')
  }
}
r=await orquestrarConviteHml(expirouDuranteReserva,ctx,ops)
assert.equal(r.estado,'bloqueado')
assert.equal(r.codigo,'JANELA_DE_TESTE_ENCERROU_ANTES_DO_ENVIO')
assert.deepEqual(logs,['preparo','abandono'],'Expiração antes do POST não envia Meta')
logs.length=0
const timeout:OperacoesConvite={...ops,async enviar(){logs.push('meta');throw Error('timeout')}}
r=await orquestrarConviteHml(auth,ctx,timeout)
assert.equal(r.estado,'resultado_indeterminado')
assert.deepEqual(logs,['preparo','meta'],'Timeout nunca deve provocar novo POST ou abandono automático')
logs.length=0
const falhaVinculo:OperacoesConvite={...ops,async vincular(){logs.push('vinculo');throw Error('db offline')}}
r=await orquestrarConviteHml(auth,ctx,falhaVinculo)
assert.equal(r.estado,'aceito_sem_vinculo')
assert.deepEqual(logs,['preparo','meta','vinculo'])
logs.length=0
console.log('ORQUESTRADOR CONVITE META HML - ISOLAMENTO, ACEITE, TIMEOUT E DUPLICIDADE - PASS')
