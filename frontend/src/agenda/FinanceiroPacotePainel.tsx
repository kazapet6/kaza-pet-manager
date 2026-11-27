import { useEffect, useState } from 'react'
import ReceberPacoteAntecipado from '../conclusaoAtendimento/ReceberPacoteAntecipado.tsx'
import ReceberAdicionais from '../conclusaoAtendimento/ReceberAdicionais.tsx'
import { executarDadosConclusao } from '../conclusaoAtendimento/clienteSupabase.ts'
import type { FinanceiroAtendimento } from '../conclusaoAtendimento/contrato.ts'
import './FinanceiroPacotePainel.css'

export default function FinanceiroPacotePainel({ atendimentoId }: { atendimentoId: string }) {
  const [financeiro, setFinanceiro] = useState<FinanceiroAtendimento | null>(null)
  const [erro, setErro] = useState(false)
  const [tentativa, setTentativa] = useState(0)
  useEffect(() => {
    let ativo = true
    void executarDadosConclusao({ operacao: 'carregar', atendimentoId }).then(resultado => {
      if (!ativo) return
      if (resultado.status !== 'carregado' || !resultado.financeiro.cicloPacoteId) { setErro(true); return }
      setFinanceiro(resultado.financeiro)
    }).catch(() => { if (ativo) setErro(true) })
    return () => { ativo = false }
  }, [atendimentoId, tentativa])

  return <section className="agenda-financeiro-pacote" aria-label="Financeiro do atendimento">
    <header className="agenda-financeiro-cabecalho">
      <span className="agenda-financeiro-icone"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 9h18m-5 5h5m-5 3h5M7 14h3"/></svg></span>
      <div><h3>Financeiro do atendimento</h3><p>Pagamento do ciclo e serviços adicionais.</p></div>
    </header>
    {erro ? <div className="agenda-financeiro-estado"><p role="alert">Não foi possível carregar os pagamentos.</p><button type="button" className="agenda-operacao-btn" onClick={() => { setErro(false); setTentativa(n => n + 1) }}>Tentar novamente</button></div>
      : !financeiro ? <p className="agenda-financeiro-carregando" role="status"><i className="agenda-status-spinner" aria-hidden="true"/>Carregando pagamentos...</p>
      : <div className="agenda-financeiro-itens">
        <ReceberPacoteAntecipado atendimentoId={atendimentoId} inicial={financeiro}/>
        {financeiro.adicionais ? <ReceberAdicionais atendimentoId={atendimentoId} inicial={financeiro.adicionais} painelAgenda/> : <section className="agenda-financeiro-item"><h4>Serviços adicionais</h4><p className="agenda-financeiro-sem-adicionais">Nenhum adicional neste atendimento.</p></section>}
      </div>}
  </section>
}
