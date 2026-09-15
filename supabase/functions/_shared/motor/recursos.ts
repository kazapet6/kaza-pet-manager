import type { AlocacaoEquipamento, AlocacaoFuncionario, DadosDisponibilidade, EntradaDisponibilidade, EtapaCalculada, EtapaPlanejada, IntervaloMinutos, PetMotor, ReservaEquipamentoMotor, ReservaFuncionarioMotor } from './tipos.ts'
import { combinacoes, contem, sobrepoe } from './tempo.ts'

type RecursosPlanejados = Pick<EtapaPlanejada, 'inicio' | 'fim' | 'funcionarios' | 'equipamentos'>[]
export type AlocacaoRecursos = { funcionarios: AlocacaoFuncionario[]; equipamentos: AlocacaoEquipamento[] }

export function alocacoesPossiveis(etapa: EtapaCalculada, periodo: IntervaloMinutos, diaSemana: number, pet: PetMotor, entrada: EntradaDisponibilidade, dados: DadosDisponibilidade, planejados: RecursosPlanejados) {
  const requisitosFuncionarios = etapa.recursos.filter((item) => item.tipo === 'funcionario')
  const requisitosEquipamentos = etapa.recursos.filter((item) => item.tipo === 'equipamento')
  let funcionarios: AlocacaoFuncionario[][] = [[]]
  for (const requisito of requisitosFuncionarios) {
    const candidatos = funcionariosDisponiveis(etapa, periodo, diaSemana, entrada, dados, planejados)
    funcionarios = combinacoes(candidatos, requisito.quantidade)
    if (!funcionarios.length) return []
  }

  let equipamentos: AlocacaoEquipamento[][] = [[]]
  for (const requisito of requisitosEquipamentos) {
    if (!requisito.equipamentoId) return []
    const candidatos = unidadesDisponiveis(requisito.equipamentoId, periodo, diaSemana, pet, dados, planejados)
    const escolhas = combinacoes(candidatos, requisito.quantidade)
    equipamentos = produto(equipamentos, escolhas).filter((grupo) => new Set(grupo.map((item) => item.unidadeId)).size === grupo.length)
    if (!equipamentos.length) return []
  }

  return produtoRecursos(funcionarios, equipamentos)
}

function funcionariosDisponiveis(etapa: EtapaCalculada, periodo: IntervaloMinutos, dia: number, entrada: EntradaDisponibilidade, dados: DadosDisponibilidade, planejados: RecursosPlanejados) {
  const candidatos = dados.funcionarios.filter((funcionario) => {
    if (!funcionario.ativo) return false
    if (entrada.preferenciaFuncionario === 'obrigatorio' && funcionario.id !== entrada.funcionarioPreferidoId) return false
    if (!etapa.habilitacoesNecessarias.every((habilitacao) => funcionarioHabilitado(funcionario.id, habilitacao, dados))) return false
    const jornadas = dados.jornadas.filter((item) => item.funcionarioId === funcionario.id && item.diaSemana === dia && item.ativo)
    if (!jornadas.some((item) => contem(item, periodo))) return false
    if (dados.intervalosFuncionarios.some((item) => item.funcionarioId === funcionario.id && item.diaSemana === dia && item.ativo && sobrepoe(item, periodo))) return false
    if (dados.reservasFuncionarios.some((item) => item.funcionarioId === funcionario.id && sobrepoe(item, periodo))) return false
    return !planejados.some((item) => item.funcionarios.some((alocacao) => alocacao.id === funcionario.id) && sobrepoe(item, periodo))
  }).map((item) => ({ id: item.id, nome: item.nome }))

  return candidatos.sort((a, b) => {
    const preferidoA = a.id === entrada.funcionarioPreferidoId ? 0 : 1
    const preferidoB = b.id === entrada.funcionarioPreferidoId ? 0 : 1
    return preferidoA - preferidoB || a.nome.localeCompare(b.nome)
  })
}

function funcionarioHabilitado(funcionarioId: string, habilitacao: { servicoId: string; servicoEtapaId: string }, dados: DadosDisponibilidade) {
  if (!dados.habilitacoes.servicos.some((item) => item.funcionarioId === funcionarioId && item.servicoId === habilitacao.servicoId && item.ativo)) return false
  const regraEtapa = dados.habilitacoes.etapas.find((item) => item.funcionarioId === funcionarioId && item.servicoEtapaId === habilitacao.servicoEtapaId)
  return !regraEtapa || regraEtapa.ativo
}

function unidadesDisponiveis(equipamentoId: string, periodo: IntervaloMinutos, dia: number, pet: PetMotor, dados: DadosDisponibilidade, planejados: RecursosPlanejados) {
  const equipamento = dados.equipamentos.find((item) => item.id === equipamentoId && item.ativo)
  if (!equipamento) return []
  const supervisores = equipamento.exigeSupervisaoHumana
    ? coberturaSupervisao(periodo, dia, dados)
    : []
  if (equipamento.exigeSupervisaoHumana && !supervisores) return []
  return dados.unidadesEquipamentos.filter((item) => item.equipamentoId === equipamentoId && item.ativo).filter((unidade) => capacidadeValida(unidade.id, equipamentoId, equipamento.separarPorSexo, periodo, pet, dados, planejados)).sort((a, b) => a.numero - b.numero).map((unidade) => ({ equipamentoId, equipamentoNome: equipamento.nome, unidadeId: unidade.id, unidadeNome: unidade.nome || `Unidade ${unidade.numero}`, numero: unidade.numero, supervisores: supervisores ?? [] }))
}

