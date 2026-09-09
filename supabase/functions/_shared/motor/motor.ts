import { alocacoesPossiveis } from './recursos.ts'
import { calcularEtapas, resolverServicos, validarElegibilidade } from './regras.ts'
import { diaSemana } from './tempo.ts'
import { ciclosAtivosNaData } from './ciclosTaxidog.ts'
import type { CicloTaxidogMotor, DadosDisponibilidade, EntradaDisponibilidade, EsperaPlanejada, EtapaCalculada, EtapaPlanejada, IntervaloMinutos, OpcaoDisponibilidade, ResultadoDisponibilidade, ServicoResolvido } from './tipos.ts'

type PlanoParcial = { etapas: EtapaPlanejada[]; esperas: EsperaPlanejada[] }

export function calcularDisponibilidade(entrada: EntradaDisponibilidade, dados: DadosDisponibilidade): ResultadoDisponibilidade {
  return calcularDisponibilidadeInterna(entrada, dados, 1, null)
}

export function calcularPossibilidadesDisponibilidade(entrada: EntradaDisponibilidade, dados: DadosDisponibilidade, limitePorHorario = 10): ResultadoDisponibilidade {
  return calcularDisponibilidadeInterna(entrada, dados, Math.max(1, limitePorHorario), null)
}

export function calcularDisponibilidadeNoHorario(
  entrada: EntradaDisponibilidade,
  dados: DadosDisponibilidade,
  horarioEscolhido: number,
): ResultadoDisponibilidade {
  return calcularDisponibilidadeInterna(entrada, dados, 1, horarioEscolhido)
}

function calcularDisponibilidadeInterna(entrada: EntradaDisponibilidade, dados: DadosDisponibilidade, limitePorHorario: number, horarioEscolhido: number | null): ResultadoDisponibilidade {
  if (!dados.funcionamentoConfigurado) return resultado('AGENDA_NAO_CONFIGURADA', entrada, [], ['Agenda ainda não configurada.'])
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entrada.data)) return resultado('SERVICO_INVALIDO', entrada, [], ['Data inválida.'])
  if (entrada.tipoPlanejamento !== 'normal') return resultado('SERVICO_INVALIDO', entrada, [], ['O Motor V1 aceita apenas planejamento normal.'])
  const modalidade = entrada.modalidade ?? 'sem_transporte'
  if (modalidade === 'taxidog' && !entrada.cicloTaxidogId) return resultado('SERVICO_INVALIDO', entrada, [], ['Informe o ciclo TaxiDog pretendido.'])
  if (entrada.preferenciaFuncionario !== 'automatico' && !entrada.funcionarioPreferidoId) return resultado('SERVICO_INVALIDO', entrada, [], ['Informe o funcionário escolhido.'])
  const pet = dados.pets.find((item) => item.id === entrada.petId)
  if (!pet) return resultado('PET_INELEGIVEL', entrada, [], ['Pet não encontrado.'])

  let servicos: ServicoResolvido[]
  let etapas: EtapaCalculada[]
  try {
    servicos = resolverServicos(entrada, dados)
    const inelegibilidades = validarElegibilidade(pet, servicos, dados)
    if (inelegibilidades.length) return resultado('PET_INELEGIVEL', entrada, [], inelegibilidades)
    etapas = calcularEtapas(pet, servicos, dados)
  } catch (erro) {
    return resultado('SERVICO_INVALIDO', entrada, [], [erro instanceof Error ? erro.message : 'Configuração de serviço inválida.'])
  }

  const dia = diaSemana(entrada.data)
  const cicloTaxidog = modalidade === 'taxidog'
    ? ciclosAtivosNaData(dados.ciclosTaxidog, entrada.data).find((item) => item.id === entrada.cicloTaxidogId) ?? null
    : null
  if (modalidade === 'taxidog' && !cicloTaxidog) return resultado('SEM_DISPONIBILIDADE', entrada, [], ['O ciclo TaxiDog não está ativo nesta data.'])
  const blocosLoja = blocosDoDia(entrada.data, dia, dados)
  const blocos = cicloTaxidog ? restringirAoCiclo(blocosLoja, cicloTaxidog) : blocosLoja
  if (!blocosLoja.length) return resultado('LOJA_FECHADA', entrada, [], ['O estabelecimento está fechado nesta data.'])
  if (!blocos.length) return resultado('SEM_DISPONIBILIDADE', entrada, [], ['O ciclo TaxiDog não possui período operacional dentro do funcionamento da loja.'])
  const problemasRecursos = diagnosticarConfiguracaoRecursos(etapas, dia, entrada, dados)
  if (problemasRecursos.length) return resultado('SEM_DISPONIBILIDADE', entrada, [], problemasRecursos)
  const opcoes: OpcaoDisponibilidade[] = []
  for (const bloco of blocos) {
    for (const candidato of candidatosDoBloco(
      bloco,
      dados.configuracao.granularidadeMinutos,
      horarioEscolhido,
    )) {
      opcoes.push(...avaliarHorario(
        candidato, bloco, etapas, dia, pet, entrada, dados,
        servicos, cicloTaxidog, limitePorHorario,
      ))
    }
  }

  const opcoesUnicas = limitePorHorario === 1 ? [...opcoes.reduce((mapa, opcao) => {
    const atual = mapa.get(opcao.horarioApresentado)
    if (!atual || compararOpcoes(opcao, atual) < 0) mapa.set(opcao.horarioApresentado, opcao)
    return mapa
  }, new Map<number, OpcaoDisponibilidade>()).values()].sort(compararOpcoes) : opcoes.sort(compararOpcoes)
  return opcoesUnicas.length ? resultado('OK', entrada, opcoesUnicas, []) : resultado('SEM_DISPONIBILIDADE', entrada, [], ['Nenhuma jornada operacional completa pôde ser montada.'])
}

