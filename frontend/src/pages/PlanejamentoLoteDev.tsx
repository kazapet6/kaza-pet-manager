import { useContext, useMemo, useState } from 'react'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import { AgendaContext } from '../context/AgendaContext'
import { SistemaContext } from '../context/SistemaContext'
import { ciclosAtivosNaData } from '../lib/ciclosTaxidog'
import { consultarPlanejamentoLote, LIMITES_PLANEJADOR_DEV, minutosParaHora, rotuloEtapaComAcoplamentos, type OcupacoesSimuladas, type PreferenciaFuncionario, type ResultadoPlanejamentoLote } from '../motorDisponibilidade'

type ItemLote = { id: string; petId: string; servicoIds: string[]; modalidade: 'sem_transporte' | 'taxidog'; cicloTaxidogId: string; preferencia: PreferenciaFuncionario; funcionarioId: string }
type OcupacaoDev = { id: string; tipo: 'funcionario' | 'equipamento'; recursoId: string; petId: string; inicio: string; fim: string }

export default function PlanejamentoLoteDev() {
  const sistema = useContext(SistemaContext)
  const agenda = useContext(AgendaContext)
  const [data, setData] = useState(dataLocalHoje())
  const [itens, setItens] = useState<ItemLote[]>([novoItem()])
  const [ocupacoes, setOcupacoes] = useState<OcupacaoDev[]>([])
  const [resultado, setResultado] = useState<ResultadoPlanejamentoLote | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [processando, setProcessando] = useState(false)
  const ciclos = useMemo(() => ciclosAtivosNaData(agenda.taxidogCiclos.map((ciclo) => ({ ...ciclo, diasSemana: agenda.taxidogCicloDias.filter((dia) => dia.cicloId === ciclo.id && dia.ativo).map((dia) => dia.diaSemana) })), data).sort((a, b) => a.ordem - b.ordem), [agenda.taxidogCiclos, agenda.taxidogCicloDias, data])

  function alterarItem(id: string, alteracao: Partial<ItemLote>) { setItens((atuais) => atuais.map((item) => item.id === id ? { ...item, ...alteracao } : item)); setResultado(null) }
  function adicionarPet() { if (itens.length < LIMITES_PLANEJADOR_DEV.maximoPets) setItens((atuais) => [...atuais, novoItem()]) }

  async function executar() {
    setErro(null); setResultado(null)
    for (const item of itens) {
      if (!item.petId || !item.servicoIds.length) return setErro('Selecione Pet e serviço em todas as solicitações.')
      if (item.modalidade === 'taxidog' && !item.cicloTaxidogId) return setErro('Selecione o ciclo TaxiDog de todos os pets com transporte.')
      if (item.preferencia !== 'automatico' && !item.funcionarioId) return setErro('Selecione o funcionário das preferências informadas.')
    }
    setProcessando(true)
    try {
      const solicitacoes = itens.map((item) => ({ id: item.id, entrada: { petId: item.petId, servicoIds: item.servicoIds, data, preferenciaFuncionario: item.preferencia, funcionarioPreferidoId: item.preferencia === 'automatico' ? null : item.funcionarioId, tipoPlanejamento: 'normal' as const, modalidade: item.modalidade, cicloTaxidogId: item.modalidade === 'taxidog' ? item.cicloTaxidogId : null } }))
      setResultado(await consultarPlanejamentoLote(solicitacoes, materializarOcupacoes(ocupacoes, sistema.pets)))
    } catch (error) { setErro(mensagemErro(error)) } finally { setProcessando(false) }
  }

  return <section className="teste-motor-lote teste-motor-painel">
    <header><div><span>DEV · somente memória</span><h2>Planejamento de múltiplos pets</h2><p>Explora horários, funcionários, unidades e ordens sem criar reservas.</p></div><small>Até {LIMITES_PLANEJADOR_DEV.maximoPets} pets · {LIMITES_PLANEJADOR_DEV.maximoEstados} estados</small></header>
    <label className="lote-data"><span>Data do lote</span><Input type="date" value={data} onChange={(e) => { setData(e.target.value); setResultado(null) }} /></label>
    <div className="lote-pets">{itens.map((item, indice) => <article key={item.id}>
      <div className="lote-pet-topo"><strong>Pet {indice + 1}</strong>{itens.length > 1 && <button type="button" onClick={() => setItens((atuais) => atuais.filter((atual) => atual.id !== item.id))}>Remover</button>}</div>
      <div className="form-grid"><label><span>Pet</span><Select value={item.petId} onChange={(e) => alterarItem(item.id, { petId: e.target.value })} options={[{ value: '', label: 'Selecione' }, ...sistema.pets.map((pet) => ({ value: pet.id, label: pet.nome }))]} /></label><label><span>Modalidade</span><Select value={item.modalidade} onChange={(e) => alterarItem(item.id, { modalidade: e.target.value as ItemLote['modalidade'], cicloTaxidogId: '' })} options={[{ value: 'sem_transporte', label: 'Sem transporte' }, { value: 'taxidog', label: 'TaxiDog' }]} /></label></div>
      <fieldset><legend>Serviços</legend><div className="teste-motor-servicos">{agenda.servicos.filter((servico) => servico.ativo).map((servico) => <label key={servico.id}><input type="checkbox" checked={item.servicoIds.includes(servico.id)} onChange={() => alterarItem(item.id, { servicoIds: item.servicoIds.includes(servico.id) ? item.servicoIds.filter((id) => id !== servico.id) : [...item.servicoIds, servico.id] })} /><span>{servico.nome}</span></label>)}</div></fieldset>
      {item.modalidade === 'taxidog' && <label><span>Ciclo</span><Select value={item.cicloTaxidogId} onChange={(e) => alterarItem(item.id, { cicloTaxidogId: e.target.value })} options={[{ value: '', label: ciclos.length ? 'Selecione' : 'Nenhum ciclo nesta data' }, ...ciclos.map((ciclo) => ({ value: ciclo.id, label: `${ciclo.nome} · até ${hora(ciclo.conclusaoLimite)}` }))]} /></label>}
      <div className="form-grid"><label><span>Preferência</span><Select value={item.preferencia} onChange={(e) => alterarItem(item.id, { preferencia: e.target.value as PreferenciaFuncionario, funcionarioId: '' })} options={[{ value: 'automatico', label: 'Automático' }, { value: 'preferencial', label: 'Preferencial' }, { value: 'obrigatorio', label: 'Obrigatório' }]} /></label>{item.preferencia !== 'automatico' && <label><span>Funcionário</span><Select value={item.funcionarioId} onChange={(e) => alterarItem(item.id, { funcionarioId: e.target.value })} options={[{ value: '', label: 'Selecione' }, ...agenda.funcionarios.filter((f) => f.ativo).map((f) => ({ value: f.id, label: f.nome }))]} /></label>}</div>
    </article>)}</div>
    <Button variant="secondary" onClick={adicionarPet} disabled={itens.length >= LIMITES_PLANEJADOR_DEV.maximoPets}>+ Adicionar pet</Button>
    <Ocupacoes ocupacoes={ocupacoes} alterar={setOcupacoes} />
    {erro && <p className="teste-motor-erro">{erro}</p>}
    <Button onClick={() => void executar()} disabled={processando}>{processando ? 'Planejando…' : 'Planejar conjunto'}</Button>
    {resultado && <ResultadoLote resultado={resultado} />}
  </section>
}

