import assert from 'node:assert/strict'
import { planejarRespostaAoClique } from './respostaAoCliqueWhatsapp.ts'

const id='11111111-1111-4111-8111-111111111111'
const convite='22222222-2222-4222-8222-222222222222'
const ok={tipo:'confirmado' as const,gravadoNoBanco:true,atendimentoId:id,conviteId:convite}
const pedido={tipo:'remarcacao_solicitada' as const,gravadoNoBanco:true,atendimentoId:id,conviteId:convite}

const agradecimento=planejarRespostaAoClique(ok)
assert.deepEqual(agradecimento,{
  eventoCodigo:'AGENDAMENTO_CONFIRMADO_WHATSAPP',atendimentoId:id,
  conviteId:convite,tipo:'agradecimento_confirmacao',urlAutoatendimento:null,
})
assert.equal(planejarRespostaAoClique({...ok,gravadoNoBanco:false}),null,
  'Não pode agradecer antes de confirmar no banco')
assert.equal(planejarRespostaAoClique({...pedido,gravadoNoBanco:false}),null,
  'Remarcação deve existir no banco antes da resposta')
assert.equal(planejarRespostaAoClique(pedido)?.eventoCodigo,'REMARCACAO_SOLICITADA_WHATSAPP')
assert.equal(planejarRespostaAoClique(pedido)?.urlAutoatendimento,null,
  'Não criar link fictício enquanto não houver portal')
for(const tipo of ['repetido','conflito','convite_expirado','falha'] as const){
  assert.equal(planejarRespostaAoClique({tipo}),null,
    'Não produzir segunda confirmação ou falsa mensagem em erro')
}
assert.equal(planejarRespostaAoClique(pedido,{
  habilitado:true,urlAssinada:'http://remarcar.example.test/agenda/a',
  dominiosAutorizados:['remarcar.example.test'],
})?.urlAutoatendimento,null,'Exigir https')
assert.equal(planejarRespostaAoClique(pedido,{
  habilitado:false,urlAssinada:'https://remarcar.example.test/a',
  dominiosAutorizados:['remarcar.example.test'],
})?.urlAutoatendimento,null,'Flag desligada: não mostrar link')
assert.equal(planejarRespostaAoClique(pedido,{
  habilitado:true,urlAssinada:'https://dominio-errado.example.test/a',
  dominiosAutorizados:['remarcar.example.test'],
})?.urlAutoatendimento,null,'Domínio precisa ser autorizado')
assert.equal(planejarRespostaAoClique(pedido,{
  habilitado:true,urlAssinada:'https://remarcar.example.test/agenda/abc',
  dominiosAutorizados:['remarcar.example.test'],
})?.urlAutoatendimento,'https://remarcar.example.test/agenda/abc',
  'Quando o portal estiver pronto, aceitar link HTTPS restrito')
console.log('RESPOSTAS WHATSAPP - AGRADECIMENTO POS-COMMIT E REMARCACAO FUTURA - PASS')
