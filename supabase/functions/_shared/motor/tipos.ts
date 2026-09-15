export type EspeciePetMotor='cao'|'gato'
export type SexoPetMotor='macho'|'femea'
export type PortePetMotor='mini'|'pequeno'|'medio'|'grande'|'gigante'
export type PelagemPetMotor='curta'|'media'|'longa'
export type TemperamentoPetMotor='calmo'|'moderado'|'dificil'
export type CampoCadastroPet='especie'|'raca'|'sexo'|'porte'|'pelagem'|'temperamento'|'peso'
export type PetMotorBase={id:string;clienteId:string;nome:string;especie:EspeciePetMotor|null;racaId:string|null;racaNome:string|null;sexo:SexoPetMotor|null;porte:PortePetMotor|null;pelagem:PelagemPetMotor|null;peso:number|null;temperamento:TemperamentoPetMotor|null}
export type PoliticaEsperaEtapa='padrao'|'personalizada'|'sem_limite_operacional'

export type PreferenciaFuncionario = 'automatico' | 'preferencial' | 'obrigatorio'
export type EstadoDisponibilidade = 'OK' | 'AGENDA_NAO_CONFIGURADA' | 'LOJA_FECHADA' | 'CADASTRO_PET_INCOMPLETO' | 'PET_INELEGIVEL' | 'SERVICO_INVALIDO' | 'SEM_DISPONIBILIDADE'

export type EntradaDisponibilidade = {
  petId: string
  servicoIds: string[]
  data: string
  preferenciaFuncionario: PreferenciaFuncionario
  funcionarioPreferidoId?: string | null
  tipoPlanejamento: 'normal'
  modalidade?: 'sem_transporte' | 'taxidog'
  cicloTaxidogId?: string | null
}

export type IntervaloMinutos = { inicio: number; fim: number }
export type PetMotor = Omit<PetMotorBase,'clienteId'> & { clienteId?: string }
export type ServicoMotor = { id: string; nome: string; ativo: boolean }
export type DependenciaMotor = { servicoId: string; dependenciaServicoId: string; ativo: boolean }
export type AcoplamentoMotor = { servicoId: string; etapaAlvoId: string; ativo: boolean }
export type RegraPrecoMotor = {
  id: string
  servicoId: string
  criterio: 'porte' | 'pelagem' | 'raca' | 'peso' | 'temperamento'
  porte: PortePetMotor | null
  pelagem: PelagemPetMotor | null
  racaId: string | null
  pesoMin: number | null
  pesoMax: number | null
  temperamento: TemperamentoPetMotor | null
  acrescimoValor: number
  ativo: boolean
}
export type ElegibilidadeMotor = {
  especies: { servicoId: string; especie: EspeciePetMotor; ativo: boolean }[]
  portes: { servicoId: string; porte: PortePetMotor; ativo: boolean }[]
  racasBloqueadas: { servicoId: string; racaId: string; ativo: boolean }[]
}
export type EtapaMotor = {
  id: string
  servicoId: string
  nome: string
  ordem: number
  duracaoMinutos: number
  ativo: boolean
  politicaEsperaAntes: PoliticaEsperaEtapa
  esperaAntesMinutos: number | null
}
export type RecursoEtapaMotor = { id: string; servicoEtapaId: string; tipo: 'funcionario' | 'equipamento'; equipamentoId: string | null; quantidade: number; ativo: boolean }
export type ModificadorDuracaoMotor = {
  id: string
  servicoId: string
  servicoEtapaId: string | null
  criterio: 'porte' | 'pelagem' | 'raca' | 'peso' | 'temperamento'
  acrescimoMinutos: number
  ativo: boolean
  racaId: string | null
  porte: PortePetMotor | null
  pelagem: PelagemPetMotor | null
  temperamento: TemperamentoPetMotor | null
  pesoMin: number | null
  pesoMax: number | null
}
export type FuncionarioMotor = { id: string; nome: string; ativo: boolean }
export type JornadaFuncionarioMotor = { funcionarioId: string; diaSemana: number; inicio: number; fim: number; ativo: boolean }
export type IntervaloFuncionarioMotor = { funcionarioId: string; diaSemana: number; inicio: number; fim: number; ativo: boolean }
export type HabilitacoesMotor = {
  servicos: { funcionarioId: string; servicoId: string; ativo: boolean }[]
  etapas: { funcionarioId: string; servicoEtapaId: string; ativo: boolean }[]
}
export type EquipamentoMotor = { id: string; nome: string; ativo: boolean; separarPorSexo: boolean; exigeSupervisaoHumana: boolean }
export type UnidadeEquipamentoMotor = { id: string; equipamentoId: string; numero: number; nome: string; ativo: boolean }
export type PerfilCapacidadeMotor = { id: string; equipamentoId: string; ativo: boolean }
export type ItemPerfilCapacidadeMotor = { perfilId: string; porte: PortePetMotor; quantidade: number; ativo: boolean }
export type ReservaFuncionarioMotor = { id: string; funcionarioId: string; inicio: number; fim: number }
export type ReservaEquipamentoMotor = { id: string; unidadeId: string; inicio: number; fim: number; porte: PortePetMotor; sexo: SexoPetMotor }
export type ExcecaoEstabelecimentoMotor = { data: string; fechado: boolean; blocos: IntervaloMinutos[] }
export type CicloTaxidogMotor = { id: string; nome: string; ordem: number; coletaInicio: number; coletaFim: number; conclusaoLimite: number; ativo: boolean; diasSemana: number[] }

