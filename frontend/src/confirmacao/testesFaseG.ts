import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  calcularHashIntencao, lerIntencaoConfirmacao, normalizarIntencaoParaHash,
  respostaConfirmacaoValida, type ConfirmacaoAgendamentoIntent,
} from './contrato.ts'
import { montarPlanoConfirmacaoRpc } from './plano.ts'
import type {
  DadosDisponibilidade, OpcaoDisponibilidade, RecursoEtapaMotor,
  ResultadoPrecificacao,
} from '../motorDisponibilidade/tipos.ts'
import { criarHandler } from '../../../supabase/functions/confirmar-agendamento/handler.ts'
import { executarRpcConfirmacao } from './observabilidade.ts'

const base: ConfirmacaoAgendamentoIntent = {
  chaveIdempotencia: '11111111-1111-4111-8111-111111111111', petId: 'pet-1',
  servicoIds: ['b', 'a'], data: '2099-01-05', horarioEscolhido: 600,
  modalidade: 'sem_transporte', cicloTaxidogId: null,
  preferenciaFuncionario: 'automatico', funcionarioPreferidoId: null, funcionarioResponsavelId: null,
  versaoConfiguracaoConsultada: 2, versaoOcupacaoConsultada: 3,
}
const raiz = '../supabase/functions/confirmar-agendamento/'
const fonteServico = readFileSync(`${raiz}servico.ts`, 'utf8')
const fontePlano = readFileSync('../supabase/functions/_shared/confirmacao/plano.ts', 'utf8')
const fonteObservabilidade = readFileSync('../supabase/functions/_shared/confirmacao/observabilidade.ts', 'utf8')
let quantidade = 0
async function teste(codigo: string, nome: string, executar: () => void | Promise<void>) {
  await executar(); quantidade += 1; console.log(`${codigo} OK - ${nome}`)
}
function request(corpo: unknown, token: string | null = 'token', origem = 'http://localhost:5173') {
  const headers: Record<string, string> = { 'content-type': 'application/json', origin: origem }
  if (token) headers.authorization = `Bearer ${token}`
  return new Request('http://local/confirmar', { method: 'POST', headers, body: JSON.stringify(corpo) })
}
function handler(role: string | null, confirmar = async () => ({
  status: 'confirmado' as const, atendimentoId: 'a', grupoAgendamentoId: 'g',
  statusAtendimento: 'agendado' as const, horarioConfirmado: 600,
  conclusaoPrevista: 630, valorFinal: 10, versaoConfiguracao: 2,
  versaoOcupacao: 4, reutilizadoPorIdempotencia: false, servicos: [],
})) {
  return criarHandler({
    validarToken: async () => role === null ? null : ({ app_metadata: { role } }), confirmar,
  }, new Set(['http://localhost:5173']))
}

