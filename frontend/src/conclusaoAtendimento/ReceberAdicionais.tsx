import { useRef, useState } from 'react'
import Button from '../components/ui/Button.tsx'
import { executarDadosConclusao } from './clienteSupabase.ts'
import { FORMAS_PAGAMENTO, dataEfetivaValida, hojeFinanceiro, type FinanceiroAtendimento, type FormaPagamento } from './contrato.ts'

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export default function ReceberAdicionais({ atendimentoId, inicial, painelAgenda = false }: {
  atendimentoId: string
  inicial?: FinanceiroAtendimento
  painelAgenda?: boolean
}) {
  const [financeiro, setFinanceiro] = useState(inicial)
  const [consultado, setConsultado] = useState(Boolean(inicial))
  const [dataEfetiva, setDataEfetiva] = useState('')
  const [forma, setForma] = useState<FormaPagamento>('pix')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const emAndamento = useRef(false)
  const chave = useRef<string | null>(null)

  async function atualizar(receber: boolean) {
    if (emAndamento.current) return
    emAndamento.current = true
    setOcupado(true)
    setErro('')
    try {
      if (receber && financeiro && financeiro.saldo > 0) {
        if (!dataEfetivaValida(dataEfetiva)) { setErro('Informe a data efetiva do pagamento.'); return }
        chave.current ??= crypto.randomUUID()
        const resultado = await executarDadosConclusao({
          operacao: 'receber', destino: 'adicionais', atendimentoId,
          chaveIdempotencia: chave.current, valor: financeiro.saldo, formaPagamento: forma, dataEfetiva,
        })
        if (resultado.status !== 'registrado') {
          chave.current = null
          setErro('mensagem' in resultado ? String(resultado.mensagem) : 'Não foi possível registrar o recebimento.')
          return
        }
      }
      const resultado = await executarDadosConclusao({ operacao: 'carregar', atendimentoId })
      if (resultado.status !== 'carregado') throw new Error('Financeiro indisponível')
      setFinanceiro(resultado.financeiro.adicionais)
      setConsultado(true)
      chave.current = null
    } catch {
      setErro('Não foi possível atualizar os recebimentos dos adicionais. Tente novamente.')
    } finally {
      emAndamento.current = false
      setOcupado(false)
    }
  }

  return <section aria-label="Pagamento dos adicionais" className={painelAgenda ? "agenda-financeiro-item" : undefined}>
    {!consultado && <Button variant="secondary" disabled={ocupado} onClick={() => void atualizar(false)}>Consultar pagamento dos adicionais</Button>}
    {consultado && !financeiro && <p>Sem adicionais neste atendimento.</p>}
    {financeiro && <>
      {painelAgenda ? <div className="agenda-financeiro-titulo"><h4>Serviços adicionais</h4><span className={'agenda-financeiro-status ' + (financeiro.saldo > 0 ? 'pendente' : 'quitado')}>{financeiro.isento ? 'Isento' : financeiro.saldo > 0 ? 'Pendente' : 'Quitado'}</span></div> : <h4>Pagamento dos adicionais</h4>}
      {financeiro.valorOriginal !== undefined && financeiro.valorOriginal !== financeiro.valorFinal
        && <p>Valor original: {moeda.format(financeiro.valorOriginal)}</p>}
      {painelAgenda ? <div className="agenda-financeiro-valores"><div><small>Valor dos adicionais</small><strong>{moeda.format(financeiro.valorFinal)}</strong></div><div><small>Recebido</small><strong>{moeda.format(financeiro.totalRecebido)}</strong></div><div><small>Saldo a receber</small><strong>{moeda.format(financeiro.saldo)}</strong></div></div> : <p>Valor final: {moeda.format(financeiro.valorFinal)} · Recebido: {moeda.format(financeiro.totalRecebido)} · Saldo: {moeda.format(financeiro.saldo)}</p>}
      {financeiro.saldo > 0 && <>
        <div className={painelAgenda ? "agenda-financeiro-campos" : undefined}><label>Data efetiva do pagamento dos adicionais <input type="date" max={hojeFinanceiro()} value={dataEfetiva} disabled={ocupado || Boolean(chave.current)} onChange={e => setDataEfetiva(e.target.value)} required /></label>
        <label>Forma de pagamento dos adicionais <select value={forma} disabled={ocupado || Boolean(chave.current)} onChange={evento => setForma(evento.target.value as FormaPagamento)}>
          {FORMAS_PAGAMENTO.map(item => <option key={item} value={item}>{item}</option>)}
        </select></label></div>
        <Button disabled={ocupado || !dataEfetivaValida(dataEfetiva)} onClick={() => void atualizar(true)}>Registrar {moeda.format(financeiro.saldo)} dos adicionais</Button>
      </>}
    </>}
    {erro && <p role="alert">{erro}</p>}
  </section>
}
