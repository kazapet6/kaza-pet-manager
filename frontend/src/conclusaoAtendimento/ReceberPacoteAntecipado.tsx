import { useRef, useState } from 'react'
import Button from '../components/ui/Button.tsx'
import { executarDadosConclusao } from './clienteSupabase.ts'
import { dataEfetivaValida, FORMAS_PAGAMENTO, hojeFinanceiro, type ConclusaoDadosIntent, type FinanceiroAtendimento, type FormaPagamento } from './contrato.ts'

type Pagamento = Extract<ConclusaoDadosIntent, { operacao: 'receber' }>
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** Registra pagamento que o operador confirma ter ocorrido; não realiza cobrança externa. */
export default function ReceberPacoteAntecipado({ atendimentoId, inicial }: { atendimentoId: string; inicial?: FinanceiroAtendimento }) {
  const [financeiro, setFinanceiro] = useState<FinanceiroAtendimento | null>(inicial ?? null)
  const [forma, setForma] = useState<FormaPagamento>('pix')
  const [data, setData] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [pendente, setPendente] = useState<Pagamento | null>(null)
  const trava = useRef(false)
  const envio = useRef<Pagamento | null>(null)

  async function operar(registrar: boolean) {
    if (trava.current) return
    trava.current = true
    setOcupado(true)
    setErro('')
    try {
      if (registrar) {
        if (!envio.current) {
          if (!financeiro?.cicloPacoteId || financeiro.saldo <= 0 || !dataEfetivaValida(data)) {
            setErro('Informe a data efetiva do pagamento já recebido.'); return
          }
          envio.current = { operacao: 'receber', atendimentoId, chaveIdempotencia: crypto.randomUUID(), valor: financeiro.saldo, formaPagamento: forma, dataEfetiva: data }
          setPendente(envio.current)
        }
        const resultado = await executarDadosConclusao(envio.current)
        if (resultado.status !== 'registrado') {
          // Resposta definitiva: consultar saldo antes de permitir nova tentativa.
          envio.current = null; setPendente(null); setFinanceiro(null)
          setErro('mensagem' in resultado ? String(resultado.mensagem) : 'Recebimento não confirmado. Consulte o saldo.'); return
        }
      }
      const resultado = await executarDadosConclusao({ operacao: 'carregar', atendimentoId })
      if (resultado.status !== 'carregado' || !resultado.financeiro.cicloPacoteId) throw new Error('Ciclo indisponível')
      setFinanceiro(resultado.financeiro)
      envio.current = null; setPendente(null)
    } catch {
      setErro(envio.current ? 'Resultado ainda não confirmado. Repita a mesma operação para consultar o recebimento, sem alterar os dados.' : 'Não foi possível consultar o financeiro do pacote.')
    } finally { trava.current = false; setOcupado(false) }
  }

  return <section aria-label="Pagamento antecipado do pacote" className="conclusao-pagamento agenda-financeiro-item">
    <div className="agenda-financeiro-titulo"><h4>Pagamento do ciclo</h4>{financeiro && <span className={'agenda-financeiro-status ' + (financeiro.saldo > 0 ? 'pendente' : 'quitado')}>{financeiro.isento ? 'Isento' : financeiro.saldo > 0 ? 'Pendente' : 'Quitado'}</span>}</div>
    {!financeiro && <Button variant="secondary" disabled={ocupado} onClick={() => void operar(false)}>Consultar pagamento do pacote</Button>}
    {financeiro && <>
      <div className="agenda-financeiro-valores"><div><small>Valor do ciclo</small><strong>{moeda.format(financeiro.valorFinal)}</strong></div><div><small>Recebido</small><strong>{moeda.format(financeiro.totalRecebido)}</strong></div><div><small>Saldo a receber</small><strong>{moeda.format(financeiro.saldo)}</strong></div></div>
      {financeiro.recebimentos.length > 0 && <details className="agenda-financeiro-historico"><summary>Histórico de recebimentos ({financeiro.recebimentos.length})</summary>{financeiro.recebimentos.map(r => <p key={r.id}>{moeda.format(r.valor)} · {r.formaPagamento} · {r.dataEfetiva ? r.dataEfetiva.split('-').reverse().join('/') : 'Data não informada (legado)'}</p>)}</details>}
      {(financeiro.saldo > 0 || pendente) && <>
        <div className="agenda-financeiro-campos"><label>Data efetiva do pagamento <input type="date" max={hojeFinanceiro()} value={data} disabled={ocupado || Boolean(pendente)} onChange={e => setData(e.target.value)} required /></label>
        <label>Forma de pagamento <select value={forma} disabled={ocupado || Boolean(pendente)} onChange={e => setForma(e.target.value as FormaPagamento)}>{FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}</select></label></div>
        <p className="agenda-financeiro-nota">Registre somente valores já recebidos. Esta operação não inicia nem conclui o atendimento.</p>
        <Button disabled={ocupado || (!pendente && !dataEfetivaValida(data))} onClick={() => void operar(true)}>{pendente ? 'Verificar recebimento anterior' : `Registrar recebimento de ${moeda.format(financeiro.saldo)}`}</Button>
      </>}
    </>}
    {erro && <p role="alert">{erro}</p>}
  </section>
}