function candidatosDoBloco(
  bloco: IntervaloMinutos,
  granularidade: number,
  horarioEscolhido: number | null,
) {
  const primeiro = alinharInicio(bloco.inicio, granularidade)
  if (horarioEscolhido !== null) {
    const valido = Number.isInteger(horarioEscolhido)
      && horarioEscolhido >= primeiro
      && horarioEscolhido < bloco.fim
      && (horarioEscolhido - primeiro) % granularidade === 0
    return valido ? [horarioEscolhido] : []
  }
  const candidatos: number[] = []
  for (let candidato = primeiro; candidato < bloco.fim; candidato += granularidade) {
    candidatos.push(candidato)
  }
  return candidatos
}

function avaliarHorario(
  candidato: number,
  bloco: IntervaloMinutos,
  etapas: EtapaCalculada[],
  dia: number,
  pet: DadosDisponibilidade['pets'][number],
  entrada: EntradaDisponibilidade,
  dados: DadosDisponibilidade,
  servicos: ServicoResolvido[],
  cicloTaxidog: CicloTaxidogMotor | null,
  limitePorHorario: number,
) {
  const planos = planejarEtapas(
    etapas, 0, candidato, bloco, dia, pet, entrada, dados,
    { etapas: [], esperas: [] },
  )
  return planos
    .sort((a, b) => compararPlanos(a, b, entrada))
    .slice(0, limitePorHorario)
    .map((plano) => montarOpcao(candidato, servicos, plano, cicloTaxidog))
}

