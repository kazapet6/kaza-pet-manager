import { useCallback, useEffect, useRef, useState } from 'react'
import NovoAgendamentoModal from '../agenda/NovoAgendamentoModal.tsx'
import RemarcarAtendimentoModal from '../agenda/RemarcarAtendimentoModal.tsx'
import GradeAgenda from '../agenda/GradeAgenda.tsx'
import '../agenda/AcoesAtendimento.css'
import type { ContextoGrade, Expediente } from '../agenda/gradeTemporal.ts'
import { carregarBlocosEstabelecimento } from '../data/funcionamentoAgenda.ts'
import { obterAcaoRapidaAtendimento } from '../agenda/acaoRapidaAtendimento.ts'
import Button from '../components/ui/Button.tsx'
import Modal from '../components/ui/Modal.tsx'
import { carregarAgendaDiaria } from '../data/agendaDiaria.ts'
import { supabase } from '../lib/supabase.ts'
import { alterarStatusAtendimento } from '../statusAtendimento/clienteSupabase.ts'
import ObservacoesAtendimentoModal from '../observacoesAtendimento/ObservacoesAtendimentoModal.tsx'
import EditarFormaPrevista from '../conclusaoAtendimento/EditarFormaPrevista.tsx'
import FinanceiroPacotePainel from '../agenda/FinanceiroPacotePainel.tsx'
import ConclusaoAtendimentoModal from '../conclusaoAtendimento/ConclusaoAtendimentoModal.tsx'
import { podeAbrirConclusao } from '../conclusaoAtendimento/contrato.ts'
import { executarDadosConclusao } from '../conclusaoAtendimento/clienteSupabase.ts'
import { financeiroDaResposta, textoFinanceiro } from '../agenda/financeiroAtendimento.ts'
import { statusAtendimento, type AcaoExcepcionalAtendimento, type AlterarStatusIntent, type AlterarStatusResposta, type StatusOperacionalEditavel } from '../statusAtendimento/contrato.ts'
import { opcoesStatusOperacional, podeEditarStatus, podeExecutarAcaoExcepcional, rotuloStatusAtendimento } from '../statusAtendimento/politica.ts'
import { ROTULOS_PROCEDIMENTOS } from '../../../supabase/functions/_shared/motor/procedimentos.ts'
import type {
  AgendaDiariaAtendimento,
  AgendaDiariaResultado,
} from '../types/AgendaDiaria.ts'

