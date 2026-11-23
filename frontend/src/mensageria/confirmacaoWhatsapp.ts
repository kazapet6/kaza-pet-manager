/**
 * Parser PURO das escolhas de agendamento por WhatsApp.
 *
 * NÃO muda status nem recebe um corpo de webhook sem validação.
 * Somente pode ser chamado APÓS verificação HMAC-SHA256 do corpo bruto
 * pelo receptor da Meta e verificação exata do WABA e phone_number_id.
 *
 * Meta entrega:
 *  - template quick reply: messages[].type='button'; button.payload
 *  - reply button de mensagem interativa: type='interactive'; interactive.button_reply.id
 *
 * O payload NÃO é prova de autorização. A fase seguinte resolve um token opaco
 * registrado pelo backend, compara remetente/ID de mensagem/prazo/agendamento
 * e efetua a transição em uma transação serializada e auditável.
 */
export type EscolhaWhatsApp = {
  token: string
  remetenteMeta: string
  mensagemRespostaId: string
  mensagemOriginalId: string
  timestampMeta: string | null
  formato: 'template_quick_reply' | 'interactive_button_reply'
}
export type EscopoMeta = { wabaId: string; phoneNumberId: string }

export type AcaoAgendamento = 'confirmar' | 'remarcar'
export type SituacaoConfirmacao =
  | { resultado: 'confirmar'; novoStatus: 'confirmado' }
  | { resultado: 'remarcacao_pendente'; novoStatus: null }
  | { resultado: 'conflito'; novoStatus: null }

function objeto(value: unknown): Record<string,unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string,unknown> : null
}
function texto(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}
function objetos(value: unknown): Record<string,unknown>[] {
  return Array.isArray(value) ? value.map(objeto).filter((o):o is Record<string,unknown>=>Boolean(o)) : []
}
const PADRAO_TOKEN = /^KPAG1_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PADRAO_NUMERO_META = /^\d{10,15}$/
const PADRAO_EPOCH = /^\d{10,13}$/

export function extrairCliquesConfirmacao(corpo:unknown, escopo:EscopoMeta):EscolhaWhatsApp[] {
  const raiz=objeto(corpo)
  if (!raiz || raiz.object!=='whatsapp_business_account' ||
      !/^\d{5,30}$/.test(escopo.wabaId) || !/^\d{5,30}$/.test(escopo.phoneNumberId)) return []
  const vistos=new Set<string>()
  const cliques:EscolhaWhatsApp[]=[]
  for (const entrada of objetos(raiz.entry)) {
    if (String(entrada.id)!==escopo.wabaId) continue
    for (const alteracao of objetos(entrada.changes)) {
      if (alteracao.field!=='messages') continue
      const valor=objeto(alteracao.value)
      if (!valor || String(objeto(valor.metadata)?.phone_number_id)!==escopo.phoneNumberId) continue
      for (const mensagem of objetos(valor.messages)) {
        const type=texto(mensagem.type)
        const reply=type==='button' ? objeto(mensagem.button)
          : type==='interactive' ? objeto(objeto(mensagem.interactive)?.button_reply) : null
        const token=texto(type==='button' ? reply?.payload : reply?.id)
        if (!token || !PADRAO_TOKEN.test(token)) continue
        const id=texto(mensagem.id),remetente=texto(mensagem.from)
        const original=texto(objeto(mensagem.context)?.id)
        if (!id || id.length>300 || !original || original.length>300 ||
            !remetente || !PADRAO_NUMERO_META.test(remetente)) continue
        // O click duplicado é ignorado apenas nesta chamada; o banco fará dedupe global.
        if (vistos.has(id)) continue
        vistos.add(id)
        const timestamp=texto(mensagem.timestamp)
        cliques.push({
          token,remetenteMeta:remetente,
          mensagemRespostaId:id,mensagemOriginalId:original,
          timestampMeta:timestamp && PADRAO_EPOCH.test(timestamp) ? timestamp : null,
          formato:type==='button'?'template_quick_reply':'interactive_button_reply',
        })
      }
    }
  }
  return cliques
}

/**
 * Regra pura, sem acesso ao banco:
 * - "Confirmar" SOMENTE agendado -> confirmado
 * - "Remarcar" cria solicitação à equipe; não muda horário ou status
 * - demais estados são conflitos; nunca regredir o fluxo operacional
 */
export function avaliarEscolhaAgendamento(
  acao:AcaoAgendamento,statusAtual:string,
):SituacaoConfirmacao {
  if(statusAtual!=='agendado')return {resultado:'conflito',novoStatus:null}
  return acao==='confirmar'
    ? {resultado:'confirmar',novoStatus:'confirmado'}
    : {resultado:'remarcacao_pendente',novoStatus:null}
}
