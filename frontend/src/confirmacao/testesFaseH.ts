import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { montarIntencaoConfirmacaoDev } from './dev.ts'
import { respostaConfirmacaoValida, type ConfirmacaoAgendamentoResposta } from './contrato.ts'

let quantidade = 0
async function teste(codigo: string, nome: string, executar: () => void | Promise<void>) {
  await executar()
  quantidade += 1
  console.log(`${codigo} — ${nome}: OK`)
}

const fontePagina = readFileSync('src/pages/TesteMotorDisponibilidade.tsx', 'utf8')
const fonteModal = readFileSync('src/confirmacao/ConfirmacaoAgendamentoDev.tsx', 'utf8')
const fonteLote = readFileSync('src/pages/PlanejamentoLoteDev.tsx', 'utf8')
const fonteAgenda = readFileSync('src/pages/Agenda.tsx', 'utf8')
const chave1 = '11111111-1111-4111-8111-111111111111'
const chave2 = '22222222-2222-4222-8222-222222222222'
let indiceChave = 0
const chaves = () => [chave1, chave2][indiceChave++] ?? chave2
const dadosBase = {
  petId: 'pet-1', servicoIds: ['servico-2', 'servico-1'],
  data: '2026-08-20', horarioEscolhido: 540,
  modalidade: 'sem_transporte' as const, cicloTaxidogId: null,
  preferenciaFuncionario: 'automatico' as const,
  funcionarioPreferidoId: null,
  funcionarioResponsavelId: null,
  versaoConfiguracaoConsultada: 6, versaoOcupacaoConsultada: 12,
}
const confirmado: ConfirmacaoAgendamentoResposta = {
  status: 'confirmado', codigo: 'CONFIRMADO', atendimentoId: 'atendimento-1',
  grupoAgendamentoId: 'grupo-1', statusAtendimento: 'confirmado',
  horarioConfirmado: 540, conclusaoPrevista: 570, valorFinal: 50,
  versaoConfiguracao: 6, versaoOcupacao: 13,
  reutilizadoPorIdempotencia: false,
  servicos: [{ id: 'servico-1', nome: 'Banho', origem: 'solicitado' }],
}

await teste('HD', 'opcao disponivel oferece confirmacao DEV', () => {
  assert.ok(fontePagina.includes('Confirmar atendimento DEV'))
  assert.ok(fontePagina.includes("resultado.estado !== 'OK'"))
})
await teste('HE', 'intencao contem exatamente campos autorizados', () => {
  const { intencao } = montarIntencaoConfirmacaoDev(dadosBase, null, chaves)
  assert.deepEqual(Object.keys(intencao).sort(), [
    'chaveIdempotencia', 'cicloTaxidogId', 'data', 'funcionarioPreferidoId', 'funcionarioResponsavelId',
    'horarioEscolhido', 'modalidade', 'petId', 'preferenciaFuncionario',
    'servicoIds', 'versaoConfiguracaoConsultada', 'versaoOcupacaoConsultada',
  ].sort())
})
await teste('HF', 'dados visuais nao sao autoridade', () => {
  const { intencao } = montarIntencaoConfirmacaoDev(dadosBase, null, chaves)
  const serializada = JSON.stringify(intencao)
  for (const proibido of ['valorFinal', 'etapas', 'funcionarios', 'equipamentos', 'supervisores', 'recursos']) assert.ok(!serializada.includes(proibido))
})
await teste('HG', 'versoes pertencem a consulta apresentada', () => {
  assert.ok(fontePagina.includes('const [resultado, versoes] = await Promise.all'))
  const { intencao } = montarIntencaoConfirmacaoDev(dadosBase, null, chaves)
  assert.equal(intencao.versaoConfiguracaoConsultada, 6)
  assert.equal(intencao.versaoOcupacaoConsultada, 12)
})
await teste('HH', 'revisao mostra campos obrigatorios', () => {
  for (const campo of ['Pet', 'Data', 'Início', 'Conclusão prevista', 'Modalidade', 'Serviços', 'Etapas e recursos apresentados']) assert.ok(fonteModal.includes(campo))
})
await teste('HI', 'abrir revisao nao confirma automaticamente', () => {
  assert.ok(fontePagina.includes('onConfirmar={() => void confirmar()}'))
  assert.ok(!fonteModal.includes('useEffect'))
})
await teste('HJ', 'chamada em andamento bloqueia nova confirmacao', () => {
  assert.ok(fontePagina.includes('confirmando || !consultaAtual?.valida'))
  assert.ok(fonteModal.includes('disabled={!podeConfirmar}'))
})
await teste('HK', 'retry preserva chave', () => {
  indiceChave = 0
  const primeira = montarIntencaoConfirmacaoDev(dadosBase, null, chaves)
  const retry = montarIntencaoConfirmacaoDev(dadosBase, primeira.tentativa, chaves)
  assert.equal(retry.intencao.chaveIdempotencia, primeira.intencao.chaveIdempotencia)
})
await teste('HL', 'mudanca semantica invalida chave', () => {
  indiceChave = 0
  const primeira = montarIntencaoConfirmacaoDev(dadosBase, null, chaves)
  const nova = montarIntencaoConfirmacaoDev({ ...dadosBase, horarioEscolhido: 555 }, primeira.tentativa, chaves)
  assert.notEqual(nova.intencao.chaveIdempotencia, primeira.intencao.chaveIdempotencia)
  assert.ok(fontePagina.includes('function alterarParametros'))
})
await teste('HM', 'sucesso expoe IDs status e versoes', () => {
  assert.ok(respostaConfirmacaoValida(confirmado))
  for (const campo of ['Grupo', 'Atendimento', 'Status', 'Ocupação consultada', 'Ocupação retornada']) assert.ok(fonteModal.includes(campo))
})
await teste('HN', 'idempotencia reutilizada e representada', () => assert.ok(fonteModal.includes('Confirmação já existente reutilizada por idempotência.')))
await teste('HO', 'disponibilidade alterada exige consulta', () => {
  assert.ok(fonteModal.includes('A disponibilidade desse horário mudou. Consulte novamente.'))
  assert.ok(fontePagina.includes("resposta.status === 'disponibilidade_alterada'"))
})
await teste('HP', 'configuracao alterada exige consulta', () => {
  assert.ok(fonteModal.includes('A configuração da agenda mudou desde esta consulta. Consulte novamente.'))
  assert.ok(fontePagina.includes("resposta.status === 'configuracao_alterada'"))
})
await teste('HQ', 'invalido mostra codigo e mensagem', () => {
  assert.ok(fonteModal.includes('<strong>{resposta.codigo}</strong>'))
  assert.ok(fonteModal.includes('return resposta.mensagem'))
})
await teste('HR', 'falha tecnica e sanitizada', () => {
  assert.ok(fontePagina.includes('Não foi possível confirmar o atendimento. Tente novamente.'))
  assert.ok(!fontePagina.includes('error.stack'))
})
await teste('HS', 'TaxiDog envia somente ciclo como dado logistico', () => {
  const { intencao } = montarIntencaoConfirmacaoDev({ ...dadosBase, modalidade: 'taxidog', cicloTaxidogId: 'ciclo-1' }, null, () => chave1)
  assert.equal(intencao.cicloTaxidogId, 'ciclo-1')
  assert.ok(!('coletaInicio' in intencao) && !('conclusaoLimite' in intencao))
})
await teste('HT', 'preferencias sao preservadas', () => {
  for (const preferencia of ['automatico', 'preferencial', 'obrigatorio'] as const) {
    const funcionarioPreferidoId = preferencia === 'automatico' ? null : 'funcionario-1'
    const { intencao } = montarIntencaoConfirmacaoDev({ ...dadosBase, preferenciaFuncionario: preferencia, funcionarioPreferidoId, funcionarioResponsavelId: preferencia === 'obrigatorio' ? funcionarioPreferidoId : null }, null, () => chave1)
    assert.equal(intencao.preferenciaFuncionario, preferencia)
    assert.equal(intencao.funcionarioPreferidoId, funcionarioPreferidoId)
  }
})
await teste('HU', 'lote permanece sem persistencia', () => {
  assert.ok(!fonteLote.includes('confirmacaoAgendamentoClient'))
  assert.ok(!fonteLote.includes('Confirmar atendimento DEV'))
})
await teste('HV', 'Agenda final permanece sem confirmacao', () => {
  assert.ok(!fonteAgenda.includes('confirmacaoAgendamentoClient'))
  assert.ok(!fonteAgenda.includes('Confirmar atendimento DEV'))
})

