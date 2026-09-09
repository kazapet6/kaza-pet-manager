import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { alternarOcorrencia, lerObservacoesIntent, normalizarObservacao, normalizarOcorrencias, podeEditarObservacoes } from './contrato.ts'
import { TIPOS_OCORRENCIA, tipoOcorrencia } from './catalogo.ts'
import { criarHandlerObservacoes } from '../../../supabase/functions/salvar-observacoes-atendimento/handler.ts'

let total = 0
function teste(nome: string, executar: () => void | Promise<void>) { return Promise.resolve().then(executar).then(() => { total++; console.log(`OK OB${String(total).padStart(2, '0')} - ${nome}`) }) }
const raiz = new URL('../../../', import.meta.url)
const ler = (caminho: string) => readFileSync(new URL(caminho, raiz), 'utf8')
const migration = ler('banco/024_observacoes_ocorrencias_atendimento.sql')
const modal = ler('frontend/src/observacoesAtendimento/ObservacoesAtendimentoModal.tsx')
const agenda = ler('frontend/src/pages/Agenda.tsx')

await teste('catalogo possui doze tipos', () => assert.equal(TIPOS_OCORRENCIA.length, 12))
await teste('reconhece tipo oficial', () => assert.equal(tipoOcorrencia('pulgas'), true))
await teste('rejeita tipo desconhecido', () => assert.equal(tipoOcorrencia('outro'), false))
await teste('seleciona ocorrencia', () => assert.deepEqual(alternarOcorrencia([], 'pulgas'), ['pulgas']))
await teste('desmarca ocorrencia', () => assert.deepEqual(alternarOcorrencia(['pulgas'], 'pulgas'), []))
await teste('remove duplicatas', () => assert.deepEqual(normalizarOcorrencias(['pulgas','pulgas']), ['pulgas']))
await teste('ordena ocorrencias', () => assert.deepEqual(normalizarOcorrencias(['tranquilo','agitado']), ['agitado','tranquilo']))
await teste('observacao ausente vira nula', () => assert.equal(normalizarObservacao(null), null))
await teste('observacao em branco vira nula', () => assert.equal(normalizarObservacao('  '), null))
await teste('observacao recebe trim', () => assert.equal(normalizarObservacao(' ok '), 'ok'))
await teste('carregamento valido', () => assert.deepEqual(lerObservacoesIntent({ operacao:'carregar', atendimentoId:'a' }), { operacao:'carregar', atendimentoId:'a' }))
await teste('salvamento valido', () => assert.ok(lerObservacoesIntent({ operacao:'salvar', atendimentoId:'a', versaoEsperada:0, ocorrencias:['pulgas'], observacao:null })))
await teste('versao negativa invalida', () => assert.equal(lerObservacoesIntent({ operacao:'salvar', atendimentoId:'a', versaoEsperada:-1, ocorrencias:[], observacao:null }), null))
await teste('tipo desconhecido invalida intencao', () => assert.equal(lerObservacoesIntent({ operacao:'salvar', atendimentoId:'a', versaoEsperada:0, ocorrencias:['x'], observacao:null }), null))
await teste('texto acima do limite invalida', () => assert.equal(lerObservacoesIntent({ operacao:'salvar', atendimentoId:'a', versaoEsperada:0, ocorrencias:[], observacao:'x'.repeat(1001) }), null))
for (const status of ['agendado','confirmado','recebido','em_atendimento','aguardando_retirada','aguardando_entrega']) await teste(`edicao permitida em ${status}`, () => assert.equal(podeEditarObservacoes(status), true))
await teste('estados terminais sao somente leitura', () => { for (const status of ['concluido','cancelado','faltou']) assert.equal(podeEditarObservacoes(status), false) })
await teste('schema limita texto', () => assert.match(migration, /char_length\(observacao_operacional\) <= 1000/i))
await teste('schema impede ocorrencia duplicada', () => assert.match(migration, /unique \(atendimento_id, tipo\)/i))
await teste('FK remove ocorrencias com atendimento', () => assert.match(migration, /on delete cascade/i))
await teste('RPC usa lock', () => assert.match(migration, /for update/i))
await teste('RPC valida versao', () => assert.match(migration, /v_atual\.observacoes_versao <> v_versao_esperada/i))
await teste('RPC substitui ocorrencias atomicamente', () => { assert.match(migration, /delete from public\.atendimento_ocorrencias/i); assert.match(migration, /insert into public\.atendimento_ocorrencias/i) })
await teste('RPC restrita a service role', () => assert.match(migration, /grant execute on function public\.salvar_observacoes_atendimento\(jsonb\)\s+to service_role/i))
await teste('frontend carrega sob demanda', () => assert.match(modal, /operacao: 'carregar'/))
await teste('frontend recarrega depois de salvar', () => assert.ok((modal.match(/operacao: 'carregar'/g) ?? []).length >= 2))
await teste('frontend possui contador', () => assert.match(modal, /observacao\.length/))
await teste('frontend confirma descarte internamente', () => assert.match(modal, /confirmarDescarte/))
await teste('agenda exibe botao dedicado', () => assert.match(agenda, />Observacoes</))
await teste('agenda nao lista ocorrencias no card', () => assert.doesNotMatch(agenda, /TIPOS_OCORRENCIA/))
await teste('handler exige JWT internal', async () => { const dependencias = { validarToken: async () => ({ app_metadata:{ role:'cliente' } }), executar: async () => { throw new Error() } }; const semJwt = await criarHandlerObservacoes(dependencias, new Set())(new Request('http://local', { method:'POST' })); const externo = await criarHandlerObservacoes(dependencias, new Set())(new Request('http://local', { method:'POST', headers:{ authorization:'Bearer x' } })); assert.equal(semJwt.status, 401); assert.equal(externo.status, 403) })

assert.equal(total, 36)
console.log(`${total} testes de observacoes e ocorrencias aprovados.`)
