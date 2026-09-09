import { useCallback, useEffect, useRef, useState } from 'react'
import NovoAgendamentoModal from '../agenda/NovoAgendamentoModal.tsx'
import RemarcarAtendimentoModal from '../agenda/RemarcarAtendimentoModal.tsx'
import GradeAgenda from '../agenda/GradeAgenda.tsx'
import type { ContextoGrade, Expediente } from '../agenda/gradeTemporal.ts'
import { carregarBlocosEstabelecimento } from '../data/funcionamentoAgenda.ts'
import { obterAcaoRapidaAtendimento } from '../agenda/acaoRapidaAtendimento.ts'
import Button from '../components/ui/Button.tsx'
import Modal from '../components/ui/Modal.tsx'
import { carregarAgendaDiaria } from '../data/agendaDiaria.ts'
import { supabase } from '../lib/supabase.ts'
import { alterarStatusAtendimento } from '../statusAtendimento/clienteSupabase.ts'
import ObservacoesAtendimentoModal from '../observacoesAtendimento/ObservacoesAtendimentoModal.tsx'
import ConclusaoAtendimentoModal from '../conclusaoAtendimento/ConclusaoAtendimentoModal.tsx'
import { podeAbrirConclusao } from '../conclusaoAtendimento/contrato.ts'
import { executarDadosConclusao } from '../conclusaoAtendimento/clienteSupabase.ts'
import { financeiroDaResposta, textoFinanceiro } from '../agenda/financeiroAtendimento.ts'
import { statusAtendimento, type AcaoExcepcionalAtendimento, type AlterarStatusIntent, type AlterarStatusResposta, type StatusOperacionalEditavel } from '../statusAtendimento/contrato.ts'
import { opcoesStatusOperacional, podeEditarStatus, podeExecutarAcaoExcepcional, rotuloStatusAtendimento } from '../statusAtendimento/politica.ts'
import type {
  AgendaDiariaAtendimento,
  AgendaDiariaResultado,
} from '../types/AgendaDiaria.ts'