function planejarEtapas(etapas: EtapaCalculada[], indice: number, instanteDisponivel: number, bloco: IntervaloMinutos, dia: number, pet: DadosDisponibilidade['pets'][number], entrada: EntradaDisponibilidade, dados: DadosDisponibilidade, plano: PlanoParcial): PlanoParcial[] {
  if (indice >= etapas.length) return [plano]
  const etapa = etapas[indice]
  const limiteEspera = indice === 0 ? 0 : etapa.politicaEsperaAntes === 'padrao' ? dados.configuracao.esperaNormalMinutos : etapa.politicaEsperaAntes === 'personalizada' ? etapa.esperaAntesMinutos ?? -1 : bloco.fim - instanteDisponivel
  if (limiteEspera < 0) return []
  const ultimoInicio = Math.min(instanteDisponivel + limiteEspera, bloco.fim - etapa.duracaoCalculada)
  const solucoes: PlanoParcial[] = []
  for (let inicio = instanteDisponivel; inicio <= ultimoInicio; inicio += 1) {
    const fim = inicio + etapa.duracaoCalculada
    const alocacoes = alocacoesPossiveis(etapa, { inicio, fim }, dia, pet, entrada, dados, plano.etapas)
    for (const alocacao of alocacoes) {
      const espera = inicio > instanteDisponivel ? [{ antesDaEtapaId: etapa.id, inicio: instanteDisponivel, fim: inicio, duracaoMinutos: inicio - instanteDisponivel, politica: etapa.politicaEsperaAntes }] : []
      const etapaPlanejada: EtapaPlanejada = { etapaId: etapa.id, servicoId: etapa.servicoId, servicoNome: etapa.servicoNome, nome: etapa.nome, inicio, fim, duracaoBaseMinutos: etapa.duracaoBaseCalculada, duracaoMinutos: etapa.duracaoCalculada, funcionarios: alocacao.funcionarios, equipamentos: alocacao.equipamentos, modificadoresAplicados: etapa.modificadoresAplicados, contribuicoesAcopladas: etapa.contribuicoesAcopladas }
      solucoes.push(...planejarEtapas(etapas, indice + 1, fim, bloco, dia, pet, entrada, dados, { etapas: [...plano.etapas, etapaPlanejada], esperas: [...plano.esperas, ...espera] }))
    }
  }
  return solucoes
}

function blocosDoDia(data: string, dia: number, dados: DadosDisponibilidade) {
  const excecao = dados.excecoesEstabelecimento.find((item) => item.data === data)
  if (excecao) return excecao.fechado ? [] : excecao.blocos
  return dados.blocosEstabelecimento.filter((item) => item.diaSemana === dia && item.ativo).map(({ inicio, fim }) => ({ inicio, fim })).sort((a, b) => a.inicio - b.inicio)
}

function restringirAoCiclo(blocos: IntervaloMinutos[], ciclo: CicloTaxidogMotor) {
  // Sem a chegada individual de cada pet, o fim da coleta e o primeiro
  // instante operacional seguro do ciclo.
  return blocos.map((bloco) => ({
    inicio: Math.max(bloco.inicio, ciclo.coletaFim),
    fim: Math.min(bloco.fim, ciclo.conclusaoLimite),
  })).filter((bloco) => bloco.fim > bloco.inicio)
}

function diagnosticarConfiguracaoRecursos(etapas: EtapaCalculada[], dia: number, entrada: EntradaDisponibilidade, dados: DadosDisponibilidade) {
  const problemas = new Set<string>()
  for (const etapa of etapas) {
    if (etapa.recursos.some((item) => item.tipo === 'funcionario')) {
      const candidatos = dados.funcionarios.filter((funcionario) => {
        if (!funcionario.ativo) return false
        if (entrada.preferenciaFuncionario === 'obrigatorio' && funcionario.id !== entrada.funcionarioPreferidoId) return false
        const habilitado = etapa.habilitacoesNecessarias.every((habilitacao) => {
          if (!dados.habilitacoes.servicos.some((item) => item.funcionarioId === funcionario.id && item.servicoId === habilitacao.servicoId && item.ativo)) return false
          const regraEtapa = dados.habilitacoes.etapas.find((item) => item.funcionarioId === funcionario.id && item.servicoEtapaId === habilitacao.servicoEtapaId)
          return !regraEtapa || regraEtapa.ativo
        })
        return habilitado && dados.jornadas.some((item) => item.funcionarioId === funcionario.id && item.diaSemana === dia && item.ativo)
      })
      if (!candidatos.length) problemas.add(entrada.preferenciaFuncionario === 'obrigatorio' ? `O funcionário obrigatório não está habilitado ou não possui jornada para ${etapa.servicoNome} — ${etapa.nome}.` : `Nenhum funcionário habilitado com jornada ativa para ${etapa.servicoNome} — ${etapa.nome}.`)
    }
    for (const recurso of etapa.recursos.filter((item) => item.tipo === 'equipamento')) {
      const equipamento = dados.equipamentos.find((item) => item.id === recurso.equipamentoId && item.ativo)
      const unidades = dados.unidadesEquipamentos.filter((item) => item.equipamentoId === recurso.equipamentoId && item.ativo)
      const perfis = dados.perfisCapacidade.filter((item) => item.equipamentoId === recurso.equipamentoId && item.ativo)
      if (!equipamento || unidades.length < recurso.quantidade || !perfis.length) problemas.add(`Equipamento, unidades ou capacidade não configurados para ${etapa.servicoNome} — ${etapa.nome}.`)
    }
  }
  return [...problemas]
}

