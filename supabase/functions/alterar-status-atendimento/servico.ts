import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.2'
import type { AlterarStatusIntent, AlterarStatusResposta } from '../_shared/status-atendimento.ts'

export async function alterarStatusComBackendConfiavel(
  intencao: AlterarStatusIntent,
  usuarioId: string,
  admin: SupabaseClient,
  renovar: (cicloId: string) => Promise<void>,
): Promise<AlterarStatusResposta> {
  const { data, error } = await admin.rpc('alterar_status_atendimento_com_creditos', {
    p_intencao: { ...intencao, usuarioId },
  })
  if (error) {
    if (error.code === 'P0045') return { status: 'invalido', codigo: 'PAGAMENTO_INTEGRAL_PACOTE_PENDENTE', mensagem: 'Registre o pagamento integral do pacote antes de concluir.' }
    if (error.code === 'P0049') return { status: 'invalido', codigo: 'ADICIONAL_JA_RECEBIDO', mensagem: 'O adicional já foi recebido. Resolva o pagamento antes de cancelar ou pular o banho.' }
    console.error({ evento: 'status_atendimento_update_erro', codigo: seguro(error.code), mensagem: seguro(error.message) })
    throw error
  }
  const resposta = data as AlterarStatusResposta
  if (resposta.status === 'atualizado' && resposta.statusAtual === 'concluido') {
    try {
      const { data: unidades, error: erroCiclo } = await admin.from('contrato_creditos_contexto_044')
        .select('ciclo_id').eq('atendimento_atual_id', resposta.atendimentoId)
      if (erroCiclo) throw erroCiclo
      for (const cicloId of new Set((unidades ?? []).map(unidade => String(unidade.ciclo_id)))) await renovar(cicloId)
    } catch {
      console.error({ evento: 'renovacao_automatica_pendente', atendimentoId: resposta.atendimentoId })
      return { ...resposta, renovacaoPendente: true }
    }
  }
  return resposta
}
function seguro(valor: unknown) { return typeof valor === 'string' ? valor.slice(0, 300) : undefined }
