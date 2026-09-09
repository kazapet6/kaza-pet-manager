import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.2'
import type { AlterarStatusIntent, AlterarStatusResposta } from '../_shared/status-atendimento.ts'

export async function alterarStatusComBackendConfiavel(
  intencao: AlterarStatusIntent,
  usuarioId: string,
  admin: SupabaseClient,
): Promise<AlterarStatusResposta> {
  const { data, error } = await admin.rpc('alterar_status_atendimento_com_creditos', {
    p_intencao: { ...intencao, usuarioId },
  })
  if (error) {
    console.error({ evento: 'status_atendimento_update_erro', codigo: seguro(error.code), mensagem: seguro(error.message) })
    throw error
  }
  return data as AlterarStatusResposta
}
function seguro(valor: unknown) { return typeof valor === 'string' ? valor.slice(0, 300) : undefined }
