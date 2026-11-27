import { supabase } from '../lib/supabase.ts'
import {
  respostaConfirmacaoValida,
  type ConfirmacaoAgendamentoClient,
  type ConfirmacaoAgendamentoIntent,
} from './contrato.ts'

export const confirmacaoAgendamentoClient: ConfirmacaoAgendamentoClient = {
  async confirmar(intencao: ConfirmacaoAgendamentoIntent) {
    const { data: sessao, error: erroSessao } = await supabase.auth.getSession()
    if (erroSessao || !sessao.session?.access_token) {
      throw new Error('Sessao autenticada obrigatoria para confirmar.')
    }
    const { data, error } = await supabase.functions.invoke('confirmar-agendamento', {
      body: intencao,
      headers: { Authorization: `Bearer ${sessao.session.access_token}` },
    })
    if (error) {
      const contexto = 'context' in error ? error.context : null
      const status = contexto instanceof Response ? contexto.status : 0
      const referencia = intencao.chaveIdempotencia
      if (status === 546) throw new Error('O cálculo da confirmação excedeu o limite do servidor. Atualize a Agenda antes de tentar novamente. Referência: ' + referencia)
      if (status === 401) throw new Error('Sua sessão expirou. Entre novamente antes de confirmar.')
      if (status === 403) throw new Error('A sessão ou a origem não tem acesso à confirmação. Referência: ' + referencia)
      throw new Error('A confirmação não retornou um resultado verificável. Confira a Agenda antes de tentar novamente. Referência: ' + referencia)
    }
    if (!respostaConfirmacaoValida(data)) throw new Error('Resposta invalida do backend de confirmacao.')
    return data
  },
}

export async function carregarVersoesConfirmacao() {
  const [configuracao, ocupacao] = await Promise.all([
    supabase.from('agenda_versao_configuracao').select('versao').eq('id', true).single(),
    supabase.from('agenda_versao_ocupacao').select('versao').eq('id', true).single(),
  ])
  if (configuracao.error) throw configuracao.error
  if (ocupacao.error) throw ocupacao.error
  return {
    versaoConfiguracaoConsultada: Number(configuracao.data.versao),
    versaoOcupacaoConsultada: Number(ocupacao.data.versao),
  }
}
