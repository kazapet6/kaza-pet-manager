import type { Preparo044 } from '../_shared/reaproveitamento-044.ts'
const enc = new TextEncoder(), mensagem = (s: string) => enc.encode('kaza:reaproveitamento:044:1|' + s)
export async function criarAssinador044(segredo: string) {
 if (segredo.length < 32) throw new Error('Assinatura indisponível.')
 const key = await crypto.subtle.importKey('raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
 return {
  async assinar(payload: Record<string, unknown>): Promise<Preparo044> { const conteudo = JSON.stringify(payload), bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, mensagem(conteudo))); return { versao: 1, conteudo, assinatura: [...bytes].map(x => x.toString(16).padStart(2, '0')).join('') } },
  async verificar(p: Preparo044) { return p.versao === 1 && /^[a-f0-9]{64}$/.test(p.assinatura) && crypto.subtle.verify('HMAC', key, Uint8Array.from(p.assinatura.match(/../g)!, x => parseInt(x, 16)), mensagem(p.conteudo)) },
 }
}
