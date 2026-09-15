import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { calcularHashRemarcacao, lerRemarcacaoIntent, respostaRemarcacaoValida, validarRemarcacaoIntent, type RemarcacaoIntent } from './contrato.ts'
import { criarHandlerRemarcacao } from '../../../supabase/functions/remarcar-atendimento/handler.ts'

const base: RemarcacaoIntent = {
  chaveIdempotencia: '11111111-1111-4111-8111-111111111111',
  atendimentoId: '22222222-2222-4222-8222-222222222222',
  grupoAgendamentoIdEsperado: '33333333-3333-4333-8333-333333333333',
  statusEsperado: 'agendado', inicioOperacionalEsperado: '2026-08-15T12:00:00.000Z',
  funcionarioResponsavelIdEsperado: '66666666-6666-4666-8666-666666666666',
  funcionarioResponsavelId: '66666666-6666-4666-8666-666666666666',
  data: '2026-08-20', horarioEscolhido: 600, modalidade: 'sem_transporte',
  cicloTaxidogId: null, versaoConfiguracaoConsultada: 9, versaoOcupacaoConsultada: 15,
}
const frontend = new URL('../../', import.meta.url)
const repositorio = new URL('../../../', import.meta.url)
const lerFrontend = (arquivo: string) => readFileSync(new URL(arquivo, frontend), 'utf8').toLowerCase()
const lerRepositorio = (arquivo: string) => readFileSync(new URL(arquivo, repositorio), 'utf8').toLowerCase()
let executados = 0
function teste(nome: string, executar: () => void | Promise<void>) { return Promise.resolve(executar()).then(() => { executados += 1; console.log(`OK R${String(executados).padStart(2, '0')} ${nome}`) }) }