function Ocupacoes({ ocupacoes, alterar }: { ocupacoes: OcupacaoDev[]; alterar: React.Dispatch<React.SetStateAction<OcupacaoDev[]>> }) {
  const sistema = useContext(SistemaContext); const agenda = useContext(AgendaContext)
  function mudar(id: string, mudanca: Partial<OcupacaoDev>) { alterar((atuais) => atuais.map((item) => item.id === id ? { ...item, ...mudanca } : item)) }
  return <details className="lote-ocupacoes"><summary>Simulação de ocupações <small>({ocupacoes.length})</small></summary><div><p>Essas ocupações existem apenas nesta tela e são descartadas ao recarregar.</p>{ocupacoes.map((item) => <article key={item.id}><Select value={item.tipo} onChange={(e) => mudar(item.id, { tipo: e.target.value as OcupacaoDev['tipo'], recursoId: '' })} options={[{ value: 'funcionario', label: 'Funcionário exclusivo' }, { value: 'equipamento', label: 'Equipamento/unidade' }]} /><Select value={item.recursoId} onChange={(e) => mudar(item.id, { recursoId: e.target.value })} options={[{ value: '', label: 'Selecione o recurso' }, ...(item.tipo === 'funcionario' ? agenda.funcionarios.filter((f) => f.ativo).map((f) => ({ value: f.id, label: f.nome })) : agenda.equipamentoUnidades.filter((unidade) => unidade.ativo).map((unidade) => ({ value: unidade.id, label: `${agenda.equipamentos.find((equipamento) => equipamento.id === unidade.equipamentoId)?.nome ?? 'Equipamento'} · ${unidade.nome || `Unidade ${unidade.numero}`}` })))]} />{item.tipo === 'equipamento' && <Select value={item.petId} onChange={(e) => mudar(item.id, { petId: e.target.value })} options={[{ value: '', label: 'Pet que ocupa' }, ...sistema.pets.map((pet) => ({ value: pet.id, label: pet.nome }))]} />}<Input type="time" value={item.inicio} onChange={(e) => mudar(item.id, { inicio: e.target.value })} /><Input type="time" value={item.fim} onChange={(e) => mudar(item.id, { fim: e.target.value })} /><button type="button" onClick={() => alterar((atuais) => atuais.filter((atual) => atual.id !== item.id))}>Remover</button></article>)}<Button variant="secondary" onClick={() => alterar((atuais) => [...atuais, { id: crypto.randomUUID(), tipo: 'funcionario', recursoId: '', petId: '', inicio: '09:00', fim: '09:30' }])}>+ Adicionar ocupação</Button></div></details>
}

