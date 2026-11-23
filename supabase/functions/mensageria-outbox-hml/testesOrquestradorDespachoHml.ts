import assert from 'node:assert/strict'
import {
  executarUmAgradecimentoHml,type ConfigDespachoHml,type OperacoesDespachoHml
} from './orquestradorDespachoHml.ts'

const outboxId='11111111-1111-4111-8111-111111111111'
const operadorId='22222222-2222-4222-8222-222222222222'
const chave='33333333-3333-4333-8333-333333333333'
const numero='5511999999999'
const agora=new Date('2026-11-23T18:00:00Z')
const cfg:ConfigDespachoHml={
 projeto:'jgtctzqieyorhvqxjbpk',operadorId,permitidoE164:numero,
 envioHabilitado:true,autorizacaoExpiraIso:'2026-11-23T18:01:00Z',
 agora:()=>agora,chaveAleatoria:()=>chave
}
const contexto={
 status:'pronto',eventoCodigo:'AGENDAMENTO_CONFIRMADO_WHATSAPP',
 statusAtendimento:'confirmado',statusConvite:'confirmado',
 modeloPublicado:true,
 textoModelo:'Obrigado, {{NOME_TUTOR}}! {{NOME_PET}} confirmado para {{DATA_AGENDAMENTO}} às {{HORARIO_AGENDAMENTO}}. {{NOME_EMPRESA}}',
 destinatarioE164:'+'+numero,remetenteClique:numero,
 mensagemCliqueId:'wamid.hml.test-click-55555',
 inicioAtualIso:'2026-11-25T12:00:00Z',
 inicioConviteIso:'2026-11-25T12:00:00Z',
 cliqueRecebidoIso:'2026-11-23T17:59:50Z',
 agoraIso:'2026-11-23T18:00:00Z',
 nomeTutor:'Mariana',nomePet:'Thor',nomeEmpresa:'KAZA PET'
}
let chamadas:string[]=[]
const op=():OperacoesDespachoHml=>({
 async listar(limite){
   chamadas.push('listar')
   assert.equal(limite,1)
   return {status:'ok',itens:[outboxId],quantidade:1}
 },
 async reservar(x){
   chamadas.push('reservar')
   assert.deepEqual(x,{outboxId,chave,operadorId})
   return {status:'reservado'}
 },
 async contexto(params){
   chamadas.push('contexto')
   assert.equal(params.p_outbox,outboxId)
   assert.equal(params.p_chave,chave)
   assert.equal(params.p_operador,operadorId)
   assert.equal(params.p_destinatario_permitido,'+'+numero)
   return contexto
 },
 async enviar(body){
   chamadas.push('meta_mock')
   assert.equal(body.to,numero)
   assert.equal(body.context.message_id,contexto.mensagemCliqueId)
   assert.match(body.text.body,/Thor confirmado/)
   assert.match(body.text.body,/25\/11\/2026 às 09:00/)
   return {httpStatus:200,wamid:'wamid.hml.aceite-ficticio-010'}
 },
 async finalizar(args){
   chamadas.push('finalizar_'+args.resultado)
   assert.equal(args.outboxId,outboxId)
   assert.equal(args.chave,chave)
   assert.equal(args.operadorId,operadorId)
   return {status:args.resultado}
 }
})
function clean(){chamadas=[]}
let r=await executarUmAgradecimentoHml(cfg,op())
assert.equal(r.estado,'aceito')
assert.equal(r.codigo,'META_ACEITOU_NAO_E_ENTREGA')
assert.equal(r.enviados,1)
assert.deepEqual(chamadas,['listar','reservar','contexto','meta_mock','finalizar_aceito_meta'])

