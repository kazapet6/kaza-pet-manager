import { calcularPossibilidadesDisponibilidade } from './motor.ts'
import type { DadosDisponibilidade, LimitesPlanejamentoLote, OcupacoesSimuladas, OpcaoDisponibilidade, PlanejamentoPetLote, ResultadoPlanejamentoLote, SolicitacaoPlanejamentoLote } from './tipos.ts'

export const LIMITES_PLANEJADOR_DEV: LimitesPlanejamentoLote = {
  maximoPets: 5,
  maximoOpcoesPorPet: 10,
  maximoEstados: 5000,
}

type EstadoBusca = {
  estadosExplorados: number
  houveBacktracking: boolean
  limiteAtingido: boolean
  opcoesLimitadas: boolean
}

export function planejarLoteEmMemoria(solicitacoes: SolicitacaoPlanejamentoLote[], dadosBase: DadosDisponibilidade, limites: LimitesPlanejamentoLote = LIMITES_PLANEJADOR_DEV, ocupacoes?: Partial<OcupacoesSimuladas>): ResultadoPlanejamentoLote {
  const erro = validarEntrada(solicitacoes, dadosBase, limites)
  if (erro) return resultado('ENTRADA_INVALIDA', [], { estadosExplorados: 0, houveBacktracking: false, limiteAtingido: false, opcoesLimitadas: false }, [erro])

  const dados = aplicarOcupacoes(dadosBase, ocupacoes)
  const estado: EstadoBusca = { estadosExplorados: 0, houveBacktracking: false, limiteAtingido: false, opcoesLimitadas: false }
  const solucao = buscar(solicitacoes, dados, [], limites, estado)
  if (solucao) return resultado('SOLUCAO', solucao, estado, [])
  if (estado.limiteAtingido) return resultado('BUSCA_INCONCLUSIVA', [], estado, ['O limite de estados foi atingido antes de concluir a busca.'])
  if (estado.opcoesLimitadas) return resultado('BUSCA_INCONCLUSIVA', [], estado, ['A busca esgotou as alternativas selecionadas, mas havia outras opções além do limite por pet.'])
  return resultado('SEM_DISPONIBILIDADE', [], estado, ['Não existe uma combinação operacional completa para o conjunto informado.'])
}

function buscar(restantes: SolicitacaoPlanejamentoLote[], dados: DadosDisponibilidade, escolhidos: PlanejamentoPetLote[], limites: LimitesPlanejamentoLote, estado: EstadoBusca): PlanejamentoPetLote[] | null {
  if (estado.estadosExplorados >= limites.maximoEstados) {
    estado.limiteAtingido = true
    return null
  }
  estado.estadosExplorados += 1
  if (!restantes.length) return escolhidos

  const avaliados = restantes.map((solicitacao) => {
    const resultadoPet = calcularPossibilidadesDisponibilidade(solicitacao.entrada, dados, limites.maximoOpcoesPorPet + 1)
    if (resultadoPet.opcoes.length > limites.maximoOpcoesPorPet) estado.opcoesLimitadas = true
    return { solicitacao, opcoes: selecionarAlternativas(resultadoPet.opcoes, limites.maximoOpcoesPorPet), folga: menorFolga(resultadoPet.opcoes) }
  })
  if (avaliados.some((item) => !item.opcoes.length)) return null
  avaliados.sort((a, b) => a.opcoes.length - b.opcoes.length || a.folga - b.folga || a.solicitacao.id.localeCompare(b.solicitacao.id))
  const escolhido = avaliados[0]
  const pet = dados.pets.find((item) => item.id === escolhido.solicitacao.entrada.petId)!
  const proximos = restantes.filter((item) => item.id !== escolhido.solicitacao.id)

  for (let indice = 0; indice < escolhido.opcoes.length; indice += 1) {
    if (estado.estadosExplorados >= limites.maximoEstados) {
      estado.limiteAtingido = true
      return null
    }
    const opcao = escolhido.opcoes[indice]
    const planejamento: PlanejamentoPetLote = { solicitacaoId: escolhido.solicitacao.id, petId: pet.id, petNome: pet.nome, opcao }
    const resposta = buscar(proximos, materializarOpcao(dados, pet, opcao, escolhido.solicitacao.id), [...escolhidos, planejamento], limites, estado)
    if (resposta) return resposta
    if (indice < escolhido.opcoes.length - 1 || proximos.length) estado.houveBacktracking = true
    if (estado.limiteAtingido) return null
  }
  return null
}