export default function Agenda({ onVerContrato }: { onVerContrato: (contratoId: string) => void }) {
  const [data, setData] = useState('')
  const [visao, setVisao] = useState<'cards' | 'grade'>('cards')
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
    // O painel financeiro do pacote já consulta o ciclo e os adicionais em conjunto.
    if (item.vinculoContrato && (item.status === 'agendado' || item.status === 'confirmado')) return
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
    if (resposta.status === 'atualizado' && resposta.renovacaoPendente) {
      setAviso('Atendimento concluído. A renovação automática ficou pendente de conferência.')
    }
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

  async function pularBanho(atendimento: AgendaDiariaAtendimento, motivo: string, senha?: string) {
    if (!statusAtendimento(atendimento.status)) throw new Error('Status desconhecido.')
    const resposta = await alterarStatusAtendimento({
      atendimentoId: atendimento.id, statusEsperado: atendimento.status, acao: 'pular_banho', motivo, senha, inicioOperacionalEsperado: atendimento.inicio,
    })
    if (resposta.status !== 'atualizado') throw Object.assign(new Error(resposta.mensagem), { codigo: resposta.codigo })
    setSucesso(null); setAviso(null)
    const atualizada = await carregar(atendimento.dataOperacional)
    if (resposta.reutilizado) {
      setAviso(atualizada ? 'Este banho já foi reprogramado. A agenda foi atualizada; nenhum novo pulo foi realizado.' : 'Este banho já foi reprogramado. Nenhum novo pulo foi realizado. Atualize a agenda.')
    } else if (atualizada) {
      setSucesso('Banho pulado. O ciclo foi reprogramado automaticamente, sem gerar créditos livres.')
    } else {
      setAviso('Banho pulado, mas não foi possível atualizar a agenda. Recarregue antes de continuar.')
    }
  }

  return <section className="agenda-diaria">
    {sucesso && <div className="agenda-sucesso" role="status"><span>✓</span><strong>{sucesso}</strong><button type="button" aria-label="Fechar aviso" onClick={() => setSucesso(null)}>×</button></div>}
    {aviso && <div className="agenda-aviso" role="alert"><strong>{aviso}</strong><button type="button" aria-label="Fechar aviso" onClick={() => setAviso(null)}>×</button></div>}

    {carregando ? <EstadoTela titulo="Carregando agenda..." texto="Buscando os atendimentos desta data." />
      : erro ? <EstadoTela titulo="Não foi possível carregar a Agenda" texto={erro}><Button variant="secondary" onClick={() => void carregar(data || undefined)}>Tentar novamente</Button></EstadoTela>
        : agenda && <GradeAgenda key={agenda.dataOperacional} visao={visao} mudarVisao={setVisao} agenda={agenda} blocos={blocos} agora={agora} mudarData={mudarData} hoje={() => void carregar()} abrir={item => void abrirDetalhe(item)} novo={abrirNovo} acao={item => void executarAcaoRapida(item)} atualizandoId={acaoRapidaAtualizandoId} />}

    <Detalhes atendimento={detalhe} timezone={agenda?.timezone ?? 'America/Sao_Paulo'} fechar={() => setDetalhe(null)} executarAcao={executarAcaoStatus} pularBanho={pularBanho} remarcar={(item) => { setDetalhe(null); setRemarcando(item) }} concluir={(item) => { setDetalhe(null); setConcluindo(item) }} verContrato={onVerContrato} notificar={(mensagem) => setSucesso(mensagem ?? 'Observacoes do atendimento salvas.')} />
    {novoAberto && <NovoAgendamentoModal aberto dataInicial={data} contextoInicial={contextoNovo} onClose={() => setNovoAberto(false)} onConfirmado={concluirNovoAgendamento} />}
    {remarcando && <RemarcarAtendimentoModal atendimento={remarcando} onClose={() => setRemarcando(null)} onRemarcado={concluirRemarcacao} />}
    {concluindo && <ConclusaoAtendimentoModal atendimento={concluindo} statusEsperado={concluindo.status} onClose={() => setConcluindo(null)} onConcluir={(item, statusEsperado) => executarAcaoStatus(item, 'concluido', false, statusEsperado)} />}
  </section>
}