await teste('HW', 'parser aceita confirmado completo', () => assert.equal(respostaConfirmacaoValida(confirmado), true))
await teste('HX', 'parser rejeita confirmado incompleto', () => assert.equal(respostaConfirmacaoValida({ status: 'confirmado' }), false))
await teste('HY', 'parser aceita invalido completo', () => assert.equal(respostaConfirmacaoValida({ status: 'invalido', codigo: 'INTENCAO_INVALIDA', mensagem: 'Inválida.' }), true))
await teste('HZ', 'parser rejeita invalido sem codigo', () => assert.equal(respostaConfirmacaoValida({ status: 'invalido', mensagem: 'Inválida.' }), false))
await teste('IA', 'parser aceita configuracao alterada', () => assert.equal(respostaConfirmacaoValida({ status: 'configuracao_alterada', codigo: 'CONFIGURACAO_ALTERADA', mensagem: 'Mudou.', versaoConfiguracaoConsultada: 6, versaoConfiguracaoAtual: 7 }), true))
await teste('IB', 'parser aceita disponibilidade alterada', () => assert.equal(respostaConfirmacaoValida({ status: 'disponibilidade_alterada', codigo: 'HORARIO_INDISPONIVEL', mensagem: 'Mudou.', versaoOcupacaoAtual: 13 }), true))
await teste('IC', 'parser rejeita objeto desconhecido', () => assert.equal(respostaConfirmacaoValida({ status: 'desconhecido' }), false))
await teste('ID', 'parser rejeita null e array', () => { assert.equal(respostaConfirmacaoValida(null), false); assert.equal(respostaConfirmacaoValida([]), false) })
await teste('IE', 'parser rejeita string', () => assert.equal(respostaConfirmacaoValida('confirmado'), false))
await teste('IF', 'TaxiDog nao fixa horario operacional na intencao', () => {
  const { intencao } = montarIntencaoConfirmacaoDev({ ...dadosBase, modalidade: 'taxidog', cicloTaxidogId: 'ciclo-1' }, null, () => chave1)
  assert.equal(intencao.horarioEscolhido, null)
})
await teste('IG', 'Sem transporte preserva horario escolhido', () => {
  const { intencao } = montarIntencaoConfirmacaoDev(dadosBase, null, () => chave1)
  assert.equal(intencao.horarioEscolhido, 540)
})

assert.equal(quantidade, 30)
console.log(`${quantidade} testes unitários HD-IG aprovados.`)