export default function Agenda({ onVerContrato }: { onVerContrato: (contratoId: string) => void }) {
  const [data, setData] = useState('')
  const [agenda, setAgenda] = useState<AgendaDiariaResultado | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<AgendaDiariaAtendimento | null>(null)
  const [blocos, setBlocos] = useState<Expediente[]>([])
  const [contextoNovo, setContextoNovo] = useState<ContextoGrade>({})
  const detalheConsulta = useRef(0)
  const [novoAberto, setNovoAberto] = useState(false)
  const [remarcando, setRemarcando] = useState<AgendaDiariaAtendimento | null>(null)
  const [concluindo, setConcluindo] = useState<AgendaDiariaAtendimento | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [acaoRapidaAtualizandoId, setAcaoRapidaAtualizandoId] = useState<string | null>(null)
  const [agora, setAgora] = useState(() => new Date())
  const requisicao = useRef(0)
  const acaoRapidaEmAndamento = useRef<string | null>(null)

  const carregar = useCallback(async (dataDesejada?: string) => {
    const atual = ++requisicao.current
    setCarregando(true); setErro(null); setDetalhe(null)
    try {
      const [resultado, expediente] = await Promise.all([carregarAgendaDiaria(supabase, dataDesejada), carregarBlocosEstabelecimento()])
      if (atual !== requisicao.current) return
      setBlocos(expediente); setAgenda(resultado); setData(resultado.dataOperacional)
      return true
    } catch (error) {
      if (atual !== requisicao.current) return
      setErro(mensagemErro(error))
      return false
    } finally {
      if (atual === requisicao.current) setCarregando(false)
    }
  }, [])

  useEffect(() => { void carregar() }, [carregar])
  useEffect(() => {
    const intervalo = window.setInterval(() => setAgora(new Date()), 60_000)
    return () => window.clearInterval(intervalo)
  }, [])
  function mudarData(novaData: string) { if (novaData) void carregar(novaData) }
  function abrirNovo(contexto: ContextoGrade = {}) { setContextoNovo(contexto); setNovoAberto(true) }
  async function abrirDetalhe(item: AgendaDiariaAtendimento) {
    const consulta = ++detalheConsulta.current
    setDetalhe(item)
    try {
      const resposta = await executarDadosConclusao({ operacao: 'carregar', atendimentoId: item.id })
      if (consulta === detalheConsulta.current) setDetalhe(atual => atual?.id === item.id ? { ...atual, financeiro: financeiroDaResposta(resposta) } : atual)
    } catch { /* O detalhe permanece acessível quando o financeiro está indisponível. */ }
  }
  async function concluirNovoAgendamento(dataConfirmada: string) {
    const atualizada = await carregar(dataConfirmada)
    if (!atualizada) throw new Error('Agenda não atualizada após confirmação.')
    setNovoAberto(false)
    setSucesso('Agendamento confirmado com sucesso.')
  }
  async function concluirRemarcacao(dataConfirmada: string) {
    const atualizada = await carregar(dataConfirmada)
    if (!atualizada) throw new Error('Agenda nao atualizada apos remarcacao.')
    setRemarcando(null); setSucesso('Atendimento remarcado com sucesso.')
  }
  async function executarAcaoStatus(atendimento: AgendaDiariaAtendimento, alteracao: StatusOperacionalEditavel | AcaoExcepcionalAtendimento, atualizarDetalhe = true, statusEsperado = atendimento.status): Promise<AlterarStatusResposta> {
    if (!statusAtendimento(statusEsperado)) return { status: 'invalido', codigo: 'TRANSICAO_INVALIDA', mensagem: 'Status desconhecido.' }
    const base = { atendimentoId: atendimento.id, statusEsperado }
    const intencao: AlterarStatusIntent = alteracao === 'cancelar' || alteracao === 'registrar_falta'
      ? { ...base, acao: alteracao }
      : { ...base, novoStatus: alteracao }
    const resposta = await alterarStatusAtendimento(intencao)
    if (resposta.status === 'atualizado' || resposta.status === 'conflito') {
      const atualizada = await carregarAgendaDiaria(supabase, atendimento.dataOperacional)
      setAgenda(atualizada); setData(atualizada.dataOperacional)
      if (atualizarDetalhe) setDetalhe(encontrarAtendimento(atualizada, atendimento.id))
    }
    return resposta
  }
  async function executarAcaoRapida(atendimento: AgendaDiariaAtendimento) {
    const acao = obterAcaoRapidaAtendimento(atendimento)
    if (!acao || acaoRapidaEmAndamento.current) return
    if (acao.novoStatus === 'concluido' && podeAbrirConclusao(atendimento.status)) { setConcluindo(atendimento); return }
    acaoRapidaEmAndamento.current = atendimento.id
    setAcaoRapidaAtualizandoId(atendimento.id); setAviso(null); setSucesso(null)
    try {
      const resposta = await executarAcaoStatus(atendimento, acao.novoStatus, false)
      if (resposta.status === 'conflito') setAviso('Não foi possível alterar o status porque a disponibilidade operacional mudou.')
      else if (resposta.status === 'invalido') setAviso(resposta.mensagem)
      else setSucesso(`Atendimento atualizado: ${acao.rotulo}.`)
    } catch {
      setAviso('Não foi possível atualizar o atendimento. Tente novamente.')
    } finally {
      acaoRapidaEmAndamento.current = null; setAcaoRapidaAtualizandoId(null)
    }
  }

  return <section className="agenda-diaria">
    <header className="agenda-cabecalho"><div className="agenda-titulo"><span>Central operacional</span><h1>Agenda</h1><p>Organize os atendimentos do seu dia de forma prática e eficiente.</p></div></header>
    {sucesso && <div className="agenda-sucesso" role="status"><span>✓</span><strong>{sucesso}</strong><button type="button" aria-label="Fechar aviso" onClick={() => setSucesso(null)}>×</button></div>}
    {aviso && <div className="agenda-aviso" role="alert"><strong>{aviso}</strong><button type="button" aria-label="Fechar aviso" onClick={() => setAviso(null)}>×</button></div>}

    {carregando ? <EstadoTela titulo="Carregando agenda..." texto="Buscando os atendimentos desta data." />
      : erro ? <EstadoTela titulo="Não foi possível carregar a Agenda" texto={erro}><Button variant="secondary" onClick={() => void carregar(data || undefined)}>Tentar novamente</Button></EstadoTela>
        : agenda && <GradeAgenda key={agenda.dataOperacional} agenda={agenda} blocos={blocos} agora={agora} mudarData={mudarData} hoje={() => void carregar()} abrir={item => void abrirDetalhe(item)} novo={abrirNovo} acao={item => void executarAcaoRapida(item)} atualizandoId={acaoRapidaAtualizandoId} />}

    <Detalhes atendimento={detalhe} timezone={agenda?.timezone ?? 'America/Sao_Paulo'} fechar={() => setDetalhe(null)} executarAcao={executarAcaoStatus} remarcar={(item) => { setDetalhe(null); setRemarcando(item) }} concluir={(item) => { setDetalhe(null); setConcluindo(item) }} verContrato={onVerContrato} notificar={(mensagem) => setSucesso(mensagem ?? 'Observacoes do atendimento salvas.')} />
    {novoAberto && <NovoAgendamentoModal aberto dataInicial={data} contextoInicial={contextoNovo} onClose={() => setNovoAberto(false)} onConfirmado={concluirNovoAgendamento} />}
    {remarcando && <RemarcarAtendimentoModal atendimento={remarcando} onClose={() => setRemarcando(null)} onRemarcado={concluirRemarcacao} />}
    {concluindo && <ConclusaoAtendimentoModal atendimento={concluindo} statusEsperado={concluindo.status} onClose={() => setConcluindo(null)} onConcluir={(item, statusEsperado) => executarAcaoStatus(item, 'concluido', false, statusEsperado)} />}
  </section>
}

