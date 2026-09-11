import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { criarHandlerStatus } from '../../../supabase/functions/alterar-status-atendimento/handler.ts'
import { criarHandler as criarHandlerConfirmacao } from '../../../supabase/functions/confirmar-agendamento/handler.ts'
import { criarHandlerDadosConclusao } from '../../../supabase/functions/dados-conclusao-atendimento/handler.ts'
import { criarHandlerCreditos } from '../../../supabase/functions/gerenciar-creditos-contrato/handler.ts'
import { criarHandlerGerenciarPacotes } from '../../../supabase/functions/gerenciar-pacotes/handler.ts'
import { criarHandlerMaterializacao } from '../../../supabase/functions/materializar-ciclo/handler.ts'
import { criarHandlerRemarcacao } from '../../../supabase/functions/remarcar-atendimento/handler.ts'
import { criarHandlerObservacoes } from '../../../supabase/functions/salvar-observacoes-atendimento/handler.ts'
import { criarHandlerSimulacaoPacote } from '../../../supabase/functions/simular-preco-pacote/handler.ts'
import { criarHandlerVendaContrato } from '../../../supabase/functions/vender-contrato/handler.ts'
import {
  criarOrigensPermitidas,
  ORIGENS_OFICIAIS,
} from '../../../supabase/functions/_shared/cors.ts'

const edges = [
  'alterar-status-atendimento',
  'confirmar-agendamento',
  'dados-conclusao-atendimento',
  'gerenciar-creditos-contrato',
  'gerenciar-pacotes',
  'materializar-ciclo',
  'remarcar-atendimento',
  'salvar-observacoes-atendimento',
  'simular-preco-pacote',
  'vender-contrato',
] as const

let autenticacoes = 0
const validarToken = async () => {
  autenticacoes += 1
  return { id: 'usuario-interno', app_metadata: { role: 'internal' } }
}
const naoExecutar = async (): Promise<never> => {
  throw new Error('A intenção inválida não deve alcançar a regra funcional.')
}
const origens = criarOrigensPermitidas(null)
const handlers = [
  criarHandlerStatus({ validarToken, alterar: naoExecutar }, origens),
  criarHandlerConfirmacao({ validarToken, confirmar: naoExecutar }, origens),
  criarHandlerDadosConclusao({ validarToken, executar: naoExecutar }, origens),
  criarHandlerCreditos({ validarToken, executar: naoExecutar }, origens),
  criarHandlerGerenciarPacotes({ validarToken, executar: naoExecutar }, origens),
  criarHandlerMaterializacao({ validarToken, materializar: naoExecutar }, origens),
  criarHandlerRemarcacao({ validarToken, remarcar: naoExecutar }, origens),
  criarHandlerObservacoes({ validarToken, executar: naoExecutar }, origens),
  criarHandlerSimulacaoPacote({ validarToken, executar: naoExecutar }, origens),
  criarHandlerVendaContrato({ validarToken, executar: naoExecutar }, origens),
]

let aprovados = 0
async function teste(nome: string, executar: () => void | Promise<void>) {
  await executar()
  aprovados += 1
  console.log(`OK CORS${String(aprovados).padStart(2, '0')} ${nome}`)
}

await teste('allowlist oficial contém desenvolvimento e produção sem wildcard', () => {
  assert.deepEqual([...ORIGENS_OFICIAIS], [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://kaza-pet-manager.vercel.app',
  ])
  assert.equal(origens.has('*'), false)
})

await teste('configuração adicional amplia a allowlist sem substituir origens oficiais', () => {
  const configuradas = criarOrigensPermitidas(' https://painel.exemplo.com , * ')
  for (const origem of ORIGENS_OFICIAIS) assert.equal(configuradas.has(origem), true)
  assert.equal(configuradas.has('https://painel.exemplo.com'), true)
  assert.equal(configuradas.has('*'), false)
})

for (const origem of ORIGENS_OFICIAIS) {
  await teste(`OPTIONS permite ${origem} em todas as Edges`, async () => {
    for (const handler of handlers) {
      const resposta = await handler(new Request('http://edge.local', {
        method: 'OPTIONS',
        headers: { origin: origem },
      }))
      assert.equal(resposta.status, 204)
      assert.equal(resposta.headers.get('access-control-allow-origin'), origem)
      assert.equal(resposta.headers.get('vary'), 'Origin')
      assert.match(resposta.headers.get('access-control-allow-methods') ?? '', /POST/)
      const cabecalhos = resposta.headers.get('access-control-allow-headers') ?? ''
      for (const esperado of ['authorization', 'content-type', 'apikey', 'x-client-info']) {
        assert.match(cabecalhos, new RegExp(esperado))
      }
    }
  })
}

await teste('origem desconhecida permanece bloqueada em todas as Edges', async () => {
  for (const handler of handlers) {
    const resposta = await handler(new Request('http://edge.local', {
      method: 'OPTIONS',
      headers: { origin: 'https://origem-desconhecida.example' },
    }))
    assert.equal(resposta.status, 403)
    assert.equal(resposta.headers.has('access-control-allow-origin'), false)
  }
})

await teste('requisições autenticadas atravessam o CORS em todas as Edges', async () => {
  autenticacoes = 0
  for (const handler of handlers) {
    const resposta = await handler(new Request('http://edge.local', {
      method: 'POST',
      headers: {
        origin: 'https://kaza-pet-manager.vercel.app',
        authorization: 'Bearer token-valido',
        'content-type': 'application/json',
      },
      body: '{}',
    }))
    assert.notEqual(resposta.status, 401)
    assert.notEqual(resposta.status, 403)
    assert.equal(
      resposta.headers.get('access-control-allow-origin'),
      'https://kaza-pet-manager.vercel.app',
    )
  }
  assert.equal(autenticacoes, handlers.length)
})

await teste('todas as Edges usam a allowlist compartilhada', () => {
  const raizFuncoes = fileURLToPath(new URL('../../../supabase/functions/', import.meta.url))
  for (const edge of edges) {
    const indice = readFileSync(`${raizFuncoes}/${edge}/index.ts`, 'utf8')
    assert.match(indice, /criarOrigensPermitidas\(Deno\.env\.get\('ALLOWED_ORIGINS'\)\)/)
  }
})

console.log(`${aprovados} regressões de CORS aprovadas para ${handlers.length} Edge Functions.`)