export type ConfiguracaoMotor = {
  granularidadeMinutos: number
  esperaNormalMinutos: number
  timezone?: string
}

export type DadosDisponibilidade = {
  configuracao: ConfiguracaoMotor
  pets: PetMotor[]
  servicos: ServicoMotor[]
  dependencias: DependenciaMotor[]
  acoplamentos: AcoplamentoMotor[]
  elegibilidade: ElegibilidadeMotor
  etapas: EtapaMotor[]
  recursosEtapas: RecursoEtapaMotor[]
  modificadoresDuracao: ModificadorDuracaoMotor[]
  funcionamentoConfigurado: boolean
  blocosEstabelecimento: { diaSemana: number; inicio: number; fim: number; ativo: boolean }[]
  excecoesEstabelecimento: ExcecaoEstabelecimentoMotor[]
  funcionarios: FuncionarioMotor[]
  jornadas: JornadaFuncionarioMotor[]
  intervalosFuncionarios: IntervaloFuncionarioMotor[]
  habilitacoes: HabilitacoesMotor
  equipamentos: EquipamentoMotor[]
  unidadesEquipamentos: UnidadeEquipamentoMotor[]
  perfisCapacidade: PerfilCapacidadeMotor[]
  itensPerfisCapacidade: ItemPerfilCapacidadeMotor[]
  reservasFuncionarios: ReservaFuncionarioMotor[]
  reservasEquipamentos: ReservaEquipamentoMotor[]
  ciclosTaxidog: CicloTaxidogMotor[]
}