// Supervisao nao e reserva exclusiva: ocupacoes operacionais do funcionario
// nao sao consultadas. Jornadas podem se complementar, mas nao podem deixar
// nenhum minuto do uso do equipamento sem cobertura.
function coberturaSupervisao(periodo: IntervaloMinutos, dia: number, dados: DadosDisponibilidade) {
  const segmentos = dados.funcionarios.filter((item) => item.ativo).flatMap((funcionario) =>
    dados.jornadas
      .filter((jornada) => jornada.funcionarioId === funcionario.id && jornada.diaSemana === dia && jornada.ativo)
      .flatMap((jornada) => subtrairIntervalos(
        { inicio: Math.max(jornada.inicio, periodo.inicio), fim: Math.min(jornada.fim, periodo.fim) },
        dados.intervalosFuncionarios.filter((item) => item.funcionarioId === funcionario.id && item.diaSemana === dia && item.ativo),
      ).map((intervalo) => ({ ...intervalo, id: funcionario.id, nome: funcionario.nome }))),
  ).filter((item) => item.fim > item.inicio)

  const cobertura = [] as { id: string; nome: string; inicio: number; fim: number }[]
  let cursor = periodo.inicio
  while (cursor < periodo.fim) {
    const melhor = segmentos
      .filter((item) => item.inicio <= cursor && item.fim > cursor)
      .sort((a, b) => b.fim - a.fim || a.nome.localeCompare(b.nome))[0]
    if (!melhor) return null
    const fim = Math.min(melhor.fim, periodo.fim)
    cobertura.push({ id: melhor.id, nome: melhor.nome, inicio: cursor, fim })
    cursor = fim
  }
  return cobertura
}

function subtrairIntervalos(base: IntervaloMinutos, intervalos: IntervaloMinutos[]) {
  if (base.fim <= base.inicio) return []
  let partes = [base]
  for (const intervalo of intervalos) {
    partes = partes.flatMap((parte) => {
      if (!sobrepoe(parte, intervalo)) return [parte]
      return [
        { inicio: parte.inicio, fim: Math.min(parte.fim, intervalo.inicio) },
        { inicio: Math.max(parte.inicio, intervalo.fim), fim: parte.fim },
      ].filter((item) => item.fim > item.inicio)
    })
  }
  return partes
}

function capacidadeValida(unidadeId: string, equipamentoId: string, separarPorSexo: boolean, periodo: IntervaloMinutos, pet: PetMotor, dados: DadosDisponibilidade, planejados: RecursosPlanejados) {
  const existentes: ReservaEquipamentoMotor[] = [
    ...dados.reservasEquipamentos.filter((item) => item.unidadeId === unidadeId && sobrepoe(item, periodo)),
    ...planejados.flatMap((item, indice) => item.equipamentos.filter((alocacao) => alocacao.unidadeId === unidadeId && sobrepoe(item, periodo)).map((alocacao) => ({ id: `planejado-${indice}-${alocacao.unidadeId}`, unidadeId, inicio: item.inicio, fim: item.fim, porte: pet.porte!, sexo: pet.sexo! }))),
  ]
  const pontos = [...new Set([periodo.inicio, ...existentes.map((item) => Math.max(item.inicio, periodo.inicio))])]
  return pontos.every((ponto) => {
    const simultaneos = existentes.filter((item) => item.inicio <= ponto && item.fim > ponto)
    if (separarPorSexo && simultaneos.some((item) => item.sexo !== pet.sexo)) return false
    const consumo = new Map<NonNullable<PetMotor['porte']>, number>([[pet.porte!, 1]])
    for (const reserva of simultaneos) consumo.set(reserva.porte, (consumo.get(reserva.porte) ?? 0) + 1)
    return dados.perfisCapacidade.filter((item) => item.equipamentoId === equipamentoId && item.ativo).some((perfil) => {
      const itens = dados.itensPerfisCapacidade.filter((item) => item.perfilId === perfil.id && item.ativo)
      return [...consumo].every(([porte, quantidade]) => quantidade <= (itens.find((item) => item.porte === porte)?.quantidade ?? 0))
    })
  })
}

function produto<T>(atuais: T[][], proximos: T[][]) {
  return atuais.flatMap((atual) => proximos.map((proximo) => [...atual, ...proximo]))
}

function produtoRecursos(funcionarios: AlocacaoFuncionario[][], equipamentos: AlocacaoEquipamento[][]): AlocacaoRecursos[] {
  return funcionarios.flatMap((grupoFuncionarios) => equipamentos.map((grupoEquipamentos) => ({ funcionarios: grupoFuncionarios, equipamentos: grupoEquipamentos })))
}

export function reservasPlanejadasFuncionarios(etapas: RecursosPlanejados): ReservaFuncionarioMotor[] {
  return etapas.flatMap((etapa, indice) => etapa.funcionarios.map((item) => ({ id: `p-${indice}-${item.id}`, funcionarioId: item.id, inicio: etapa.inicio, fim: etapa.fim })))
}
