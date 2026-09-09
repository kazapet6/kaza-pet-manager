import { useContext, useMemo, useRef, useState } from 'react'
import Button from '../components/ui/Button.tsx'
import Modal from '../components/ui/Modal.tsx'
import { carregarVersoesConfirmacao } from '../confirmacao/clienteSupabase.ts'
import { AgendaContext } from '../context/AgendaContext.tsx'
import { ciclosAtivosNaData } from '../lib/ciclosTaxidog.ts'
import { supabase } from '../lib/supabase.ts'
import { calcularDisponibilidade } from '../motorDisponibilidade/motor.ts'
import { carregarDadosDisponibilidadeComCliente } from '../motorDisponibilidade/supabase.ts'
import type { OpcaoDisponibilidade } from '../motorDisponibilidade/tipos.ts'
import { remarcarAtendimento } from '../remarcacao/clienteSupabase.ts'
import type { RemarcacaoIntent } from '../remarcacao/contrato.ts'
import type { AgendaDiariaAtendimento } from '../types/AgendaDiaria.ts'
import { Calendario, Horarios } from './NovoAgendamentoModal.tsx'

export default function RemarcarAtendimentoModal({ atendimento, onClose, onRemarcado }: { atendimento: AgendaDiariaAtendimento; onClose: () => void; onRemarcado: (data: string) => Promise<void> }) {
  const agenda = useContext(AgendaContext)
  const [data, setData] = useState(atendimento.dataOperacional)
  const [cicloId, setCicloId] = useState(atendimento.taxidog?.cicloId ?? '')
  const [funcionarioResponsavelId, setFuncionarioResponsavelId] = useState(atendimento.funcionarioResponsavelId ?? '')
  const [opcoes, setOpcoes] = useState<OpcaoDisponibilidade[]>([])
  const [opcao, setOpcao] = useState<OpcaoDisponibilidade | null>(null)
  const [versoes, setVersoes] = useState<{ versaoConfiguracaoConsultada: number; versaoOcupacaoConsultada: number } | null>(null)
  const [revisao, setRevisao] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const chave = useRef(crypto.randomUUID())
  const emAndamento = useRef(false)
  const sequenciaConsulta = useRef(0)
  const ciclos = useMemo(() => ciclosAtivosNaData(agenda.taxidogCiclos.map((ciclo) => ({ ...ciclo, diasSemana: agenda.taxidogCicloDias.filter((dia) => dia.cicloId === ciclo.id && dia.ativo).map((dia) => dia.diaSemana) })), data).sort((a, b) => a.ordem - b.ordem), [agenda.taxidogCiclos, agenda.taxidogCicloDias, data])
  const solicitados = atendimento.servicos.filter((item) => item.origem === 'solicitado').map((item) => item.servicoId)

  async function consultar(novaData = data, novoCiclo = cicloId, novoFuncionarioId = funcionarioResponsavelId) {
    if (!novoFuncionarioId) return setErro('Selecione o funcionário responsável.')
    if (atendimento.modalidade === 'taxidog' && !novoCiclo) return setErro('Selecione um ciclo TaxiDog.')
    const consultaAtual = ++sequenciaConsulta.current
    setCarregando(true); setErro(null); setOpcao(null); setOpcoes([])
    try {
      const entrada = { petId: atendimento.petId, servicoIds: solicitados, data: novaData,
        preferenciaFuncionario: 'obrigatorio' as const,
        funcionarioPreferidoId: novoFuncionarioId,
        tipoPlanejamento: 'normal' as const,
        modalidade: atendimento.modalidade === 'taxidog' ? 'taxidog' as const : 'sem_transporte' as const,
        cicloTaxidogId: atendimento.modalidade === 'taxidog' ? novoCiclo : null }
      const [dados, atuais] = await Promise.all([
        carregarDadosDisponibilidadeComCliente(entrada, supabase, undefined, atendimento.id),
        carregarVersoesConfirmacao(),
      ])
      const resultado = calcularDisponibilidade(entrada, dados)
      if (consultaAtual !== sequenciaConsulta.current) return
      setVersoes(atuais); setOpcoes(resultado.opcoes)
      if (atendimento.modalidade === 'taxidog') setOpcao(resultado.opcoes[0] ?? null)
      if (!resultado.opcoes.length) setErro(resultado.motivos[0] ?? 'Nenhuma disponibilidade encontrada.')
    } catch (e) { if (consultaAtual === sequenciaConsulta.current) setErro(e instanceof Error ? e.message : 'Nao foi possivel consultar a disponibilidade.') }
    finally { if (consultaAtual === sequenciaConsulta.current) setCarregando(false) }
  }
  function escolherData(valor: string) {
    setData(valor); setRevisao(false); setOpcoes([]); setOpcao(null); setVersoes(null)
    if (atendimento.modalidade === 'normal') void consultar(valor, '')
    else { setCicloId(''); setErro(null) }
  }
  function escolherFuncionario(valor: string) {
    sequenciaConsulta.current += 1
    setFuncionarioResponsavelId(valor); setRevisao(false); setOpcoes([]); setOpcao(null); setVersoes(null); setCarregando(false)
    if (!valor) return setErro('Selecione o funcionário responsável.')
    setErro(null)
    if (atendimento.modalidade === 'normal') void consultar(data, '', valor)
    else if (cicloId) void consultar(data, cicloId, valor)
  }
  async function confirmar() {
    if (!opcao || !versoes || emAndamento.current) return
    emAndamento.current = true; setCarregando(true); setErro(null)
    const intencao: RemarcacaoIntent = {
      chaveIdempotencia: chave.current, atendimentoId: atendimento.id,
      grupoAgendamentoIdEsperado: atendimento.grupoId,
      statusEsperado: atendimento.status as 'agendado' | 'confirmado',
      inicioOperacionalEsperado: atendimento.inicio,
      funcionarioResponsavelIdEsperado: atendimento.funcionarioResponsavelId,
      funcionarioResponsavelId,
      data,
      horarioEscolhido: atendimento.modalidade === 'taxidog' ? null : opcao.horarioApresentado,
      modalidade: atendimento.modalidade === 'taxidog' ? 'taxidog' : 'sem_transporte',
      cicloTaxidogId: atendimento.modalidade === 'taxidog' ? cicloId : null,
      ...versoes,
    }
    try {
      const resposta = await remarcarAtendimento(intencao)
      if (resposta.status === 'remarcado') { await onRemarcado(data); return }
      if (resposta.status === 'disponibilidade_alterada' || resposta.status === 'configuracao_alterada') { setRevisao(false); setOpcao(null); setOpcoes([]) }
      setErro(resposta.mensagem)
    } catch { setErro('Nao foi possivel remarcar o atendimento. Tente novamente.') }
    finally { emAndamento.current = false; setCarregando(false) }
  }
  const ciclo = ciclos.find((item) => item.id === cicloId)
  return <Modal aberto titulo={<span className="novo-agendamento-titulo"><strong>Remarcar atendimento</strong><small>{atendimento.petNome}</small></span>} onClose={carregando ? () => undefined : onClose} maxWidth="min(92vw, 1050px)" className="novo-agendamento-modal">
    <div className="remarcacao-modal">
      {!revisao ? <><div className="novo-data-horarios"><Calendario data={data} selecionar={escolherData} /><section className="novo-horarios-painel"><label className="remarcacao-responsavel"><strong>Funcionário responsável</strong><span>O Motor validará a disponibilidade somente para a pessoa escolhida.</span><select value={funcionarioResponsavelId} onChange={(evento) => escolherFuncionario(evento.target.value)}><option value="">Selecione um funcionário</option>{agenda.funcionarios.filter((item) => item.ativo).map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label><header><span>{atendimento.modalidade === 'taxidog' ? 'Ciclo TaxiDog' : 'Horarios disponiveis'}</span><strong>{dataCurta(data)}</strong></header>
        {atendimento.modalidade === 'taxidog' ? <div className="novo-ciclos"><div>{ciclos.map((item) => <button type="button" className={cicloId === item.id ? 'selecionada' : ''} key={item.id} onClick={() => { setCicloId(item.id); void consultar(data, item.id) }}><strong>{item.nome}</strong><small>Coleta {item.coletaInicio}–{item.coletaFim}</small></button>)}</div></div>
          : carregando ? <p>Consultando disponibilidade...</p> : <Horarios opcoes={opcoes} selecionada={opcao} selecionar={setOpcao} />}
        {erro && <p className="novo-agendamento-erro" role="alert">{erro}</p>}</section></div>
        <footer className="novo-agendamento-acoes"><Button variant="secondary" onClick={onClose}>Cancelar</Button><div>{atendimento.modalidade === 'taxidog' && <Button variant="secondary" disabled={!cicloId || !funcionarioResponsavelId || carregando} onClick={() => void consultar()}>Consultar ciclo</Button>}<Button disabled={!funcionarioResponsavelId || !opcao || !versoes} onClick={() => setRevisao(true)}>Revisar remarcacao</Button></div></footer></>
        : <><section className="remarcacao-revisao"><h3>Revisar remarcacao</h3><p><strong>{atendimento.petNome}</strong> · {atendimento.servicos.map((item) => item.nome).join(' + ')}</p><p>Funcionário responsável: <strong>{agenda.funcionarios.find((item) => item.id === funcionarioResponsavelId)?.nome}</strong></p><div><article><small>DE</small><strong>{dataCurta(atendimento.dataOperacional)} · {atendimento.modalidade === 'taxidog' ? atendimento.taxidog?.cicloNome : hora(atendimento.inicio)}</strong></article><span>→</span><article><small>PARA</small><strong>{dataCurta(data)} · {atendimento.modalidade === 'taxidog' ? ciclo?.nome : opcao ? minutos(opcao.horarioApresentado) : ''}</strong></article></div>{erro && <p className="novo-agendamento-erro" role="alert">{erro}</p>}</section>
        <footer className="novo-agendamento-acoes"><Button variant="secondary" disabled={carregando} onClick={() => setRevisao(false)}>Voltar</Button><Button disabled={carregando} onClick={() => void confirmar()}>{carregando ? 'Remarcando...' : 'Confirmar remarcacao'}</Button></footer></>}
    </div>
  </Modal>
}
function dataCurta(data: string) { const [a,m,d] = data.split('-').map(Number); return new Intl.DateTimeFormat('pt-BR').format(new Date(a,m-1,d)) }
function minutos(valor: number) { return `${String(Math.floor(valor / 60)).padStart(2,'0')}:${String(valor % 60).padStart(2,'0')}` }
function hora(valor: string) { const data = new Date(valor); return `${String(data.getHours()).padStart(2,'0')}:${String(data.getMinutes()).padStart(2,'0')}` }
