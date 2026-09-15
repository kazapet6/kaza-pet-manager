import { useContext, useEffect, useMemo, useRef, useState, type ContextType, type ReactNode } from 'react'
import Button from '../components/ui/Button.tsx'
import Input from '../components/ui/Input.tsx'
import Modal from '../components/ui/Modal.tsx'
import { confirmacaoAgendamentoClient, carregarVersoesConfirmacao } from '../confirmacao/clienteSupabase.ts'
import type { ConfirmacaoAgendamentoResposta } from '../confirmacao/contrato.ts'
import { montarIntencaoConfirmacao, type TentativaConfirmacao } from '../confirmacao/dev.ts'
import { AgendaContext } from '../context/AgendaContext.tsx'
import { SistemaContext } from '../context/SistemaContext.tsx'
import { ciclosAtivosNaData } from '../lib/ciclosTaxidog.ts'
import { supabase } from '../lib/supabase.ts'
import { calcularPrecificacao, ErroCadastroPetIncompleto, carregarDadosPrecificacaoComCliente, consultarDisponibilidade, consultarDisponibilidadeDoCiclo, minutosParaHora, rotuloEtapaComAcoplamentos } from '../motorDisponibilidade/index.ts'
import type { OpcaoDisponibilidade, ResultadoDisponibilidade, ResultadoDisponibilidadeCiclo } from '../motorDisponibilidade/tipos.ts'
import type { Cliente } from '../types/Cliente.ts'
import type { Pet } from '../types/Pet.ts'
import { buscarClientes, construirEntradaNovoAgendamento, criarControleConsultas, diasDoCalendario, deslocarMes, petsDoCliente } from './novoAgendamento.ts'
import { horario, type ContextoGrade } from './gradeTemporal.ts'

type Props = { aberto: boolean; dataInicial: string; contextoInicial?: ContextoGrade; onClose: () => void; onConfirmado: (data: string) => Promise<void> }
type EtapaFluxo = 1 | 2 | 3 | 4 | 5 | 6
type ModalidadeSelecionada = '' | 'sem_transporte' | 'taxidog'
type AgendaContextType = ContextType<typeof AgendaContext>
type EstadoPreco = { status: 'inativo' | 'carregando' } | { status: 'pronto'; valor: number } | { status: 'erro'; mensagem?:string }

