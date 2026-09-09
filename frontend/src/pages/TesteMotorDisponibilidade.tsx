import { useContext, useMemo, useState, type FormEvent } from 'react'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import ConfirmacaoAgendamentoDev from '../confirmacao/ConfirmacaoAgendamentoDev.tsx'
import { confirmacaoAgendamentoClient, carregarVersoesConfirmacao } from '../confirmacao/clienteSupabase.ts'
import { montarIntencaoConfirmacaoDev, type TentativaConfirmacaoDev } from '../confirmacao/dev.ts'
import type { ConfirmacaoAgendamentoIntent, ConfirmacaoAgendamentoResposta } from '../confirmacao/contrato.ts'
import { AgendaContext } from '../context/AgendaContext'
import { SistemaContext } from '../context/SistemaContext'
import { ciclosAtivosNaData } from '../lib/ciclosTaxidog'
import { consultarDisponibilidade, minutosParaHora, rotuloEtapaComAcoplamentos, type PreferenciaFuncionario, type ResultadoDisponibilidade } from '../motorDisponibilidade/index.ts'
import type { OpcaoDisponibilidade } from '../motorDisponibilidade/tipos.ts'
import type { Pet } from '../types/Pet'
import PlanejamentoLoteDev from './PlanejamentoLoteDev'

type ConsultaConfirmavel = {
  resultado: ResultadoDisponibilidade
  versaoConfiguracaoConsultada: number
  versaoOcupacaoConsultada: number
  valida: boolean
}

