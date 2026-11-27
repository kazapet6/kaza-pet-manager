import type { Intencao044, Resposta044, SolicitarReaproveitamento044 } from '../../../supabase/functions/_shared/reaproveitamento-044.ts'
export type Tentativa044 = { pedido: SolicitarReaproveitamento044; chaveIdempotencia: string; preparo?: Extract<Resposta044, { status: 'preparado' }>; enviada?: boolean; resultado?: Resposta044 }
type Deps = { ator(): Promise<string>; invoke(i: Intencao044): Promise<Resposta044>; uuid(): string; storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> }
export function criarFluxo044(d: Deps) {
 const andamento = new Map<string, { op: string; p: Promise<unknown> }>()
 const key = (ator: string, ciclo: string, ocorrencia: string, item: string) => `kaza:reaproveitar:044:${ator}:${ciclo}:${ocorrencia}:${item}`
 const ler = (k: string): Tentativa044 | null => { const raw = d.storage.getItem(k); if (!raw) return null; const x = JSON.parse(raw) as Tentativa044; if (!x?.pedido?.creditos?.length || !x.chaveIdempotencia) throw new Error('A tentativa salva exige revisão.'); return x }
 const save = (k: string, x: Tentativa044) => d.storage.setItem(k, JSON.stringify(x))
 function unica<T>(k: string, op: string, f: () => Promise<T>): Promise<T> { const x = andamento.get(k); if (x) return x.op === op ? x.p as Promise<T> : Promise.reject(new Error('Aguarde a operação em andamento.')); const promise = Promise.resolve().then(f).finally(() => andamento.delete(k)); andamento.set(k, { op, p: promise }); return promise }
 function conferir(x: Tentativa044, r: Resposta044) {
  if (r.status !== 'reservado' && r.status !== 'recusado') return false
  if (r.desfechoPersistido !== true || r.versaoDesfecho !== 2 || r.reciboId !== x.chaveIdempotencia || r.chaveIdempotencia !== x.chaveIdempotencia || r.contratoId !== x.pedido.contratoId || r.cicloId !== x.pedido.cicloId || r.desfecho !== (r.status === 'reservado' ? 'sucesso_confirmado' : 'recusa_definitiva')) throw new Error('A resposta não comprova o desfecho desta intenção.')
  return true
 }
 async function consultar(k: string, x: Tentativa044) {
  if (!x.preparo) throw new Error('Preparação original indisponível para reconciliação.')
  const r = await d.invoke({ operacao: 'reconciliar', preparo: x.preparo.preparo })
  conferir(x, r); x.resultado = r; try { save(k, x) } catch { /* manter preparo enviado para replay */ }
  return r
 }
 return {
  async recuperar(ciclo: string, ocorrencia: string, item: string) { return ler(key(await d.ator(), ciclo, ocorrencia, item)) },
  async preparar(pedido: SolicitarReaproveitamento044, ocorrencia: string, item: string) {
   const k = key(await d.ator(), pedido.cicloId, ocorrencia, item)
   return unica(k, 'preparar', async () => {
    if (!pedido.creditos.some(x => x.ocorrenciaId === ocorrencia && x.contratoItemId === item)) throw new Error('A unidade principal não está selecionada.')
    let x = ler(k)
    if (x && JSON.stringify(x.pedido) !== JSON.stringify(pedido)) throw new Error('Reconcilie a intenção enviada antes de preparar outra.')
    if (x?.enviada) throw new Error('Consulte o resultado da intenção já enviada.')
    if (x?.preparo) return x.preparo
    if (!x) { const chaveIdempotencia = d.uuid(); if (d.storage.getItem(k + ':arquivo:' + chaveIdempotencia)) throw new Error('Uma chave arquivada não pode ser reutilizada.'); x = { pedido, chaveIdempotencia } }
    save(k, x)
    const r = await d.invoke({ ...pedido, operacao: 'preparar', chaveIdempotencia: x.chaveIdempotencia })
    if (r.status !== 'preparado') throw new Error('mensagem' in r ? r.mensagem : 'Resposta de preparação inválida.')
    x.preparo = r; save(k, x); return r
   })
  },
  async reconciliar(ciclo: string, ocorrencia: string, item: string) {
   const k = key(await d.ator(), ciclo, ocorrencia, item)
   return unica(k, 'reconciliar', async () => { const x = ler(k); if (!x?.enviada) throw new Error('Nenhuma intenção enviada para consultar.'); return consultar(k, x) })
  },
  async confirmar(ciclo: string, ocorrencia: string, item: string) {
   const k = key(await d.ator(), ciclo, ocorrencia, item)
   return unica(k, 'confirmar', async () => {
    const x = ler(k); if (!x?.preparo) throw new Error('Prepare o atendimento antes de confirmar.')
    if (x.enviada) {
     const r = await consultar(k, x)
     if (r.status !== 'desconhecido') return r
     // Ausencia nao libera nova chave. Apenas replay explicito do MESMO payload.
    }
    x.enviada = true; save(k, x)
    const r = await d.invoke({ operacao: 'confirmar', preparo: x.preparo.preparo })
    conferir(x, r); x.resultado = r; try { save(k, x) } catch { /* preparo preservado para replay */ }
    return r
   })
  },
  async alterar(ciclo: string, ocorrencia: string, item: string, novaLiberacao?: string) {
   const k = key(await d.ator(), ciclo, ocorrencia, item)
   return unica(k, 'alterar', async () => {
    const x = ler(k); if (!x) return
    if (x.enviada) {
     // Nem resultado local salvo nem ausencia de recibo sao prova de recusa.
     const r = await consultar(k, x)
     const anterior = x.pedido.creditos.find(c => c.ocorrenciaId === ocorrencia && c.contratoItemId === item)
     if (!(r.status === 'recusado' || r.status === 'reservado' && novaLiberacao && novaLiberacao !== anterior?.eventoLiberacaoId)) throw new Error('Desfecho ainda não permite nova intenção. Preserve a chave e retome a mesma tentativa.')
    }
    const arquivo = k + ':arquivo:' + x.chaveIdempotencia
    // Arquivo auditavel local antes de liberar slot; UUID e payload enviados nunca sao apagados.
    const old = d.storage.getItem(arquivo)
    if (old && old !== JSON.stringify(x)) throw new Error('Arquivo da intenção já existe com conteúdo divergente.')
    save(arquivo, x); d.storage.removeItem(k)
   })
  },
 }
}