export default function NovoAgendamentoModal({ aberto, dataInicial, contextoInicial, onClose, onConfirmado }: Props) {
  const sistema = useContext(SistemaContext)
  const agenda = useContext(AgendaContext)
  const [etapa, setEtapa] = useState<EtapaFluxo>(1)
  const [buscaCliente, setBuscaCliente] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [petId, setPetId] = useState('')
  const [servicoIds, setServicoIds] = useState<string[]>([])
  const [data, setData] = useState(dataInicial)
  const [modalidade, setModalidade] = useState<ModalidadeSelecionada>('')
  const [cicloTaxidogId, setCicloTaxidogId] = useState('')
  const [funcionarioResponsavelId, setFuncionarioResponsavelId] = useState(contextoInicial?.funcionarioId ?? '')
  const [resultado, setResultado] = useState<ResultadoDisponibilidade | null>(null)
  const [resultadoCiclo, setResultadoCiclo] = useState<ResultadoDisponibilidadeCiclo | null>(null)
  const [opcao, setOpcao] = useState<OpcaoDisponibilidade | null>(null)
  const [consultando, setConsultando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [versoes, setVersoes] = useState<{ versaoConfiguracaoConsultada: number; versaoOcupacaoConsultada: number } | null>(null)
  const [tentativa, setTentativa] = useState<TentativaConfirmacao | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [erroConfirmacao, setErroConfirmacao] = useState<string | null>(null)
  const [respostaConfirmacao, setRespostaConfirmacao] = useState<ConfirmacaoAgendamentoResposta | null>(null)
  const [preco, setPreco] = useState<EstadoPreco>({ status: 'inativo' })
  const consultas = useRef(criarControleConsultas())
  const consultaPreco = useRef(0)
  const confirmacaoEmAndamento = useRef(false)
  useEffect(() => () => { consultas.current.invalidar(); consultaPreco.current += 1 }, [])

  const cliente = sistema.clientes.find((item) => item.id === clienteId)
  const pet = sistema.pets.find((item) => item.id === petId)
  const clientesEncontrados = useMemo(() => buscarClientes(sistema.clientes, buscaCliente), [sistema.clientes, buscaCliente])
  const pets = useMemo(() => petsDoCliente(sistema.pets, clienteId), [sistema.pets, clienteId])
  const servicos = agenda.servicos.filter((item) => item.ativo)
  const servicosSelecionados = servicos.filter((item) => servicoIds.includes(item.id))
  const ciclos = useMemo(() => ciclosAtivosNaData(agenda.taxidogCiclos.map((ciclo) => ({ ...ciclo, diasSemana: agenda.taxidogCicloDias.filter((dia) => dia.cicloId === ciclo.id && dia.ativo).map((dia) => dia.diaSemana) })), data).sort((a, b) => a.ordem - b.ordem), [agenda.taxidogCiclos, agenda.taxidogCicloDias, data])

  function invalidarResultado() { consultas.current.invalidar(); consultaPreco.current += 1; setResultado(null); setResultadoCiclo(null); setOpcao(null); setVersoes(null); setTentativa(null); setRespostaConfirmacao(null); setErroConfirmacao(null); setPreco({ status: 'inativo' }); setErro(null); setConsultando(false) }
  function selecionarCliente(item: Cliente) { setClienteId(item.id); setBuscaCliente(item.nome); setPetId(''); setServicoIds([]); invalidarResultado() }
  function alterarServico(id: string) { setServicoIds((atuais) => atuais.includes(id) ? atuais.filter((item) => item !== id) : [...atuais, id]); invalidarResultado() }

  async function consultar(dataConsulta = data, modalidadeConsulta = modalidade, cicloConsulta = cicloTaxidogId) {
    if (!pet || !servicoIds.length || !dataConsulta) return setErro('Revise pet, serviços e data antes de consultar.')
    if (!modalidadeConsulta) return setErro('Escolha como o pet chegará até nós.')
    if (!funcionarioResponsavelId) return setErro('Escolha o funcionário responsável.')
    if (modalidadeConsulta === 'taxidog' && !cicloConsulta) return setErro('Selecione um ciclo TaxiDog.')
    const token = consultas.current.iniciar()
    setConsultando(true); setErro(null); setResultado(null); setResultadoCiclo(null); setOpcao(null); setVersoes(null)
    try {
      const entrada = construirEntradaNovoAgendamento({ petId, servicoIds, data: dataConsulta, modalidade: modalidadeConsulta, cicloTaxidogId: cicloConsulta, funcionarioResponsavelId })
      if (modalidadeConsulta === 'taxidog') {
        const entradaSemTransporte = { ...entrada, modalidade: 'sem_transporte' as const, cicloTaxidogId: null }
        const [resposta, horariosRelevantes, versoesConsulta] = await Promise.all([consultarDisponibilidadeDoCiclo(entrada), consultarDisponibilidade(entradaSemTransporte), carregarVersoesConfirmacao()])
        if (consultas.current.atual(token)) { setResultadoCiclo(resposta); setResultado(horariosRelevantes); setVersoes(versoesConsulta) }
      } else {
        const [resposta, versoesConsulta] = await Promise.all([consultarDisponibilidade(entrada), carregarVersoesConfirmacao()])
        if (consultas.current.atual(token)) {
          setResultado(resposta); setVersoes(versoesConsulta)
          if (dataConsulta === dataInicial && resposta.estado === 'OK') setOpcao(resposta.opcoes.find(item => item.horarioApresentado === contextoInicial?.horario) ?? null)
        }
      }
    } catch (error) {
      if (consultas.current.atual(token)) setErro(mensagemErro(error))
    } finally {
      if (consultas.current.atual(token)) setConsultando(false)
    }
  }

  function escolherData(novaData: string) {
    setData(novaData)
    invalidarResultado()
    if (modalidade === 'sem_transporte') return void consultar(novaData, modalidade, '')
    if (!modalidade) return
    const cicloContinuaAtivo = ciclosAtivosNaData(agenda.taxidogCiclos.map((ciclo) => ({ ...ciclo, diasSemana: agenda.taxidogCicloDias.filter((dia) => dia.cicloId === ciclo.id && dia.ativo).map((dia) => dia.diaSemana) })), novaData).some((ciclo) => ciclo.id === cicloTaxidogId)
    if (cicloContinuaAtivo) void consultar(novaData, modalidade, cicloTaxidogId)
    else { setCicloTaxidogId(''); setEtapa(4); setErro('Selecione um ciclo TaxiDog disponível para a nova data.') }
  }

  async function confirmar() {
    if (confirmacaoEmAndamento.current || !opcao || !versoes || !modalidade || preco.status !== 'pronto') return
    const montada = montarIntencaoConfirmacao({
      petId, servicoIds, data, horarioEscolhido: opcao.horarioApresentado,
      modalidade, cicloTaxidogId: modalidade === 'taxidog' ? cicloTaxidogId : null,
      preferenciaFuncionario: 'obrigatorio', funcionarioPreferidoId: funcionarioResponsavelId, funcionarioResponsavelId,
      ...versoes,
    }, tentativa)
    if (montada.erros.length) { setErroConfirmacao('Os dados da confirmação ficaram inválidos. Consulte novamente.'); return }
    setTentativa(montada.tentativa); setConfirmando(true); setErroConfirmacao(null); setRespostaConfirmacao(null); confirmacaoEmAndamento.current = true
    let confirmou = false
    try {
      const resposta = await confirmacaoAgendamentoClient.confirmar(montada.intencao)
      setRespostaConfirmacao(resposta)
      if (resposta.status === 'confirmado') {
        confirmou = true; confirmacaoEmAndamento.current = false; setConfirmando(false)
        try { await onConfirmado(data) } catch { setRespostaConfirmacao(null); setErroConfirmacao('O agendamento foi confirmado, mas a Agenda não pôde ser atualizada. Recarregue a data selecionada.') }
        return
      }
      if (resposta.status === 'disponibilidade_alterada' || resposta.status === 'configuracao_alterada') {
        const mensagem = resposta.status === 'configuracao_alterada'
          ? 'A configuração da agenda mudou. Consulte novamente.'
          : modalidade === 'taxidog'
            ? 'Não há mais disponibilidade neste ciclo para a data selecionada.'
            : 'Este horário não está mais disponível.'
        invalidarResultado(); setErro(mensagem); setEtapa(5); return
      }
      if (resposta.codigo === 'IDEMPOTENCIA_CONFLITANTE') setTentativa(null)
      setErroConfirmacao(mensagemConfirmacao(resposta))
    } catch {
      setErroConfirmacao('Não foi possível confirmar o agendamento. Verifique a conexão e tente novamente.')
    } finally {
      if (!confirmou) { confirmacaoEmAndamento.current = false; setConfirmando(false) }
    }
  }
  async function calcularValorRevisao(opcaoAtual: OpcaoDisponibilidade) {
    const token = ++consultaPreco.current
    setPreco({ status: 'carregando' })
    try {
      const dadosPreco = await carregarDadosPrecificacaoComCliente(petId, supabase)
      const calculada = calcularPrecificacao(dadosPreco.pet, opcaoAtual.servicos, dadosPreco.dados)
      if (consultaPreco.current === token) setPreco({ status: 'pronto', valor: calculada.valorCalculadoAtendimento })
    } catch(error) {
      if (consultaPreco.current === token) setPreco({ status: 'erro',mensagem:error instanceof ErroCadastroPetIncompleto?error.message:undefined })
    }
  }
  function voltar() { if (etapa > 1) setEtapa((etapa - 1) as EtapaFluxo) }
  function avancar() {
    if (etapa === 1 && cliente) setEtapa(2)
    else if (etapa === 2 && pet) setEtapa(3)
    else if (etapa === 3 && servicoIds.length) setEtapa(4)
    else if (etapa === 4 && funcionarioResponsavelId && (modalidade === 'sem_transporte' || (modalidade === 'taxidog' && cicloTaxidogId))) { setEtapa(5); void consultar() }
    else if (etapa === 5 && opcao) { setEtapa(6); void calcularValorRevisao(opcao) }
  }

  const carregando = sistema.carregando || agenda.carregandoAgenda
  const erroCatalogo = sistema.erro || agenda.erroAgenda
  return <Modal aberto={aberto} titulo={<span className="novo-agendamento-titulo"><strong>Novo agendamento</strong><small>Crie um novo atendimento</small></span>} onClose={confirmando ? () => undefined : onClose} maxWidth="min(92vw, 1180px)" className="novo-agendamento-modal">
    <div className="novo-agendamento">
      <ResumoLateral etapa={etapa} cliente={cliente} pet={pet} servicos={servicosSelecionados.map((item) => item.nome)} modalidade={modalidade} cicloNome={ciclos.find((item) => item.id === cicloTaxidogId)?.nome} funcionarioNome={agenda.funcionarios.find((item)=>item.id===funcionarioResponsavelId)?.nome} data={data} opcao={opcao} />
      <main className="novo-agendamento-principal">
        {contextoInicial && <p className="agenda-sugestao-contexto">Sugestão: {dataCurta(dataInicial)}{contextoInicial.horario !== undefined ? ` às ${horario(contextoInicial.horario)}` : ''}{contextoInicial.funcionarioNome ? ` · preferência por ${contextoInicial.funcionarioNome}` : ''}. Sujeita à validação após escolher pet, serviços e transporte. No TaxiDog, o planejamento segue o ciclo logístico.</p>}
        {etapa === 5 && modalidade === 'sem_transporte' && data === dataInicial && contextoInicial?.horario !== undefined && resultado && !consultando && <p role="status" className="agenda-sugestao-contexto">{resultado.estado === 'OK' && resultado.opcoes.some(item => item.horarioApresentado === contextoInicial.horario) ? 'O horário sugerido foi validado. Confira a equipe e as etapas na revisão.' : 'O horário sugerido não foi validado. Escolha uma das opções permitidas abaixo ou consulte outra data.'}</p>}
        {carregando ? <Estado titulo="Carregando dados..." texto="Preparando clientes, pets e serviços." />
          : erroCatalogo ? <Estado titulo="Não foi possível preparar o agendamento" texto={erroCatalogo} />
            : etapa === 1 ? <EtapaCliente busca={buscaCliente} alterarBusca={(valor) => { setBuscaCliente(valor); if (cliente && valor !== cliente.nome) { setClienteId(''); setPetId(''); setServicoIds([]); invalidarResultado() } }} encontrados={clientesEncontrados} cliente={cliente} selecionar={selecionarCliente} />
              : etapa === 2 ? <EtapaPet cliente={cliente!} pets={pets} petId={petId} selecionar={(id) => { setPetId(id); invalidarResultado() }} />
                : etapa === 3 ? <EtapaServicos servicos={servicos} selecionados={servicoIds} alterar={alterarServico} />
                  : etapa === 4 ? <EtapaTransporte modalidade={modalidade} alterarModalidade={(valor) => { setModalidade(valor); setCicloTaxidogId(''); invalidarResultado() }} ciclos={ciclos} cicloId={cicloTaxidogId} alterarCiclo={(id) => { setCicloTaxidogId(id); invalidarResultado() }} funcionarios={agenda.funcionarios.filter((item)=>item.ativo)} funcionarioId={funcionarioResponsavelId} alterarFuncionario={(id)=>{setFuncionarioResponsavelId(id);invalidarResultado()}} />
                    : etapa === 5 ? <EtapaDataHorarios data={data} modalidade={modalidade} ciclo={ciclos.find((item) => item.id === cicloTaxidogId)} escolherData={escolherData} resultado={resultado} resultadoCiclo={resultadoCiclo} opcao={opcao} consultando={consultando} erro={erro} consultar={() => void consultar()} selecionar={setOpcao} />
                      : opcao && cliente && pet ? <EtapaRevisao cliente={cliente} pet={pet} funcionarioNome={agenda.funcionarios.find((item)=>item.id===funcionarioResponsavelId)?.nome ?? 'Não identificado'} data={data} modalidade={modalidade} cicloNome={ciclos.find((item) => item.id === cicloTaxidogId)?.nome} opcao={opcao} preco={preco} tentarPreco={() => void calcularValorRevisao(opcao)} /> : <Estado titulo="Opção desatualizada" texto="Volte e consulte novamente a disponibilidade." />}
        {etapa === 6 && erroConfirmacao && <div className="novo-confirmacao-feedback erro" role="alert"><strong>Não foi possível concluir</strong><p>{erroConfirmacao}</p></div>}
        {etapa === 6 && respostaConfirmacao?.status === 'confirmado' && <div className="novo-confirmacao-feedback sucesso" role="status"><strong>Agendamento confirmado com sucesso.</strong></div>}
      </main>
      {!carregando && !erroCatalogo && (etapa === 6
        ? <RodapeConfirmacao pet={pet} servicos={servicosSelecionados.map((item) => item.nome)} data={data} voltar={voltar} confirmando={confirmando} podeConfirmar={preco.status === 'pronto'} confirmar={() => void confirmar()} />
        : <Rodape etapa={etapa === 5 ? 4 : etapa} mostrarAvisoValor={etapa === 5} cliente={cliente} pet={pet} servicos={servicosSelecionados.map((item) => item.nome)} data={data} opcao={modalidade === 'taxidog' ? null : opcao} voltar={voltar} avancar={avancar} cancelar={onClose} podeAvancar={Boolean(etapa === 1 ? cliente : etapa === 2 ? pet : etapa === 3 ? servicoIds.length : etapa === 4 ? funcionarioResponsavelId && (modalidade === 'sem_transporte' || (modalidade === 'taxidog' && cicloTaxidogId)) : etapa === 5 ? opcao : false)} />)}
    </div>
  </Modal>
}

function ResumoLateral({ etapa, cliente, pet, servicos, modalidade, cicloNome, funcionarioNome, data, opcao }: { etapa: EtapaFluxo; cliente?: Cliente; pet?: Pet; servicos: string[]; modalidade: ModalidadeSelecionada; cicloNome?: string; funcionarioNome?: string; data: string; opcao: OpcaoDisponibilidade | null }) {
  const itens = [
    { titulo: 'Cliente', valor: cliente?.nome }, { titulo: 'Pet', valor: pet?.nome },
    { titulo: 'Serviços', valor: servicos.join(', ') },
    { titulo: 'Transporte e responsável', valor: [modalidade === 'taxidog' ? `TaxiDog${cicloNome ? ` · ${cicloNome}` : ''}` : modalidade === 'sem_transporte' ? 'Sem transporte' : '', funcionarioNome].filter(Boolean).join(' · ') },
    { titulo: modalidade === 'taxidog' ? 'Data' : 'Data e horário', valor: `${data ? dataCurta(data) : ''}${modalidade !== 'taxidog' && opcao ? ` · ${minutosParaHora(opcao.horarioApresentado)}` : ''}` },
    { titulo: 'Revisão', valor: etapa === 6 ? 'Pronta para conferir' : '' },
  ]
  return <aside className="novo-agendamento-resumo"><header><span>Resumo</span><strong>{pet?.nome || cliente?.nome || 'Novo atendimento'}</strong></header><ol>{itens.map((item, indice) => <li key={item.titulo} className={etapa === indice + 1 ? 'atual' : etapa > indice + 1 ? 'concluida' : ''}><i>{etapa > indice + 1 ? '✓' : indice + 1}</i><div><strong>{item.titulo}</strong><span>{item.valor || 'Não selecionado'}</span></div></li>)}</ol></aside>
}

function EtapaCliente({ busca, alterarBusca, encontrados, cliente, selecionar }: { busca: string; alterarBusca: (v: string) => void; encontrados: Cliente[]; cliente?: Cliente; selecionar: (c: Cliente) => void }) {
  return <EtapaCabecalho numero="01" titulo="Selecione o cliente" texto="Busque pelo nome ou telefone do tutor."><div className="novo-busca-grande"><span aria-hidden="true">⌕</span><Input value={busca} placeholder="Buscar cliente por nome ou telefone..." onChange={(evento) => alterarBusca(evento.target.value)} /></div>{busca && !cliente && (encontrados.length ? <div className="novo-cliente-resultados">{encontrados.map((item) => <button type="button" key={item.id} onClick={() => selecionar(item)}><span><strong>{item.nome}</strong><small>{item.whatsapp || 'Telefone não informado'}</small></span><i>Selecionar</i></button>)}</div> : <p className="novo-agendamento-vazio">Nenhum cliente encontrado.</p>)}{cliente && <div className="novo-selecionado"><span>{inicial(cliente.nome)}</span><div><small>Cliente selecionado</small><strong>✓ {cliente.nome}</strong><p>{cliente.whatsapp || 'Telefone não informado'}</p></div></div>}</EtapaCabecalho>
}

function EtapaPet({ cliente, pets, petId, selecionar }: { cliente: Cliente; pets: Pet[]; petId: string; selecionar: (id: string) => void }) {
  return <EtapaCabecalho numero="02" titulo="Qual pet será atendido?" texto={`Pets cadastrados para ${cliente.nome}.`}>{pets.length ? <div className="novo-pets-visuais">{pets.map((pet) => <button type="button" className={petId === pet.id ? 'selecionada' : ''} key={pet.id} onClick={() => selecionar(pet.id)}><span>{inicial(pet.nome)}</span><div><strong>{pet.nome}</strong><small>{rotuloEspecie(pet.especie)} · {pet.racaNome || 'Raça não informada'}</small><small>{pet.porte ? `Porte ${pet.porte}` : 'Porte não informado'}{cadastroIncompleto(pet) ? ' · Cadastro incompleto' : ''}</small></div>{petId === pet.id && <i>✓</i>}</button>)}</div> : <p className="novo-agendamento-vazio">Este cliente não possui pets cadastrados.</p>}</EtapaCabecalho>
}

function EtapaServicos(props: { servicos: AgendaContextType['servicos']; selecionados: string[]; alterar: (id: string) => void }) {
  return <EtapaCabecalho numero="03" titulo="Selecione os serviços" texto="O Motor resolverá dependências, etapas, equipe e equipamentos."><div className="novo-servicos-visuais">{props.servicos.map((servico) => <label className={props.selecionados.includes(servico.id) ? 'selecionada' : ''} key={servico.id}><input type="checkbox" checked={props.selecionados.includes(servico.id)} onChange={() => props.alterar(servico.id)} /><span aria-hidden="true">✦</span><div><strong>{servico.nome}</strong><small>Preço-base: {moeda(servico.precoBase)}</small></div></label>)}</div></EtapaCabecalho>
}

function EtapaTransporte(props: { modalidade: ModalidadeSelecionada; alterarModalidade: (v: 'sem_transporte' | 'taxidog') => void; ciclos: AgendaContextType['taxidogCiclos']; cicloId: string; alterarCiclo: (id: string) => void; funcionarios: AgendaContextType['funcionarios']; funcionarioId: string; alterarFuncionario: (id:string)=>void }) {
  return <EtapaCabecalho numero="04" titulo="Transporte e responsável" texto="O Motor validará toda a rotina com o funcionário escolhido."><section className="novo-modalidade-inline novo-transporte-opcoes"><div><label className={props.modalidade === 'sem_transporte' ? 'selecionada' : ''}><input type="radio" name="novo-modalidade" checked={props.modalidade === 'sem_transporte'} onChange={() => props.alterarModalidade('sem_transporte')} /><span><strong>Sem transporte</strong><small>O tutor leva e busca o pet</small></span></label><label className={props.modalidade === 'taxidog' ? 'selecionada' : ''}><input type="radio" name="novo-modalidade" checked={props.modalidade === 'taxidog'} onChange={() => props.alterarModalidade('taxidog')} /><span><strong>TaxiDog</strong><small>Buscamos e levamos o pet</small></span></label></div></section><label className="novo-funcionario-responsavel"><strong>Funcionário responsável</strong><small>Será responsável pelo pet do início ao fim.</small><select value={props.funcionarioId} onChange={(e)=>props.alterarFuncionario(e.target.value)}><option value="">Selecione um funcionário</option>{props.funcionarios.map((item)=><option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>{props.modalidade === 'taxidog' && <section className="novo-ciclos"><h4>Escolha o ciclo do TaxiDog</h4>{props.ciclos.length ? <div>{props.ciclos.map((ciclo) => <button type="button" className={props.cicloId === ciclo.id ? 'selecionada' : ''} key={ciclo.id} onClick={() => props.alterarCiclo(ciclo.id)}><strong>{ciclo.nome}</strong><small>Coleta {horaSimples(ciclo.coletaInicio)}–{horaSimples(ciclo.coletaFim)}</small></button>)}</div> : <p className="novo-agendamento-vazio">Nenhum ciclo funciona na data atual.</p>}</section>}</EtapaCabecalho>
}

function EtapaDataHorarios({ data, modalidade, ciclo, escolherData, resultado, resultadoCiclo, opcao, consultando, erro, consultar, selecionar }: { data: string; modalidade: ModalidadeSelecionada; ciclo?: { nome: string; coletaInicio: string; coletaFim: string }; escolherData: (v: string) => void; resultado: ResultadoDisponibilidade | null; resultadoCiclo: ResultadoDisponibilidadeCiclo | null; opcao: OpcaoDisponibilidade | null; consultando: boolean; erro: string | null; consultar: () => void; selecionar: (o: OpcaoDisponibilidade) => void }) {
  if (modalidade === 'taxidog') return <EtapaCabecalho numero="05" titulo="Escolha a data e a janela" texto="A janela logística pode ter execução efetiva posterior, conforme o plano do Motor."><div className="novo-data-horarios"><Calendario data={data} selecionar={escolherData} /><PainelHorariosTaxidog ciclo={ciclo} horarios={resultado} resultado={resultadoCiclo} selecionada={opcao} consultando={consultando} erro={erro} consultar={consultar} selecionar={selecionar} /></div></EtapaCabecalho>
  return <EtapaCabecalho numero="05" titulo="Escolha data e horário" texto="Somente horários calculados pelo Motor podem ser selecionados."><div className="novo-data-horarios"><Calendario data={data} selecionar={escolherData} /><section className="novo-horarios-painel"><header><span>Horários disponíveis</span><strong>{dataCurta(data)}</strong></header>{consultando ? <Estado titulo="Buscando os melhores horários..." texto="Avaliando etapas, equipe e equipamentos." /> : erro ? <div className="novo-agendamento-erro"><strong>Não foi possível consultar</strong><p>{erro}</p><Button variant="secondary" onClick={consultar}>Tentar novamente</Button></div> : resultado?.estado === 'OK' ? <Horarios opcoes={resultado.opcoes} selecionada={opcao} selecionar={selecionar} /> : resultado ? <div className="novo-sem-horarios"><strong>{rotuloEstado(resultado.estado)}</strong>{resultado.motivos.map((motivo) => <p key={motivo}>{motivo}</p>)}<Button variant="secondary" onClick={consultar}>Consultar novamente</Button></div> : <Estado titulo="Escolha uma data" texto="A disponibilidade será carregada pelo Motor." />}</section></div></EtapaCabecalho>
}

export function PainelHorariosTaxidog({ ciclo, horarios, resultado, selecionada, consultando, erro, consultar, selecionar, linguagem = 'tecnica' }: { ciclo?: { nome: string; coletaInicio: string; coletaFim: string }; horarios: ResultadoDisponibilidade | null; resultado: ResultadoDisponibilidadeCiclo | null; selecionada: OpcaoDisponibilidade | null; consultando: boolean; erro: string | null; consultar: () => void; selecionar: (o: OpcaoDisponibilidade) => void; linguagem?: 'tecnica' | 'operacional' }) {
  if (consultando) return <section className="novo-horarios-painel"><Estado titulo="Verificando horários..." texto={linguagem === 'operacional' ? 'O Motor está avaliando a capacidade real para esta coleta.' : 'O Motor está avaliando capacidade real e a janela logística.'} /></section>
  if (erro) return <section className="novo-horarios-painel"><div className="novo-agendamento-erro"><strong>Não foi possível consultar</strong><p>{erro}</p><Button variant="secondary" onClick={consultar}>Tentar novamente</Button></div></section>
  const janela = ciclo ? Number(ciclo.coletaInicio.slice(0,2))*60+Number(ciclo.coletaInicio.slice(3,5)) : -1
  const relevantes = horarios?.opcoes ?? []
  const horariosVisiveis=[...new Set([...relevantes.map(item=>item.horarioApresentado),janela].filter(item=>item>=0))].sort((a,b)=>a-b)
  const operacional = linguagem === 'operacional'
  return <section className={`novo-horarios-painel ${operacional ? 'taxidog-operacional' : ''}`}><header><span>{operacional ? 'Disponibilidade para a coleta' : 'Horários e janelas'}</span><strong>{ciclo?.nome || 'TaxiDog'}</strong></header><div className="novo-horarios-taxidog">{horariosVisiveis.map(horario=>{const ehJanela=horario===janela;const habilitado=ehJanela&&Boolean(resultado?.disponivel&&resultado.opcao);const estado=habilitado?'disponivel':ehJanela?'sem-capacidade':'fora-janela';const explicacao=habilitado?'Disponível':ehJanela?'Sem capacidade':operacional?'Indisponível para esta coleta':'Fora da janela do TaxiDog';return <button type="button" key={horario} disabled={!habilitado} aria-label={`${minutosParaHora(horario)} · ${explicacao}`} title={explicacao} className={`${estado} ${selecionada&&habilitado?'selecionado':''}`} onClick={()=>resultado?.opcao&&selecionar(resultado.opcao)}><strong>{minutosParaHora(horario)}</strong>{(!operacional||estado!=='fora-janela')&&<small>{operacional?explicacao:habilitado?'Janela TaxiDog disponível':ehJanela?'Sem capacidade':'Fora da janela do TaxiDog'}</small>}</button>})}</div>{operacional&&horariosVisiveis.length>0&&<div className="taxidog-operacional-legenda"><span><i className="indisponivel"/>Esmaecido: indisponível para esta coleta</span><span><i className="lotado"/>Tracejado: sem capacidade</span></div>}{resultado&&!resultado.disponivel&&<p className="novo-taxidog-motivo">{operacional?'Este horário de coleta está sem capacidade operacional.':'A janela existe, mas a capacidade operacional está esgotada.'}</p>}</section>
}

export function Calendario({ data, selecionar }: { data: string; selecionar: (v: string) => void }) {
  const [anoInicial, mesInicial] = data.split('-').map(Number)
  const [mesVisivel, setMesVisivel] = useState({ ano: anoInicial, mes: mesInicial - 1 })
  const dias = diasDoCalendario(mesVisivel.ano, mesVisivel.mes)
  const hoje = hojeLocal()
  function mover(deslocamento: number) { setMesVisivel(deslocarMes(mesVisivel.ano, mesVisivel.mes, deslocamento)) }
  return <section className="novo-calendario"><header><button type="button" aria-label="Mês anterior" onClick={() => mover(-1)}>‹</button><strong>{nomeMes(mesVisivel.ano, mesVisivel.mes)}</strong><button type="button" aria-label="Próximo mês" onClick={() => mover(1)}>›</button></header><div className="novo-calendario-semana">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((dia) => <span key={dia}>{dia}</span>)}</div><div className="novo-calendario-dias">{dias.map((dia) => <button type="button" key={dia.data} className={`${dia.mesAtual ? '' : 'outro-mes'} ${dia.data === hoje ? 'hoje' : ''} ${dia.data === data ? 'selecionado' : ''}`} onClick={() => { selecionar(dia.data); if (!dia.mesAtual) { const [a, m] = dia.data.split('-').map(Number); setMesVisivel({ ano: a, mes: m - 1 }) } }}>{dia.dia}</button>)}</div></section>
}

export function Horarios({ opcoes, selecionada, selecionar }: { opcoes: OpcaoDisponibilidade[]; selecionada: OpcaoDisponibilidade | null; selecionar: (o: OpcaoDisponibilidade) => void }) {
  const grupos = [{ titulo: 'Manhã', itens: opcoes.filter((item) => item.horarioApresentado < 720) }, { titulo: 'Tarde', itens: opcoes.filter((item) => item.horarioApresentado >= 720) }]
  if (!opcoes.length) return <div className="novo-sem-horarios"><strong>Nenhum horário disponível para esta data.</strong></div>
  return <div className="novo-horarios-grupos">{grupos.filter((grupo) => grupo.itens.length).map((grupo) => <section key={grupo.titulo}><h4>{grupo.titulo}</h4><div>{grupo.itens.map((item) => <button type="button" className={selecionada?.horarioApresentado === item.horarioApresentado ? 'selecionado' : ''} key={item.horarioApresentado} onClick={() => selecionar(item)}><strong>{minutosParaHora(item.horarioApresentado)}</strong><small>até {minutosParaHora(item.conclusaoPrevista)}</small></button>)}</div></section>)}</div>
}

function EtapaRevisao({ cliente, pet, funcionarioNome, data, modalidade, cicloNome, opcao, preco, tentarPreco }: { cliente: Cliente; pet: Pet; funcionarioNome: string; data: string; modalidade: ModalidadeSelecionada; cicloNome?: string; opcao: OpcaoDisponibilidade; preco: EstadoPreco; tentarPreco: () => void }) {
  const chegada = modalidade === 'taxidog' ? `TaxiDog${cicloNome ? ` · Ciclo: ${cicloNome}` : ''}` : 'Sem transporte'
  const valor = <><div className="novo-revisao-chegada"><small>Funcionário responsável</small><strong>{funcionarioNome}</strong></div><BlocoValor preco={preco} tentar={tentarPreco} /></>
  if (modalidade === 'taxidog') return <EtapaCabecalho numero="06" titulo="Revisar agendamento" texto="Confira o ciclo, os serviços e o valor antes de confirmar."><div className="novo-revisao-identidade"><span>{inicial(pet.nome)}</span><div><strong>{pet.nome}</strong><small>Tutor: {cliente.nome}</small></div><div><strong>{dataCurta(data)}</strong><small>Data operacional</small></div></div><div className="novo-revisao-servicos">{opcao.servicos.map((servico) => <span key={servico.id}>{servico.nome}{servico.origem === 'dependencia' ? ' · dependência' : ''}</span>)}</div><div className="novo-revisao-chegada"><small>Como o pet chegará até nós</small><strong>{chegada}</strong></div>{opcao.cicloTaxidog && <div className="novo-revisao-taxidog"><strong>{opcao.cicloTaxidog.nome}</strong><span>Coleta {minutosParaHora(opcao.cicloTaxidog.coletaInicio)}–{minutosParaHora(opcao.cicloTaxidog.coletaFim)} · conclusão limite {minutosParaHora(opcao.cicloTaxidog.conclusaoLimite)}</span></div>}{valor}</EtapaCabecalho>
  return <EtapaCabecalho numero="06" titulo="Revisar agendamento" texto="Confira o planejamento e o valor antes de confirmar."><div className="novo-revisao-identidade"><span>{inicial(pet.nome)}</span><div><strong>{pet.nome}</strong><small>Tutor: {cliente.nome}</small></div><div><strong>{minutosParaHora(opcao.horarioApresentado)} → {minutosParaHora(opcao.conclusaoPrevista)}</strong><small>{dataCurta(data)}</small></div></div><div className="novo-revisao-servicos">{opcao.servicos.map((servico) => <span key={servico.id}>{servico.nome}{servico.origem === 'dependencia' ? ' · dependência' : ''}</span>)}</div><div className="novo-revisao-chegada"><small>Como o pet chegará até nós</small><strong>{chegada}</strong></div><section><h4>Planejamento operacional</h4><div className="novo-revisao-etapas">{opcao.etapas.map((etapa) => { const espera = opcao.esperas.find((item) => item.antesDaEtapaId === etapa.etapaId); return <div key={etapa.etapaId}>{espera && <aside><time>{minutosParaHora(espera.inicio)}–{minutosParaHora(espera.fim)}</time><span>Espera · {espera.duracaoMinutos} min</span></aside>}<article><time>{minutosParaHora(etapa.inicio)}</time><i /><div><strong>{rotuloEtapaComAcoplamentos(etapa, etapa.nome)}</strong><span>{[...etapa.funcionarios.map((item) => `Equipe: ${item.nome}`), ...etapa.equipamentos.map((item) => `Equipamento: ${item.equipamentoNome} · ${item.unidadeNome}`)].join(', ') || 'Sem recurso exclusivo'}</span></div><time>{minutosParaHora(etapa.fim)}</time></article></div> })}</div></section>{opcao.cicloTaxidog && <div className="novo-revisao-taxidog"><strong>TaxiDog · {opcao.cicloTaxidog.nome}</strong><span>Coleta {minutosParaHora(opcao.cicloTaxidog.coletaInicio)}–{minutosParaHora(opcao.cicloTaxidog.coletaFim)} · conclusão limite {minutosParaHora(opcao.cicloTaxidog.conclusaoLimite)}</span></div>}{valor}</EtapaCabecalho>
}

function BlocoValor({ preco, tentar }: { preco: EstadoPreco; tentar: () => void }) {
  return <div className={`novo-revisao-valor ${preco.status}`}><span>Valor do atendimento</span>{preco.status === 'pronto' ? <strong>{moeda(preco.valor)}</strong> : preco.status === 'erro' ? <><strong>{preco.mensagem??'Não foi possível calcular o valor do atendimento.'}</strong><Button variant="secondary" onClick={tentar}>Tentar novamente</Button></> : <strong>Calculando valor...</strong>}</div>
}

function RodapeConfirmacao({ pet, servicos, data, voltar, confirmando, podeConfirmar, confirmar }: { pet?: Pet; servicos: string[]; data: string; voltar: () => void; confirmando: boolean; podeConfirmar: boolean; confirmar: () => void }) {
  return <footer className="novo-agendamento-acoes"><div className="novo-rodape-resumo"><strong>{[pet?.nome, servicos.join(' + ')].filter(Boolean).join(' • ')}</strong><span>{dataCurta(data)}</span></div><div><Button variant="secondary" onClick={voltar} disabled={confirmando}>Voltar</Button><Button onClick={confirmar} disabled={confirmando || !podeConfirmar}>{confirmando ? 'Confirmando agendamento...' : 'Confirmar agendamento'}</Button></div></footer>
}

function Rodape({ etapa, mostrarAvisoValor, cliente, pet, servicos, data, opcao, voltar, avancar, cancelar, podeAvancar }: { etapa: EtapaFluxo; mostrarAvisoValor: boolean; cliente?: Cliente; pet?: Pet; servicos: string[]; data: string; opcao: OpcaoDisponibilidade | null; voltar: () => void; avancar: () => void; cancelar: () => void; podeAvancar: boolean }) {
  const resumo = [pet?.nome || cliente?.nome, servicos.join(' + ')].filter(Boolean).join(' • ')
  return <footer className="novo-agendamento-acoes"><div className="novo-rodape-resumo"><strong>{resumo || 'Novo agendamento'}</strong><span>{data ? dataCurta(data) : ''}{opcao ? ` • ${minutosParaHora(opcao.horarioApresentado)} → ${minutosParaHora(opcao.conclusaoPrevista)}` : ''}</span>{mostrarAvisoValor && <small>O valor será confirmado na próxima etapa.</small>}</div><div>{etapa === 1 ? <Button variant="secondary" onClick={cancelar}>Cancelar</Button> : <Button variant="secondary" onClick={voltar}>Voltar</Button>}{etapa < 5 ? <Button disabled={!podeAvancar} onClick={avancar}>Continuar →</Button> : <span className="novo-agendamento-confirmacao"><Button disabled>Confirmar agendamento</Button></span>}</div></footer>
}

function EtapaCabecalho({ numero, titulo, texto, children }: { numero: string; titulo: string; texto: string; children: ReactNode }) { return <section className="novo-agendamento-conteudo"><header><span>Etapa {numero}</span><h3>{titulo}</h3><p>{texto}</p></header>{children}</section> }
function Estado({ titulo, texto }: { titulo: string; texto: string }) { return <div className="novo-agendamento-estado"><span>🐾</span><strong>{titulo}</strong><p>{texto}</p></div> }
function inicial(nome: string) { return nome.trim().charAt(0).toUpperCase() || 'P' }
function rotuloEspecie(especie: Pet['especie']) { return especie === 'cao' ? 'Cão' : especie === 'gato' ? 'Gato' : 'Espécie não informada' }
function cadastroIncompleto(pet:Pet){return [pet.especie,pet.racaId,pet.sexo,pet.porte,pet.pelagem,pet.temperamento,pet.castrado].some((v)=>v===null)}
function horaSimples(valor: string) { return valor.slice(0, 5) }
function moeda(valor: number) { return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function dataCurta(data: string) { const [ano, mes, dia] = data.split('-').map(Number); return new Intl.DateTimeFormat('pt-BR').format(new Date(ano, mes - 1, dia)) }
function hojeLocal() { const agora = new Date(); const deslocamento = agora.getTimezoneOffset() * 60_000; return new Date(agora.getTime() - deslocamento).toISOString().slice(0, 10) }
function nomeMes(ano: number, mes: number) { return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(ano, mes, 1))) }
function mensagemErro(error: unknown) { return typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Não foi possível consultar a disponibilidade.' }
function mensagemConfirmacao(resposta: Exclude<ConfirmacaoAgendamentoResposta, { status: 'confirmado' }>) { return resposta.status === 'configuracao_alterada' ? 'A configuração da agenda mudou. Consulte novamente.' : resposta.status === 'disponibilidade_alterada' ? 'A disponibilidade mudou. Consulte novamente.' : resposta.mensagem }
function rotuloEstado(estado: ResultadoDisponibilidade['estado']) { return { AGENDA_NAO_CONFIGURADA: 'Agenda ainda não configurada', LOJA_FECHADA: 'Estabelecimento fechado', CADASTRO_PET_INCOMPLETO:'Complete os dados necessários do pet', PET_INELEGIVEL: 'Serviço incompatível com o pet', SERVICO_INVALIDO: 'Configuração do serviço inválida', SEM_DISPONIBILIDADE: 'Nenhum horário disponível para esta data.', OK: 'Disponível' }[estado] }
