import { useEffect, useRef, useState } from 'react'
import Button from '../components/ui/Button.tsx'
import Modal from '../components/ui/Modal.tsx'
import type { AgendaDiariaAtendimento } from '../types/AgendaDiaria.ts'
import { OCORRENCIAS_ATENDIMENTO, type TipoOcorrenciaAtendimento } from './catalogo.ts'
import { executarObservacoesAtendimento } from './clienteSupabase.ts'
import { alternarOcorrencia, LIMITE_OBSERVACAO_ATENDIMENTO, normalizarObservacao, type ObservacoesAtendimento } from './contrato.ts'

export default function ObservacoesAtendimentoModal({ atendimento, onClose, onSalvo }: { atendimento: AgendaDiariaAtendimento; onClose: () => void; onSalvo: () => void }) {
  const [oficial, setOficial] = useState<ObservacoesAtendimento | null>(null)
  const [ocorrencias, setOcorrencias] = useState<TipoOcorrenciaAtendimento[]>([])
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true), [salvando, setSalvando] = useState(false)
  const [confirmarDescarte, setConfirmarDescarte] = useState(false)
  const emAndamento = useRef(false)
  useEffect(() => {
    let ativo = true
    setCarregando(true)
    void executarObservacoesAtendimento({ operacao: 'carregar', atendimentoId: atendimento.id }).then((resposta) => {
      if (!ativo) return
      if (resposta.status !== 'carregado') { setErro('mensagem' in resposta ? resposta.mensagem : 'Resposta inesperada ao carregar.'); return }
      aplicar(resposta)
    }).catch(() => ativo && setErro('Nao foi possivel carregar as observacoes.')).finally(() => ativo && setCarregando(false))
    return () => { ativo = false }
  }, [atendimento.id])
  const alterado = oficial ? JSON.stringify(ocorrencias) !== JSON.stringify(oficial.ocorrencias) || normalizarObservacao(observacao) !== oficial.observacao : false
  function aplicar(valor: ObservacoesAtendimento) { setOficial(valor); setOcorrencias(valor.ocorrencias); setObservacao(valor.observacao ?? ''); setErro(null) }
  function fecharSolicitado() { if (alterado && oficial?.editavel) setConfirmarDescarte(true); else onClose() }
  async function salvar() {
    if (!oficial?.editavel || emAndamento.current || observacao.length > LIMITE_OBSERVACAO_ATENDIMENTO) return
    emAndamento.current = true; setSalvando(true); setErro(null)
    try {
      const resposta = await executarObservacoesAtendimento({ operacao: 'salvar', atendimentoId: atendimento.id, versaoEsperada: oficial.versao, ocorrencias, observacao: normalizarObservacao(observacao) })
      if (resposta.status === 'conflito') { aplicar(resposta.oficial); setErro('As observacoes foram alteradas por outro usuario. Dados oficiais recarregados; revise antes de salvar.'); return }
      if (resposta.status !== 'salvo') { setErro('mensagem' in resposta ? resposta.mensagem : 'Resposta inesperada ao salvar.'); return }
      const recarregada = await executarObservacoesAtendimento({ operacao: 'carregar', atendimentoId: atendimento.id })
      if (recarregada.status !== 'carregado') { setErro('mensagem' in recarregada ? recarregada.mensagem : 'Resposta inesperada ao recarregar.'); return }
      aplicar(recarregada); onSalvo(); onClose()
    } catch { setErro('Nao foi possivel salvar as observacoes.') }
    finally { emAndamento.current = false; setSalvando(false) }
  }
  return <Modal aberto titulo={<span><strong>Observacoes e ocorrencias</strong><small className="observacoes-identidade">{atendimento.petNome} · Tutor: {atendimento.tutorNome}</small></span>} onClose={fecharSolicitado} maxWidth="720px" className="observacoes-modal">
    <div className="observacoes-conteudo">
      {carregando ? <p>Carregando observacoes...</p> : erro && !oficial ? <p role="alert" className="observacoes-erro">{erro}</p> : oficial && <>
        {!oficial.editavel && <p className="observacoes-leitura">Atendimento encerrado. Informacoes disponiveis somente para leitura.</p>}
        <div className="observacoes-categorias">{OCORRENCIAS_ATENDIMENTO.map((categoria) => <section key={categoria.categoria}><h3>{categoria.categoria}</h3><div>{categoria.itens.map(([tipo, rotulo]) => <button type="button" key={tipo} aria-pressed={ocorrencias.includes(tipo)} disabled={!oficial.editavel || salvando} onClick={() => setOcorrencias(alternarOcorrencia(ocorrencias, tipo))}>{rotulo}</button>)}</div></section>)}</div>
        <label className="observacoes-campo"><span>Observacao operacional <small>opcional</small></span><textarea value={observacao} maxLength={LIMITE_OBSERVACAO_ATENDIMENTO} readOnly={!oficial.editavel} rows={3} onChange={(event) => setObservacao(event.target.value)} /><small>{observacao.length}/{LIMITE_OBSERVACAO_ATENDIMENTO}</small></label>
        {erro && <p role="alert" className="observacoes-erro">{erro}</p>}
        {confirmarDescarte && <div className="observacoes-descarte" role="alertdialog"><span><strong>Descartar alteracoes?</strong><small>Nada sera salvo.</small></span><button type="button" onClick={() => setConfirmarDescarte(false)}>Continuar editando</button><button type="button" onClick={onClose}>Descartar</button></div>}
      </>}
      <footer><Button variant="secondary" onClick={fecharSolicitado}>{oficial?.editavel ? 'Cancelar' : 'Fechar'}</Button>{oficial?.editavel && <Button disabled={!alterado || salvando} onClick={() => void salvar()}>{salvando ? 'Salvando...' : 'Salvar'}</Button>}</footer>
    </div>
  </Modal>
}