export type ServicoResolvido = {
  id: string
  nome: string
  origem: 'solicitado' | 'dependencia'
  ordem: number
  paisDiretos: string[]
  raizesSolicitadas: string[]
}
export type AcrescimoPrecoCalculado = {
  regraPrecoId: string
  criterio: RegraPrecoMotor['criterio']
  descricaoSnapshot: string
  valorReferenciaSnapshot: string
  acrescimoValor: number
}
export type PrecoServicoCalculado = {
  servicoId: string
  servicoNome: string
  origem: ServicoResolvido['origem']
  ordem: number
  paisDiretos: string[]
  precoBaseSnapshot: number
  acrescimos: AcrescimoPrecoCalculado[]
  valorCalculado: number
}
export type ResultadoPrecificacao = {
  servicos: PrecoServicoCalculado[]
  valorCalculadoAtendimento: number
}
export type DadosPrecificacao = {
  servicos: { id: string; nome: string; precoBase: number; ativo: boolean }[]
  regrasPreco: RegraPrecoMotor[]
}
export type ContribuicaoAcoplada = {
  servicoId: string
  servicoNome: string
  etapaId: string
  etapaNome: string
  duracaoBase: number
  duracaoCalculada: number
  modificadoresAplicados: string[]
  recursos: RecursoEtapaMotor[]
  habilitacoesNecessarias: { servicoId: string; servicoEtapaId: string }[]
}
export type EtapaCalculada = EtapaMotor & { servicoNome: string; servicoOrdem: number; duracaoBaseCalculada: number; duracaoCalculada: number; modificadoresAplicados: string[]; recursos: RecursoEtapaMotor[]; habilitacoesNecessarias: { servicoId: string; servicoEtapaId: string }[]; contribuicoesAcopladas: ContribuicaoAcoplada[] }
export type AlocacaoFuncionario = { id: string; nome: string }
export type SupervisaoEquipamento = AlocacaoFuncionario & IntervaloMinutos
export type AlocacaoEquipamento = { equipamentoId: string; equipamentoNome: string; unidadeId: string; unidadeNome: string; numero: number; supervisores: SupervisaoEquipamento[] }
export type EtapaPlanejada = { etapaId: string; servicoId: string; servicoNome: string; nome: string; inicio: number; fim: number; duracaoBaseMinutos: number; duracaoMinutos: number; funcionarios: AlocacaoFuncionario[]; equipamentos: AlocacaoEquipamento[]; modificadoresAplicados: string[]; contribuicoesAcopladas: ContribuicaoAcoplada[] }
export type EsperaPlanejada = { antesDaEtapaId: string; inicio: number; fim: number; duracaoMinutos: number; politica: PoliticaEsperaEtapa }
export type OpcaoDisponibilidade = { horarioApresentado: number; inicioOperacional: number; conclusaoPrevista: number; cicloTaxidog: CicloTaxidogMotor | null; servicos: ServicoResolvido[]; etapas: EtapaPlanejada[]; esperas: EsperaPlanejada[]; duracaoProcessamento: number; tempoEspera: number; duracaoTotal: number; trocasFuncionario: number; trocasRecurso: number }
export type ResultadoDisponibilidade = { estado: EstadoDisponibilidade; data: string; opcoes: OpcaoDisponibilidade[]; motivos: string[]; erro?: { codigo:'CADASTRO_PET_INCOMPLETO'; campos:CampoCadastroPet[] } }
export type ResultadoDisponibilidadeCiclo = { estado: EstadoDisponibilidade; data: string; disponivel: boolean; opcao: OpcaoDisponibilidade | null; motivos: string[]; erro?: ResultadoDisponibilidade['erro'] }

export type SolicitacaoPlanejamentoLote = { id: string; entrada: EntradaDisponibilidade }
export type LimitesPlanejamentoLote = { maximoPets: number; maximoOpcoesPorPet: number; maximoEstados: number }
export type OcupacoesSimuladas = { funcionarios: ReservaFuncionarioMotor[]; equipamentos: ReservaEquipamentoMotor[] }
export type PlanejamentoPetLote = { solicitacaoId: string; petId: string; petNome: string; opcao: OpcaoDisponibilidade }
export type EstadoPlanejamentoLote = 'SOLUCAO' | 'SEM_DISPONIBILIDADE' | 'BUSCA_INCONCLUSIVA' | 'ENTRADA_INVALIDA'
export type ResultadoPlanejamentoLote = {
  estado: EstadoPlanejamentoLote
  planejamentos: PlanejamentoPetLote[]
  conclusaoUltimoPet: number | null
  retiradaPrevistaGrupo: number | null
  estadosExplorados: number
  houveBacktracking: boolean
  ordemEscolhida: string[]
  motivos: string[]
}