function snapshotRecursos(recursos: RecursoEtapaMotor[]) {
  const dados = {
    configuracao: {
      granularidadeMinutos: 15, esperaNormalMinutos: 15,
      timezone: 'America/Sao_Paulo',
    },
    pets: [{
      id: 'pet-1', clienteId: 'cliente-1', nome: 'Pet', especie: 'cao',
      racaId: 'raca-1', racaNome: 'Raca', sexo: 'macho', porte: 'pequeno',
      pelagem: 'curta', peso: 8, temperamento: 'calmo',
    }],
    servicos: [{ id: 'a', nome: 'Servico', ativo: true }],
    dependencias: [], acoplamentos: [],
    elegibilidade: { especies: [], portes: [], racasBloqueadas: [] },
    etapas: [{
      id: 'etapa-1', servicoId: 'a', nome: 'Etapa', ordem: 1,
      duracaoMinutos: 30, ativo: true, politicaEsperaAntes: 'padrao',
      esperaAntesMinutos: null,
    }],
    recursosEtapas: recursos, modificadoresDuracao: [],
    funcionamentoConfigurado: true, blocosEstabelecimento: [],
    excecoesEstabelecimento: [], funcionarios: [], jornadas: [],
    intervalosFuncionarios: [], habilitacoes: { servicos: [], etapas: [] },
    equipamentos: [], unidadesEquipamentos: [], perfisCapacidade: [],
    itensPerfisCapacidade: [], reservasFuncionarios: [],
    reservasEquipamentos: [], ciclosTaxidog: [],
  } satisfies DadosDisponibilidade
  const opcao = {
    horarioApresentado: 600, inicioOperacional: 600, conclusaoPrevista: 630,
    cicloTaxidog: null,
    servicos: [{
      id: 'a', nome: 'Servico', origem: 'solicitado', ordem: 1,
      paisDiretos: [], raizesSolicitadas: ['a'],
    }],
    etapas: [{
      etapaId: 'etapa-1', servicoId: 'a', servicoNome: 'Servico', nome: 'Etapa',
      inicio: 600, fim: 630, duracaoBaseMinutos: 30, duracaoMinutos: 30,
      funcionarios: [], equipamentos: [], modificadoresAplicados: [],
      contribuicoesAcopladas: [],
    }],
    esperas: [], duracaoProcessamento: 30, tempoEspera: 0, duracaoTotal: 30,
    trocasFuncionario: 0, trocasRecurso: 0,
  } satisfies OpcaoDisponibilidade
  const precificacao = {
    servicos: [{
      servicoId: 'a', servicoNome: 'Servico', origem: 'solicitado', ordem: 1,
      paisDiretos: [], precoBaseSnapshot: 10, acrescimos: [], valorCalculado: 10,
    }],
    valorCalculadoAtendimento: 10,
  } satisfies ResultadoPrecificacao
  const plano = montarPlanoConfirmacaoRpc(
    { ...base, servicoIds: ['a'] }, dados, opcao, precificacao, 'a'.repeat(64),
  )
  return (plano.etapas as { recursos_snapshot: unknown }[])[0].recursos_snapshot
}

function recurso(
  id: string,
  tipo: RecursoEtapaMotor['tipo'],
  equipamentoId: string | null,
  quantidade = 1,
): RecursoEtapaMotor {
  return {
    id, servicoEtapaId: 'etapa-1', tipo, equipamentoId, quantidade, ativo: true,
  }
}

