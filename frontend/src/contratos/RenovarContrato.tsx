import { useEffect, useRef, useState } from 'react'
import Button from '../components/ui/Button'
import { fluxoRenovacao } from './clienteRenovacao.ts'
import type { TentativaRenovacao } from './renovacaoFluxo.ts'
import type { RespostaRenovacao } from '../../../supabase/functions/_shared/contrato-renovacao.ts'

export default function RenovarContrato({ contratoId, cicloId, cicloNumero, elegivel, aposRenovacao }: { contratoId: string; cicloId: string; cicloNumero: number; elegivel: boolean; aposRenovacao(): Promise<void> }) {
  const [tentativa, setTentativa] = useState<TentativaRenovacao | null>(null), [dataAncora, setData] = useState(''), [erro, setErro] = useState(''), [ocupado, setOcupado] = useState(false), [recuperado, setRecuperado] = useState(false), [resultado, setResultado] = useState<RespostaRenovacao | null>(null)
  const enviando = useRef(false)
  useEffect(() => { let ativo = true; setRecuperado(false); void fluxoRenovacao.recuperar(contratoId, cicloId).then(x => { if (ativo) { setTentativa(x); setData(x?.solicitacao.dataAncora ?? ''); setResultado(x?.resultado ?? null); setRecuperado(true) } }).catch(() => { if (ativo) { setErro('Não foi possível recuperar uma tentativa anterior. Nenhuma operação foi enviada.'); setRecuperado(false) } }); return () => { ativo = false } }, [contratoId, cicloId])
  async function agir(confirmar: boolean) {
    if (enviando.current || !recuperado) return
    enviando.current = true; setOcupado(true); setErro('')
    try {
      if (!confirmar) {
        await fluxoRenovacao.preparar(contratoId, cicloId, dataAncora)
        setTentativa(await fluxoRenovacao.recuperar(contratoId, cicloId))
      } else {
        const r = await fluxoRenovacao.confirmar(contratoId, cicloId); setResultado(r)
        if (['renovado', 'requer_revisao', 'materializacao_pendente'].includes(r.status)) {
          try { await aposRenovacao() } catch { setErro('O novo ciclo foi confirmado, mas a atualização da tela falhou. Recarregue contrato e Agenda; não crie outra renovação.') }
        }
      }
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível confirmar o resultado. Retome a mesma tentativa.') }
    finally { try { setTentativa(await fluxoRenovacao.recuperar(contratoId, cicloId)) } catch { /* manter a tentativa anterior visível */ } enviando.current = false; setOcupado(false) }
  }
  async function alterarPreparacao() {
    if (enviando.current) return
    enviando.current = true; setOcupado(true)
    try { await fluxoRenovacao.descartarPreparacao(contratoId, cicloId); setTentativa(null); setResultado(null); setErro('') }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível alterar a preparação.') }
    finally { enviando.current = false; setOcupado(false) }
  }
  if (!elegivel && !tentativa && !erro) return null
  const concluido = resultado?.status === 'renovado' || resultado?.status === 'requer_revisao'
  return <section className="contrato-painel-compacto" aria-label="Renovação do ciclo">
    <h3>Renovar ciclo {cicloNumero}</h3>
    {erro && <p role="alert">{erro}</p>}
    {resultado && <p role={['invalido', 'conflito', 'erro'].includes(resultado.status) ? 'alert' : 'status'}>{resultado.mensagem}</p>}
    {!concluido && <>
      <label>Primeira data do novo ciclo <input type="date" value={dataAncora} disabled={ocupado || Boolean(tentativa)} onChange={e => setData(e.target.value)} /></label>
      <p>A data organiza a nova Agenda. Ela não encerra o ciclo anterior.</p>
      {tentativa && !tentativa.confirmacaoEnviada && <Button variant="secondary" disabled={ocupado} onClick={() => void alterarPreparacao()}>Alterar preparação antes de confirmar</Button>}
      {!tentativa?.preparado ? <Button disabled={ocupado || !recuperado || !elegivel || !dataAncora} onClick={() => void agir(false)}>{ocupado ? 'Preparando…' : 'Preparar renovação'}</Button> : <>
        <p>{tentativa.preparado.mensagem}</p>
        <Button disabled={ocupado} onClick={() => void agir(true)}>{ocupado ? 'Confirmando…' : resultado || erro ? 'Retomar a mesma tentativa' : tentativa.preparado.disponivel ? 'Confirmar renovação' : 'Criar ciclo para revisão'}</Button>
      </>}
    </>}
  </section>
}
