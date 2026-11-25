import { supabase } from '../lib/supabase.ts'
import { objeto, uuid, type IntencaoRenovacao, type RespostaRenovacao } from '../../../supabase/functions/_shared/contrato-renovacao.ts'
import { criarFluxoRenovacao } from './renovacaoFluxo.ts'

async function invocar(i: IntencaoRenovacao): Promise<RespostaRenovacao> {
  const { data, error } = await supabase.functions.invoke('renovar-contrato', { body: i })
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status
    throw new Error(status === 401 ? 'Sessão expirada. Entre novamente e retome a mesma tentativa.' : status === 403 ? 'Seu usuário não tem permissão para renovar.' : 'Resultado não confirmado. Retome a mesma tentativa, sem criar outra chave.')
  }
  if (!objeto(data) || typeof data.mensagem !== 'string') throw new Error('Resposta não reconhecida. Retome a mesma tentativa.')
  if (data.status === 'preparado' && objeto(data.preparo) && data.preparo.versao === 1 && typeof data.preparo.conteudo === 'string' && typeof data.preparo.assinatura === 'string' && typeof data.disponivel === 'boolean' && Number.isSafeInteger(data.quantidadeOcorrencias)) return data as RespostaRenovacao
  if (['renovado', 'materializacao_pendente', 'requer_revisao'].includes(String(data.status)) && uuid(data.contratoId) && uuid(data.cicloId) && Number.isSafeInteger(data.numero)) return data as RespostaRenovacao
  if (['invalido', 'conflito', 'erro'].includes(String(data.status)) && typeof data.codigo === 'string') return data as RespostaRenovacao
  throw new Error('Resposta não reconhecida. Retome a mesma tentativa.')
}
export const fluxoRenovacao = criarFluxoRenovacao({
  async ator() { const { data, error } = await supabase.auth.getSession(); if (error || !data.session?.user.id) throw new Error('Entre novamente para retomar a renovação.'); return data.session.user.id },
  invocar,
  storage: { getItem: k => window.localStorage.getItem(k), setItem: (k, v) => window.localStorage.setItem(k, v), removeItem: k => window.localStorage.removeItem(k) },
  uuid: () => crypto.randomUUID(),
})