export default function TesteMotorDisponibilidade() {
  const sistema = useContext(SistemaContext)
  const agenda = useContext(AgendaContext)
  const [petId, setPetId] = useState('')
  const [servicoIds, setServicoIds] = useState<string[]>([])
  const [data, setData] = useState(dataLocalHoje())
  const [preferencia, setPreferencia] = useState<PreferenciaFuncionario>('automatico')
  const [funcionarioId, setFuncionarioId] = useState('')
  const [modalidade, setModalidade] = useState<'sem_transporte' | 'taxidog'>('sem_transporte')
  const [cicloTaxidogId, setCicloTaxidogId] = useState('')
  const [consultando, setConsultando] = useState(false)
  const [consultaAtual, setConsultaAtual] = useState<ConsultaConfirmavel | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [opcaoRevisada, setOpcaoRevisada] = useState<OpcaoDisponibilidade | null>(null)
  const [intencaoAtual, setIntencaoAtual] = useState<ConfirmacaoAgendamentoIntent | null>(null)
  const [tentativaAtual, setTentativaAtual] = useState<TentativaConfirmacaoDev | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [respostaConfirmacao, setRespostaConfirmacao] = useState<ConfirmacaoAgendamentoResposta | null>(null)
  const [erroConfirmacao, setErroConfirmacao] = useState<string | null>(null)
  const pet = sistema.pets.find((item) => item.id === petId)
  const servicosAtivos = agenda.servicos.filter((item) => item.ativo)
  const funcionariosAtivos = agenda.funcionarios.filter((item) => item.ativo)
  const dependenciasPrevistas = useMemo(() => resolverDependenciasVisuais(servicoIds, agenda.servicoDependencias, agenda.servicos), [servicoIds, agenda.servicoDependencias, agenda.servicos])
  const pendenciasPet = pet ? validarDadosPet(pet) : []
  const ciclosNaData = useMemo(() => ciclosAtivosNaData(agenda.taxidogCiclos.map((ciclo) => ({ ...ciclo, diasSemana: agenda.taxidogCicloDias.filter((dia) => dia.cicloId === ciclo.id && dia.ativo).map((dia) => dia.diaSemana) })), data).sort((a, b) => a.ordem - b.ordem), [agenda.taxidogCiclos, agenda.taxidogCicloDias, data])

  async function consultar(evento: FormEvent) {
    evento.preventDefault()
    invalidarConfirmacao()
    setErro(null)
    if (!petId) return setErro('Selecione um Pet.')
    if (!servicoIds.length) return setErro('Selecione pelo menos um serviço.')
    if (!data) return setErro('Selecione uma data.')
    if (pendenciasPet.length) return setErro(`Cadastro do Pet incompleto: ${pendenciasPet.join(', ')}.`)
    if (preferencia !== 'automatico' && !funcionarioId) return setErro('Selecione o funcionário da preferência.')
    if (modalidade === 'taxidog' && !cicloTaxidogId) return setErro('Selecione o ciclo TaxiDog.')
    if (modalidade === 'taxidog' && !ciclosNaData.some((item) => item.id === cicloTaxidogId)) return setErro('O ciclo TaxiDog selecionado não funciona nesta data.')
    setConsultando(true)
    try {
      const entrada = { petId, servicoIds, data, preferenciaFuncionario: preferencia, funcionarioPreferidoId: preferencia === 'automatico' ? null : funcionarioId, tipoPlanejamento: 'normal' as const, modalidade, cicloTaxidogId: modalidade === 'taxidog' ? cicloTaxidogId : null }
      const [resultado, versoes] = await Promise.all([
        consultarDisponibilidade(entrada),
        carregarVersoesConfirmacao(),
      ])
      setConsultaAtual({ resultado, ...versoes, valida: true })
    } catch (error) {
      setErro(mensagemErro(error))
    } finally {
      setConsultando(false)
    }
  }

  function invalidarConfirmacao() {
    setConsultaAtual(null)
    setOpcaoRevisada(null)
    setIntencaoAtual(null)
    setTentativaAtual(null)
    setRespostaConfirmacao(null)
    setErroConfirmacao(null)
  }

  function alterarParametros(acao: () => void) {
    acao()
    invalidarConfirmacao()
    setErro(null)
  }

  function abrirRevisao(opcao: OpcaoDisponibilidade) {
    if (!consultaAtual?.valida || consultaAtual.resultado.estado !== 'OK') return
    const montada = montarIntencaoConfirmacaoDev({
      petId, servicoIds, data, horarioEscolhido: opcao.horarioApresentado,
      modalidade, cicloTaxidogId: modalidade === 'taxidog' ? cicloTaxidogId : null,
      preferenciaFuncionario: preferencia,
      funcionarioPreferidoId: preferencia === 'automatico' ? null : funcionarioId,
      versaoConfiguracaoConsultada: consultaAtual.versaoConfiguracaoConsultada,
      versaoOcupacaoConsultada: consultaAtual.versaoOcupacaoConsultada,
    }, tentativaAtual)
    if (montada.erros.length) {
      setErro(montada.erros.map((item) => item.mensagem).join(' '))
      return
    }
    setOpcaoRevisada(opcao)
    setIntencaoAtual(montada.intencao)
    setTentativaAtual(montada.tentativa)
    setRespostaConfirmacao(null)
    setErroConfirmacao(null)
  }

  async function confirmar() {
    if (!intencaoAtual || confirmando || !consultaAtual?.valida) return
    setConfirmando(true)
    setErroConfirmacao(null)
    try {
      const resposta = await confirmacaoAgendamentoClient.confirmar(intencaoAtual)
      setRespostaConfirmacao(resposta)
      if (resposta.status === 'disponibilidade_alterada' || resposta.status === 'configuracao_alterada') {
        setConsultaAtual((atual) => atual ? { ...atual, valida: false } : null)
      }
    } catch {
      setErroConfirmacao('Não foi possível confirmar o atendimento. Tente novamente.')
    } finally {
      setConfirmando(false)
    }
  }

  return <div className="teste-motor-page">
    <header className="teste-motor-header"><div><span>Ferramenta temporária · confirmação controlada</span><h1>Teste do Motor de Disponibilidade</h1><p>Consulta opções reais e permite confirmar individualmente após revisão explícita.</p></div><span className="teste-motor-dev">DEV</span></header>
    <div className="teste-motor-alerta"><strong>Confirmação DEV controlada</strong><span>A opção só é persistida após revisão e clique explícito. O backend recalcula todos os dados autoritativos.</span></div>

    {(sistema.carregando || agenda.carregandoAgenda) ? <section className="teste-motor-painel">Carregando dados reais do Supabase...</section> : (sistema.erro || agenda.erroAgenda) ? <section className="teste-motor-painel erro">{sistema.erro ?? agenda.erroAgenda}</section> : <form className="teste-motor-layout" onSubmit={consultar}>
      <section className="teste-motor-painel teste-motor-formulario">
        <h2>Parâmetros da consulta</h2>
        <label><span>Pet</span><Select value={petId} onChange={(evento) => alterarParametros(() => setPetId(evento.target.value))} options={[{ value: '', label: sistema.pets.length ? 'Selecione um Pet' : 'Nenhum Pet cadastrado' }, ...sistema.pets.map((item) => ({ value: item.id, label: item.nome }))]} /></label>
        {pet && <ResumoPet pet={pet} pendencias={pendenciasPet} />}
        <fieldset><legend>Serviços ativos</legend>{servicosAtivos.length ? <div className="teste-motor-servicos">{servicosAtivos.map((servico) => <label key={servico.id}><input type="checkbox" checked={servicoIds.includes(servico.id)} onChange={() => alterarParametros(() => setServicoIds((atuais) => atuais.includes(servico.id) ? atuais.filter((id) => id !== servico.id) : [...atuais, servico.id]))} /><span>{servico.nome}</span></label>)}</div> : <p>Nenhum serviço ativo cadastrado.</p>}</fieldset>
        {servicoIds.length > 0 && <div className="teste-motor-dependencias"><strong>Solicitado</strong><span>{servicoIds.map((id) => agenda.servicos.find((item) => item.id === id)?.nome).filter(Boolean).join(', ')}</span><strong>Incluído automaticamente</strong><span>{dependenciasPrevistas.length ? dependenciasPrevistas.join(', ') : 'Nenhuma dependência'}</span></div>}
        <fieldset><legend>Modalidade</legend><div className="teste-motor-servicos"><label><input type="radio" name="modalidade" checked={modalidade === 'sem_transporte'} onChange={() => alterarParametros(() => { setModalidade('sem_transporte'); setCicloTaxidogId('') })} /><span>Sem transporte</span></label><label><input type="radio" name="modalidade" checked={modalidade === 'taxidog'} onChange={() => alterarParametros(() => setModalidade('taxidog'))} /><span>TaxiDog</span></label></div></fieldset>
        {modalidade === 'taxidog' && <label><span>Ciclo logístico</span><Select value={cicloTaxidogId} onChange={(evento) => alterarParametros(() => setCicloTaxidogId(evento.target.value))} options={[{ value: '', label: ciclosNaData.length ? 'Selecione o ciclo' : 'Nenhum ciclo ativo nesta data' }, ...ciclosNaData.map((item) => ({ value: item.id, label: `${item.nome} · coleta ${hora(item.coletaInicio)}–${hora(item.coletaFim)} · pronto até ${hora(item.conclusaoLimite)}` }))]} /></label>}
        <div className="form-grid"><label><span>Data</span><Input type="date" value={data} onChange={(evento) => alterarParametros(() => setData(evento.target.value))} /></label><label><span>Preferência de funcionário</span><Select value={preferencia} onChange={(evento) => alterarParametros(() => { setPreferencia(evento.target.value as PreferenciaFuncionario); setFuncionarioId('') })} options={[{ value: 'automatico', label: 'Automático' }, { value: 'preferencial', label: 'Preferencial' }, { value: 'obrigatorio', label: 'Obrigatório' }]} /></label></div>
        {preferencia !== 'automatico' && <label><span>Funcionário</span><Select value={funcionarioId} onChange={(evento) => alterarParametros(() => setFuncionarioId(evento.target.value))} options={[{ value: '', label: funcionariosAtivos.length ? 'Selecione' : 'Nenhum funcionário ativo' }, ...funcionariosAtivos.map((item) => ({ value: item.id, label: item.nome }))]} /></label>}
        {erro && <p className="teste-motor-erro">{erro}</p>}
        <Button type="submit" disabled={consultando}>{consultando ? 'Consultando...' : 'Consultar disponibilidade'}</Button>
      </section>

      <section className="teste-motor-painel teste-motor-resultados"><h2>Resultado</h2>{consultaAtual ? <Resultado resultado={consultaAtual.resultado} confirmavel={consultaAtual.valida} onConfirmar={abrirRevisao} /> : <p className="teste-motor-vazio">Preencha os parâmetros para executar uma consulta.</p>}</section>
    </form>}
    <ConfirmacaoAgendamentoDev aberto={Boolean(opcaoRevisada && intencaoAtual)} petNome={pet?.nome ?? 'Pet não encontrado'} opcao={opcaoRevisada} intencao={intencaoAtual} preferenciaFuncionario={preferencia} confirmando={confirmando} resposta={respostaConfirmacao} erroTecnico={erroConfirmacao} consultaInvalidada={consultaAtual?.valida === false} onClose={() => setOpcaoRevisada(null)} onConfirmar={() => void confirmar()} />
    {!sistema.carregando && !agenda.carregandoAgenda && !sistema.erro && !agenda.erroAgenda && <PlanejamentoLoteDev />}
  </div>
}

