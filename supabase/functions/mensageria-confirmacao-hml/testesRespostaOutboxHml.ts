import assert from 'node:assert/strict'
import {prepararAgradecimentoHml,type ContextoRespostaHml} from './respostaOutboxHml.ts'
const base:ContextoRespostaHml={
 eventoCodigo:'AGENDAMENTO_CONFIRMADO_WHATSAPP',
 statusAtendimento:'confirmado',statusConvite:'confirmado',
 modeloPublicado:true,
 textoModelo:'Perfeito, {{NOME_TUTOR}}! 💚 O horário de {{NOME_PET}} está confirmado para {{DATA_AGENDAMENTO}} às {{HORARIO_AGENDAMENTO}}. {{NOME_EMPRESA}} 🧡',
 destinatarioE164:'+5511999999999',remetenteClique:'5511999999999',
 mensagemCliqueId:'wamid.hml.click-100001',inicioAtualIso:'2026-11-24T12:00:00Z',
 inicioConviteIso:'2026-11-24T12:00:00Z',
 cliqueRecebidoIso:'2026-11-22T22:00:00Z',
 agoraIso:'2026-11-22T22:00:05Z',
 nomeTutor:'Mariana',nomePet:'Thor',nomeEmpresa:'KAZA PET'
}
const result=prepararAgradecimentoHml(base)
assert.equal(result.status,'pronto')
if(result.status!=='pronto')throw Error('BLOQUEIO_INESPERADO')
assert.equal(result.corpo.to,'5511999999999')
assert.equal(result.corpo.context.message_id,base.mensagemCliqueId)
assert.equal(result.corpo.text.preview_url,false)
assert.match(result.corpo.text.body,/24\/11\/2026 às 09:00/)
assert.match(result.corpo.text.body,/Mariana/)
const legado=prepararAgradecimentoHml({...base,textoModelo:
  'Obrigado, {NOME_TUTOR}! {NOME_PET} está confirmado para {DATA_AGENDAMENTO} às {HORARIO_AGENDAMENTO}. {NOME_EMPRESA}'})
assert.equal(legado.status,'pronto')
if(legado.status!=='pronto')throw Error('MODELO_LEGADO_INVALIDO')
assert.match(legado.corpo.text.body,/24\/11\/2026 às 09:00/)
assert.ok(!legado.corpo.text.body.includes('{NOME_TUTOR}'))
const misto=prepararAgradecimentoHml({...base,textoModelo:
  'Obrigado {NOME_TUTOR}! {{NOME_PET}} confirmado. {{NOME_EMPRESA}}'})
assert.equal(misto.status,'pronto')

assert.equal(prepararAgradecimentoHml({...base,statusAtendimento:'agendado'}).status,'bloqueado')
assert.equal(prepararAgradecimentoHml({...base,statusAtendimento:'cancelado'}).status,'bloqueado')
assert.equal(prepararAgradecimentoHml({...base,statusConvite:'invalido'}).status,'bloqueado')
assert.equal(prepararAgradecimentoHml({...base,modeloPublicado:false}).status,'bloqueado')
assert.equal(prepararAgradecimentoHml({...base,inicioAtualIso:'2026-11-24T13:00:00Z'}).status,'bloqueado')
assert.equal(prepararAgradecimentoHml({...base,remetenteClique:'5511888888888'}).status,'bloqueado')
assert.equal(prepararAgradecimentoHml({...base,mensagemCliqueId:'123'}).status,'bloqueado')
assert.equal(prepararAgradecimentoHml({...base,cliqueRecebidoIso:'2026-11-21T20:00:00Z'}).status,'bloqueado')
assert.equal(prepararAgradecimentoHml({...base,textoModelo:'Obrigado {{TAG_FALSA}}'}).status,'bloqueado')
assert.equal(prepararAgradecimentoHml({...base,textoModelo:'X'.repeat(4100)}).status,'bloqueado')
const pedido:ContextoRespostaHml={...base,
 eventoCodigo:'REMARCACAO_SOLICITADA_WHATSAPP',
 statusAtendimento:'agendado',statusConvite:'remarcacao_pendente',
 textoModelo:'Olá {{NOME_TUTOR}}! Recebemos seu pedido de remarcação de {{NOME_PET}}. Seu agendamento ainda não foi alterado.'
}
assert.equal(prepararAgradecimentoHml(pedido).status,'pronto')
const link=prepararAgradecimentoHml({...pedido,textoModelo:'Veja: https://exemplo.com/remarcar'})
assert.deepEqual(link,{status:'bloqueado',codigo:'LINK_AUTOATENDIMENTO_INDISPONIVEL'})
assert.equal(prepararAgradecimentoHml({...pedido,statusAtendimento:'confirmado'}).status,'bloqueado')
console.log('OUTBOX HML - TEXTO PERSONALIZADO, SEGURANCA DE AGENDA E JANELA 24H - PASS')
