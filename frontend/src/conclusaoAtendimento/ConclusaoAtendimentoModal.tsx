import { useCallback, useEffect, useRef, useState } from 'react'
import Button from '../components/ui/Button.tsx'
import Modal from '../components/ui/Modal.tsx'
import type { AgendaDiariaAtendimento } from '../types/AgendaDiaria.ts'
import { OCORRENCIAS_ATENDIMENTO, type TipoOcorrenciaAtendimento } from '../observacoesAtendimento/catalogo.ts'
import { executarObservacoesAtendimento } from '../observacoesAtendimento/clienteSupabase.ts'
import { alternarOcorrencia, normalizarObservacao, type ObservacoesAtendimento } from '../observacoesAtendimento/contrato.ts'
import { executarDadosConclusao } from './clienteSupabase.ts'
import { FORMAS_PAGAMENTO, type DadosConclusao, type FormaPagamento } from './contrato.ts'
import { acaoPrincipalConclusao, carregarEstadoConclusao, etapaAnteriorConclusao, proximaEtapaConclusao, retornosForamAlterados, type EstadoCarregamentoConclusao, type EtapaConclusao } from './fluxo.ts'
import type { AlterarStatusResposta } from '../statusAtendimento/contrato.ts'

const etapas = ['Observacoes', 'Pagamento', 'Retorno', 'Revisao']

type Props = {
  atendimento: AgendaDiariaAtendimento
  statusEsperado: string
  onClose: () => void
  onConcluir: (atendimento: AgendaDiariaAtendimento, statusEsperado: string) => Promise<AlterarStatusResposta>
}

