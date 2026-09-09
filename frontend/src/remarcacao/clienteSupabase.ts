import { supabase } from '../lib/supabase.ts'
import { respostaRemarcacaoValida, type RemarcacaoIntent } from './contrato.ts'

export async function remarcarAtendimento(intencao: RemarcacaoIntent) {
  const { data, error } = await supabase.functions.invoke('remarcar-atendimento', { body: intencao })
  if (error) throw error
  if (!respostaRemarcacaoValida(data)) throw new Error('Resposta invalida do backend de remarcacao.')
  return data
}
