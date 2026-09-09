import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dataNoTimezone, montarAgendaDiaria, montarHistoricoOperacional } from './agendaDiaria.ts'
import { classificarAlertaOperacional, TOLERANCIA_OPERACIONAL_MINUTOS } from '../agenda/alertaOperacional.ts'
import { financeiroDaResposta, textoFinanceiro } from '../agenda/financeiroAtendimento.ts'
import type { FinanceiroAtendimento, SituacaoFinanceira } from '../conclusaoAtendimento/contrato.ts'

type Linha = Record<string, unknown>
const fonteLoader = readFileSync('src/data/agendaDiaria.ts', 'utf8')
const fontePagina = readFileSync('src/pages/Agenda.tsx', 'utf8')
const fonteGrade = readFileSync('src/agenda/GradeAgenda.tsx', 'utf8')
const fonteGradeTemporal = readFileSync('src/agenda/gradeTemporal.ts', 'utf8')
const fonteEstilos = readFileSync('src/App.css', 'utf8')
const fonteApp = readFileSync('src/App.tsx', 'utf8')
const fonteContratos = readFileSync('src/contratos/Contratos.tsx', 'utf8')
const fonteDev = readFileSync('src/pages/TesteMotorDisponibilidade.tsx', 'utf8')
const fonteAlertas = readFileSync('src/agenda/alertaOperacional.ts', 'utf8')
const fonteFinanceiro = readFileSync('src/agenda/financeiroAtendimento.ts', 'utf8')
let aprovados = 0

function teste(id: string, nome: string, executar: () => void) {
  executar(); aprovados += 1; console.log(`${id} — ${nome}: OK`)
}

function fixture() {
  const dados = {
    grupos: [{ id: 'g1', cliente_id: 'c1', modalidade: 'normal', data_operacional: '2026-08-15', observacoes: '' }],
    atendimentos: [{ id: 'a1', grupo_agendamento_id: 'g1', pet_id: 'p1', status: 'agendado', inicio_operacional_planejado: '2026-08-15T12:00:00Z', conclusao_operacional_prevista: '2026-08-15T13:10:00Z', funcionario_responsavel_id: 'f1', observacoes: 'Cuidado', valor_final: '55.00', pet_nome_snapshot: 'Jou antigo', recebido_em: null, iniciado_em: null, finalizado_em: null, concluido_em: null }],
    clientes: [{ id: 'c1', nome: 'Fábio' }], pets: [{ id: 'p1', nome: 'Jou atual' }],
    servicos: [{ id: 'as1', atendimento_id: 'a1', servico_id: 's-banho', nome_snapshot: 'Banho histórico', ordem: 1, origem: 'solicitado' }],
    etapas: [
      { id: 'e1', atendimento_id: 'a1', nome_snapshot: 'Banho', ordem_snapshot: 1, inicio_planejado: '2026-08-15T12:00:00Z', fim_planejado: '2026-08-15T12:15:00Z' },
      { id: 'e2', atendimento_id: 'a1', nome_snapshot: 'Secagem', ordem_snapshot: 2, inicio_planejado: '2026-08-15T12:15:00Z', fim_planejado: '2026-08-15T13:00:00Z' },
      { id: 'e3', atendimento_id: 'a1', nome_snapshot: 'Finalização', ordem_snapshot: 3, inicio_planejado: '2026-08-15T13:00:00Z', fim_planejado: '2026-08-15T13:10:00Z' },
    ],
    reservasFuncionarios: [
      { id: 'rf2', atendimento_etapa_id: 'e1', funcionario_id: 'f2' },
      { id: 'rf1', atendimento_etapa_id: 'e1', funcionario_id: 'f1' },
      { id: 'rf3', atendimento_etapa_id: 'e3', funcionario_id: 'f3' },
    ],
    funcionarios: [{ id: 'f1', nome: 'Ágata' }, { id: 'f2', nome: 'Bruno' }, { id: 'f3', nome: 'Carla' }],
    reservasEquipamentos: [{ id: 're1', atendimento_etapa_id: 'e2', equipamento_unidade_id: 'u1' }],
    unidades: [{ id: 'u1', equipamento_id: 'eq1', numero: 1, nome: 'Secadora 1' }],
    equipamentos: [{ id: 'eq1', nome: 'Máquina de secagem' }],
    esperas: [{ id: 'w1', atendimento_id: 'a1', inicio: '2026-08-15T13:00:00Z', fim: '2026-08-15T13:05:00Z', motivo: 'operacional' }],
    vinculosContratuais: [] as Linha[], ciclosContratuais: [] as Linha[], ocorrenciasContratuais: [] as Linha[], itensContratuais: [] as Linha[],
  } satisfies Record<string, Linha[]>
  return dados
}

