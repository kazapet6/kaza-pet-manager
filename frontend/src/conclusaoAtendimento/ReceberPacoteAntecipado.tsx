import { useRef, useState } from 'react'
import Button from '../components/ui/Button.tsx'
import { executarDadosConclusao } from './clienteSupabase.ts'
import { dataEfetivaValida, FORMAS_PAGAMENTO, hojeFinanceiro, type ConclusaoDadosIntent, type FinanceiroAtendimento, type FormaPagamento } from './contrato.ts'

type Pagamento = Extract<ConclusaoDadosIntent, { operacao: 'receber' }>
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** Registra pagamento que o operador confirma ter ocorrido; não realiza cobrança externa. */
export default function ReceberPacoteAntecipado({ atendimentoId }: { atendimentoId: string }) {
  const [financeiro, setFinanceiro] = useState<FinanceiroAtendimento | null>(null)
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

  return <section aria-label="Pagamento antecipado do pacote" className="conclusao-pagamento">
    <h4>Pagamento do ciclo</h4>
    {!financeiro && <Button variant="secondary" disabled={ocupado} onClick={() => void operar(false)}>Consultar pagamento do pacote</Button>}
    {financeiro && <>
      <p>Pacote: {moeda.format(financeiro.valorFinal)} · Recebido: {moeda.format(financeiro.totalRecebido)} · Saldo: {moeda.format(financeiro.saldo)}</p>
      {financeiro.recebimentos.map(r => <p key={r.id}>Recebimento {moeda.format(r.valor)} · {r.formaPagamento} · Data efetiva: {r.dataEfetiva ? r.dataEfetiva.split('-').reverse().join('/') : 'não informada (legado)'}</p>)}
      {(financeiro.saldo > 0 || pendente) && <>
        <label>Data efetiva do pagamento <input type="date" max={hojeFinanceiro()} value={data} disabled={ocupado || Boolean(pendente)} onChange={e => setData(e.target.value)} required /></label>
        <label>Forma de pagamento <select value={forma} disabled={ocupado || Boolean(pendente)} onChange={e => setForma(e.target.value as FormaPagamento)}>{FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}</select></label>
        <p>Confirme somente valores já recebidos. Nenhum atendimento será iniciado ou concluído.</p>
        <Button disabled={ocupado || (!pendente && !dataEfetivaValida(data))} onClick={() => void operar(true)}>{pendente ? 'Verificar recebimento anterior' : `Registrar recebimento de ${moeda.format(financeiro.saldo)}`}</Button>
      </>}
    </>}
    {erro && <p role="alert">{erro}</p>}
  </section>
}