function ResultadoLote({ resultado }: { resultado: ResultadoPlanejamentoLote }) {
  return <div className={`lote-resultado ${resultado.estado.toLowerCase()}`}><header><strong>{resultado.estado.replaceAll('_', ' ')}</strong><span>{resultado.estadosExplorados} estado(s) · backtracking {resultado.houveBacktracking ? 'sim' : 'não'}</span></header>{resultado.motivos.map((motivo) => <p key={motivo}>{motivo}</p>)}{resultado.estado === 'SOLUCAO' && <><p>Ordem escolhida: {resultado.ordemEscolhida.join(' → ')}</p><div>{resultado.planejamentos.map((plano) => <article key={plano.solicitacaoId}><h3>{plano.petNome}</h3><p>Início {minutosParaHora(plano.opcao.inicioOperacional)} · conclusão {minutosParaHora(plano.opcao.conclusaoPrevista)}</p>{plano.opcao.etapas.map((etapa) => <small key={etapa.etapaId}>{minutosParaHora(etapa.inicio)}–{minutosParaHora(etapa.fim)} {rotuloEtapaComAcoplamentos(etapa)} · {[...etapa.funcionarios.map((f) => f.nome), ...etapa.equipamentos.map((e) => e.unidadeNome)].join(', ') || 'sem recurso exclusivo'}</small>)}</article>)}</div><strong>Último pet concluído: {minutosParaHora(resultado.conclusaoUltimoPet!)}</strong>{resultado.retiradaPrevistaGrupo !== null && <span>Retirada conjunta prevista: {minutosParaHora(resultado.retiradaPrevistaGrupo)}</span>}</>}</div>
}

function materializarOcupacoes(itens: OcupacaoDev[], pets: SistemaContextShape['pets']): Partial<OcupacoesSimuladas> {
  return { funcionarios: itens.filter((item) => item.tipo === 'funcionario' && item.recursoId && item.fim > item.inicio).map((item) => ({ id: item.id, funcionarioId: item.recursoId, inicio: minutos(item.inicio), fim: minutos(item.fim) })), equipamentos: itens.filter((item) => item.tipo === 'equipamento' && item.recursoId && item.petId && item.fim > item.inicio).map((item) => { const pet = pets.find((p) => p.id === item.petId)!; return { id: item.id, unidadeId: item.recursoId, inicio: minutos(item.inicio), fim: minutos(item.fim), porte: pet.porte, sexo: pet.sexo } }) }
}

type SistemaContextShape = React.ContextType<typeof SistemaContext>
function novoItem(): ItemLote { return { id: crypto.randomUUID(), petId: '', servicoIds: [], modalidade: 'sem_transporte', cicloTaxidogId: '', preferencia: 'automatico', funcionarioId: '' } }
function minutos(valor: string) { const [h, m] = valor.split(':').map(Number); return h * 60 + m }
function hora(valor: string) { return valor.slice(0, 5) }
function dataLocalHoje() { const agora = new Date(); const deslocamento = agora.getTimezoneOffset() * 60_000; return new Date(agora.getTime() - deslocamento).toISOString().slice(0, 10) }
function mensagemErro(error: unknown) { return typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Não foi possível planejar o lote.' }