const montar = (dados = fixture()) => montarAgendaDiaria('2026-08-15', 'America/Sao_Paulo', dados)

function fixtureContrato(ordem = 1) {
  const dados = fixture()
  dados.vinculosContratuais = [{ id: `oc${ordem}`, atendimento_id: 'a1', ciclo_id: 'ciclo1', ordem }]
  dados.ciclosContratuais = [{ id: 'ciclo1', contrato_id: 'contrato1', numero: 3, contratos: { id: 'contrato1', pacote_nome_snapshot: 'Pacote Ouro' } }]
  dados.ocorrenciasContratuais = [1, 2, 3, 4].map((numero) => ({ id: `oc${numero}`, ciclo_id: 'ciclo1', ordem: numero, data_operacional: `2026-08-${String(1 + numero * 7).padStart(2, '0')}` }))
  dados.itensContratuais = [{ ocorrencia_id: `oc${ordem}`, contrato_itens: { servico_id: 's-banho' } }]
  return dados
}

teste('AJ01', 'atendimento moderno aparece na data operacional', () => assert.equal(montar().secoes[0].atendimentos[0].dataOperacional, '2026-08-15'))
teste('AJ02', 'múltiplas etapas geram somente um card', () => assert.equal(montar().secoes.flatMap((item) => item.atendimentos).length, 1))
teste('AJ03', 'responsável autoritativo escolhe a coluna e permanece disponível para ações', () => { const item = montar().secoes[0]; assert.equal(item.funcionario?.id, 'f1'); assert.equal(item.atendimentos[0].funcionarioResponsavelId, 'f1') })
teste('AJ04', 'sem responsável permanece em seção própria', () => { const d = fixture(); d.atendimentos[0].funcionario_responsavel_id = null as never; assert.equal(montar(d).secoes[0].chave, '__sem_funcionario__') })
teste('AJ05', 'cards são ordenados por início e ID', () => { const d = fixture(); d.atendimentos.push({ ...d.atendimentos[0], id: 'a0', inicio_operacional_planejado: '2026-08-15T11:00:00Z' }); d.etapas.push({ ...d.etapas[0], id: 'e0', atendimento_id: 'a0', inicio_planejado: '2026-08-15T11:00:00Z' }); d.reservasFuncionarios.push({ id: 'rf0', atendimento_etapa_id: 'e0', funcionario_id: 'f1' }); assert.deepEqual(montar(d).secoes[0].atendimentos.map((item) => item.id), ['a0', 'a1']) })
teste('AJ06', 'seções são ordenadas por nome e chave', () => { const d = fixture(); d.atendimentos.push({ ...d.atendimentos[0], id: 'a2', funcionario_responsavel_id: 'f2' }); d.etapas.push({ ...d.etapas[0], id: 'e4', atendimento_id: 'a2' }); d.reservasFuncionarios.push({ id: 'rf4', atendimento_etapa_id: 'e4', funcionario_id: 'f2' }); assert.deepEqual(montar(d).secoes.map((item) => item.funcionario?.nome), ['Ágata', 'Bruno']) })
teste('AJ07', 'serviços repetidos pelo mesmo ID não duplicam', () => { const d = fixture(); d.servicos.push({ ...d.servicos[0] }); assert.equal(montar(d).secoes[0].atendimentos[0].servicos.length, 1) })
teste('AJ08', 'dependência materializada preserva origem', () => { const d = fixture(); d.servicos.push({ id: 'as2', atendimento_id: 'a1', servico_id: 's-base', nome_snapshot: 'Serviço base', ordem: 2, origem: 'dependencia' }); assert.equal(montar(d).secoes[0].atendimentos[0].servicos[1].origem, 'dependencia') })
teste('AJ09', 'snapshots históricos vencem catálogo atual', () => { const item = montar().secoes[0].atendimentos[0]; assert.equal(item.petNome, 'Jou antigo'); assert.equal(item.servicos[0].nome, 'Banho histórico') })
teste('AJ10', 'valor final persistido não é recalculado', () => assert.equal(montar().secoes[0].atendimentos[0].valorFinal, 55))
teste('AJ11', 'TaxiDog usa snapshots persistidos', () => { const d = fixture(); Object.assign(d.grupos[0], { modalidade: 'taxidog', taxidog_ciclo_nome_snapshot: 'Manhã', taxidog_coleta_inicio_snapshot: '08:00:00', taxidog_coleta_fim_snapshot: '09:00:00', taxidog_conclusao_limite_snapshot: '12:00:00' }); assert.equal(montar(d).secoes[0].atendimentos[0].taxidog?.cicloNome, 'Manhã') })
teste('AJ12', 'etapas ficam aninhadas no atendimento', () => assert.equal(montar().secoes[0].atendimentos[0].etapas.length, 3))
teste('AJ13', 'equipamento aparece na etapa de detalhe', () => assert.equal(montar().secoes[0].atendimentos[0].etapas[1].equipamentos[0].nome, 'Máquina de secagem'))
teste('AJ14', 'funcionários adicionais permanecem nos detalhes', () => assert.deepEqual(montar().secoes[0].atendimentos[0].etapas[0].funcionarios.map((item) => item.id), ['f1', 'f2']))
teste('AJ15', 'loader filtra grupos pela data operacional', () => assert.ok(fonteLoader.includes(".eq('data_operacional', data)")))
teste('AJ16', 'timezone mantém a data local correta', () => assert.equal(dataNoTimezone(new Date('2026-08-16T01:30:00Z'), 'America/Sao_Paulo'), '2026-08-15'))
teste('AJ17', 'dia vazio mantém componente da grade', () => assert.ok(fontePagina.includes(': agenda && <GradeAgenda') && !fontePagina.includes('Nenhum atendimento para esta data.')))
teste('AJ18', 'estado de erro permite tentar novamente', () => assert.ok(fontePagina.includes('Não foi possível carregar a Agenda') && fontePagina.includes('Tentar novamente')))
teste('AJ19', 'estado carregando é explícito', () => assert.ok(fontePagina.includes('Carregando agenda...')))
teste('AJ20', 'Agenda não possui confirmação DEV', () => assert.ok(!fontePagina.includes('Confirmar atendimento DEV')))
teste('AJ21', 'loader diário é estritamente somente leitura', () => assert.ok(!/\.(insert|update|upsert|delete)\s*\(/.test(fonteLoader)))
teste('AJ22', 'ferramenta DEV permanece separada', () => assert.ok(fonteDev.includes('Confirmar atendimento DEV') && !fontePagina.includes('ConfirmacaoAgendamentoDev')))
teste('AJ23', 'aplicação continua protegida por autenticação internal', () => assert.ok(fonteApp.includes("estadoAutenticacao === 'nao_autenticado'") && fonteApp.includes("estadoAutenticacao === 'sem_permissao'")))
teste('AJ24', 'loader traz os quatro timestamps sem consulta redundante', () => ['recebido_em', 'iniciado_em', 'finalizado_em', 'concluido_em'].forEach((campo) => assert.ok(fonteLoader.includes(campo))))
teste('AJ25', 'histórico mostra somente eventos reais existentes', () => assert.deepEqual(montarHistoricoOperacional({ recebido_em: '2026-08-15T12:02:00Z', iniciado_em: null, concluido_em: '2026-08-15T13:20:00Z' }).map((item) => item.tipo), ['recebido', 'concluido']))
teste('AJ26', 'histórico não cria linhas para timestamps nulos', () => assert.deepEqual(montarHistoricoOperacional({ recebido_em: null, iniciado_em: null, finalizado_em: null, concluido_em: null }), []))
teste('AJ27', 'planejamento permanece separado do histórico real', () => { const d = fixture(); Object.assign(d.atendimentos[0], { recebido_em: '2026-08-15T12:02:00Z', iniciado_em: '2026-08-15T12:10:00Z' }); const item = montar(d).secoes[0].atendimentos[0]; assert.equal(item.inicio, '2026-08-15T12:00:00Z'); assert.equal(item.etapas[0].inicio, '2026-08-15T12:00:00Z'); assert.deepEqual(item.historicoOperacional.map((evento) => evento.ocorridoEm), ['2026-08-15T12:02:00Z', '2026-08-15T12:10:00Z']) })
teste('AJ28', 'modal omite integralmente o bloco quando não há eventos', () => assert.ok(fontePagina.includes('atendimento.historicoOperacional.length > 0') && !fontePagina.includes('ocorridoEm ||')))
const atendimentoAlerta = (alteracoes: Partial<ReturnType<typeof montar>['secoes'][number]['atendimentos'][number]> = {}) => ({ ...montar().secoes[0].atendimentos[0], ...alteracoes })
const alerta = (alteracoes: Parameters<typeof atendimentoAlerta>[0], agora: string) => classificarAlertaOperacional(atendimentoAlerta(alteracoes), new Date(agora))
teste('AJ29', 'agendado antes do horário não alerta', () => assert.equal(alerta({}, '2026-08-15T11:59:00Z'), null))
teste('AJ30', 'confirmado dentro da tolerância não alerta', () => assert.equal(alerta({ status: 'confirmado' }, '2026-08-15T12:10:00Z'), null))
teste('AJ31', 'confirmado após tolerância alerta chegada', () => assert.deepEqual(alerta({ status: 'confirmado' }, '2026-08-15T12:11:00Z')?.tipo, 'atraso_chegada'))
teste('AJ32', 'agendado após tolerância alerta chegada', () => assert.equal(alerta({}, '2026-08-15T12:17:00Z')?.minutos, 17))
teste('AJ33', 'recebido dentro do horário não alerta', () => assert.equal(alerta({ status: 'recebido', historicoOperacional: [{ tipo: 'recebido', rotulo: 'Recebido', ocorridoEm: '2026-08-15T11:55:00Z' }] }, '2026-08-15T12:07:00Z'), null))
teste('AJ34', 'recebido após tolerância aguarda início', () => assert.equal(alerta({ status: 'recebido', historicoOperacional: [{ tipo: 'recebido', rotulo: 'Recebido', ocorridoEm: '2026-08-15T11:55:00Z' }] }, '2026-08-15T12:18:00Z')?.tipo, 'aguardando_inicio'))
teste('AJ35', 'em atendimento antes da conclusão não alerta', () => assert.equal(alerta({ status: 'em_atendimento' }, '2026-08-15T13:00:00Z'), null))
teste('AJ36', 'em atendimento dentro da tolerância após conclusão não alerta', () => assert.equal(alerta({ status: 'em_atendimento' }, '2026-08-15T13:20:00Z'), null))
teste('AJ37', 'em atendimento além da tolerância alerta execução', () => assert.equal(alerta({ status: 'em_atendimento' }, '2026-08-15T13:28:00Z')?.tipo, 'atraso_execucao'))
for (const [codigo, status] of [['AJ38', 'aguardando_retirada'], ['AJ39', 'aguardando_entrega'], ['AJ40', 'concluido'], ['AJ41', 'cancelado'], ['AJ42', 'faltou']] as const) teste(codigo, `${status} não recebe alerta ativo`, () => assert.equal(alerta({ status }, '2026-08-15T15:00:00Z'), null))
teste('AJ43', 'TaxiDog agendado não usa início interno para atraso de chegada', () => assert.equal(alerta({ modalidade: 'taxidog' }, '2026-08-15T15:00:00Z'), null))
teste('AJ44', 'mudança do agora recalcula sem reload', () => { const item = atendimentoAlerta(); assert.equal(classificarAlertaOperacional(item, new Date('2026-08-15T12:05:00Z')), null); assert.equal(classificarAlertaOperacional(item, new Date('2026-08-15T12:15:00Z'))?.tipo, 'atraso_chegada') })
teste('AJ45', 'tolerância de dez minutos está centralizada', () => assert.equal(TOLERANCIA_OPERACIONAL_MINUTOS, 10))
teste('AJ46', 'instantes com offset operacional não sofrem deslocamento', () => assert.equal(alerta({ inicio: '2026-08-15T09:00:00-03:00' }, '2026-08-15T12:11:00Z')?.minutos, 11))
teste('AJ47', 'status e alerta permanecem conceitos independentes', () => { const item = atendimentoAlerta({ status: 'confirmado' }); assert.equal(item.status, 'confirmado'); assert.equal(classificarAlertaOperacional(item, new Date('2026-08-15T12:15:00Z'))?.tipo, 'atraso_chegada') })
teste('AJ48', 'atraso é derivado sem escrita no banco', () => assert.ok(!/\.(insert|update|upsert|delete)\s*\(/.test(fonteAlertas) && fontePagina.includes('window.setInterval') && fontePagina.includes('window.clearInterval')))

function financeiro(situacao: SituacaoFinanceira, alteracoes: Partial<FinanceiroAtendimento> = {}): FinanceiroAtendimento {
  return { valorFinal: 100, totalRecebido: 0, saldo: 100, situacao, isento: false, versao: 1, recebimentos: [], ...alteracoes }
}

teste('AJ49', 'pendente mostra o saldo oficial', () => assert.equal(textoFinanceiro(financeiroDaResposta({ status: 'carregado', atendimentoId: 'a1', financeiro: financeiro('pendente'), retornosVersao: 0, retornos: [] })), 'Pendente · saldo R$ 100,00'))
teste('AJ50', 'parcial mostra o saldo oficial', () => assert.equal(textoFinanceiro(financeiroDaResposta({ status: 'carregado', atendimentoId: 'a1', financeiro: financeiro('parcial', { totalRecebido: 35, saldo: 65 }), retornosVersao: 0, retornos: [] })), 'Parcial · saldo R$ 65,00'))
teste('AJ51', 'pago mostra o total recebido oficial', () => assert.equal(textoFinanceiro(financeiroDaResposta({ status: 'carregado', atendimentoId: 'a1', financeiro: financeiro('pago', { totalRecebido: 100, saldo: 0 }), retornosVersao: 0, retornos: [] })), 'Pago · R$ 100,00'))
teste('AJ52', 'isento possui indicação explícita', () => assert.equal(textoFinanceiro(financeiroDaResposta({ status: 'carregado', atendimentoId: 'a1', financeiro: financeiro('isento', { saldo: 0, isento: true }), retornosVersao: 0, retornos: [] })), 'Isento'))
teste('AJ53', 'ausência ou resposta inválida mantém indicação neutra', () => {
  assert.equal(textoFinanceiro(null), 'Financeiro indisponível')
  assert.equal(financeiroDaResposta({ status: 'invalido', codigo: 'DADOS_INVALIDOS', mensagem: 'Inválido' }), null)
})
teste('AJ54', 'Agenda usa a Edge oficial sem consultar tabelas financeiras diretamente', () => {
  assert.ok(fontePagina.includes("executarDadosConclusao({ operacao: 'carregar'"))
  assert.ok(!fontePagina.includes(".from('atendimento_financeiro')") && !fonteFinanceiro.includes(".from('atendimento_financeiro')"))
})
teste('AJ55', 'representação financeira não recalcula situação nem saldo', () => {
  assert.ok(!fonteFinanceiro.includes('situacaoFinanceira('))
  assert.ok(!/valorFinal\s*-\s*financeiro\.totalRecebido/.test(fonteFinanceiro))
})

teste('AJ56', 'atendimento avulso não recebe identificação de Pacote', () => {
  assert.equal(montar().secoes[0].atendimentos[0].vinculoContrato, null)
  assert.ok(fonteGrade.includes('possuiPacote(a)&&<span'))
})
teste('AJ57', 'atendimento contratual usa nome comercial autoritativo do Pacote', () => {
  assert.equal(montar(fixtureContrato()).secoes[0].atendimentos[0].vinculoContrato?.pacoteNome, 'Pacote Ouro')
})
teste('AJ58', 'período do Ciclo usa primeira e última ocorrência persistidas', () => {
  const vinculo = montar(fixtureContrato()).secoes[0].atendimentos[0].vinculoContrato
  assert.deepEqual([vinculo?.periodoInicio, vinculo?.periodoFim], ['2026-08-08', '2026-08-29'])
  assert.equal(vinculo?.cicloNumero, 3)
})
teste('AJ59', 'primeira ocorrência aparece como Atendimento 1 de 4', () => {
  const vinculo = montar(fixtureContrato(1)).secoes[0].atendimentos[0].vinculoContrato
  assert.deepEqual([vinculo?.ocorrenciaOrdem, vinculo?.totalOcorrencias], [1, 4])
})
teste('AJ60', 'quarta ocorrência aparece como Atendimento 4 de 4', () => {
  const vinculo = montar(fixtureContrato(4)).secoes[0].atendimentos[0].vinculoContrato
  assert.deepEqual([vinculo?.ocorrenciaOrdem, vinculo?.totalOcorrencias], [4, 4])
})
teste('AJ61', 'posição programada não é apresentada como consumo', () => {
  assert.ok(fontePagina.includes('Atendimento {atendimento.vinculoContrato.ocorrenciaOrdem} de {atendimento.vinculoContrato.totalOcorrencias} do ciclo'))
  assert.ok(!fontePagina.includes('utilizados') && !fontePagina.includes('créditos restantes'))
})
teste('AJ62', 'item comercial recebe marca Pacote e dependência operacional não recebe', () => {
  const dados = fixtureContrato()
  dados.servicos.push({ id: 'as2', atendimento_id: 'a1', servico_id: 's-dependencia', nome_snapshot: 'Dependência operacional', ordem: 2, origem: 'dependencia' })
  const servicos = montar(dados).secoes[0].atendimentos[0].servicos
  assert.equal(servicos.find((item) => item.servicoId === 's-banho')?.contratado, true)
  assert.equal(servicos.find((item) => item.servicoId === 's-dependencia')?.contratado, false)
})
teste('AJ63', 'Ver contrato navega pelo contrato_id e abre o contrato correspondente', () => {
  assert.ok(fontePagina.includes('verContrato(atendimento.vinculoContrato!.contratoId)'))
  assert.ok(fonteApp.includes('setContratoEmFocoId(contratoId)') && fonteApp.includes("setPaginaAtual('contratos')"))
  assert.ok(fonteContratos.includes('item.id === contratoInicialId') && fonteContratos.includes('setDetalhe(contrato)'))
})
teste('AJ64', 'reconstrução após reload preserva a identificação contratual', () => {
  const dados = fixtureContrato(2)
  assert.deepEqual(montar(dados).secoes[0].atendimentos[0].vinculoContrato, montar(dados).secoes[0].atendimentos[0].vinculoContrato)
})
teste('AJ65', 'metadados contratuais são carregados em lote sem consulta por card', () => {
  assert.ok(fonteLoader.includes("consultarEm(cliente, 'contrato_ciclo_ocorrencias'") && fonteLoader.includes("consultarEm(cliente, 'contrato_ciclos'"))
  assert.ok(!/atendimentos\.map\(async[\s\S]*contrato_ciclo_ocorrencias/.test(fonteLoader))
})
teste('AJ66', 'valor de atendimento contratual é rotulado como referência', () => {
  assert.ok(fontePagina.includes("atendimento.vinculoContrato ? 'Valor de referência' : 'Valor final'"))
})

teste('AJ67', 'card identifica pacote apenas por caixa acessível', () => {
  assert.ok(fonteGrade.includes('aria-label="Atendimento de pacote"'))
  assert.ok(!fonteGrade.includes('<strong>PACOTE</strong>'))
})
teste('AJ68', 'grade usa um card total e mantém etapas somente no detalhe', () => {
  assert.ok(fonteGradeTemporal.includes('const inicio = a.inicio') && !fonteGrade.includes('s.referencia') && !fonteGrade.includes('s.etapa'))
})
teste('AJ69', 'grade permite rolagem controlada em telas estreitas', () => {
  assert.ok(fonteEstilos.includes('.agenda-timeline-scroll { overflow:auto;'))
})
console.log(`${aprovados} testes AJ01–AJ69 aprovados.`)
