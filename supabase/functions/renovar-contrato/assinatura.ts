import type { PreparoRenovacao } from '../_shared/contrato-renovacao.ts'
const encoder = new TextEncoder()
const mensagem = (conteudo: string) => encoder.encode('kaza:renovacao:1|' + conteudo)
export async function criarAssinadorRenovacao(segredo: string) {
  if (segredo.length < 32) throw new Error('Chave de assinatura indisponível.')
  const key = await crypto.subtle.importKey('raw', encoder.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
  return {
    async assinar(payload: Record<string, unknown>): Promise<PreparoRenovacao> {
      const conteudo = JSON.stringify(payload)
      const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, mensagem(conteudo)))
      return { versao: 1, conteudo, assinatura: [...bytes].map(x => x.toString(16).padStart(2, '0')).join('') }
    },
    async verificar(preparo: PreparoRenovacao): Promise<boolean> {
      if (preparo.versao !== 1 || !/^[a-f0-9]{64}$/.test(preparo.assinatura)) return false
      const bytes = Uint8Array.from(preparo.assinatura.match(/../g)!, x => parseInt(x, 16))
      return crypto.subtle.verify('HMAC', key, bytes, mensagem(preparo.conteudo))
    },
  }
}
