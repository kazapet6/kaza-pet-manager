import { useContext, useEffect, useMemo, useRef, useState, type ContextType, type ReactNode } from 'react'
import EditorPet from '../components/EditorPet'
import Button from '../components/ui/Button.tsx'
import Input from '../components/ui/Input.tsx'
import Modal from '../components/ui/Modal.tsx'
import { confirmacaoAgendamentoClient, carregarVersoesConfirmacao } from '../confirmacao/clienteSupabase.ts'
import { valorValidoAtendimento, type ConfirmacaoAgendamentoResposta } from '../confirmacao/contrato.ts'
import { montarIntencaoConfirmacao, type TentativaConfirmacao } from '../confirmacao/dev.ts'
import { AgendaContext } from '../context/AgendaContext.tsx'
import { SistemaContext } from '../context/SistemaContext.tsx'
import { ciclosAtivosNaData } from '../lib/ciclosTaxidog.ts'
import { supabase } from '../lib/supabase.ts'
import { calcularPrecificacao, ErroCadastroPetIncompleto, exigirResponsavelUnico, funcionarioResponsavelDaOpcao, carregarDadosPrecificacaoComCliente, consultarDisponibilidade, minutosParaHora, resumirDisponibilidadeDoCiclo, rotuloEtapaComAcoplamentos } from '../motorDisponibilidade/index.ts'
import type { OpcaoDisponibilidade, ResultadoDisponibilidade, ResultadoDisponibilidadeCiclo } from '../motorDisponibilidade/tipos.ts'
import type { Cliente } from '../types/Cliente.ts'
import type { Pet } from '../types/Pet.ts'
import { buscarClientes, construirEntradaNovoAgendamento, criarControleConsultas, diasDoCalendario, deslocarMes, pendenciasPet, petsDoCliente } from './novoAgendamento.ts'
import { horario, type ContextoGrade } from './gradeTemporal.ts'

type Props = { aberto: boolean; dataInicial: string; contextoInicial?: ContextoGrade; onClose: () => void; onConfirmado: (data: string) => Promise<void> }
type EtapaFluxo = 1 | 2 | 3 | 4 | 5 | 6
type ModalidadeSelecionada = '' | 'sem_transporte' | 'taxidog'
type AgendaContextType = ContextType<typeof AgendaContext>
type EstadoPreco = { status: 'inativo' | 'carregando' } | { status: 'pronto'; valor: number; servicos: { servicoId: string; servicoNome: string; valorCalculado: number }[] } | { status: 'erro'; mensagem?:string }