function ResumoPet({ pet, pendencias }: { pet: Pet; pendencias: string[] }) {
  const campos = [['Nome', pet.nome], ['Espécie', pet.especie === 'cao' ? 'Cão' : 'Gato'], ['Raça', pet.racaNome], ['Sexo', pet.sexo === 'macho' ? 'Macho' : 'Fêmea'], ['Porte', pet.porte], ['Peso', pet.peso === null ? 'Não informado' : `${pet.peso.toLocaleString('pt-BR')} kg`], ['Pelagem', pet.pelagem], ['Temperamento', pet.temperamento]]
  return <div className="teste-motor-pet"><h3>Dados usados pelo motor</h3><dl>{campos.map(([nome, valor]) => <div key={nome}><dt>{nome}</dt><dd>{valor}</dd></div>)}</dl>{pendencias.length > 0 && <p className="teste-motor-erro">Informações obrigatórias ausentes: {pendencias.join(', ')}.</p>}{pet.peso === null && <p className="teste-motor-aviso">Peso não informado: regras de duração por peso não serão aplicadas.</p>}</div>
}

function Resultado({ resultado, confirmavel, onConfirmar }: { resultado: ResultadoDisponibilidade; confirmavel: boolean; onConfirmar: (opcao: OpcaoDisponibilidade) => void }) {
  if (resultado.estado !== 'OK') return <div className="teste-motor-sem-resultado"><strong>{rotuloEstado(resultado.estado)}</strong>{resultado.motivos.map((motivo) => <p key={motivo}>{motivo}</p>)}{resultado.estado === 'SEM_DISPONIBILIDADE' && <small>O diagnóstico V1 ainda é geral quando nenhuma combinação completa de recursos é encontrada.</small>}</div>
  return <div className="teste-motor-opcoes"><p><strong>{resultado.opcoes.length}</strong> possibilidade(s) encontrada(s).</p>{resultado.opcoes.map((opcao) => <details key={opcao.horarioApresentado}><summary><strong>{opcao.cicloTaxidog ? `Início operacional ${minutosParaHora(opcao.horarioApresentado)}` : minutosParaHora(opcao.horarioApresentado)}</strong><span>Conclusão prevista: {minutosParaHora(opcao.conclusaoPrevista)}</span></summary><div className="teste-motor-opcao-detalhes">{opcao.cicloTaxidog && <div className="teste-motor-dependencias"><strong>Ciclo TaxiDog</strong><span>{opcao.cicloTaxidog.nome}</span><strong>Coleta</strong><span>{minutosParaHora(opcao.cicloTaxidog.coletaInicio)}–{minutosParaHora(opcao.cicloTaxidog.coletaFim)}</span><strong>Deadline</strong><span>{minutosParaHora(opcao.cicloTaxidog.conclusaoLimite)}</span></div>}<dl><div><dt>Início operacional</dt><dd>{minutosParaHora(opcao.inicioOperacional)}</dd></div><div><dt>Duração total</dt><dd>{opcao.duracaoTotal} min</dd></div><div><dt>Processamento</dt><dd>{opcao.duracaoProcessamento} min</dd></div><div><dt>Espera</dt><dd>{opcao.tempoEspera} min</dd></div></dl><div className="teste-motor-servicos-incluidos"><strong>Serviços incluídos</strong>{opcao.servicos.map((item) => <span key={item.id}>{item.nome} <small>({item.origem === 'solicitado' ? 'solicitado' : 'dependência'})</small></span>)}</div><div className="teste-motor-jornada">{opcao.etapas.map((etapa) => { const espera = opcao.esperas.find((item) => item.antesDaEtapaId === etapa.etapaId); return <div key={etapa.etapaId}>{espera && <article className="espera"><strong>Espera</strong><span>{minutosParaHora(espera.inicio)}–{minutosParaHora(espera.fim)} · {espera.duracaoMinutos} min</span></article>}<article><strong>{rotuloEtapaComAcoplamentos(etapa, `${etapa.servicoNome} · ${etapa.nome}`)}</strong><span>{minutosParaHora(etapa.inicio)}–{minutosParaHora(etapa.fim)} · {etapa.duracaoMinutos} min</span>{etapa.funcionarios.map((item) => <small key={item.id}>Funcionário: {item.nome}</small>)}{etapa.equipamentos.map((item) => <small key={item.unidadeId}>Equipamento: {item.equipamentoNome} · {item.unidadeNome}</small>)}{!etapa.funcionarios.length && !etapa.equipamentos.length && <small>Sem recurso exclusivo</small>}</article></div> })}</div><Button onClick={() => onConfirmar(opcao)} disabled={!confirmavel}>Confirmar atendimento DEV</Button></div></details>)}</div>
}