function Detalhes({ atendimento, timezone, fechar, executarAcao, pularBanho, remarcar, concluir, verContrato, notificar }: { atendimento: AgendaDiariaAtendimento | null; timezone: string; fechar: () => void; executarAcao: (atendimento: AgendaDiariaAtendimento, alteracao: StatusOperacionalEditavel | AcaoExcepcionalAtendimento) => Promise<AlterarStatusResposta>; pularBanho: (atendimento: AgendaDiariaAtendimento, motivo: string, senha?: string) => Promise<void>; remarcar: (atendimento: AgendaDiariaAtendimento) => void; concluir: (atendimento: AgendaDiariaAtendimento) => void; verContrato: (contratoId: string) => void; notificar: (mensagem?: string) => void }) {
  const [atualizando, setAtualizando] = useState(false)
  const [statusAtualizando, setStatusAtualizando] = useState<StatusOperacionalEditavel | null>(null)
  const [confirmacao, setConfirmacao] = useState<AcaoExcepcionalAtendimento | null>(null)
  const [acaoAtualizando, setAcaoAtualizando] = useState<AcaoExcepcionalAtendimento | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [observacoesAberto, setObservacoesAberto] = useState(false)
  const [puloAberto, setPuloAberto] = useState(false)
  const emAndamento = useRef(false)
  useEffect(() => { setMensagem(null); setConfirmacao(null); setAcaoAtualizando(null); setObservacoesAberto(false); setPuloAberto(false); emAndamento.current = false; setAtualizando(false); setStatusAtualizando(null) }, [atendimento?.id, atendimento?.status])
  const status = atendimento && statusAtendimento(atendimento.status) ? atendimento.status : null
  const editavel = status ? status !== 'concluido' && podeEditarStatus(status) : false
  const podeRemarcar = status === 'agendado' || status === 'confirmado'
  const podePular = Boolean(atendimento?.vinculoContrato && podeRemarcar)
  const podeFalta = Boolean(status && podeExecutarAcaoExcepcional(status, 'registrar_falta'))
  const podeCancelar = Boolean(status && podeExecutarAcaoExcepcional(status, 'cancelar'))
  async function executarPulo(motivo: string, senha?: string) {
    if (!atendimento || emAndamento.current) return
    emAndamento.current = true; setAtualizando(true); setMensagem(null)
    try { await pularBanho(atendimento, motivo, senha) }
    finally { emAndamento.current = false; setAtualizando(false) }
  }
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
  return <><Modal aberto={Boolean(atendimento)} titulo={atendimento ? <span className="agenda-modal-identidade"><span className="agenda-modal-avatar">{inicialPet(atendimento.petNome)}</span><span><strong>{atendimento.petNome}</strong><small>Tutor: {atendimento.tutorNome}</small></span><Status valor={atendimento.status} /></span> : 'Atendimento'} onClose={() => { if (!emAndamento.current) fechar() }} maxWidth="900px" className="agenda-modal">
    {atendimento && <div className="agenda-detalhes">
      {atendimento.vinculoContrato && <section className="agenda-vinculo-pacote" aria-label="Origem contratual do atendimento">
        <span className="agenda-vinculo-icone" aria-hidden="true">📦</span>
        <div><small>Atendimento de pacote</small><strong>{atendimento.vinculoContrato.pacoteNome}</strong><p><span>Ciclo {atendimento.vinculoContrato.cicloNumero}</span><span>{dataDiaMes(atendimento.vinculoContrato.periodoInicio)} → {dataDiaMes(atendimento.vinculoContrato.periodoFim)}</span><span>Atendimento {atendimento.vinculoContrato.ocorrenciaOrdem} de {atendimento.vinculoContrato.totalOcorrencias} do ciclo</span></p></div>
        <button type="button" onClick={() => verContrato(atendimento.vinculoContrato!.contratoId)}>Ver contrato →</button>
      </section>}
      <div className="agenda-detalhes-resumo">
        <div className="agenda-resumo-horario"><span>{atendimento.taxidog ? "Atendimento previsto" : "Horário previsto"}</span><strong>{hora(atendimento.inicio, timezone)} <i>→</i> {hora(atendimento.conclusao, timezone)}</strong></div>
        <Item rotulo="Data" valor={dataCurta(atendimento.dataOperacional)} />
        <Item rotulo="Modalidade" valor={atendimento.modalidade === 'taxidog' ? 'TaxiDog' : 'Sem transporte'} />
        <Item rotulo={atendimento.vinculoContrato ? 'Valor de referência' : 'Valor final'} valor={moeda(atendimento.valorFinal)} />
        {!atendimento.vinculoContrato && <Item rotulo="Financeiro" valor={textoFinanceiro(atendimento.financeiro)} />}
      </div>
      {!atendimento.vinculoContrato && (status === 'agendado' || status === 'confirmado')
        && atendimento.financeiro?.versao !== undefined
        && <EditarFormaPrevista key={atendimento.id} atendimentoId={atendimento.id}
          forma={atendimento.financeiro.formaPagamentoPrevista ?? null} versao={atendimento.financeiro.versao} />}
      <section className="agenda-status-operacional">
        <span className="agenda-status-titulo">Status do atendimento</span>
        {editavel ? <div className="agenda-status-opcoes" role="group" aria-label="Status do atendimento">
          {opcoesStatusOperacional.map((opcao) => <button type="button" className={`status-${opcao.valor}${status === opcao.valor ? ' atual' : ''}${statusAtualizando === opcao.valor ? ' processando' : ''}`} aria-pressed={status === opcao.valor} disabled={atualizando || puloAberto || Boolean(confirmacao)} onClick={() => void alterar(opcao.valor)} key={opcao.valor}>{statusAtualizando === opcao.valor ? <><i className="agenda-status-spinner" aria-hidden="true" />Atualizando...</> : <>{status === opcao.valor && <span aria-hidden="true">✓</span>}{opcao.rotulo}</>}</button>)}
        </div> : <span className={`agenda-status-somente-leitura status-${atendimento.status}`}>{rotuloStatus(atendimento.status)}</span>}
        {!editavel && <small>{status ? 'Este status possui fluxo específico e está disponível somente para leitura.' : 'Status histórico desconhecido. Nenhuma alteração disponível.'}</small>}
        {mensagem && !confirmacao && <p role="alert">{mensagem}</p>}
      </section>
      <div className="agenda-detalhes-tags" aria-label="Serviços">{atendimento.servicos.map((item, indice) => <span key={`${item.nome}-${indice}`}>{item.nome}{item.contratado ? ' · Pacote' : item.origem === 'dependencia' ? ' · dependência' : ''}</span>)}</div>
      {Boolean(atendimento.procedimentosInclusos?.length) && <Bloco titulo="Procedimentos inclusos"><p>Checklist previsto no serviço, sem cobrança adicional. Não indica execução concluída.</p><ul aria-label="Procedimentos previstos">{atendimento.procedimentosInclusos!.map(c => <li key={c}>{ROTULOS_PROCEDIMENTOS[c]}</li>)}</ul></Bloco>}
      <Bloco titulo="Etapas do atendimento"><div className="agenda-etapas">{atendimento.etapas.map((etapa) => <article key={etapa.id}><time>{hora(etapa.inicio, timezone)}</time><i aria-hidden="true" /><div><header><strong>{etapa.nome}</strong><time>{hora(etapa.fim, timezone)}</time></header>{etapa.funcionarios.length > 0 && <p><span className="agenda-recurso-tipo">Equipe</span>{etapa.funcionarios.map((item) => item.nome).join(', ')}</p>}{etapa.equipamentos.length > 0 && <p><span className="agenda-recurso-tipo">Equipamento</span>{etapa.equipamentos.map((item) => `${item.nome} · ${item.unidade}`).join(', ')}</p>}{!etapa.funcionarios.length && !etapa.equipamentos.length && <p>Sem recurso exclusivo</p>}</div></article>)}</div></Bloco>
      {atendimento.historicoOperacional.length > 0 && <Bloco titulo="Histórico do atendimento"><div className="agenda-historico-operacional">{atendimento.historicoOperacional.map((evento) => <span key={evento.tipo}><strong>{evento.rotulo}</strong><time>{hora(evento.ocorridoEm, timezone)}</time></span>)}</div></Bloco>}
      <div className="agenda-complementos">
        {atendimento.esperas.length > 0 && <Bloco titulo="Intervalos operacionais"><div className="agenda-esperas">{atendimento.esperas.map((item) => <span key={item.id}><time>{hora(item.inicio, timezone)}–{hora(item.fim, timezone)}</time><strong>Espera</strong> · {item.motivo}</span>)}</div></Bloco>}
        {atendimento.taxidog && <Bloco titulo="TaxiDog"><div className="agenda-taxidog-resumo"><Item rotulo="Ciclo" valor={atendimento.taxidog.cicloNome} /><Item rotulo="Janela de coleta" valor={`${horaSimples(atendimento.taxidog.coletaInicio)}–${horaSimples(atendimento.taxidog.coletaFim)}`} /><Item rotulo="Limite operacional de conclusão" valor={horaSimples(atendimento.taxidog.conclusaoLimite)} /></div></Bloco>}
        {atendimento.observacoes && <Bloco titulo="Observações"><p className="agenda-observacoes">{atendimento.observacoes}</p></Bloco>}
      </div>
      {atendimento.vinculoContrato && status && podeEditarStatus(status) && status !== 'concluido' && <FinanceiroPacotePainel key={atendimento.id} atendimentoId={atendimento.id} />}
      <section className="agenda-acoes-painel" aria-label="Ações do atendimento">
        {puloAberto && podePular ? <PuloBanho key={atendimento.id} executar={executarPulo} voltar={() => setPuloAberto(false)} />
          : confirmacao ? <div className="agenda-acao-confirmar" role="group" aria-labelledby="agenda-confirmacao-titulo">
            <div className="agenda-acao-cabecalho">
              <span className="agenda-acao-icone agenda-acao-icone--perigo"><IconeAcao nome={confirmacao === 'cancelar' ? 'cancelar' : 'falta'} /></span>
              <div><h4 id="agenda-confirmacao-titulo">{confirmacao === 'cancelar' ? 'Cancelar atendimento?' : 'Registrar falta?'}</h4>
                <p>{confirmacao === 'cancelar' ? 'O horário deixará de ocupar a agenda.' : 'O atendimento será marcado como falta e deixará de ocupar a agenda.'}</p></div>
            </div>
            {mensagem && <p className="agenda-acao-feedback" role="alert">{mensagem}</p>}
            <div className="agenda-acao-confirmacao-botoes">
              <AcaoModal disabled={atualizando} onClick={() => { setConfirmacao(null); setMensagem(null) }}>Voltar</AcaoModal>
              <AcaoModal variante="perigo-forte" disabled={atualizando} onClick={() => void confirmarAcaoExcepcional()}>{acaoAtualizando === confirmacao ? <><i className="agenda-status-spinner" aria-hidden="true" />Atualizando...</> : confirmacao === 'cancelar' ? 'Confirmar cancelamento' : 'Confirmar falta'}</AcaoModal>
            </div>
          </div> : <>
            <header><h3>Ações do atendimento</h3><p>Gerencie o agendamento e as ocorrências operacionais.</p></header>
            <div className="agenda-acoes-grupo"><small>Gestão do atendimento</small><div className="agenda-acoes-linha">
              <AcaoModal icone="observacoes" disabled={atualizando} onClick={() => setObservacoesAberto(true)}>Observações</AcaoModal>
              {podeRemarcar && <AcaoModal variante="primario" icone="remarcar" disabled={atualizando} onClick={() => remarcar(atendimento)}>Remarcar atendimento</AcaoModal>}
            </div></div>
            {podePular && <div className="agenda-acoes-grupo"><small>Rotina do pacote</small><div className="agenda-acoes-linha">
              <AcaoModal variante="especial" icone="pular" disabled={atualizando} onClick={() => { setMensagem(null); setPuloAberto(true) }}>Pular banho</AcaoModal>
            </div><small>Reprograma o ciclo sem liberar créditos.</small></div>}
            {(podeFalta || podeCancelar) && <div className="agenda-acoes-grupo"><small>Ocorrências</small><div className="agenda-acoes-linha">
              {podeFalta && <AcaoModal variante="perigo" icone="falta" disabled={atualizando} onClick={() => { setMensagem(null); setConfirmacao('registrar_falta') }}>Registrar falta</AcaoModal>}
              {podeCancelar && <AcaoModal variante="perigo" icone="cancelar" disabled={atualizando} onClick={() => { setMensagem(null); setConfirmacao('cancelar') }}>Cancelar atendimento</AcaoModal>}
            </div></div>}
          </>}
      </section>
      {!puloAberto && !confirmacao && <footer className="agenda-fechar-rodape"><AcaoModal disabled={atualizando} onClick={fechar}>Fechar</AcaoModal></footer>}
    </div>}
  </Modal>{atendimento && observacoesAberto && <ObservacoesAtendimentoModal atendimento={atendimento} onClose={() => setObservacoesAberto(false)} onSalvo={notificar} />}</>
}