export default function NovoAgendamentoModal({ aberto, dataInicial, contextoInicial, onClose, onConfirmado }: Props) {
  const sistema = useContext(SistemaContext)
  const agenda = useContext(AgendaContext)
  const [etapa, setEtapa] = useState<EtapaFluxo>(1)
  const [buscaCliente, setBuscaCliente] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [petId, setPetId] = useState('')
  const [editandoPet, setEditandoPet] = useState(false)
  const [servicoIds, setServicoIds] = useState<string[]>([])
  const [data, setData] = useState('')
  const [modalidade, setModalidade] = useState<ModalidadeSelecionada>('')
  const [cicloTaxidogId, setCicloTaxidogId] = useState('')
  const [funcionarioSelecionadoId, setFuncionarioSelecionadoId] = useState('')
  const [funcionarioResponsavelId, setFuncionarioResponsavelId] = useState('')
  const [resultado, setResultado] = useState<ResultadoDisponibilidade | null>(null)
  const [resultadosCiclos, setResultadosCiclos] = useState<Record<string, ResultadoDisponibilidadeCiclo> | null>(null)
  const [opcao, setOpcao] = useState<OpcaoDisponibilidade | null>(null)
  const [consultando, setConsultando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [versoes, setVersoes] = useState<{ versaoConfiguracaoConsultada: number; versaoOcupacaoConsultada: number } | null>(null)
  const [tentativa, setTentativa] = useState<TentativaConfirmacao | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [erroConfirmacao, setErroConfirmacao] = useState<string | null>(null)
  const [respostaConfirmacao, setRespostaConfirmacao] = useState<ConfirmacaoAgendamentoResposta | null>(null)
  const [valoresDigitados, setValoresDigitados] = useState<Record<string, string>>({})
  const [preco, setPreco] = useState<EstadoPreco>({ status: 'inativo' })
  const consultas = useRef(criarControleConsultas())
  const consultaPreco = useRef(0)
  const confirmacaoEmAndamento = useRef(false)
  useEffect(() => () => { consultas.current.invalidar(); consultaPreco.current += 1 }, [])

  const cliente = sistema.clientes.find((item) => item.id === clienteId)
  const pet = sistema.pets.find((item) => item.id === petId)
  const camposPet = pet ? pendenciasPet(pet) : []
  const clientesEncontrados = useMemo(() => buscarClientes(sistema.clientes, buscaCliente), [sistema.clientes, buscaCliente])
  const pets = useMemo(() => petsDoCliente(sistema.pets, clienteId), [sistema.pets, clienteId])
  const servicos = agenda.servicos.filter((item) => item.ativo)
  const servicosSelecionados = servicos.filter((item) => servicoIds.includes(item.id))
  const ciclos = useMemo(() => data ? ciclosAtivosNaData(agenda.taxidogCiclos.map((ciclo) => ({ ...ciclo, diasSemana: agenda.taxidogCicloDias.filter((dia) => dia.cicloId === ciclo.id && dia.ativo).map((dia) => dia.diaSemana) })), data).sort((a, b) => a.ordem - b.ordem) : [], [agenda.taxidogCiclos, agenda.taxidogCicloDias, data])

  const cicloSelecionado = ciclos.find((item) => item.id === cicloTaxidogId)

  function invalidarResultado() { consultas.current.invalidar(); consultaPreco.current += 1; setResultado(null); setResultadosCiclos(null); setOpcao(null); setFuncionarioResponsavelId(''); setVersoes(null); setTentativa(null); setRespostaConfirmacao(null); setErroConfirmacao(null); setPreco({ status: 'inativo' }); setValoresDigitados({}); setErro(null); setConsultando(false) }
  function selecionarCliente(item: Cliente) { setClienteId(item.id); setBuscaCliente(item.nome); setPetId(''); setServicoIds([]); invalidarResultado() }
  function alterarServico(id: string) { setServicoIds((atuais) => atuais.includes(id) ? atuais.filter((item) => item !== id) : [...atuais, id]); setModalidade(''); setCicloTaxidogId(''); invalidarResultado() }

  async function consultar(dataConsulta = data, modalidadeConsulta = modalidade, cicloConsulta = cicloTaxidogId) {
    if (!pet || !servicoIds.length || !dataConsulta) return setErro('Revise pet, serviços e data antes de consultar.')
    if (!modalidadeConsulta) return setErro('Escolha como o pet chegará até nós.')
    const token = consultas.current.iniciar()
    setConsultando(true); setErro(null); setResultado(null); setResultadosCiclos(null); setOpcao(null); setFuncionarioResponsavelId(''); setVersoes(null)
    try {
      const entrada = construirEntradaNovoAgendamento({ petId, servicoIds, data: dataConsulta, modalidade: modalidadeConsulta, cicloTaxidogId: cicloConsulta, funcionarioSelecionadoId })
      if (modalidadeConsulta === 'taxidog') {
        if (!ciclos.length) { if (consultas.current.atual(token)) setErro(`Não há ciclos TaxiDog disponíveis em ${dataCurta(dataConsulta)}.`); return }
        const [respostas, versoesConsulta] = await Promise.all([
          Promise.all(ciclos.map(async (ciclo) => {
            const resultadoDisponibilidade = exigirResponsavelUnico(await consultarDisponibilidade({ ...entrada, cicloTaxidogId: ciclo.id }))
            return [ciclo.id, resumirDisponibilidadeDoCiclo(resultadoDisponibilidade)] as const
          })),
          carregarVersoesConfirmacao(),
        ])
        if (consultas.current.atual(token)) { setResultadosCiclos(Object.fromEntries(respostas)); setVersoes(versoesConsulta) }
      } else {
        const [resposta, versoesConsulta] = await Promise.all([consultarDisponibilidade(entrada), carregarVersoesConfirmacao()])
        if (consultas.current.atual(token)) {
          const validada = exigirResponsavelUnico(resposta)
          setResultado(validada); setVersoes(versoesConsulta)
          if (dataConsulta === dataInicial && validada.estado === 'OK') selecionarOpcao(validada.opcoes.find(item => item.horarioApresentado === contextoInicial?.horario) ?? null)
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
    setModalidade('')
    setCicloTaxidogId('')
    invalidarResultado()
  }

  function escolherFuncionario(id: string) {
    setFuncionarioSelecionadoId(id)
    setModalidade('')
    setCicloTaxidogId('')
    invalidarResultado()
  }

  function selecionarOpcao(novaOpcao: OpcaoDisponibilidade | null) {
    const responsavel = novaOpcao ? funcionarioResponsavelDaOpcao(novaOpcao) : null
    setOpcao(responsavel ? novaOpcao : null)
    setFuncionarioResponsavelId(responsavel ?? '')
    if (novaOpcao && !responsavel) setErro('Nenhum funcionário pode assumir o atendimento completo nesta opção.')
  }

  function escolherCiclo(id: string) {
    const disponibilidade = resultadosCiclos?.[id]
    if (!disponibilidade?.disponivel || !disponibilidade.opcao) return
    setCicloTaxidogId(id)
    selecionarOpcao(disponibilidade.opcao)
  }

  async function confirmar() {
    if (confirmacaoEmAndamento.current || !opcao || !versoes || !modalidade || preco.status !== 'pronto') return
    const valoresNegociados = preco.servicos.flatMap(servico => {
      const valor = valoresDigitados[servico.servicoId]?.trim()
      if (!valor || !servicoIds.includes(servico.servicoId)) return []
      const final = Number(valor.replace(',', '.'))
      return final === servico.valorCalculado ? [] : [{ servicoId: servico.servicoId, original: servico.valorCalculado, final }]
    })
    if (valoresNegociados.some(ajuste => !valorValidoAtendimento(ajuste.final))) {
      setErroConfirmacao('Informe valores válidos, com até duas casas decimais.')
      return
    }
    const montada = montarIntencaoConfirmacao({
      valoresNegociados,
      petId, servicoIds, data, horarioEscolhido: opcao.horarioApresentado,
      modalidade, cicloTaxidogId: modalidade === 'taxidog' ? cicloTaxidogId : null,
      preferenciaFuncionario: funcionarioSelecionadoId ? 'obrigatorio' : 'automatico', funcionarioPreferidoId: funcionarioSelecionadoId || null, funcionarioResponsavelId,
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
          ? resposta.mensagem
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
      if (consultaPreco.current === token) setPreco({ status: 'pronto', valor: calculada.valorCalculadoAtendimento, servicos: calculada.servicos })
    } catch(error) {
      if (consultaPreco.current === token) setPreco({ status: 'erro',mensagem:error instanceof ErroCadastroPetIncompleto?error.message:undefined })
    }
  }
  function voltar() { if (etapa > 1) setEtapa((etapa - 1) as EtapaFluxo) }
  function avancar() {
    if (etapa === 1 && cliente) setEtapa(2)
    else if (etapa === 2 && pet) setEtapa(3)
    else if (etapa === 3 && servicoIds.length) setEtapa(4)
    else if (etapa === 4 && data) { setEtapa(5); if (modalidade) void consultar(data, modalidade, '') }
    else if (etapa === 5 && opcao) { setEtapa(6); void calcularValorRevisao(opcao) }
  }

  const carregando = sistema.carregando || agenda.carregandoAgenda
  const erroCatalogo = sistema.erro || agenda.erroAgenda
  return <Modal aberto={aberto} titulo={<span className="novo-agendamento-titulo"><strong>Novo agendamento</strong><small>Crie um novo atendimento</small></span>} onClose={confirmando ? () => undefined : onClose} maxWidth="min(92vw, 1180px)" className="novo-agendamento-modal">
    <div className="novo-agendamento">
      <ResumoLateral etapa={etapa} cliente={cliente} pet={pet} servicos={servicosSelecionados.map((item) => item.nome)} modalidade={modalidade} cicloNome={ciclos.find((item) => item.id === cicloTaxidogId)?.nome} funcionarioNome={agenda.funcionarios.find((item)=>item.id===funcionarioResponsavelId)?.nome} funcionarioAutomatico={!funcionarioSelecionadoId} data={data} opcao={opcao} />
      <main className="novo-agendamento-principal">
        {contextoInicial && <p className="agenda-sugestao-contexto">Sugestão: {dataCurta(dataInicial)}{contextoInicial.horario !== undefined ? ` às ${horario(contextoInicial.horario)}` : ''}{contextoInicial.funcionarioNome ? ` · referência visual de ${contextoInicial.funcionarioNome}` : ''}. Escolha explicitamente a data e o funcionário antes de consultar a disponibilidade.</p>}
        {etapa === 2 && pet && camposPet.length > 0 && <div role="status" className="novo-agendamento-erro">
          <p>Dados ausentes no cadastro de {pet.nome}: {camposPet.join(', ')}. A necessidade depende dos serviços escolhidos.</p>
          <Button variant="secondary" onClick={() => setEditandoPet(true)}>Editar cadastro do pet</Button>
        </div>}
        {editandoPet && pet && <EditorPet key={pet.id} pet={pet} fixarCliente onClose={() => { setEditandoPet(false); invalidarResultado() }} />}
        {etapa === 5 && modalidade === 'sem_transporte' && data === dataInicial && contextoInicial?.horario !== undefined && resultado && !consultando && <p role="status" className="agenda-sugestao-contexto">{resultado.estado === 'OK' && resultado.opcoes.some(item => item.horarioApresentado === contextoInicial.horario) ? 'O horário sugerido foi validado. Confira a equipe e as etapas na revisão.' : 'O horário sugerido não foi validado. Escolha uma das opções permitidas abaixo ou consulte outra data.'}</p>}
        {carregando ? <Estado titulo="Carregando dados..." texto="Preparando clientes, pets e serviços." />
          : erroCatalogo ? <Estado titulo="Não foi possível preparar o agendamento" texto={erroCatalogo} />
            : etapa === 1 ? <EtapaCliente busca={buscaCliente} alterarBusca={(valor) => { setBuscaCliente(valor); if (cliente && valor !== cliente.nome) { setClienteId(''); setPetId(''); setServicoIds([]); invalidarResultado() } }} encontrados={clientesEncontrados} cliente={cliente} selecionar={selecionarCliente} />
              : etapa === 2 ? <EtapaPet cliente={cliente!} pets={pets} petId={petId} selecionar={(id) => { setPetId(id); invalidarResultado() }} />
                : etapa === 3 ? <EtapaServicos servicos={servicos} selecionados={servicoIds} alterar={alterarServico} />
                  : etapa === 4 ? <EtapaDataFuncionario data={data} dataVisivelInicial={dataInicial} escolherData={escolherData} funcionarios={agenda.funcionarios.filter((item)=>item.ativo)} funcionarioId={funcionarioSelecionadoId} alterarFuncionario={escolherFuncionario} />
                    : etapa === 5 ? <EtapaTransporteDisponibilidade data={data} modalidade={modalidade} alterarModalidade={(valor) => { setModalidade(valor); setCicloTaxidogId(''); invalidarResultado(); void consultar(data, valor, '') }} ciclos={ciclos} resultadosCiclos={resultadosCiclos} cicloId={cicloTaxidogId} alterarCiclo={escolherCiclo} resultado={resultado} opcao={opcao} consultando={consultando} erro={erro} consultar={() => void consultar()} selecionar={selecionarOpcao} />
                      : opcao && cliente && pet ? <EtapaRevisao cliente={cliente} pet={pet} funcionarioNome={agenda.funcionarios.find((item)=>item.id===funcionarioResponsavelId)?.nome ?? 'Não identificado'} data={data} modalidade={modalidade} cicloNome={cicloSelecionado?.nome} opcao={opcao} preco={preco} valoresDigitados={valoresDigitados} editarValor={(id, valor) => setValoresDigitados(atuais => ({ ...atuais, [id]: valor }))} confirmarEmAndamento={confirmando} tentarPreco={() => void calcularValorRevisao(opcao)} /> : <Estado titulo="Opção desatualizada" texto="Volte e consulte novamente a disponibilidade." />}
        {etapa === 6 && erroConfirmacao && <div className="novo-confirmacao-feedback erro" role="alert"><strong>Não foi possível concluir</strong><p>{erroConfirmacao}</p></div>}
        {etapa === 6 && respostaConfirmacao?.status === 'confirmado' && <div className="novo-confirmacao-feedback sucesso" role="status"><strong>Agendamento confirmado com sucesso.</strong>{modalidade === "taxidog" && <span>Confira a janela de coleta e as previsões na revisão acima.</span>}</div>}
      </main>
      {!carregando && !erroCatalogo && (etapa === 6
        ? <RodapeConfirmacao pet={pet} servicos={servicosSelecionados.map((item) => item.nome)} data={data} voltar={voltar} confirmando={confirmando} podeConfirmar={preco.status === 'pronto'} confirmar={() => void confirmar()} />
        : <Rodape etapa={etapa} mostrarAvisoValor={etapa === 5} cliente={cliente} pet={pet} servicos={servicosSelecionados.map((item) => item.nome)} data={data} opcao={modalidade === 'taxidog' ? null : opcao} voltar={voltar} avancar={avancar} cancelar={onClose} podeAvancar={Boolean(etapa === 1 ? cliente : etapa === 2 ? pet : etapa === 3 ? servicoIds.length : etapa === 4 ? data : etapa === 5 ? opcao && funcionarioResponsavelId : false)} />)}
    </div>
  </Modal>
}

function ResumoLateral({ etapa, cliente, pet, servicos, modalidade, cicloNome, funcionarioNome, funcionarioAutomatico, data, opcao }: { etapa: EtapaFluxo; cliente?: Cliente; pet?: Pet; servicos: string[]; modalidade: ModalidadeSelecionada; cicloNome?: string; funcionarioNome?: string; funcionarioAutomatico: boolean; data: string; opcao: OpcaoDisponibilidade | null }) {
  const itens = [
    { titulo: 'Cliente', valor: cliente?.nome }, { titulo: 'Pet', valor: pet?.nome },
    { titulo: 'Serviços', valor: servicos.join(', ') },
    { titulo: 'Data e funcionário', valor: [data ? dataCurta(data) : '', funcionarioAutomatico ? funcionarioNome ? `Automático · ${funcionarioNome}` : 'Automático' : funcionarioNome].filter(Boolean).join(' · ') },
    { titulo: 'Transporte e disponibilidade', valor: `${modalidade === 'taxidog' ? `TaxiDog${cicloNome ? ` · ${cicloNome}` : ''}` : modalidade === 'sem_transporte' ? 'Sem transporte' : ''}${modalidade !== 'taxidog' && opcao ? ` · ${minutosParaHora(opcao.horarioApresentado)}` : ''}` },
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

function EtapaDataFuncionario(props: { data: string; dataVisivelInicial: string; escolherData: (v: string) => void; funcionarios: AgendaContextType['funcionarios']; funcionarioId: string; alterarFuncionario: (id: string) => void }) {
  return <EtapaCabecalho numero="04" titulo="Data e funcionário" texto="Escolha a data real do atendimento antes de consultar a disponibilidade."><div className="novo-data-horarios"><Calendario data={props.data} dataVisivelInicial={props.dataVisivelInicial} selecionar={props.escolherData} /><label className="novo-funcionario-responsavel"><strong>Funcionário responsável</strong><small>{props.funcionarioId ? 'O Motor considerará somente a pessoa escolhida.' : 'Escolheremos automaticamente um funcionário com disponibilidade para o atendimento completo.'}</small><select value={props.funcionarioId} onChange={(evento) => props.alterarFuncionario(evento.target.value)}><option value="">Automático</option>{props.funcionarios.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label></div></EtapaCabecalho>
}

function EtapaTransporteDisponibilidade(props: { data: string; modalidade: ModalidadeSelecionada; alterarModalidade: (v: 'sem_transporte' | 'taxidog') => void; ciclos: AgendaContextType['taxidogCiclos']; resultadosCiclos: Record<string, ResultadoDisponibilidadeCiclo> | null; cicloId: string; alterarCiclo: (id: string) => void; resultado: ResultadoDisponibilidade | null; opcao: OpcaoDisponibilidade | null; consultando: boolean; erro: string | null; consultar: () => void; selecionar: (o: OpcaoDisponibilidade | null) => void }) {
  const ciclosDisponiveis = props.ciclos.filter((ciclo) => props.resultadosCiclos?.[ciclo.id]?.disponivel)
  return <EtapaCabecalho numero="05" titulo="Transporte e disponibilidade" texto="A disponibilidade usa a data e o funcionário definidos na etapa anterior."><section className="novo-modalidade-inline novo-transporte-opcoes"><div><label className={props.modalidade === 'sem_transporte' ? 'selecionada' : ''}><input type="radio" name="novo-modalidade" checked={props.modalidade === 'sem_transporte'} onChange={() => props.alterarModalidade('sem_transporte')} /><span><strong>Sem transporte</strong><small>O tutor leva e busca o pet</small></span></label><label className={props.modalidade === 'taxidog' ? 'selecionada' : ''}><input type="radio" name="novo-modalidade" checked={props.modalidade === 'taxidog'} onChange={() => props.alterarModalidade('taxidog')} /><span><strong>TaxiDog</strong><small>Buscamos e levamos o pet</small></span></label></div></section>{props.consultando ? <Estado titulo="Calculando disponibilidade..." texto="Avaliando serviços, equipe, equipamentos e transporte." /> : props.erro ? <div className="novo-agendamento-erro"><strong>Não foi possível consultar</strong><p>{props.erro}</p><Button variant="secondary" onClick={props.consultar}>Tentar novamente</Button></div> : props.modalidade === 'sem_transporte' ? <section className="novo-horarios-painel"><header><span>Horários disponíveis</span><strong>{dataCurta(props.data)}</strong></header>{props.resultado?.estado === 'OK' ? <Horarios opcoes={props.resultado.opcoes} selecionada={props.opcao} selecionar={props.selecionar} /> : props.resultado ? <div className="novo-sem-horarios"><strong>{rotuloEstado(props.resultado.estado)}</strong>{props.resultado.motivos.map((motivo) => <p key={motivo}>{motivo}</p>)}</div> : null}</section> : props.modalidade === 'taxidog' ? <section className="novo-ciclos"><h4>Ciclos TaxiDog disponíveis em {dataCurta(props.data)}</h4>{ciclosDisponiveis.length ? <div>{ciclosDisponiveis.map((ciclo) => <button type="button" className={props.cicloId === ciclo.id ? 'selecionada' : ''} key={ciclo.id} onClick={() => props.alterarCiclo(ciclo.id)}><strong>{ciclo.nome}</strong><small>Coleta {horaSimples(ciclo.coletaInicio)}–{horaSimples(ciclo.coletaFim)}</small></button>)}</div> : props.resultadosCiclos ? <p className="novo-agendamento-vazio">Não há ciclos TaxiDog disponíveis em {dataCurta(props.data)}.</p> : null}</section> : <Estado titulo="Escolha o transporte" texto="Depois da escolha, o Motor calculará a disponibilidade para a data selecionada." />}</EtapaCabecalho>
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

export function Calendario({ data, dataVisivelInicial = data || hojeLocal(), selecionar }: { data: string; dataVisivelInicial?: string; selecionar: (v: string) => void }) {
  const [anoInicial, mesInicial] = dataVisivelInicial.split('-').map(Number)
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

function EtapaRevisao({ cliente, pet, funcionarioNome, data, modalidade, cicloNome, opcao, preco, valoresDigitados, editarValor, confirmarEmAndamento, tentarPreco }: { cliente: Cliente; pet: Pet; funcionarioNome: string; data: string; modalidade: ModalidadeSelecionada; cicloNome?: string; opcao: OpcaoDisponibilidade; preco: EstadoPreco; valoresDigitados: Record<string, string>; editarValor: (id: string, valor: string) => void; confirmarEmAndamento: boolean; tentarPreco: () => void }) {
  const chegada = modalidade === 'taxidog' ? `TaxiDog${cicloNome ? ` · Ciclo: ${cicloNome}` : ''}` : 'Sem transporte'
  const valor = <><div className="novo-revisao-chegada"><small>Funcionário responsável</small><strong>{funcionarioNome}</strong></div><BlocoValor preco={preco} tentar={tentarPreco} />{preco.status === 'pronto' && <ValoresNegociados preco={preco} opcao={opcao} digitados={valoresDigitados} editar={editarValor} desabilitado={confirmarEmAndamento} />}</>
  if (modalidade === 'taxidog') return <EtapaCabecalho numero="06" titulo="Revisar agendamento" texto="Confira o ciclo, os serviços e o valor antes de confirmar."><div className="novo-revisao-identidade"><span>{inicial(pet.nome)}</span><div><strong>{pet.nome}</strong><small>Tutor: {cliente.nome}</small></div><div><strong>{dataCurta(data)}</strong><small>Data operacional</small></div></div><div className="novo-revisao-servicos">{opcao.servicos.map((servico) => <span key={servico.id}>{servico.nome}{servico.origem === 'dependencia' ? ' · dependência' : ''}</span>)}</div><div className="novo-revisao-chegada"><small>Como o pet chegará até nós</small><strong>{chegada}</strong></div>{opcao.cicloTaxidog && <div className="novo-revisao-taxidog"><strong>{opcao.cicloTaxidog.nome}</strong><span>Coleta {minutosParaHora(opcao.cicloTaxidog.coletaInicio)}–{minutosParaHora(opcao.cicloTaxidog.coletaFim)}</span><span>Início previsto do atendimento: {minutosParaHora(opcao.inicioOperacional)}</span><span>Conclusão prevista: {minutosParaHora(opcao.conclusaoPrevista)}</span></div>}{valor}</EtapaCabecalho>
  return <EtapaCabecalho numero="06" titulo="Revisar agendamento" texto="Confira o planejamento e o valor antes de confirmar."><div className="novo-revisao-identidade"><span>{inicial(pet.nome)}</span><div><strong>{pet.nome}</strong><small>Tutor: {cliente.nome}</small></div><div><strong>{minutosParaHora(opcao.horarioApresentado)} → {minutosParaHora(opcao.conclusaoPrevista)}</strong><small>{dataCurta(data)}</small></div></div><div className="novo-revisao-servicos">{opcao.servicos.map((servico) => <span key={servico.id}>{servico.nome}{servico.origem === 'dependencia' ? ' · dependência' : ''}</span>)}</div><div className="novo-revisao-chegada"><small>Como o pet chegará até nós</small><strong>{chegada}</strong></div><section><h4>Planejamento operacional</h4><div className="novo-revisao-etapas">{opcao.etapas.map((etapa) => { const espera = opcao.esperas.find((item) => item.antesDaEtapaId === etapa.etapaId); return <div key={etapa.etapaId}>{espera && <aside><time>{minutosParaHora(espera.inicio)}–{minutosParaHora(espera.fim)}</time><span>Espera · {espera.duracaoMinutos} min</span></aside>}<article><time>{minutosParaHora(etapa.inicio)}</time><i /><div><strong>{rotuloEtapaComAcoplamentos(etapa, etapa.nome)}</strong><span>{[...etapa.funcionarios.map((item) => `Equipe: ${item.nome}`), ...etapa.equipamentos.map((item) => `Equipamento: ${item.equipamentoNome} · ${item.unidadeNome}`)].join(', ') || 'Sem recurso exclusivo'}</span></div><time>{minutosParaHora(etapa.fim)}</time></article></div> })}</div></section>{opcao.cicloTaxidog && <div className="novo-revisao-taxidog"><strong>TaxiDog · {opcao.cicloTaxidog.nome}</strong><span>Coleta {minutosParaHora(opcao.cicloTaxidog.coletaInicio)}–{minutosParaHora(opcao.cicloTaxidog.coletaFim)} · conclusão limite {minutosParaHora(opcao.cicloTaxidog.conclusaoLimite)}</span></div>}{valor}</EtapaCabecalho>
}

function ValoresNegociados({ preco, opcao, digitados, editar, desabilitado }: {
  preco: Extract<EstadoPreco, { status: 'pronto' }>
  opcao: OpcaoDisponibilidade
  digitados: Record<string, string>
  editar: (id: string, valor: string) => void
  desabilitado: boolean
}) {
  const solicitados = preco.servicos.filter(servico => opcao.servicos.some(item => item.id === servico.servicoId && item.origem === 'solicitado'))
  const totalCentavos = preco.servicos.reduce((total, servico) => {
    const digitado = digitados[servico.servicoId]?.trim()
    const final = digitado ? Number(digitado.replace(',', '.')) : servico.valorCalculado
    return valorValidoAtendimento(final) ? total + Math.round(final * 100) : NaN
  }, 0)
  return <details className="novo-revisao-valor">
    <summary>Negociar valores dos serviços</summary>
    {solicitados.map(servico => <label key={servico.servicoId}>
      <span>{servico.servicoNome} · original {moeda(servico.valorCalculado)}</span>
      <Input inputMode="decimal" placeholder="Valor negociado em R$"
        value={digitados[servico.servicoId] ?? ''} disabled={desabilitado}
        onChange={evento => editar(servico.servicoId, evento.target.value)} />
    </label>)}
    <strong>Valor final: {Number.isFinite(totalCentavos) ? moeda(totalCentavos / 100) : 'Revise os valores'}</strong>
  </details>
}

function BlocoValor({ preco, tentar }: { preco: EstadoPreco; tentar: () => void }) {
  return <div className={`novo-revisao-valor ${preco.status}`}><span>Valor original do atendimento</span>{preco.status === 'pronto' ? <strong>{moeda(preco.valor)}</strong> : preco.status === 'erro' ? <><strong>{preco.mensagem??'Não foi possível calcular o valor do atendimento.'}</strong><Button variant="secondary" onClick={tentar}>Tentar novamente</Button></> : <strong>Calculando valor...</strong>}</div>
}

function RodapeConfirmacao({ pet, servicos, data, voltar, confirmando, podeConfirmar, confirmar }: { pet?: Pet; servicos: string[]; data: string; voltar: () => void; confirmando: boolean; podeConfirmar: boolean; confirmar: () => void }) {
  return <footer className="novo-agendamento-acoes"><div className="novo-rodape-resumo"><strong>{[pet?.nome, servicos.join(' + ')].filter(Boolean).join(' • ')}</strong><span>{dataCurta(data)}</span></div><div><Button variant="secondary" onClick={voltar} disabled={confirmando}>Voltar</Button><Button onClick={confirmar} disabled={confirmando || !podeConfirmar}>{confirmando ? 'Confirmando agendamento...' : 'Confirmar agendamento'}</Button></div></footer>
}

function Rodape({ etapa, mostrarAvisoValor, cliente, pet, servicos, data, opcao, voltar, avancar, cancelar, podeAvancar }: { etapa: EtapaFluxo; mostrarAvisoValor: boolean; cliente?: Cliente; pet?: Pet; servicos: string[]; data: string; opcao: OpcaoDisponibilidade | null; voltar: () => void; avancar: () => void; cancelar: () => void; podeAvancar: boolean }) {
  const resumo = [pet?.nome || cliente?.nome, servicos.join(' + ')].filter(Boolean).join(' • ')
  return <footer className="novo-agendamento-acoes"><div className="novo-rodape-resumo"><strong>{resumo || 'Novo agendamento'}</strong><span>{data ? dataCurta(data) : ''}{opcao ? ` • ${minutosParaHora(opcao.horarioApresentado)} → ${minutosParaHora(opcao.conclusaoPrevista)}` : ''}</span>{mostrarAvisoValor && <small>O valor será confirmado na próxima etapa.</small>}</div><div>{etapa === 1 ? <Button variant="secondary" onClick={cancelar}>Cancelar</Button> : <Button variant="secondary" onClick={voltar}>Voltar</Button>}<Button disabled={!podeAvancar} onClick={avancar}>Continuar →</Button></div></footer>
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
