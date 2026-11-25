import type { IntencaoRenovacao, RespostaRenovacao, SolicitarRenovacao } from '../../../supabase/functions/_shared/contrato-renovacao.ts'
type Preparado = Extract<RespostaRenovacao, { status: 'preparado' }>
export type TentativaRenovacao = { ator: string; solicitacao: SolicitarRenovacao; preparado?: Preparado; confirmacaoEnviada?: boolean; resultado?: RespostaRenovacao }
type Deps = { ator(): Promise<string>; invocar(i: IntencaoRenovacao): Promise<RespostaRenovacao>; storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>; uuid(): string }

export function criarFluxoRenovacao(d: Deps) {
  const andamento = new Map<string, { operacao: string; promise: Promise<unknown> }>()
  const chave = (ator: string, contrato: string, ciclo: string) => `kaza:renovacao:1:${ator}:${contrato}:${ciclo}`
  function ler(k: string): TentativaRenovacao | null {
    const raw = d.storage.getItem(k)
    if (!raw) return null
    const x = JSON.parse(raw) as TentativaRenovacao
    if (!x?.ator || !x.solicitacao?.chaveIdempotencia || chave(x.ator, x.solicitacao.contratoId, x.solicitacao.cicloAnteriorId) !== k) throw new Error('A tentativa salva exige revisão. Nenhuma nova intenção foi criada.')
    return x
  }
  const salvar = (k: string, x: TentativaRenovacao) => d.storage.setItem(k, JSON.stringify(x))
  function exclusiva<T>(k: string, operacao: string, f: () => Promise<T>): Promise<T> {
    const atual = andamento.get(k)
    if (atual) return atual.operacao === operacao ? atual.promise as Promise<T> : Promise.reject(new Error('Aguarde a operação em andamento deste ciclo.'))
    const promise = Promise.resolve().then(f).finally(() => { if (andamento.get(k)?.promise === promise) andamento.delete(k) })
    andamento.set(k, { operacao, promise })
    return promise
  }
  return {
    async recuperar(contrato: string, ciclo: string) { return ler(chave(await d.ator(), contrato, ciclo)) },
    async descartarPreparacao(contrato: string, ciclo: string) {
      const ator = await d.ator(), k = chave(ator, contrato, ciclo)
      return exclusiva(k, 'descartar', async () => {
        const x = ler(k)
        if (!x) return
        if (x.confirmacaoEnviada) throw new Error('A confirmação já foi enviada. Retome a mesma tentativa antes de qualquer nova intenção.')
        salvar(k + ':abandonada:' + x.solicitacao.chaveIdempotencia, x)
        d.storage.removeItem(k)
      })
    },
    async preparar(contratoId: string, cicloAnteriorId: string, dataAncora: string): Promise<Preparado> {
      const ator = await d.ator(), k = chave(ator, contratoId, cicloAnteriorId)
      return exclusiva(k, 'preparar', async () => {
        let x = ler(k)
        if (x && x.solicitacao.dataAncora !== dataAncora) throw new Error('Existe uma tentativa para outra data. Retome essa tentativa; não altere a intenção de um retry.')
        if (x?.preparado) return x.preparado
        x ??= { ator, solicitacao: { contratoId, cicloAnteriorId, dataAncora, chaveIdempotencia: d.uuid() } }
        salvar(k, x) // persistir identidade ANTES de qualquer chamada
        const r = await d.invocar({ operacao: 'preparar', ...x.solicitacao })
        if (r.status !== 'preparado') throw new Error(r.mensagem)
        x.preparado = r
        salvar(k, x) // sem persistir o plano, a confirmação não é enviada
        return r
      })
    },
    async confirmar(contratoId: string, cicloAnteriorId: string): Promise<RespostaRenovacao> {
      const ator = await d.ator(), k = chave(ator, contratoId, cicloAnteriorId)
      return exclusiva(k, 'confirmar', async () => {
        const x = ler(k)
        if (!x?.preparado) throw new Error('Prepare a renovação antes de confirmar.')
        x.confirmacaoEnviada = true
        salvar(k, x) // preservar retry antes de enviar; falha de storage impede a confirmação
        const resultado = await d.invocar({ operacao: 'confirmar', preparo: x.preparado.preparo })
        x.resultado = resultado
        // A resposta pode representar COMMIT já realizado. Falha local não transforma isso em rollback.
        try { salvar(k, x) } catch { /* o preparo anterior permanece e permite replay seguro */ }
        return resultado
      })
    },
  }
}