await teste('intencao normal valida', () => assert.equal(validarRemarcacaoIntent(base), true))
await teste('taxidog nao recebe horario interno', () => assert.equal(validarRemarcacaoIntent({ ...base, modalidade: 'taxidog', horarioEscolhido: null, cicloTaxidogId: '44444444-4444-4444-8444-444444444444' }), true))
await teste('taxidog rejeita horario interno', () => assert.equal(validarRemarcacaoIntent({ ...base, modalidade: 'taxidog', cicloTaxidogId: '44444444-4444-4444-8444-444444444444' }), false))
await teste('somente agendado ou confirmado', () => assert.equal(lerRemarcacaoIntent({ ...base, statusEsperado: 'recebido' }), null))
await teste('parser preserva grupo esperado', () => assert.equal(lerRemarcacaoIntent(base)?.grupoAgendamentoIdEsperado, base.grupoAgendamentoIdEsperado))
await teste('hash independe da chave de retry', async () => assert.equal(await calcularHashRemarcacao(base), await calcularHashRemarcacao({ ...base, chaveIdempotencia: '55555555-5555-4555-8555-555555555555' })))
await teste('hash muda com horario', async () => assert.notEqual(await calcularHashRemarcacao(base), await calcularHashRemarcacao({ ...base, horarioEscolhido: 615 })))
await teste('resposta tipada aceita sucesso', () => assert.equal(respostaRemarcacaoValida({ status: 'remarcado', codigo: 'REMARCADO', atendimentoId: base.atendimentoId, grupoAgendamentoId: base.grupoAgendamentoIdEsperado, funcionarioResponsavelId: base.funcionarioResponsavelId }), true))
const loader = lerRepositorio('supabase/functions/_shared/motor/supabase.ts')
await teste('loader ignora somente atendimento selecionado', () => assert.match(loader, /texto\(item\.id\) !== atendimentoidignorado/))
await teste('loader mantem filtro de status dos demais atendimentos', () => assert.match(loader, /statusbloqueiadisponibilidade/))
const servico = lerRepositorio('supabase/functions/remarcar-atendimento/servico.ts')
await teste('edge usa motor oficial', () => assert.match(servico, /calculardisponibilidade/))
await teste('edge usa o responsável escolhido sem fallback', () => { assert.match(servico, /preferenciafuncionario: 'obrigatorio'/); assert.match(servico, /funcionariopreferidoid: intencao\.funcionarioresponsavelid/); assert.doesNotMatch(servico, /preferenciafuncionario: funcionarioresponsavelid \?/) })
await teste('edge exige concordância com o responsável aberto', () => assert.match(servico, /nulooutexto\(atendimento\.funcionario_responsavel_id\) !== intencao\.funcionarioresponsavelidesperado/))
await teste('edge passa atendimento especifico ao loader', () => assert.match(servico, /undefined, intencao\.atendimentoid/))
await teste('edge revalida grupo status e inicio', () => { assert.match(servico, /grupoagendamentoidesperado/); assert.match(servico, /statusesperado/); assert.match(servico, /iniciooperacionalesperado/) })
await teste('edge nao carrega precificacao', () => assert.doesNotMatch(servico, /precificacao/))
await teste('edge preserva erro estruturado de cadastro incompleto', () => { assert.match(servico, /cadastro_pet_incompleto/); assert.match(servico, /campos: resultado\.erro\.campos/) })
const plano = lerFrontend('src/remarcacao/plano.ts')
await teste('plano envia responsável esperado e escolhido à RPC', () => { assert.match(plano, /funcionarioresponsavelidesperado: intencao\.funcionarioresponsavelidesperado/); assert.match(plano, /funcionarioresponsavelid: intencao\.funcionarioresponsavelid/) })
await teste('plano referencia servicos materializados existentes', () => assert.match(plano, /servicosmaterializados\.get/))
await teste('plano substitui estruturas operacionais', () => ['etapas','funcionarios','equipamentos','supervisoes','esperas','contribuicoes'].forEach((nome) => assert.match(plano, new RegExp(nome))))
const migration = lerRepositorio('banco/034_remarcacao_troca_funcionario_responsavel.sql')
const migrationBase = lerRepositorio('banco/023_remarcacao_transacional_atendimento.sql')
await teste('rpc preserva atendimento id', () => assert.match(migration, /update public\.atendimentos set grupo_agendamento_id/))
await teste('rpc troca responsável atomicamente e detecta concorrência', () => { assert.match(migration, /funcionario_responsavel_id = v_responsavel/); assert.match(migration, /funcionario_responsavel_id is distinct from v_responsavel_esperado/); assert.match(migration, /where id = v_responsavel and ativo/) })
await teste('grupo unico e multiplo possuem ramos dedicados', () => { assert.match(migration, /v_quantidade_grupo = 1/); assert.match(migration, /insert into public\.grupos_agendamento/) })
await teste('idempotencia propria persiste resposta', () => { assert.match(migrationBase, /create table public\.atendimento_remarcacoes/); assert.match(migration, /idempotencia_conflitante/) })
await teste('plano antigo so e removido dentro da rpc', () => { assert.match(migration, /delete from public\.atendimento_esperas/); assert.match(migration, /delete from public\.atendimento_etapas/) })
await teste('servicos e financeiro nao sao atualizados', () => { assert.doesNotMatch(migration, /update public\.atendimento_servicos/); assert.doesNotMatch(migration, /valor_final\s*=/) })
await teste('status e timestamps operacionais nao sao atualizados', () => { assert.doesNotMatch(migration, /status\s*=/); assert.doesNotMatch(migration, /recebido_em\s*=/) })
const agenda = lerFrontend('src/pages/agenda.tsx')
const modal = lerFrontend('src/agenda/remarcaratendimentomodal.tsx')
const loaderAgenda = lerFrontend('src/data/agendadiaria.ts')
await teste('abre com responsável autoritativo selecionado', () => { assert.match(loaderAgenda, /funcionarioresponsavelid: funcionarioresponsavelid \|\| null/); assert.match(modal, /usestate\(atendimento\.funcionarioresponsavelid \?\? ''\)/) })
await teste('frontend não usa funcionário preferido como fonte de negócio', () => { assert.doesNotMatch(modal, /atendimento\.funcionariopreferidoid/); assert.doesNotMatch(modal, /atendimento\.preferenciafuncionario/) })
await teste('troca de funcionário invalida e recalcula o Motor', () => { assert.match(modal, /function escolherfuncionario/); assert.match(modal, /void consultar\(data, '', valor\)/); assert.match(modal, /preferenciafuncionario: 'obrigatorio'/) })
await teste('confirmação envia o responsável escolhido e preserva o esperado', () => { assert.match(modal, /funcionarioresponsavelidesperado: atendimento\.funcionarioresponsavelid/); assert.match(modal, /funcionarioresponsavelid,/); assert.match(modal, /disabled={!funcionarioresponsavelid \|\| !opcao \|\| !versoes}/) })
await teste('botao somente para agendado e confirmado', () => assert.match(agenda, /status === 'agendado' \|\| status === 'confirmado'/))
await teste('reload oficial apos sucesso', () => assert.match(agenda, /concluirremarcacao[\s\s]*\(dataconfirmada/))
const handler = criarHandlerRemarcacao({ validarToken: async (token) => token === 'interno' ? { app_metadata: { role: 'internal' } } : token === 'externo' ? { app_metadata: {} } : null, remarcar: async () => ({ status: 'remarcado', codigo: 'REMARCADO', atendimentoId: base.atendimentoId, grupoAgendamentoId: base.grupoAgendamentoIdEsperado, funcionarioResponsavelId: base.funcionarioResponsavelId, dataOperacional: base.data, horarioConfirmado: 600, conclusaoPrevista: 630, versaoOcupacao: 16, reutilizadoPorIdempotencia: false }) }, new Set(['http://localhost:5173']))
await teste('edge exige jwt', async () => assert.equal((await handler(new Request('http://local', { method: 'POST', headers: { 'content-type': 'application/json' } }))).status, 401))
await teste('edge exige role internal', async () => assert.equal((await handler(new Request('http://local', { method: 'POST', headers: { authorization: 'Bearer externo', 'content-type': 'application/json' }, body: JSON.stringify(base) }))).status, 403))
await teste('edge aceita internal e contrato valido', async () => assert.equal((await handler(new Request('http://local', { method: 'POST', headers: { authorization: 'Bearer interno', 'content-type': 'application/json' }, body: JSON.stringify(base) }))).status, 200))
await teste('cors permite x-client-info', async () => { const resposta = await handler(new Request('http://local', { method: 'OPTIONS', headers: { origin: 'http://localhost:5173' } })); assert.match(resposta.headers.get('access-control-allow-headers') ?? '', /x-client-info/) })
console.log(`${executados} testes de remarcacao aprovados.`)
