import assert from 'node:assert/strict'
import { extrairTags, validarModelo, previaModelo, lerRascunhosLocal } from './motor.ts'
const base = {nome:'Confirmação',eventoCodigo:'CONFIRMACAO_AGENDAMENTO',contexto:'agenda' as const}
assert.deepEqual(extrairTags('Olá {{NOME_TUTOR}}, {{NOME_TUTOR}} / {{NOME_PET}}'),['NOME_TUTOR','NOME_PET'])
assert.equal(validarModelo({...base,texto:'Olá {{NOME_TUTOR}}'}).length,0)
assert.ok(validarModelo({...base,texto:'{{BANHOS_UTILIZADOS}}'}).some(x=>x.codigo==='TAG_CONTEXTO'))
assert.ok(validarModelo({...base,texto:'{{TAG_INVENTADA}}'}).some(x=>x.codigo==='TAG_DESCONHECIDA'))
assert.ok(validarModelo({...base,texto:'Olá {{NOME_TUTOR'}).some(x=>x.codigo==='CHAVES_INVALIDAS'))
assert.ok(validarModelo({nome:'Cobrança',eventoCodigo:'CLIENTE_ENTROU_INADIMPLENCIA',contexto:'financeiro',texto:'{{VALOR_EM_ABERTO}}'}).some(x=>x.codigo==='TAG_NAO_CONECTADA'))
assert.ok(previaModelo('Oi {{NOME_PET}}').includes('Luna'))
assert.ok(previaModelo('{{SALDO_CREDITOS}}').includes('Pendente'))
assert.deepEqual(lerRascunhosLocal('não é json'),[])
console.log('MENSAGERIA EDITOR VALIDADORES - PASS')