function Detalhes({ atendimento, timezone, fechar, executarAcao, remarcar, concluir, verContrato, notificar }: { atendimento: AgendaDiariaAtendimento | null; timezone: string; fechar: () => void; executarAcao: (atendimento: AgendaDiariaAtendimento, alteracao: StatusOperacionalEditavel | AcaoExcepcionalAtendimento) => Promise<AlterarStatusResposta>; remarcar: (atendimento: AgendaDiariaAtendimento) => void; concluir: (atendimento: AgendaDiariaAtendimento) => void; verContrato: (contratoId: string) => void; notificar: (mensagem?: string) => void }) {
  const [atualizando, setAtualizando] = useState(false)
  const [statusAtualizando, setStatusAtualizando] = useState<StatusOperacionalEditavel | null>(null)
  const [confirmacao, setConfirmacao] = useState<AcaoExcepcionalAtendimento | null>(null)
  const [acaoAtualizando, setAcaoAtualizando] = useState<AcaoExcepcionalAtendimento | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [observacoesAberto, setObservacoesAberto] = useState(false)
  const emAndamento = useRef(false)
  useEffect(() => { setMensagem(null); setConfirmacao(null); setAcaoAtualizando(null); setObservacoesAberto(false); emAndamento.current = false; setAtualizando(false); setStatusAtualizando(null) }, [atendimento?.id, atendimento?.status])
  const status = atendimento && statusAtendimento(atendimento.status) ? atendimento.status : null
  const editavel = status ? status !== 'concluido' && podeEditarStatus(status) : false
  async function alterar(novoStatus: string) {
    if (!atendimento || !status || !podeEditarStatus(novoStatus) || novoStatus === status || emAndamento.current) return
    if (novoStatus === 'concluido' && podeAbrirConclusao(status)) { concluir(atendimento); return }
    emAndamento.current = true; setAtualizando(true); setStatusAtualizando(novoStatus); setMensagem(null)
    try {
      const resposta = await executarAcao(atendimento, novoStatus)
      if (resposta.status === 'conflito') setMensagem('Não foi possível alterar o status porque a disponibilidade operacional mudou.')
      else if (resposta.status === 'invalido') setMensagem(resposta.mensagem)
    } catch { setMensagem('Não foi possível atualizar o atendimento. Tente novamente.') }
    finally { emAndamento.current = false; setAtualizando(false); setStatusAtualizando(null) }
  }
  async function confirmarAcaoExcepcional() {
    if (!atendimento || !status || !confirmacao || !podeExecutarAcaoExcepcional(status, confirmacao) || emAndamento.current) return
    emAndamento.current = true; setAtualizando(true); setAcaoAtualizando(confirmacao); setMensagem(null)
    try {
      const resposta = await executarAcao(atendimento, confirmacao)
      if (resposta.status === 'conflito') setMensagem('Não foi possível alterar o status porque a disponibilidade operacional mudou.')
      else if (resposta.status === 'invalido') setMensagem(resposta.mensagem)
      else setConfirmacao(null)
    } catch { setMensagem('Não foi possível atualizar o atendimento. Tente novamente.') }
    finally { emAndamento.current = false; setAtualizando(false); setAcaoAtualizando(null) }
  }
  return <><Modal aberto={Boolean(atendimento)} titulo={atendimento ? <span className="agenda-modal-identidade"><span className="agenda-modal-avatar">{inicialPet(atendimento.petNome)}</span><span><strong>{atendimento.petNome}</strong><small>Tutor: {atendimento.tutorNome}</small></span><Status valor={atendimento.status} /></span> : 'Atendimento'} onClose={fechar} maxWidth="900px" className="agenda-modal">
    {atendimento && <div className="agenda-detalhes">
      {atendimento.vinculoContrato && <section className="agenda-vinculo-pacote" aria-label="Origem contratual do atendimento">
        <span className="agenda-vinculo-icone" aria-hidden="true">📦</span>
        <div><small>Atendimento de pacote</small><strong>{atendimento.vinculoContrato.pacoteNome}</strong><p><span>Ciclo {atendimento.vinculoContrato.cicloNumero}</span><span>{dataDiaMes(atendimento.vinculoContrato.periodoInicio)} → {dataDiaMes(atendimento.vinculoContrato.periodoFim)}</span><span>Atendimento {atendimento.vinculoContrato.ocorrenciaOrdem} de {atendimento.vinculoContrato.totalOcorrencias} do ciclo</span></p></div>
        <button type="button" onClick={() => verContrato(atendimento.vinculoContrato!.contratoId)}>Ver contrato →</button>
      </section>}
      <div className="agenda-detalhes-resumo">
        <div className="agenda-resumo-horario"><span>Horário previsto</span><strong>{hora(atendimento.inicio, timezone)} <i>→</i> {hora(atendimento.conclusao, timezone)}</strong></div>
        <Item rotulo="Data" valor={dataCurta(atendimento.dataOperacional)} />
        <Item rotulo="Modalidade" valor={atendimento.modalidade === 'taxidog' ? 'TaxiDog' : 'Sem transporte'} />
        <Item rotulo={atendimento.vinculoContrato ? 'Valor de referência' : 'Valor final'} valor={moeda(atendimento.valorFinal)} />
        {!atendimento.vinculoContrato && <Item rotulo="Financeiro" valor={textoFinanceiro(atendimento.financeiro)} />}
      </div>
      <section className="agenda-status-operacional">
        <span className="agenda-status-titulo">Status do atendimento</span>
        {editavel ? <div className="agenda-status-opcoes" role="group" aria-label="Status do atendimento">
          {opcoesStatusOperacional.map((opcao) => <button type="button" className={`status-${opcao.valor}${status === opcao.valor ? ' atual' : ''}${statusAtualizando === opcao.valor ? ' processando' : ''}`} aria-pressed={status === opcao.valor} disabled={atualizando} onClick={() => void alterar(opcao.valor)} key={opcao.valor}>{statusAtualizando === opcao.valor ? <><i className="agenda-status-spinner" aria-hidden="true" />Atualizando...</> : <>{status === opcao.valor && <span aria-hidden="true">✓</span>}{opcao.rotulo}</>}</button>)}
        </div> : <span className={`agenda-status-somente-leitura status-${atendimento.status}`}>{rotuloStatus(atendimento.status)}</span>}
        {!editavel && <small>{status ? 'Este status possui fluxo específico e está disponível somente para leitura.' : 'Status histórico desconhecido. Nenhuma alteração disponível.'}</small>}
        {mensagem && <p role="alert">{mensagem}</p>}
      </section>
      <div className="agenda-detalhes-tags" aria-label="Serviços">{atendimento.servicos.map((item, indice) => <span key={`${item.nome}-${indice}`}>{item.nome}{item.contratado ? ' · Pacote' : item.origem === 'dependencia' ? ' · dependência' : ''}</span>)}</div>
      <Bloco titulo="Etapas do atendimento"><div className="agenda-etapas">{atendimento.etapas.map((etapa) => <article key={etapa.id}><time>{hora(etapa.inicio, timezone)}</time><i aria-hidden="true" /><div><header><strong>{etapa.nome}</strong><time>{hora(etapa.fim, timezone)}</time></header>{etapa.funcionarios.length > 0 && <p><span className="agenda-recurso-tipo">Equipe</span>{etapa.funcionarios.map((item) => item.nome).join(', ')}</p>}{etapa.equipamentos.length > 0 && <p><span className="agenda-recurso-tipo">Equipamento</span>{etapa.equipamentos.map((item) => `${item.nome} · ${item.unidade}`).join(', ')}</p>}{!etapa.funcionarios.length && !etapa.equipamentos.length && <p>Sem recurso exclusivo</p>}</div></article>)}</div></Bloco>
      {atendimento.historicoOperacional.length > 0 && <Bloco titulo="Histórico do atendimento"><div className="agenda-historico-operacional">{atendimento.historicoOperacional.map((evento) => <span key={evento.tipo}><strong>{evento.rotulo}</strong><time>{hora(evento.ocorridoEm, timezone)}</time></span>)}</div></Bloco>}
      <div className="agenda-complementos">
        {atendimento.esperas.length > 0 && <Bloco titulo="Intervalos operacionais"><div className="agenda-esperas">{atendimento.esperas.map((item) => <span key={item.id}><time>{hora(item.inicio, timezone)}–{hora(item.fim, timezone)}</time><strong>Espera</strong> · {item.motivo}</span>)}</div></Bloco>}
        {atendimento.taxidog && <Bloco titulo="TaxiDog"><div className="agenda-taxidog-resumo"><Item rotulo="Ciclo" valor={atendimento.taxidog.cicloNome} /><Item rotulo="Coleta" valor={`${horaSimples(atendimento.taxidog.coletaInicio)}–${horaSimples(atendimento.taxidog.coletaFim)}`} /><Item rotulo="Conclusão limite" valor={horaSimples(atendimento.taxidog.conclusaoLimite)} /></div></Bloco>}
        {atendimento.observacoes && <Bloco titulo="Observações"><p className="agenda-observacoes">{atendimento.observacoes}</p></Bloco>}
      </div>
      <footer>
      <div className="agenda-rodape-acoes"><div><button type="button" className="agenda-acao-observacoes" onClick={() => setObservacoesAberto(true)}>Observacoes</button></div></div>
      {status && (status === 'agendado' || status === 'confirmado' || podeExecutarAcaoExcepcional(status, 'registrar_falta') || podeExecutarAcaoExcepcional(status, 'cancelar')) && <div className="agenda-rodape-acoes">
        {!confirmacao ? <div>
          {(status === 'agendado' || status === 'confirmado') && <button type="button" className="agenda-acao-remarcar" disabled={atualizando} onClick={() => remarcar(atendimento)}>Remarcar atendimento</button>}
          {podeExecutarAcaoExcepcional(status, 'registrar_falta') && <button type="button" className="agenda-acao-falta" disabled={atualizando} onClick={() => setConfirmacao('registrar_falta')}>Registrar falta</button>}
          {podeExecutarAcaoExcepcional(status, 'cancelar') && <button type="button" className="agenda-acao-cancelar" disabled={atualizando} onClick={() => setConfirmacao('cancelar')}>Cancelar atendimento</button>}
        </div> : <div className={`agenda-confirmacao-excepcional ${confirmacao === 'cancelar' ? 'cancelamento' : 'falta'}`} role="alertdialog" aria-labelledby="agenda-confirmacao-titulo">
          <div><strong id="agenda-confirmacao-titulo">{confirmacao === 'cancelar' ? 'Cancelar atendimento?' : 'Registrar falta?'}</strong><p>{confirmacao === 'cancelar' ? 'O horário deixará de ocupar a Agenda.' : 'O atendimento será marcado como falta e deixará de ocupar a Agenda.'}</p></div>
          <span><button type="button" disabled={atualizando} onClick={() => setConfirmacao(null)}>Voltar</button><button type="button" disabled={atualizando} onClick={() => void confirmarAcaoExcepcional()}>{acaoAtualizando === confirmacao ? <><i className="agenda-status-spinner" aria-hidden="true" />Atualizando...</> : confirmacao === 'cancelar' ? 'Confirmar cancelamento' : 'Confirmar falta'}</button></span>
        </div>}
      </div>}
      <Button variant="secondary" onClick={fechar}>Fechar</Button></footer>
    </div>}
  </Modal>{atendimento && observacoesAberto && <ObservacoesAtendimentoModal atendimento={atendimento} onClose={() => setObservacoesAberto(false)} onSalvo={notificar} />}</>
}

