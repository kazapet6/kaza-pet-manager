import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.2'
import { podeEditarObservacoes, type ObservacoesResposta, type SalvarObservacoesIntent } from '../../../frontend/src/observacoesAtendimento/contrato.ts'
import { tipoOcorrencia, type TipoOcorrenciaAtendimento } from '../../../frontend/src/observacoesAtendimento/catalogo.ts'

type Linha = { id: string; status: string; observacao_operacional: string | null; observacoes_versao: number }
export async function carregarObservacoesBackend(atendimentoId: string, admin: SupabaseClient): Promise<ObservacoesResposta> {
  const [{ data, error }, ocorrencias] = await Promise.all([
    admin.from('atendimentos').select('id,status,observacao_operacional,observacoes_versao').eq('id', atendimentoId).maybeSingle(),
    admin.from('atendimento_ocorrencias').select('tipo').eq('atendimento_id', atendimentoId).order('tipo'),
  ])
  if (error || ocorrencias.error) throw error ?? ocorrencias.error
  if (!data) return { status: 'invalido', codigo: 'ATENDIMENTO_NAO_ENCONTRADO', mensagem: 'Atendimento não encontrado.' }
  const item = data as Linha
  return { status: 'carregado', atendimentoId: item.id, versao: Number(item.observacoes_versao), observacao: item.observacao_operacional, ocorrencias: (ocorrencias.data ?? []).map((linha) => linha.tipo).filter(tipoOcorrencia) as TipoOcorrenciaAtendimento[], editavel: podeEditarObservacoes(item.status) }
}
export async function salvarObservacoesBackend(intencao: SalvarObservacoesIntent, admin: SupabaseClient): Promise<ObservacoesResposta> {
  const { data, error } = await admin.rpc('salvar_observacoes_atendimento', { p_payload: intencao })
  if (error) throw error
  if (data?.status === 'conflito') {
    const oficial = await carregarObservacoesBackend(intencao.atendimentoId, admin)
    if (oficial.status !== 'carregado') return oficial
    return { status: 'conflito', codigo: 'OBSERVACOES_ALTERADAS', mensagem: 'As observações foram alteradas por outro usuário.', oficial }
  }
  return data as ObservacoesResposta
}