function montarOpcao(candidato: number, servicos: ServicoResolvido[], plano: PlanoParcial, cicloTaxidog: CicloTaxidogMotor | null = null): OpcaoDisponibilidade {
  const inicio = plano.etapas[0].inicio
  const conclusao = plano.etapas.at(-1)!.fim
  const processamento = plano.etapas.reduce((total, item) => total + item.duracaoMinutos, 0)
  const espera = plano.esperas.reduce((total, item) => total + item.duracaoMinutos, 0)
  return { horarioApresentado: candidato, inicioOperacional: inicio, conclusaoPrevista: conclusao, cicloTaxidog, servicos, etapas: plano.etapas, esperas: plano.esperas, duracaoProcessamento: processamento, tempoEspera: espera, duracaoTotal: conclusao - inicio, trocasFuncionario: contarTrocas(plano.etapas.map((item) => item.funcionarios.map((funcionario) => funcionario.id).sort().join(','))), trocasRecurso: contarTrocas(plano.etapas.map((item) => [...item.funcionarios.map((funcionario) => `f:${funcionario.id}`), ...item.equipamentos.map((equipamento) => `e:${equipamento.unidadeId}`)].sort().join(','))) }
}

function compararPlanos(a: PlanoParcial, b: PlanoParcial, entrada: EntradaDisponibilidade) {
  const opcaoA = montarOpcao(a.etapas[0].inicio, [], a)
  const opcaoB = montarOpcao(b.etapas[0].inicio, [], b)
  const preferenciaA = penalidadePreferencia(a, entrada)
  const preferenciaB = penalidadePreferencia(b, entrada)
  return preferenciaA - preferenciaB || Number(opcaoA.tempoEspera > 0) - Number(opcaoB.tempoEspera > 0) || opcaoA.tempoEspera - opcaoB.tempoEspera || opcaoA.trocasFuncionario - opcaoB.trocasFuncionario || opcaoA.trocasRecurso - opcaoB.trocasRecurso || opcaoA.conclusaoPrevista - opcaoB.conclusaoPrevista
}

function compararOpcoes(a: OpcaoDisponibilidade, b: OpcaoDisponibilidade) {
  return Number(a.tempoEspera > 0) - Number(b.tempoEspera > 0) || a.tempoEspera - b.tempoEspera || a.trocasFuncionario - b.trocasFuncionario || a.trocasRecurso - b.trocasRecurso || a.conclusaoPrevista - b.conclusaoPrevista || a.horarioApresentado - b.horarioApresentado
}

function penalidadePreferencia(plano: PlanoParcial, entrada: EntradaDisponibilidade) {
  if (entrada.preferenciaFuncionario !== 'preferencial') return 0
  return plano.etapas.reduce((total, etapa) => total + etapa.funcionarios.filter((item) => item.id !== entrada.funcionarioPreferidoId).length, 0)
}

function contarTrocas(valores: string[]) {
  const relevantes = valores.filter(Boolean)
  return relevantes.slice(1).reduce((total, valor, indice) => total + Number(valor !== relevantes[indice]), 0)
}

function alinharInicio(inicio: number, granularidade: number) {
  return Math.ceil(inicio / granularidade) * granularidade
}

function resultado(estado: ResultadoDisponibilidade['estado'], entrada: EntradaDisponibilidade, opcoes: OpcaoDisponibilidade[], motivos: string[]): ResultadoDisponibilidade {
  return { estado, data: entrada.data, opcoes, motivos }
}
