import assert from 'node:assert/strict'
import { extrairTags, validarModelo, previaModelo, lerRascunhosLocal } from './motor.ts'
import { modelosExemplo } from './catalogo.ts'
const base = {nome:'Confirmação',eventoCodigo:'CONFIRMACAO_AGENDAMENTO',contexto:'agenda' as const}
assert.deepEqual(extrairTags('Olá {{NOME_TUTOR}}, {{NOME_TUTOR}} / {{NOME_PET}}'),['NOME_TUTOR','NOME_PET'])
assert.equal(validarModelo({...base,texto:'Olá {{NOME_TUTOR}}'}).length,0)
assert.ok(validarModelo({...base,texto:'{{BANHOS_UTILIZADOS}}'}).some(x=>x.codigo==='TAG_CONTEXTO'))
assert.ok(validarModelo({...base,texto:'{{TAG_INVENTADA}}'}).some(x=>x.codigo==='TAG_DESCONHECIDA'))
assert.ok(validarModelo({...base,texto:'Olá {{NOME_TUTOR'}).some(x=>x.codigo==='CHAVES_INVALIDAS'))
assert.ok(validarModelo({nome:'Cobrança',eventoCodigo:'CLIENTE_ENTROU_INADIMPLENCIA',contexto:'financeiro',texto:'{{VALOR_EM_ABERTO}}'}).some(x=>x.codigo==='TAG_NAO_CONECTADA'))
assert.ok(previaModelo('Oi {{NOME_PET}}').includes('Luna'))
assert.ok(previaModelo('{{SALDO_CREDITOS}}').includes('Pendente'))
const agradecimento = modelosExemplo.find(m => m.eventoCodigo==='AGENDAMENTO_CONFIRMADO_WHATSAPP')
const pedido = modelosExemplo.find(m => m.eventoCodigo==='REMARCACAO_SOLICITADA_WHATSAPP')
assert.ok(agradecimento && pedido, 'Dois modelos de retorno precisam estar visíveis na biblioteca')
assert.equal(validarModelo(agradecimento).length,0)
assert.equal(validarModelo(pedido).length,0)
assert.ok(agradecimento.texto.includes('\n'), 'O agradecimento tem quebras de linha legíveis')
assert.ok(!pedido.texto.includes('https://'), 'Não gerar URL antes do portal existir')
assert.ok(validarModelo({nome:'Portal futuro',eventoCodigo:'REMARCACAO_SOLICITADA_WHATSAPP',contexto:'agenda',texto:'{{LINK_REMARCACAO}}'}).some(x=>x.codigo==='TAG_NAO_CONECTADA'))
assert.deepEqual(lerRascunhosLocal('não é json'),[])
console.log('MENSAGERIA EDITOR VALIDADORES - PASS')
