import type { EstadoCreditoContrato } from './credito-contrato.ts'
// Diagnóstico para a proposta de RPC. Não reserva crédito ou cria atendimento.
export function diagnosticarReaproveitamento(estado: EstadoCreditoContrato, motivoLiberacaoComprovado: boolean) {
  if (estado !== 'disponivel') return { elegivel: false, codigo: `CREDITO_${estado.toUpperCase()}` }
  if (!motivoLiberacaoComprovado) return { elegivel: false, codigo: 'LIBERACAO_EXIGE_PROVA' }
  return { elegivel: false, codigo: 'RPC_ATOMICA_DE_REAPROVEITAMENTO_AUSENTE' }
}
