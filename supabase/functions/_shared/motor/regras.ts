import type { DadosDisponibilidade, EntradaDisponibilidade, EtapaCalculada, ModificadorDuracaoMotor, PetMotor, ServicoResolvido } from './tipos.ts'

export function resolverServicos(entrada: EntradaDisponibilidade, dados: DadosDisponibilidade) {
  const solicitados = [...new Set(entrada.servicoIds)]
  if (!solicitados.length) throw new Error('Nenhum serviço foi solicitado.')
  const solicitadosSet = new Set(solicitados)
  const resolvidos: string[] = []
  const visitando = new Set<string>()
  const resolvidosSet = new Set<string>()
  const dependenciasPorServico = new Map<string, string[]>()

  for (const dependencia of dados.dependencias.filter((item) => item.ativo)) {
    const atuais = dependenciasPorServico.get(dependencia.servicoId) ?? []
    if (!atuais.includes(dependencia.dependenciaServicoId)) atuais.push(dependencia.dependenciaServicoId)
    dependenciasPorServico.set(dependencia.servicoId, atuais)
  }
  // IDs são o desempate técnico estável enquanto o domínio não possui uma
  // prioridade de negócio para dependências irmãs.
  for (const dependencias of dependenciasPorServico.values()) dependencias.sort(compararIds)

  function visitar(id: string) {
    const servico = dados.servicos.find((item) => item.id === id)
    if (!servico?.ativo) throw new Error(`Serviço indisponível: ${id}.`)
    if (visitando.has(id)) throw new Error('Ciclo de dependências detectado.')
    if (resolvidosSet.has(id)) return
    visitando.add(id)
    for (const dependenciaId of dependenciasPorServico.get(id) ?? []) visitar(dependenciaId)
    visitando.delete(id)
    resolvidos.push(id)
    resolvidosSet.add(id)
  }

  for (const id of solicitados) visitar(id)

  const paisDiretos = new Map<string, Set<string>>()
  for (const paiId of resolvidosSet) {
    for (const filhoId of dependenciasPorServico.get(paiId) ?? []) {
      if (!resolvidosSet.has(filhoId)) continue
      const pais = paisDiretos.get(filhoId) ?? new Set<string>()
      pais.add(paiId)
      paisDiretos.set(filhoId, pais)
    }
  }

  const raizesSolicitadas = new Map<string, Set<string>>()
  for (const raizId of solicitados) {
    const pendentes = [raizId]
    const visitadosDaRaiz = new Set<string>()
    while (pendentes.length) {
      const id = pendentes.pop()!
      if (visitadosDaRaiz.has(id)) continue
      visitadosDaRaiz.add(id)
      const raizes = raizesSolicitadas.get(id) ?? new Set<string>()
      raizes.add(raizId)
      raizesSolicitadas.set(id, raizes)
      for (const dependenciaId of dependenciasPorServico.get(id) ?? []) pendentes.push(dependenciaId)
    }
  }

  return resolvidos.map((id, indice): ServicoResolvido => ({
    id,
    nome: dados.servicos.find((item) => item.id === id)!.nome,
    origem: solicitadosSet.has(id) ? 'solicitado' : 'dependencia',
    ordem: indice + 1,
    paisDiretos: [...(paisDiretos.get(id) ?? [])].sort(compararIds),
    raizesSolicitadas: [...(raizesSolicitadas.get(id) ?? [])].sort(compararIds),
  }))
}

function compararIds(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}

export function validarElegibilidade(pet: PetMotor, servicos: ServicoResolvido[], dados: DadosDisponibilidade) {
  const motivos: string[] = []
  for (const servico of servicos) {
    const especies = dados.elegibilidade.especies.filter((item) => item.servicoId === servico.id && item.ativo).map((item) => item.especie)
    const portes = dados.elegibilidade.portes.filter((item) => item.servicoId === servico.id && item.ativo).map((item) => item.porte)
    if (!especies.includes(pet.especie!)) motivos.push(`${servico.nome} não atende a espécie do pet.`)
    if (!portes.includes(pet.porte!)) motivos.push(`${servico.nome} não atende o porte do pet.`)
    if (dados.elegibilidade.racasBloqueadas.some((item) => item.servicoId === servico.id && item.racaId === pet.racaId && item.ativo)) motivos.push(`${servico.nome} não está disponível para a raça do pet.`)
  }
  return motivos
}