function EstadoTela({ titulo, texto, children }: { titulo: string; texto: string; children?: React.ReactNode }) { return <div className="agenda-estado"><div>🐾</div><h2>{titulo}</h2><p>{texto}</p>{children}</div> }
function Status({ valor }: { valor: string }) { return <span className={`agenda-status status-${valor}`}>{rotuloStatus(valor)}</span> }
function Item({ rotulo, valor }: { rotulo: string; valor: string }) { return <div><span>{rotulo}</span><strong>{valor || 'Não informado'}</strong></div> }
function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) { return <section><h3>{titulo}</h3>{children}</section> }
function mensagemErro(error: unknown) { return typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Tente novamente em instantes.' }
function dataCurta(data: string) { const [a, m, d] = data.split('-').map(Number); return new Intl.DateTimeFormat('pt-BR').format(new Date(a, m - 1, d)) }
function dataDiaMes(data: string) { const [a, m, d] = data.split('-').map(Number); return data ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(a, m - 1, d)) : '—' }
function hora(valor: string, timezone: string) { if (!valor) return '--:--'; return new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(valor)) }
function horaSimples(valor: string) { return valor ? valor.slice(0, 5) : '--:--' }
function moeda(valor: number) { return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function inicialPet(nome: string) { return nome.trim().charAt(0).toUpperCase() || 'P' }
function rotuloStatus(valor: string) { return rotuloStatusAtendimento(valor) }
function encontrarAtendimento(agenda: AgendaDiariaResultado, id: string) { return agenda.secoes.flatMap((secao) => secao.atendimentos).find((item) => item.id === id) ?? null }
