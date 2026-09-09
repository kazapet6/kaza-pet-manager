import type { AgendaDiariaAtendimento } from '../types/AgendaDiaria.ts'

export const TOLERANCIA_OPERACIONAL_MINUTOS = 10

export type AlertaOperacional = {
  tipo: 'atraso_execucao' | 'aguardando_inicio' | 'atraso_chegada' | 'inicio_atrasado'
  minutos: number
  rotulo: string
} | null

export function classificarAlertaOperacional(
  atendimento: AgendaDiariaAtendimento,
  agora: Date,
  toleranciaMinutos = TOLERANCIA_OPERACIONAL_MINUTOS,
): AlertaOperacional {
  const inicio = instante(atendimento.inicio)
  const conclusao = instante(atendimento.conclusao)
  const recebido = evento(atendimento, 'recebido')
  const iniciado = evento(atendimento, 'iniciado')

  if (atendimento.status === 'em_atendimento') {
    const atrasoExecucao = minutosDepois(agora, conclusao)
    if (atrasoExecucao > toleranciaMinutos) {
      return { tipo: 'atraso_execucao', minutos: atrasoExecucao, rotulo: `Atrasado ${atrasoExecucao} min` }
    }
    const atrasoInicio = minutosEntre(inicio, iniciado)
    if (atrasoInicio > toleranciaMinutos) {
      return { tipo: 'inicio_atrasado', minutos: atrasoInicio, rotulo: `Início +${atrasoInicio} min` }
    }
    return null
  }

  if (atendimento.status === 'recebido' && recebido && !iniciado) {
    const espera = minutosDepois(agora, inicio)
    return espera > toleranciaMinutos
      ? { tipo: 'aguardando_inicio', minutos: espera, rotulo: `Aguardando início · ${espera} min` }
      : null
  }

  if (atendimento.modalidade === 'normal'
    && (atendimento.status === 'agendado' || atendimento.status === 'confirmado')
    && !recebido) {
    const atrasoChegada = minutosDepois(agora, inicio)
    return atrasoChegada > toleranciaMinutos
      ? { tipo: 'atraso_chegada', minutos: atrasoChegada, rotulo: `Atrasado ${atrasoChegada} min` }
      : null
  }

  return null
}

function evento(atendimento: AgendaDiariaAtendimento, tipo: 'recebido' | 'iniciado') {
  return instante(atendimento.historicoOperacional.find((item) => item.tipo === tipo)?.ocorridoEm)
}
function instante(valor: string | undefined) {
  const milissegundos = valor ? Date.parse(valor) : Number.NaN
  return Number.isFinite(milissegundos) ? milissegundos : null
}
function minutosDepois(agora: Date, referencia: number | null) {
  return referencia === null ? 0 : Math.max(0, Math.floor((agora.getTime() - referencia) / 60_000))
}
function minutosEntre(inicio: number | null, fim: number | null) {
  return inicio === null || fim === null ? 0 : Math.max(0, Math.floor((fim - inicio) / 60_000))
}