export function calcularEtapas(pet: PetMotor, servicos: ServicoResolvido[], dados: DadosDisponibilidade) {
  const etapas: EtapaCalculada[] = []
  const acoplamentos = dados.acoplamentos.filter((item) => item.ativo && servicos.some((servico) => servico.id === item.servicoId))
  const idsAcoplados = new Set(acoplamentos.map((item) => item.servicoId))
  for (const servico of servicos.filter((item) => !idsAcoplados.has(item.id))) {
    const etapasServico = dados.etapas.filter((item) => item.servicoId === servico.id && item.ativo).sort((a, b) => a.ordem - b.ordem)
    if (!etapasServico.length) throw new Error(`O serviço ${servico.nome} não possui etapas ativas.`)
    for (const etapa of etapasServico) {
      const calculada = calcularContribuicao(etapa, servico, pet, dados)
      etapas.push({ ...etapa, servicoNome: servico.nome, servicoOrdem: servico.ordem, duracaoBaseCalculada: calculada.duracaoCalculada, duracaoCalculada: calculada.duracaoCalculada, modificadoresAplicados: calculada.modificadoresAplicados, recursos: calculada.recursos, habilitacoesNecessarias: calculada.habilitacoesNecessarias, contribuicoesAcopladas: [] })
    }
  }

  for (const acoplamento of acoplamentos.sort((a, b) => ordemServico(a.servicoId, servicos) - ordemServico(b.servicoId, servicos) || a.servicoId.localeCompare(b.servicoId))) {
    const servico = servicos.find((item) => item.id === acoplamento.servicoId)!
    const etapasOrigem = dados.etapas.filter((item) => item.servicoId === servico.id && item.ativo)
    if (etapasOrigem.length !== 1) throw new Error(`O serviço acoplado ${servico.nome} deve possuir exatamente uma etapa ativa.`)
    const etapaAlvoConfigurada = dados.etapas.find((item) => item.id === acoplamento.etapaAlvoId && item.ativo)
    if (!etapaAlvoConfigurada || etapaAlvoConfigurada.servicoId === servico.id || !dependeDe(servico.id, etapaAlvoConfigurada.servicoId, dados)) throw new Error(`A configuração de acoplamento de ${servico.nome} é inválida.`)
    const alvo = etapas.find((item) => item.id === acoplamento.etapaAlvoId)
    if (!alvo) throw new Error(`A etapa alvo do serviço acoplado ${servico.nome} não pertence ao fluxo resolvido.`)
    const contribuicao = calcularContribuicao(etapasOrigem[0], servico, pet, dados)
    alvo.duracaoCalculada += contribuicao.duracaoCalculada
    alvo.recursos = consolidarRecursos([...alvo.recursos, ...contribuicao.recursos])
    alvo.habilitacoesNecessarias = unicas([...alvo.habilitacoesNecessarias, ...contribuicao.habilitacoesNecessarias])
    alvo.contribuicoesAcopladas.push(contribuicao)
  }
  return etapas
}

function calcularContribuicao(etapa: DadosDisponibilidade['etapas'][number], servico: ServicoResolvido, pet: PetMotor, dados: DadosDisponibilidade) {
  const modificadores = dados.modificadoresDuracao.filter((item) => item.ativo && item.servicoId === servico.id && item.servicoEtapaId === etapa.id && modificadorAplicavel(item, pet))
  const recursos = dados.recursosEtapas.filter((item) => item.servicoEtapaId === etapa.id && item.ativo)
  return { servicoId: servico.id, servicoNome: servico.nome, etapaId: etapa.id, etapaNome: etapa.nome, duracaoBase: etapa.duracaoMinutos, duracaoCalculada: etapa.duracaoMinutos + modificadores.reduce((total, item) => total + item.acrescimoMinutos, 0), modificadoresAplicados: modificadores.map((item) => item.id), recursos, habilitacoesNecessarias: recursos.some((item) => item.tipo === 'funcionario') ? [{ servicoId: servico.id, servicoEtapaId: etapa.id }] : [] }
}

function consolidarRecursos(recursos: DadosDisponibilidade['recursosEtapas']) {
  const grupos = new Map<string, DadosDisponibilidade['recursosEtapas'][number]>()
  for (const recurso of recursos) {
    const chave = `${recurso.tipo}:${recurso.equipamentoId ?? ''}`
    const atual = grupos.get(chave)
    if (!atual || recurso.quantidade > atual.quantidade) grupos.set(chave, recurso)
  }
  return [...grupos.values()].sort((a, b) => a.tipo.localeCompare(b.tipo) || (a.equipamentoId ?? '').localeCompare(b.equipamentoId ?? ''))
}

function unicas(itens: { servicoId: string; servicoEtapaId: string }[]) {
  return [...new Map(itens.map((item) => [`${item.servicoId}:${item.servicoEtapaId}`, item])).values()]
}

function ordemServico(id: string, servicos: ServicoResolvido[]) {
  return servicos.find((item) => item.id === id)?.ordem ?? Number.MAX_SAFE_INTEGER
}

function dependeDe(origem: string, destino: string, dados: DadosDisponibilidade) {
  const visitar = [origem]
  const visitados = new Set<string>()
  while (visitar.length) {
    const atual = visitar.pop()!
    if (visitados.has(atual)) continue
    visitados.add(atual)
    for (const dependencia of dados.dependencias.filter((item) => item.servicoId === atual && item.ativo)) {
      if (dependencia.dependenciaServicoId === destino) return true
      visitar.push(dependencia.dependenciaServicoId)
    }
  }
  return false
}

function modificadorAplicavel(regra: ModificadorDuracaoMotor, pet: PetMotor) {
  if (regra.criterio === 'porte') return regra.porte === pet.porte
  if (regra.criterio === 'pelagem') return regra.pelagem === pet.pelagem
  if (regra.criterio === 'raca') return regra.racaId === pet.racaId
  if (regra.criterio === 'temperamento') return regra.temperamento === pet.temperamento
  if (pet.peso === null) return false
  return (regra.pesoMin === null || pet.peso >= regra.pesoMin) && (regra.pesoMax === null || pet.peso <= regra.pesoMax)
}
