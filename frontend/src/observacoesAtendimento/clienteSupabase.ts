import { supabase } from '../lib/supabase.ts'
import type { ObservacoesIntent, ObservacoesResposta } from './contrato.ts'

export async function executarObservacoesAtendimento(intencao: ObservacoesIntent): Promise<ObservacoesResposta> {
  const { data: sessao, error: erroSessao } = await supabase.auth.getSession()
  if (erroSessao || !sessao.session?.access_token) throw new Error('Sessão autenticada obrigatória.')
  const { data, error } = await supabase.functions.invoke('salvar-observacoes-atendimento', {
    body: intencao, headers: { Authorization: `Bearer ${sessao.session.access_token}` },
  })
  if (error) throw error
  return data as ObservacoesResposta
}