type NomeAcao = 'observacoes' | 'remarcar' | 'pular' | 'falta' | 'cancelar'
function IconeAcao({ nome }: { nome: NomeAcao }) {
  const caminhos: Record<NomeAcao, React.ReactNode> = {
    observacoes: <><path d="M4 4h16v12H9l-5 4V4Z"/><path d="M8 8h8M8 12h5"/></>,
    remarcar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M9 15h6m-2-2 2 2-2 2"/></>,
    pular: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18m-12 5h6m-3-3 3 3-3 3"/></>,
    falta: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5m0 4h.01"/></>,
    cancelar: <><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{caminhos[nome]}</svg>
}
function AcaoModal({ children, variante, icone, type = 'button', disabled, onClick }: { children: React.ReactNode; variante?: 'primario' | 'especial' | 'especial-forte' | 'perigo' | 'perigo-forte'; icone?: NomeAcao; type?: 'button' | 'submit'; disabled?: boolean; onClick?: () => void }) {
  return <button type={type} className={`agenda-operacao-btn${variante ? ' agenda-operacao-btn--' + variante : ''}`} disabled={disabled} onClick={onClick}>{icone && <IconeAcao nome={icone}/>} {children}</button>
}

function PuloBanho({ executar, voltar }: { executar(motivo: string, senha?: string): Promise<void>; voltar(): void }) {
  const [motivo, setMotivo] = useState('')
  const [senha, setSenha] = useState('')
  const [administrativo, setAdministrativo] = useState(false)
  const [exigeAdmin, setExigeAdmin] = useState(false)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const enviando = useRef(false)

  async function confirmar() {
    if (enviando.current || !motivo.trim() || (exigeAdmin && !administrativo) || (administrativo && !senha)) return
    enviando.current = true
    setOcupado(true)
    setErro('')
    try { await executar(motivo, administrativo ? senha : undefined) }
    catch (error) {
      const codigo = typeof error === 'object' && error !== null && 'codigo' in error ? error.codigo : null
      if (codigo === 'PULO_EXIGE_ADMIN' || codigo === 'AUTORIZACAO_PULO_INVALIDA') setExigeAdmin(true)
      setErro(mensagemErro(error))
    }
    finally { setSenha(''); enviando.current = false; setOcupado(false) }
  }
  return <form className="agenda-pulo-form" onSubmit={(evento) => { evento.preventDefault(); void confirmar() }} aria-labelledby="agenda-pulo-titulo">
    <div className="agenda-acao-cabecalho">
      <span className="agenda-acao-icone"><IconeAcao nome="pular" /></span>
      <div><h4 id="agenda-pulo-titulo">Pular banho e reprogramar o ciclo</h4><p>O banho será transferido para o dia fixo da próxima semana, e os atendimentos seguintes serão recalculados.</p></div>
    </div>
    <div className="agenda-pulo-regra"><strong>Nenhum crédito será liberado.</strong> Todos os serviços contratados serão mantidos. A partir do terceiro pulo, é necessária autorização administrativa.</div>
    <label className="agenda-pulo-campo">Motivo do pulo<input value={motivo} maxLength={500} placeholder="Ex.: cliente não poderá comparecer nesta semana" disabled={ocupado} onChange={(evento) => setMotivo(evento.target.value)} required /></label>
    {exigeAdmin && <><label className="agenda-pulo-admin"><input type="checkbox" checked={administrativo} disabled={ocupado} onChange={(evento) => { setAdministrativo(evento.target.checked); setSenha('') }} /><span>Autorizar como administrador<small>Confirme com sua senha administrativa para continuar.</small></span></label>
      {administrativo && <label className="agenda-pulo-campo">Senha administrativa<input type="password" autoComplete="current-password" value={senha} disabled={ocupado} onChange={(evento) => setSenha(evento.target.value)} required /></label>}</>}
    {erro && <p className="agenda-acao-feedback" role="alert">{erro}</p>}
    <div className="agenda-acao-confirmacao-botoes">
      <AcaoModal disabled={ocupado} onClick={() => { setSenha(''); voltar() }}>Voltar</AcaoModal>
      <AcaoModal type="submit" variante="especial-forte" disabled={ocupado || !motivo.trim() || (exigeAdmin && !administrativo) || (administrativo && !senha)}>{ocupado ? <><i className="agenda-status-spinner" aria-hidden="true" />Reprogramando...</> : 'Confirmar pulo'}</AcaoModal>
    </div>
  </form>
}

function EstadoTela({ titulo, texto, children }: { titulo: string; texto: string; children?: React.ReactNode }) { return <div className="agenda-estado"><div>🐾</div><h2>{titulo}</h2><p>{texto}</p>{children}</div> }
function Status({ valor }: { valor: string }) { return <span className={`agenda-status status-${valor}`}>{rotuloStatus(valor)}</span> }
function Item({ rotulo, valor }: { rotulo: string; valor: string }) { return <div><span>{rotulo}</span><strong>{valor || 'Não informado'}</strong></div> }
function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) { return <section><h3>{titulo}</h3>{children}</section> }
function mensagemErro(error: unknown) { return typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Tente novamente em instantes.' }
function dataCurta(data: string) { const [a, m, d] = data.split('-').map(Number); return new Intl.DateTimeFormat('pt-BR').format(new Date(a, m - 1, d)) }
function dataDiaMes(data: string) { const [a, m, d] = data.split('-').map(Number); return data ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(a, m - 1, d)) : '—' }
function hora(valor: string, timezone: string) { const instante = Date.parse(valor); if (!Number.isFinite(instante)) return '--:--'; return new Intl.DateTimeFormat('pt-BR', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instante) }
function horaSimples(valor: string) { return valor ? valor.slice(0, 5) : '--:--' }
function moeda(valor: number) { return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function inicialPet(nome: string) { return nome.trim().charAt(0).toUpperCase() || 'P' }
function rotuloStatus(valor: string) { return rotuloStatusAtendimento(valor) }
function encontrarAtendimento(agenda: AgendaDiariaResultado, id: string) { return agenda.secoes.flatMap((secao) => secao.atendimentos).find((item) => item.id === id) ?? null }
