import { supabase } from '../lib/supabase.ts'
import { respostaAlterarStatusValida, type AlterarStatusIntent } from './contrato.ts'

export async function alterarStatusAtendimento(intencao: AlterarStatusIntent) {
  const { data: sessao, error: erroSessao } = await supabase.auth.getSession()
  if (erroSessao || !sessao.session?.access_token) throw new Error('Sessão autenticada obrigatória.')
  const { data, error } = await supabase.functions.invoke('alterar-status-atendimento', {
    body: intencao,
    headers: { Authorization: `Bearer ${sessao.session.access_token}` },
  })
  if (error) throw error
  if (!respostaAlterarStatusValida(data)) throw new Error('Resposta inválida do backend de status.')
  return data
}