function validarDadosPet(pet: Pet) { return [['nome', pet.nome], ['espécie', pet.especie], ['raça', pet.racaId], ['sexo', pet.sexo], ['porte', pet.porte], ['pelagem', pet.pelagem], ['temperamento', pet.temperamento]].filter(([, valor]) => !valor).map(([nome]) => nome) }
function resolverDependenciasVisuais(solicitados: string[], dependencias: { servicoId: string; dependenciaServicoId: string; ativo: boolean }[], servicos: { id: string; nome: string }[]) { const incluidos = new Set<string>(); const visitar = (id: string) => dependencias.filter((item) => item.servicoId === id && item.ativo).forEach((item) => { if (!solicitados.includes(item.dependenciaServicoId) && !incluidos.has(item.dependenciaServicoId)) { incluidos.add(item.dependenciaServicoId); visitar(item.dependenciaServicoId) } }); solicitados.forEach(visitar); return [...incluidos].map((id) => servicos.find((item) => item.id === id)?.nome).filter((nome): nome is string => Boolean(nome)) }
function rotuloEstado(estado: ResultadoDisponibilidade['estado']) { return { AGENDA_NAO_CONFIGURADA: 'Agenda ainda não configurada', LOJA_FECHADA: 'Estabelecimento fechado', PET_INELEGIVEL: 'Serviço incompatível com o Pet', SERVICO_INVALIDO: 'Configuração do serviço inválida', SEM_DISPONIBILIDADE: 'Nenhuma disponibilidade', OK: 'Disponível' }[estado] }
function dataLocalHoje() { const agora = new Date(); const deslocamento = agora.getTimezoneOffset() * 60_000; return new Date(agora.getTime() - deslocamento).toISOString().slice(0, 10) }
function mensagemErro(error: unknown) { return typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Não foi possível consultar a disponibilidade.' }
function hora(valor: string) { return valor.slice(0, 5) }
