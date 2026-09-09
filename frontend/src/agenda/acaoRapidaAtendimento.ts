import type { AgendaDiariaAtendimento } from '../types/AgendaDiaria.ts'
import type { StatusOperacionalEditavel } from '../statusAtendimento/contrato.ts'

export type AcaoRapidaAtendimento = {
  rotulo: 'Receber' | 'Iniciar atendimento' | 'Finalizar' | 'Concluir'
  novoStatus: StatusOperacionalEditavel
} | null

export function obterAcaoRapidaAtendimento(
  atendimento: Pick<AgendaDiariaAtendimento, 'status' | 'modalidade'>,
): AcaoRapidaAtendimento {
  if (atendimento.status === 'agendado' || atendimento.status === 'confirmado') {
    return { rotulo: 'Receber', novoStatus: 'recebido' }
  }
  if (atendimento.status === 'recebido') {
    return { rotulo: 'Iniciar atendimento', novoStatus: 'em_atendimento' }
  }
  if (atendimento.status === 'em_atendimento') {
    return {
      rotulo: 'Finalizar',
      novoStatus: atendimento.modalidade === 'taxidog'
        ? 'aguardando_entrega'
        : 'aguardando_retirada',
    }
  }
  if (atendimento.status === 'aguardando_retirada' || atendimento.status === 'aguardando_entrega') {
    return { rotulo: 'Concluir', novoStatus: 'concluido' }
  }
  return null
}
