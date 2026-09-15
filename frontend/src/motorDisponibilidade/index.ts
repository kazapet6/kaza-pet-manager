import { calcularDisponibilidade } from './motor.ts'
import { carregarDadosDisponibilidade } from './carregar.ts'
import { LIMITES_PLANEJADOR_DEV, planejarLoteEmMemoria } from './lote.ts'
import { resumirDisponibilidadeDoCiclo } from './ciclo.ts'

export { calcularDisponibilidade, carregarDadosDisponibilidade }
export { calcularPossibilidadesDisponibilidade } from './motor.ts'
export { calcularDisponibilidadeNoHorario } from './motor.ts'
export { planejarLoteEmMemoria, adicionarOcupacoesAoSnapshot, LIMITES_PLANEJADOR_DEV } from './lote.ts'
export { carregarDadosDisponibilidadeComCliente } from './supabase.ts'
export { horaParaMinutos, minutosParaHora } from './tempo.ts'
export { rotuloEtapaComAcoplamentos } from './explicabilidade.ts'
export { calcularPrecificacao } from './precificacao.ts'
export { ErroCadastroPetIncompleto } from '../../../supabase/functions/_shared/motor/cadastroPet.ts'
export { carregarDadosPrecificacaoComCliente } from './precificacaoSupabase.ts'
export { resumirDisponibilidadeDoCiclo } from './ciclo.ts'
export type * from './tipos.ts'

export async function consultarDisponibilidade(entrada: import('./tipos.ts').EntradaDisponibilidade) {
  return calcularDisponibilidade(entrada, await carregarDadosDisponibilidade(entrada))
}

export async function consultarDisponibilidadeDoCiclo(entrada: import('./tipos.ts').EntradaDisponibilidade) {
  return resumirDisponibilidadeDoCiclo(await consultarDisponibilidade(entrada))
}

export async function consultarPlanejamentoLote(solicitacoes: import('./tipos.ts').SolicitacaoPlanejamentoLote[], ocupacoes?: Partial<import('./tipos.ts').OcupacoesSimuladas>, limites?: import('./tipos.ts').LimitesPlanejamentoLote) {
  if (!solicitacoes.length) return planejarLoteEmMemoria([], {} as import('./tipos.ts').DadosDisponibilidade)
  const snapshots = await Promise.all(solicitacoes.map((item) => carregarDadosDisponibilidade(item.entrada)))
  const base = { ...snapshots[0], pets: [...new Map(snapshots.flatMap((item) => item.pets).map((pet) => [pet.id, pet])).values()] }
  return planejarLoteEmMemoria(solicitacoes, base, limites ?? LIMITES_PLANEJADOR_DEV, ocupacoes)
}