export default function ConclusaoAtendimentoModal({ atendimento, statusEsperado, onClose, onConcluir }: Props) {
  const [etapa, setEtapa] = useState<EtapaConclusao>(0)
  const [estadoCarregamento, setEstadoCarregamento] = useState<EstadoCarregamentoConclusao>({ estado: 'carregando' })
  const [obs, setObs] = useState<ObservacoesAtendimento | null>(null)
  const [dados, setDados] = useState<DadosConclusao | null>(null)
  const [tipos, setTipos] = useState<TipoOcorrenciaAtendimento[]>([])
  const [texto, setTexto] = useState('')
  const [intervalos, setIntervalos] = useState<Record<string, string>>({})
  const [valor, setValor] = useState('')
  const [forma, setForma] = useState<FormaPagamento>('pix')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [descartar, setDescartar] = useState(false)
  const trava = useRef(false)
  const chaveRecebimento = useRef<string | null>(null)
  const cargaAtual = useRef(0)

  const carregar = useCallback(async () => {
    const carga = ++cargaAtual.current
    setEstadoCarregamento({ estado: 'carregando' })
    setErro(null)
    const resultado = await carregarEstadoConclusao({
      carregarObservacoes: () => executarObservacoesAtendimento({ operacao: 'carregar', atendimentoId: atendimento.id }),
      carregarDados: () => executarDadosConclusao({ operacao: 'carregar', atendimentoId: atendimento.id }),
    })
    if (carga !== cargaAtual.current) return
    setEstadoCarregamento(resultado)
    if (resultado.estado !== 'pronto') return
    setObs(resultado.observacoes)
    setDados(resultado.dados)
    setTipos(resultado.observacoes.ocorrencias)
    setTexto(resultado.observacoes.observacao ?? '')
    setIntervalos(Object.fromEntries(resultado.dados.retornos.map((item) => [item.atendimentoServicoId, item.intervaloDias?.toString() ?? ''])))
  }, [atendimento.id])

  useEffect(() => {
    setEtapa(0)
    setObs(null)
    setDados(null)
    setTipos([])
    setTexto('')
    setIntervalos({})
    setValor('')
    setDescartar(false)
    void carregar()
    const controleCarga = cargaAtual
    return () => { controleCarga.current++ }
  }, [atendimento.id, carregar])

  const obsAlterada = Boolean(obs)
    && (JSON.stringify(tipos) !== JSON.stringify(obs?.ocorrencias)
      || normalizarObservacao(texto) !== obs?.observacao)
  const retornosAlterados = dados ? retornosForamAlterados(dados.retornos, intervalos) : false
  const alterado = obsAlterada || retornosAlterados || Boolean(valor.trim())

  async function recarregarDados() {
    const resposta = await executarDadosConclusao({ operacao: 'carregar', atendimentoId: atendimento.id })
    if (resposta.status !== 'carregado') {
      setErro(mensagem(resposta, 'Falha ao recarregar os dados da conclusao.'))
      return false
    }
    setDados(resposta)
    return true
  }

  async function salvarObs() {
    if (!obs || !obsAlterada) return true
    const resposta = await executarObservacoesAtendimento({
      operacao: 'salvar', atendimentoId: atendimento.id, versaoEsperada: obs.versao,
      ocorrencias: tipos, observacao: normalizarObservacao(texto),
    })
    if (resposta.status !== 'salvo') {
      setErro(mensagem(resposta, 'Falha ao salvar observacoes.'))
      return false
    }
    const atualizada = await executarObservacoesAtendimento({ operacao: 'carregar', atendimentoId: atendimento.id })
    if (atualizada.status !== 'carregado') {
      setErro(mensagem(atualizada, 'Falha ao recarregar observacoes.'))
      return false
    }
    setObs(atualizada)
    return true
  }

  async function avancar() {
    setErro(null)
    if (etapa === 0 && !(await salvarObs())) return
    if (etapa === 2 && dados && retornosAlterados) {
      const recomendacoes = Object.entries(intervalos)
        .filter(([, intervalo]) => intervalo)
        .map(([atendimentoServicoId, intervalo]) => ({ atendimentoServicoId, intervaloDias: Number(intervalo) }))
      if (recomendacoes.some((item) => !Number.isInteger(item.intervaloDias) || item.intervaloDias < 1 || item.intervaloDias > 3650)) {
        setErro('Informe intervalos entre 1 e 3650 dias.')
        return
      }
      const resposta = await executarDadosConclusao({
        operacao: 'salvar_retornos', atendimentoId: atendimento.id,
        versaoEsperada: dados.retornosVersao, recomendacoes,
      })
      if (resposta.status !== 'salvo') {
        setErro(mensagem(resposta, 'Falha ao salvar retornos.'))
        return
      }
      if (!(await recarregarDados())) return
    }
    setEtapa((atual) => proximaEtapaConclusao(atual))
  }

  async function receber() {
    if (!dados || trava.current) return
    const numero = Number(valor.replace(',', '.'))
    if (!(numero > 0) || numero > dados.financeiro.saldo) {
      setErro('Informe um valor positivo que nao ultrapasse o saldo.')
      return
    }
    trava.current = true
    setOcupado(true)
    chaveRecebimento.current ??= crypto.randomUUID()
    try {
      const resposta = await executarDadosConclusao({
        operacao: 'receber', atendimentoId: atendimento.id,
        chaveIdempotencia: chaveRecebimento.current, valor: numero, formaPagamento: forma,
      })
      if (resposta.status !== 'registrado') {
        setErro(mensagem(resposta, 'Falha ao registrar.'))
        return
      }
      chaveRecebimento.current = null
      setValor('')
      await recarregarDados()
    } finally {
      trava.current = false
      setOcupado(false)
    }
  }

  async function isentar() {
    if (!dados || trava.current) return
    setOcupado(true)
    try {
      const resposta = await executarDadosConclusao({
        operacao: 'isentar', atendimentoId: atendimento.id,
        versaoEsperada: dados.financeiro.versao, isento: !dados.financeiro.isento,
      })
      if (resposta.status !== 'atualizado') {
        setErro(mensagem(resposta, 'Falha ao atualizar isencao.'))
        return
      }
      await recarregarDados()
    } finally {
      setOcupado(false)
    }
  }

  async function concluir() {
    if (trava.current || acaoPrincipalConclusao(etapa) !== 'concluir') return
    trava.current = true
    setOcupado(true)
    try {
      const resposta = await onConcluir(atendimento, statusEsperado)
      if (resposta.status === 'conflito') setErro('O atendimento foi alterado. Os dados oficiais foram recarregados.')
      else if (resposta.status === 'invalido') setErro(resposta.mensagem)
      else onClose()
    } finally {
      trava.current = false
      setOcupado(false)
    }
  }

  function fechar() {
    if (alterado) setDescartar(true)
    else onClose()
  }

  const pronto = estadoCarregamento.estado === 'pronto' && obs && dados
  return <Modal aberto titulo={<span><strong>Concluir atendimento</strong><small className="observacoes-identidade">{atendimento.petNome} · Tutor: {atendimento.tutorNome}</small></span>} onClose={fechar} maxWidth="760px" className="conclusao-modal">
    <div className="conclusao-conteudo">
      <ol className="conclusao-etapas">{etapas.map((nome, indice) => <li className={indice === etapa ? 'atual' : indice < etapa ? 'feito' : ''} key={nome}><span>{indice + 1}</span>{nome}</li>)}</ol>
      {estadoCarregamento.estado === 'carregando' && <p role="status">Carregando dados da conclusao...</p>}
      {estadoCarregamento.estado === 'erro' && <div className="conclusao-estado-erro"><p role="alert" className="observacoes-erro">{estadoCarregamento.mensagem}</p><Button variant="secondary" onClick={() => void carregar()}>Tentar novamente</Button></div>}
      {pronto && <>
        {etapa === 0 && <div className="observacoes-categorias">{OCORRENCIAS_ATENDIMENTO.map((categoria) => <section key={categoria.categoria}><h3>{categoria.categoria}</h3><div>{categoria.itens.map(([tipo, rotulo]) => <button key={tipo} type="button" aria-pressed={tipos.includes(tipo)} onClick={() => setTipos(alternarOcorrencia(tipos, tipo))}>{rotulo}</button>)}</div></section>)}<label className="observacoes-campo conclusao-observacao"><span>Observacao operacional <small>opcional</small></span><textarea rows={3} maxLength={1000} value={texto} onChange={(evento) => setTexto(evento.target.value)} /><small>{texto.length}/1000</small></label></div>}
        {etapa === 1 && <section className="conclusao-pagamento"><ResumoFinanceiro dados={dados} /><div className="conclusao-receber"><label>Valor a receber agora<input inputMode="decimal" value={valor} disabled={dados.financeiro.isento || ocupado} onChange={(evento) => { chaveRecebimento.current = null; setValor(evento.target.value) }} /></label><fieldset><legend>Forma</legend>{FORMAS_PAGAMENTO.map((item) => <button type="button" className={forma === item ? 'ativo' : ''} onClick={() => { chaveRecebimento.current = null; setForma(item) }} key={item}>{item}</button>)}</fieldset><Button disabled={dados.financeiro.isento || ocupado || dados.financeiro.saldo === 0} onClick={() => void receber()}>Registrar recebimento</Button></div><button type="button" className="conclusao-isentar" disabled={dados.financeiro.totalRecebido > 0 || ocupado} onClick={() => void isentar()}>{dados.financeiro.isento ? 'Remover isencao' : 'Marcar como isento'}</button></section>}
        {etapa === 2 && <section className="conclusao-retornos">{dados.retornos.map((item) => <label key={item.atendimentoServicoId}><strong>{item.nome}</strong><span>Retornar em <input type="number" min="1" max="3650" value={intervalos[item.atendimentoServicoId] ?? ''} onChange={(evento) => setIntervalos({ ...intervalos, [item.atendimentoServicoId]: evento.target.value })} /> dias</span><small>{intervalos[item.atendimentoServicoId] ? dataSomada(atendimento.dataOperacional, Number(intervalos[item.atendimentoServicoId])) : 'Sem recomendacao de retorno'}</small></label>)}</section>}
        {etapa === 3 && <section className="conclusao-revisao"><div><h3>Observacoes</h3><p>{tipos.length ? tipos.join(', ') : 'Nenhuma ocorrencia'}{normalizarObservacao(texto) ? <><br />{normalizarObservacao(texto)}</> : null}</p></div><div><h3>Pagamento</h3><ResumoFinanceiro dados={dados} /></div><div><h3>Retorno</h3>{dados.retornos.filter((item) => intervalos[item.atendimentoServicoId]).map((item) => <p key={item.atendimentoServicoId}>{item.nome}: {intervalos[item.atendimentoServicoId]} dias · {dataSomada(atendimento.dataOperacional, Number(intervalos[item.atendimentoServicoId]))}</p>)}{!Object.values(intervalos).some(Boolean) && <p>Sem recomendacao</p>}</div></section>}
      </>}
      {erro && <p role="alert" className="observacoes-erro">{erro}</p>}
      {descartar && <div className="observacoes-descarte"><span><strong>Descartar alteracoes?</strong><small>Alteracoes nao salvas serao perdidas.</small></span><button onClick={() => setDescartar(false)}>Continuar</button><button onClick={onClose}>Descartar</button></div>}
      <footer><Button variant="secondary" onClick={etapa && pronto ? () => setEtapa((atual) => etapaAnteriorConclusao(atual)) : fechar}>{etapa && pronto ? 'Voltar' : 'Cancelar'}</Button>{pronto && (acaoPrincipalConclusao(etapa) === 'avancar' ? <Button onClick={() => void avancar()}>Avancar</Button> : <Button disabled={ocupado} onClick={() => void concluir()}>{ocupado ? 'Concluindo...' : 'Concluir atendimento'}</Button>)}</footer>
    </div>
  </Modal>
}

function ResumoFinanceiro({ dados }: { dados: DadosConclusao }) {
  const financeiro = dados.financeiro
  return <div className="conclusao-financeiro-resumo"><span>Valor<strong>{moeda(financeiro.valorFinal)}</strong></span><span>Recebido<strong>{moeda(financeiro.totalRecebido)}</strong></span><span>Saldo<strong>{moeda(financeiro.saldo)}</strong></span><span>Situacao<strong>{financeiro.situacao}</strong></span></div>
}

function moeda(valor: number) { return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function dataSomada(data: string, dias: number) { if (!Number.isFinite(dias)) return ''; const resultado = new Date(`${data}T12:00:00Z`); resultado.setUTCDate(resultado.getUTCDate() + dias); return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(resultado) }
function mensagem(valor: unknown, padrao: string) { return typeof valor === 'object' && valor !== null && 'mensagem' in valor && typeof valor.mensagem === 'string' ? valor.mensagem : padrao }