for(const wrong of [
 {...cfg,envioHabilitado:false},
 {...cfg,projeto:'fdnjhnzigveoypdkdwkq'},
 {...cfg,operadorId:'invalido'},
 {...cfg,permitidoE164:'5511000000000'},
 {...cfg,autorizacaoExpiraIso:'2026-11-23T17:59:00Z'},
 {...cfg,autorizacaoExpiraIso:'2026-11-23T18:04:00Z'}
]){
 clean()
 const guardOps=op()
 r=await executarUmAgradecimentoHml(wrong,guardOps)
 // Um destino sintaticamente válido continua sujeito à consulta autoritativa;
 // os demais bloqueios ocorrem antes mesmo de listar.
 if(wrong.permitidoE164!=='5511000000000'){
   assert.equal(r.estado,'bloqueado')
   assert.deepEqual(chamadas,[],'Nenhuma chamada com a autorização bloqueada')
 }else{
   assert.equal(r.estado,'preparo_bloqueado')
   assert.deepEqual(chamadas,['listar','reservar','contexto','finalizar_indeterminado'])
 }
}
clean()
r=await executarUmAgradecimentoHml(cfg,{
 ...op(),async listar(){chamadas.push('listar');return {status:'ok',itens:[],quantidade:0}}
})
assert.equal(r.estado,'fila_vazia')
assert.deepEqual(chamadas,['listar'])
clean()
r=await executarUmAgradecimentoHml(cfg,{
 ...op(),async reservar(){chamadas.push('reservar');return {status:'ja_reservado'}}
})
assert.equal(r.estado,'concorrencia')
assert.deepEqual(chamadas,['listar','reservar'])

clean()
r=await executarUmAgradecimentoHml(cfg,{
 ...op(),async contexto(){chamadas.push('contexto');return {...contexto,statusAtendimento:'cancelado'}}
})
assert.equal(r.estado,'preparo_bloqueado')
assert.deepEqual(chamadas,['listar','reservar','contexto','finalizar_indeterminado'])

clean()
r=await executarUmAgradecimentoHml(cfg,{
 ...op(),async enviar(){chamadas.push('meta_mock');throw Error('rede indisponivel')}
})
assert.equal(r.estado,'indeterminado')
assert.deepEqual(chamadas,['listar','reservar','contexto','meta_mock','finalizar_indeterminado'])

clean()
r=await executarUmAgradecimentoHml(cfg,{
 ...op(),async enviar(){chamadas.push('meta_mock');return {httpStatus:400}}
})
assert.equal(r.estado,'recusado')
assert.deepEqual(chamadas,['listar','reservar','contexto','meta_mock','finalizar_recusado_meta'])

for(const meta of [{httpStatus:503},{httpStatus:200,wamid:null},{httpStatus:200,wamid:'nao-e-wamid'}]){
 clean()
 r=await executarUmAgradecimentoHml(cfg,{
   ...op(),async enviar(){chamadas.push('meta_mock');return meta}
 })
 assert.equal(r.estado,'indeterminado')
 assert.deepEqual(chamadas,['listar','reservar','contexto','meta_mock','finalizar_indeterminado'])
}
clean()
r=await executarUmAgradecimentoHml(cfg,{
 ...op(),async finalizar(x){chamadas.push('finalizar_'+x.resultado);return {status:'conflito'}}
})
assert.equal(r.estado,'aceito_sem_registro')
assert.deepEqual(chamadas,['listar','reservar','contexto','meta_mock','finalizar_aceito_meta'])

clean()
let ticks=0
r=await executarUmAgradecimentoHml({
 ...cfg, agora:()=>{
   ticks++
   return new Date(ticks<3?'2026-11-23T18:00:00Z':'2026-11-23T18:02:00Z')
 }
},op())
assert.equal(r.estado,'preparo_bloqueado')
assert.deepEqual(chamadas,['listar','reservar','contexto','finalizar_indeterminado'])

assert.equal(
 (await executarUmAgradecimentoHml({...cfg,envioHabilitado:false},
   {...op(),async enviar(){assert.fail('Envio proibido com flag desligada')}})).enviados,
 0)
console.log('OUTBOX HML - ORQUESTRACAO FICTICIA, MODELO, AGENDA, TIMEOUT E DEDUPE - PASS')