function selecionarAlternativas(opcoes: OpcaoDisponibilidade[], limite: number) {
  const grupos = new Map<number, OpcaoDisponibilidade[]>()
  for (const opcao of opcoes) grupos.set(opcao.horarioApresentado, [...(grupos.get(opcao.horarioApresentado) ?? []), opcao])
  const selecionadas: OpcaoDisponibilidade[] = []
  for (let camada = 0; selecionadas.length < limite; camada += 1) {
    let adicionou = false
    for (const grupo of grupos.values()) {
      if (grupo[camada]) { selecionadas.push(grupo[camada]); adicionou = true }
      if (selecionadas.length >= limite) break
    }
    if (!adicionou) break
  }
  return selecionadas
}

function materializarOpcao(dados: DadosDisponibilidade, pet: DadosDisponibilidade['pets'][number], opcao: OpcaoDisponibilidade, prefixo: string): DadosDisponibilidade {
  return {
    ...dados,
    reservasFuncionarios: [
      ...dados.reservasFuncionarios,
      ...opcao.etapas.flatMap((etapa, etapaIndice) => etapa.funcionarios.map((funcionario) => ({ id: `${prefixo}-f-${etapaIndice}-${funcionario.id}`, funcionarioId: funcionario.id, inicio: etapa.inicio, fim: etapa.fim }))),
    ],
    reservasEquipamentos: [
      ...dados.reservasEquipamentos,
      ...opcao.etapas.flatMap((etapa, etapaIndice) => etapa.equipamentos.map((equipamento) => ({ id: `${prefixo}-e-${etapaIndice}-${equipamento.unidadeId}`, unidadeId: equipamento.unidadeId, inicio: etapa.inicio, fim: etapa.fim, porte: pet.porte, sexo: pet.sexo }))),
    ],
  }
}

function aplicarOcupacoes(dados: DadosDisponibilidade, ocupacoes?: Partial<OcupacoesSimuladas>): DadosDisponibilidade {
  return { ...dados, reservasFuncionarios: [...dados.reservasFuncionarios, ...(ocupacoes?.funcionarios ?? [])], reservasEquipamentos: [...dados.reservasEquipamentos, ...(ocupacoes?.equipamentos ?? [])] }
}

function validarEntrada(solicitacoes: SolicitacaoPlanejamentoLote[], dados: DadosDisponibilidade, limites: LimitesPlanejamentoLote) {
  if (!solicitacoes.length) return 'Adicione pelo menos um pet ao lote.'
  if (solicitacoes.length > limites.maximoPets) return `O limite desta fase é de ${limites.maximoPets} pets.`
  if (new Set(solicitacoes.map((item) => item.id)).size !== solicitacoes.length) return 'Cada solicitação do lote precisa de um identificador único.'
  if (new Set(solicitacoes.map((item) => item.entrada.data)).size !== 1) return 'Todos os pets do lote devem usar a mesma data nesta fase.'
  if (solicitacoes.some((item) => !dados.pets.some((pet) => pet.id === item.entrada.petId))) return 'Um dos pets não foi encontrado no snapshot.'
  return null
}

function menorFolga(opcoes: OpcaoDisponibilidade[]) {
  return Math.min(...opcoes.map((opcao) => opcao.cicloTaxidog ? opcao.cicloTaxidog.conclusaoLimite - opcao.conclusaoPrevista : Number.MAX_SAFE_INTEGER))
}

function resultado(estado: ResultadoPlanejamentoLote['estado'], planejamentos: PlanejamentoPetLote[], busca: EstadoBusca, motivos: string[]): ResultadoPlanejamentoLote {
  const conclusao = planejamentos.length ? Math.max(...planejamentos.map((item) => item.opcao.conclusaoPrevista)) : null
  const semTransporte = planejamentos.length > 0 && planejamentos.every((item) => !item.opcao.cicloTaxidog)
  return { estado, planejamentos, conclusaoUltimoPet: conclusao, retiradaPrevistaGrupo: semTransporte ? conclusao : null, estadosExplorados: busca.estadosExplorados, houveBacktracking: busca.houveBacktracking, ordemEscolhida: planejamentos.map((item) => item.solicitacaoId), motivos }
}

export function adicionarOcupacoesAoSnapshot(dados: DadosDisponibilidade, ocupacoes: Partial<OcupacoesSimuladas>) {
  return aplicarOcupacoes(dados, ocupacoes)
}