await teste('FT', 'sem Authorization retorna 401', async () => assert.equal((await handler('internal')(request(base, null))).status, 401))
await teste('FU', 'JWT invalido retorna 401', async () => assert.equal((await handler(null)(request(base))).status, 401))
await teste('FV', 'authenticated sem internal retorna 403', async () => assert.equal((await handler('user')(request(base))).status, 403))
await teste('FW', 'internal valido passa autorizacao', async () => assert.equal((await handler('internal')(request(base))).status, 200))
await teste('FX', 'preco extra nao vira autoridade', () => assert.deepEqual(lerIntencaoConfirmacao({ ...base, valorFinal: 1 }), base))
await teste('FY', 'recursos extras nao viram autoridade', () => assert.deepEqual(lerIntencaoConfirmacao({ ...base, funcionarios: ['x'], equipamentos: ['y'] }), base))
await teste('FZ', 'configuracao alterada tem resposta exclusiva', () => {
  assert.ok(fonteServico.includes("codigo: 'CONFIGURACAO_ALTERADA'")); assert.ok(!fonteServico.includes("codigo: 'PRECO_ALTERADO'"))
})
await teste('GA', 'ocupacao alterada ainda recalcula', () => {
  assert.ok(fonteServico.includes('calcularDisponibilidadeNoHorario(')); assert.ok(!fonteServico.includes('versaoOcupacaoConsultada !=='))
})
await teste('GB', 'horario perdido retorna disponibilidade alterada', () => assert.ok(fonteServico.includes('if (!opcao) return indisponivel')))
await teste('GC', 'horario escolhido e preservado exatamente', () => assert.ok(
  fonteServico.includes('entrada, dados, intencao.horarioEscolhido'),
))
await teste('GD', 'automatico usa alocacao atual do Motor', () => assert.ok(fontePlano.includes('etapa.funcionarios.map')))
await teste('GE', 'preferencia segue integralmente para o Motor', () => assert.ok(fonteServico.includes('preferenciaFuncionario: intencao.preferenciaFuncionario')))
await teste('GF', 'TaxiDog recarrega ciclo atual', () => assert.ok(fonteServico.includes('carregarDadosDisponibilidadeComCliente')))
await teste('GG', 'deadline nao vem do frontend', () => assert.deepEqual(lerIntencaoConfirmacao({ ...base, deadline: 1 }), base))
await teste('GH', 'preco e recalculado', () => assert.ok(fonteServico.includes('calcularPrecificacao(precos.pet, opcao.servicos, precos.dados)')))
await teste('GI', 'PRECO_ALTERADO permanece sem emissao nesta versao', () => assert.ok(!fonteServico.includes("codigo: 'PRECO_ALTERADO'")))
await teste('GJ', 'hash e SHA-256 hexadecimal', async () => assert.match(await calcularHashIntencao(base), /^[0-9a-f]{64}$/))
await teste('GK', 'mesma intencao normalizada gera mesmo hash', async () => assert.equal(await calcularHashIntencao(base), await calcularHashIntencao({ ...base, servicoIds: ['a', 'b'] })))
await teste('GL', 'chave diferente nao muda hash normalizado', async () => assert.equal(
  await calcularHashIntencao(base), await calcularHashIntencao({ ...base, chaveIdempotencia: '22222222-2222-4222-8222-222222222222' }),
))
await teste('GM', 'plano contem proveniencia completa', () => assert.ok(fontePlano.includes('filho.paisDiretos.map')))
await teste('GN', 'pai canonico usa ordem e ID', () => assert.ok(fontePlano.includes('a.ordem - b.ordem || comparar')))
await teste('GO', 'supervisoes sao materializadas', () => assert.ok(fontePlano.includes('equipamento.supervisores')))
await teste('GP', 'RPC recebe plano pelo cliente administrativo', () => {
  assert.ok(fonteServico.includes('executarRpcConfirmacao(admin, plano, intencao)'))
  assert.ok(fonteObservabilidade.includes("admin.rpc('confirmar_agendamento_transacional'"))
})
await teste('GQ', 'resposta RPC e mapeada para a union', () => assert.ok(respostaConfirmacaoValida({
  status: 'confirmado', atendimentoId: 'a', grupoAgendamentoId: 'g',
  statusAtendimento: 'agendado', horarioConfirmado: 600,
  conclusaoPrevista: 630, valorFinal: 10, versaoConfiguracao: 2,
  versaoOcupacao: 4, reutilizadoPorIdempotencia: false, servicos: [],
})))
await teste('GR', 'erro interno nao expoe detalhe', async () => {
  const resposta = await handler('internal', async () => { throw new Error('segredo') })(request(base))
  assert.equal(resposta.status, 500); assert.ok(!JSON.stringify(await resposta.json()).includes('segredo'))
})
await teste('GS', 'OPTIONS e CORS restrito', async () => {
  const resposta = await handler('internal')(new Request('http://local', { method: 'OPTIONS', headers: { origin: 'http://localhost:5173' } }))
  assert.equal(resposta.status, 204); assert.equal(resposta.headers.get('access-control-allow-origin'), 'http://localhost:5173')
})
await teste('GT', 'metodo nao POST rejeitado', async () => assert.equal((await handler('internal')(new Request('http://local', { method: 'GET' }))).status, 405))
await teste('GU', 'cliente frontend nao possui service_role', () => {
  const fonte = readFileSync('src/confirmacao/clienteSupabase.ts', 'utf8')
  assert.ok(!/service[_-]?role/i.test(fonte)); assert.ok(!('valorFinal' in normalizarIntencaoParaHash(base)))
})
await teste('GV', 'snapshot de requisito de funcionario e array', () => assert.deepEqual(
  snapshotRecursos([recurso('r1', 'funcionario', null)]),
  [{ tipo: 'funcionario', equipamento_id: null, quantidade: 1 }],
))
await teste('GW', 'snapshot de requisito de equipamento preserva equipamento', () => assert.deepEqual(
  snapshotRecursos([recurso('r1', 'equipamento', 'equipamento-1')]),
  [{ tipo: 'equipamento', equipamento_id: 'equipamento-1', quantidade: 1 }],
))
await teste('GX', 'snapshot preserva requisitos de funcionario e equipamento', () => assert.deepEqual(
  snapshotRecursos([
    recurso('r2', 'funcionario', null),
    recurso('r1', 'equipamento', 'equipamento-1'),
  ]),
  [
    { tipo: 'equipamento', equipamento_id: 'equipamento-1', quantidade: 1 },
    { tipo: 'funcionario', equipamento_id: null, quantidade: 1 },
  ],
))
await teste('GY', 'snapshot preserva multiplos requisitos', () => assert.deepEqual(
  snapshotRecursos([
    recurso('r2', 'equipamento', 'equipamento-2'),
    recurso('r1', 'equipamento', 'equipamento-1'),
  ]),
  [
    { tipo: 'equipamento', equipamento_id: 'equipamento-1', quantidade: 1 },
    { tipo: 'equipamento', equipamento_id: 'equipamento-2', quantidade: 1 },
  ],
))
await teste('GZ', 'snapshot preserva quantidade maior que um', () => assert.deepEqual(
  snapshotRecursos([recurso('r1', 'funcionario', null, 2)]),
  [{ tipo: 'funcionario', equipamento_id: null, quantidade: 2 }],
))
await teste('HA', 'snapshot nao usa o formato antigo de alocacoes', () => {
  const snapshot = snapshotRecursos([recurso('r1', 'funcionario', null)])
  assert.ok(Array.isArray(snapshot))
  assert.ok(!('funcionarios' in (snapshot as object)))
  assert.ok(!('equipamentos' in (snapshot as object)))
})
await teste('HB', 'erro da RPC e registrado com campos permitidos e relancado', async () => {
  const erroRpc = {
    code: '23514', message: 'check constraint', details: 'campo invalido',
    hint: 'revise o contrato', token: 'segredo', payload: { plano: 'integral' },
    stack: 'stack proibida', service_role: 'chave proibida',
  }
  const registros: unknown[] = []
  const original = console.error
  console.error = (valor) => { registros.push(valor) }
  try {
    await assert.rejects(
      executarRpcConfirmacao(
        { rpc: async () => ({ data: null, error: erroRpc }) } as never,
        { plano: 'nao deve ser registrado' }, base,
      ),
      (erro) => erro === erroRpc,
    )
  } finally {
    console.error = original
  }
  assert.deepEqual(registros, [{
    evento: 'confirmacao_rpc_erro', codigo: '23514',
    mensagem: 'check constraint', details: 'campo invalido',
    hint: 'revise o contrato', chaveIdempotencia: base.chaveIdempotencia,
    petId: base.petId, horarioEscolhido: base.horarioEscolhido,
  }])
  const serializado = JSON.stringify(registros)
  assert.ok(!serializado.includes('segredo'))
  assert.ok(!serializado.includes('integral'))
  assert.ok(!serializado.includes('stack proibida'))
  assert.ok(!serializado.includes('chave proibida'))
})
await teste('HC', 'erro interno mantem resposta externa generica e log seguro', async () => {
  const registros: unknown[] = []
  const original = console.error
  console.error = (valor) => { registros.push(valor) }
  let resposta: Response
  try {
    resposta = await handler('internal', async () => {
      throw new Error('Bearer token-secreto stack SQL payload')
    })(request(base))
  } finally {
    console.error = original
  }
  assert.equal(resposta.status, 500)
  assert.deepEqual(await resposta.json(), {
    mensagem: 'Nao foi possivel confirmar o agendamento.',
  })
  assert.deepEqual(registros, [{
    evento: 'confirmacao_edge_erro', tipo: 'Error',
    mensagem: 'Falha interna durante a confirmacao.',
  }])
  const serializado = JSON.stringify(registros)
  assert.ok(!serializado.includes('token-secreto'))
  assert.ok(!serializado.includes('payload'))
  assert.ok(!serializado.includes('SQL'))
})
assert.equal(quantidade, 36)
console.log(`${quantidade} testes unitarios FT-HC aprovados.`)
