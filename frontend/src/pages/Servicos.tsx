import { useContext, useMemo, useState, type FormEvent } from 'react'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Modal from '../components/ui/Modal'
import { AgendaContext } from '../context/AgendaContext'
import { SistemaContext } from '../context/SistemaContext'
import {
  desativarRegraPreco,
  salvarAjustePrecoFixo,
  salvarAjustePrecoPeso,
  salvarAjustePrecoRaca,
  salvarAcoplamentoServico,
  salvarElegibilidadeServico,
  salvarEtapa,
  salvarModificador,
  salvarServico,
} from '../data/configuracaoAgenda'
import type { Pet, Raca } from '../types/Pet'
import type { PoliticaEsperaEtapa, RecursoEtapa, Servico, ServicoEtapa, ServicoEtapaRecurso, ServicoModificador, ServicoRegraPreco } from '../types/Agenda'

type Aba = 'geral' | 'preco' | 'regras' | 'operacao'
type Criterio = 'porte' | 'pelagem' | 'raca' | 'peso' | 'temperamento'
type ModoExecucao = 'proprio' | 'acoplado'
const todosPortes: Pet['porte'][] = ['mini', 'pequeno', 'medio', 'grande', 'gigante']
const nomesPorte: Record<Pet['porte'], string> = { mini: 'Mini', pequeno: 'Pequeno', medio: 'Médio', grande: 'Grande', gigante: 'Gigante' }
const nomesPelagem: Record<Pet['pelagem'], string> = { curta: 'Curta', media: 'Média', longa: 'Longa' }

export default function Servicos() {
  const agenda = useContext(AgendaContext)
  const { racas } = useContext(SistemaContext)
  const [modalAberto, setModalAberto] = useState(false)
  const [aba, setAba] = useState<Aba>('geral')
  const [servicoId, setServicoId] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [precoBaseCentavos, setPrecoBaseCentavos] = useState(0)
  const [ativo, setAtivo] = useState(true)
  const [agendamentoCliente, setAgendamentoCliente] = useState(false)
  const [especies, setEspecies] = useState<Pet['especie'][]>(['cao', 'gato'])
  const [portes, setPortes] = useState<Pet['porte'][]>(todosPortes)
  const [racasBloqueadas, setRacasBloqueadas] = useState<string[]>([])
  const [dependencias, setDependencias] = useState<string[]>([])
  const [funcionarios, setFuncionarios] = useState<string[]>([])
  const [modoExecucao, setModoExecucao] = useState<ModoExecucao>('proprio')
  const [servicoBaseId, setServicoBaseId] = useState('')
  const [etapaAlvoId, setEtapaAlvoId] = useState('')
  const [buscaRaca, setBuscaRaca] = useState('')

  const [editandoEtapa, setEditandoEtapa] = useState<ServicoEtapa | null | undefined>()
  const [etapaNome, setEtapaNome] = useState('')
  const [etapaOrdem, setEtapaOrdem] = useState('1')
  const [etapaDuracao, setEtapaDuracao] = useState('')
  const [etapaEquipamento, setEtapaEquipamento] = useState('')
  const [etapaAtiva, setEtapaAtiva] = useState(true)
  const [etapaExigeFuncionario, setEtapaExigeFuncionario] = useState(true)
  const [etapaQuantidadeFuncionarios, setEtapaQuantidadeFuncionarios] = useState('1')
  const [etapaExigeEquipamento, setEtapaExigeEquipamento] = useState(false)
  const [etapaQuantidadeEquipamentos, setEtapaQuantidadeEquipamentos] = useState('1')
  const [etapaPoliticaEspera, setEtapaPoliticaEspera] = useState<PoliticaEsperaEtapa>('padrao')
  const [etapaEsperaMinutos, setEtapaEsperaMinutos] = useState('15')

  const [editandoDuracao, setEditandoDuracao] = useState<ServicoModificador | null | undefined>()
  const [duracaoEtapa, setDuracaoEtapa] = useState('')
  const [duracaoCriterio, setDuracaoCriterio] = useState<Criterio>('porte')
  const [duracaoValor, setDuracaoValor] = useState('')
  const [duracaoAcrescimo, setDuracaoAcrescimo] = useState('0')
  const [duracaoAtiva, setDuracaoAtiva] = useState(true)
  const [duracaoRacaBusca, setDuracaoRacaBusca] = useState('')

  const [ajustesPorte, setAjustesPorte] = useState<Record<Pet['porte'], number>>(ajustesPorteVazios())
  const [ajustesPelagem, setAjustesPelagem] = useState<Record<Pet['pelagem'], number>>(ajustesPelagemVazios())
  const [ajustesTemperamento, setAjustesTemperamento] = useState<Record<Pet['temperamento'], number>>(ajustesTemperamentoVazios())
  const [adicionandoRacaPreco, setAdicionandoRacaPreco] = useState(false)
  const [precoRacaId, setPrecoRacaId] = useState('')
  const [precoRacaCentavos, setPrecoRacaCentavos] = useState(0)
  const [precoRacaBusca, setPrecoRacaBusca] = useState('')
  const [adicionandoPeso, setAdicionandoPeso] = useState(false)
  const [pesoMin, setPesoMin] = useState('')
  const [pesoMax, setPesoMax] = useState('')
  const [pesoCentavos, setPesoCentavos] = useState(0)

  const etapas = agenda.servicoEtapas.filter((item) => item.servicoId === servicoId).sort((a, b) => a.ordem - b.ordem)
  const etapasAtivas = etapas.filter((item) => item.ativo)
  const regrasDuracao = agenda.servicoModificadores.filter((item) => item.servicoId === servicoId)
  const regrasPreco = agenda.servicoRegrasPreco.filter((item) => item.servicoId === servicoId)
  const regrasRacaPreco = regrasPreco.filter((item) => item.criterio === 'raca' && item.ativo)
  const regrasPesoPreco = regrasPreco.filter((item) => item.criterio === 'peso' && item.ativo).sort((a, b) => Number(a.pesoMin) - Number(b.pesoMin))
  const racasEncontradas = useMemo(() => filtrarRacas(racas, buscaRaca, especies, racasBloqueadas), [buscaRaca, especies, racas, racasBloqueadas])

  function novoServico() {
    setServicoId(null); setNome(''); setDescricao(''); setPrecoBaseCentavos(0); setAtivo(true); setAgendamentoCliente(false); setAba('geral')
    setAjustesPorte(ajustesPorteVazios()); setAjustesPelagem(ajustesPelagemVazios()); setAjustesTemperamento(ajustesTemperamentoVazios()); setAdicionandoRacaPreco(false); setAdicionandoPeso(false)
    setEspecies(['cao', 'gato']); setPortes(todosPortes); setRacasBloqueadas([]); setDependencias([]); setFuncionarios([]); setModoExecucao('proprio'); setServicoBaseId(''); setEtapaAlvoId(''); setModalAberto(true)
  }

  function editarServico(servico: Servico) {
    const regrasDoServico = agenda.servicoRegrasPreco.filter((item) => item.servicoId === servico.id && item.ativo)
    setServicoId(servico.id); setNome(servico.nome); setDescricao(servico.descricao); setPrecoBaseCentavos(decimalParaCentavos(servico.precoBase))
    setAjustesPorte(carregarAjustes(todosPortes, regrasDoServico, 'porte') as Record<Pet['porte'], number>)
    setAjustesPelagem(carregarAjustes(['curta', 'media', 'longa'], regrasDoServico, 'pelagem') as Record<Pet['pelagem'], number>)
    setAjustesTemperamento(carregarAjustes(['calmo', 'moderado', 'dificil'], regrasDoServico, 'temperamento') as Record<Pet['temperamento'], number>)
    setAtivo(servico.ativo); setAgendamentoCliente(servico.agendamentoCliente); setAba('geral')
    setEspecies(agenda.servicoEspecies.filter((item) => item.servicoId === servico.id && item.ativo).map((item) => item.especie))
    setPortes(agenda.servicoPortes.filter((item) => item.servicoId === servico.id && item.ativo).map((item) => item.porte))
    setRacasBloqueadas(agenda.servicoRacasBloqueadas.filter((item) => item.servicoId === servico.id && item.ativo).map((item) => item.racaId))
    setDependencias(agenda.servicoDependencias.filter((item) => item.servicoId === servico.id && item.ativo).map((item) => item.dependenciaServicoId))
    setFuncionarios(agenda.funcionarioServicos.filter((item) => item.servicoId === servico.id && item.ativo).map((item) => item.funcionarioId))
    const acoplamento = agenda.servicoAcoplamentos.find((item) => item.servicoId === servico.id && item.ativo)
    const etapaAlvo = agenda.servicoEtapas.find((item) => item.id === acoplamento?.etapaAlvoId)
    setModoExecucao(acoplamento ? 'acoplado' : 'proprio'); setServicoBaseId(etapaAlvo?.servicoId ?? ''); setEtapaAlvoId(acoplamento?.etapaAlvoId ?? '')
    setEditandoEtapa(undefined); setEditandoDuracao(undefined); setAdicionandoRacaPreco(false); setAdicionandoPeso(false); setModalAberto(true)
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    if (!nome.trim() || especies.length === 0 || portes.length === 0) return alert('Informe o nome e selecione ao menos uma espécie e um porte.')
    if (modoExecucao === 'acoplado') {
      if (!servicoId) return alert('Salve o serviço e configure sua contribuição operacional antes de ativar o acoplamento.')
      if (!servicoBaseId || !etapaAlvoId) return alert('Selecione o serviço base e a etapa onde este serviço será executado.')
      if (etapasAtivas.length !== 1) return alert('Um serviço executado junto a outra etapa deve possuir exatamente uma contribuição operacional ativa.')
      if (!dependencias.includes(servicoBaseId)) return alert('O serviço base também precisa estar selecionado como dependência obrigatória.')
    }
    try {
      const id = await salvarServico({ nome: nome.trim(), descricao: descricao.trim(), precoBase: centavosParaDecimal(precoBaseCentavos), ativo, agendamentoCliente }, servicoId ?? undefined)
      const acoplamentoAtual = agenda.servicoAcoplamentos.find((item) => item.servicoId === id && item.ativo)
      if (modoExecucao === 'proprio' || acoplamentoAtual?.etapaAlvoId !== etapaAlvoId) await salvarAcoplamentoServico(id, null)
      await salvarElegibilidadeServico(id, { especies, portes, racasBloqueadas, dependencias, funcionarios })
      if (modoExecucao === 'acoplado') await salvarAcoplamentoServico(id, etapaAlvoId)
      await Promise.all([
        ...todosPortes.map((item) => salvarAjustePrecoFixo(id, 'porte', item, centavosParaDecimal(ajustesPorte[item]))),
        ...(['curta', 'media', 'longa'] as Pet['pelagem'][]).map((item) => salvarAjustePrecoFixo(id, 'pelagem', item, centavosParaDecimal(ajustesPelagem[item]))),
        ...(['calmo', 'moderado', 'dificil'] as Pet['temperamento'][]).map((item) => salvarAjustePrecoFixo(id, 'temperamento', item, centavosParaDecimal(ajustesTemperamento[item]))),
      ])
      await agenda.recarregarAgenda(); setModalAberto(false)
    } catch (error) { alert(mensagemErro(error)) }
  }

  function abrirEtapa(item?: ServicoEtapa) {
    const recursos = item
      ? agenda.servicoEtapaRecursos.filter((recurso) => recurso.servicoEtapaId === item.id && recurso.ativo)
      : []
    const recursoFuncionario = recursos.find((recurso) => recurso.tipo === 'funcionario')
    const recursoEquipamento = recursos.find((recurso) => recurso.tipo === 'equipamento')
    const usaLegado = Boolean(item && recursos.length === 0)
    setEditandoEtapa(item ?? null); setEtapaNome(item?.nome ?? ''); setEtapaOrdem(String(item?.ordem ?? etapas.length + 1)); setEtapaDuracao(item ? String(item.duracaoMinutos) : '')
    setEtapaAtiva(item?.ativo ?? true)
    setEtapaExigeFuncionario(Boolean(recursoFuncionario) || (usaLegado && item?.recurso === 'funcionario') || !item)
    setEtapaQuantidadeFuncionarios(String(recursoFuncionario?.quantidade ?? 1))
    setEtapaExigeEquipamento(Boolean(recursoEquipamento) || (usaLegado && item?.recurso === 'equipamento'))
    setEtapaEquipamento(recursoEquipamento?.equipamentoId ?? item?.equipamentoId ?? '')
    setEtapaQuantidadeEquipamentos(String(recursoEquipamento?.quantidade ?? 1))
    setEtapaPoliticaEspera(item?.politicaEsperaAntes ?? 'padrao')
    setEtapaEsperaMinutos(String(item?.esperaAntesMinutos ?? 15))
  }

  async function gravarEtapa() {
    if (!servicoId || !etapaNome.trim() || Number(etapaDuracao) <= 0) return alert('Preencha nome e duração da etapa.')
    if (etapaExigeEquipamento && !etapaEquipamento) return alert('Selecione o equipamento.')
    if (etapaPoliticaEspera === 'personalizada' && Number(etapaEsperaMinutos) < 0) return alert('Informe um limite de espera válido.')
    const recursos = [
      ...(etapaExigeFuncionario ? [{ tipo: 'funcionario' as const, equipamentoId: null, quantidade: Number(etapaQuantidadeFuncionarios) }] : []),
      ...(etapaExigeEquipamento ? [{ tipo: 'equipamento' as const, equipamentoId: etapaEquipamento, quantidade: Number(etapaQuantidadeEquipamentos) }] : []),
    ]
    if (recursos.some((recurso) => !Number.isInteger(recurso.quantidade) || recurso.quantidade <= 0)) return alert('As quantidades de recursos devem ser maiores que zero.')
    const recursoLegado: RecursoEtapa = etapaExigeFuncionario ? 'funcionario' : etapaExigeEquipamento ? 'equipamento' : 'nenhum'
    try {
      await salvarEtapa({ servicoId, nome: etapaNome.trim(), ordem: Number(etapaOrdem), duracaoMinutos: Number(etapaDuracao), recurso: recursoLegado, equipamentoId: recursoLegado === 'equipamento' ? etapaEquipamento : null, ativo: etapaAtiva, politicaEsperaAntes: etapaPoliticaEspera, esperaAntesMinutos: etapaPoliticaEspera === 'personalizada' ? Number(etapaEsperaMinutos) : null, recursos }, editandoEtapa?.id)
      await agenda.recarregarAgenda(); setEditandoEtapa(undefined)
    } catch (error) { alert(mensagemErro(error)) }
  }

  function abrirDuracao(item?: ServicoModificador) {
    setEditandoDuracao(item ?? null); setDuracaoEtapa(etapasAtivas.some((etapa) => etapa.id === item?.servicoEtapaId) ? item!.servicoEtapaId! : etapasAtivas[0]?.id ?? ''); setDuracaoCriterio(item?.criterio ?? 'porte')
    setDuracaoValor(valorDaRegra(item)); setDuracaoAcrescimo(String(item?.acrescimoMinutos ?? 0)); setDuracaoAtiva(item?.ativo ?? true)
    setDuracaoRacaBusca(item?.racaId ? nomeRaca(racas, item.racaId) : '')
  }

  async function gravarDuracao() {
    if (!servicoId || !duracaoEtapa || !etapasAtivas.some((item) => item.id === duracaoEtapa) || !duracaoValor) return alert('Selecione uma etapa ativa e preencha a condição da regra.')
    try {
      await salvarModificador({ servicoId, servicoEtapaId: duracaoEtapa, criterio: duracaoCriterio, valor: valorLegado(duracaoCriterio, duracaoValor, racas), acrescimoMinutos: Number(duracaoAcrescimo), ativo: duracaoAtiva,
        racaId: duracaoCriterio === 'raca' ? duracaoValor : null, porte: duracaoCriterio === 'porte' ? duracaoValor as Pet['porte'] : null,
        pelagem: duracaoCriterio === 'pelagem' ? duracaoValor as Pet['pelagem'] : null, temperamento: duracaoCriterio === 'temperamento' ? duracaoValor as Pet['temperamento'] : null,
        pesoMin: duracaoCriterio === 'peso' ? Number(duracaoValor) : null, pesoMax: null }, editandoDuracao?.id)
      await agenda.recarregarAgenda(); setEditandoDuracao(undefined)
    } catch (error) { alert(mensagemErro(error)) }
  }

  async function gravarPrecoRaca() {
    if (!servicoId || !precoRacaId) return alert('Selecione uma raça.')
    if (regrasRacaPreco.some((item) => item.racaId === precoRacaId)) return alert('Esta raça já possui um ajuste de preço.')
    try {
      await salvarAjustePrecoRaca(servicoId, precoRacaId, centavosParaDecimal(precoRacaCentavos))
      await agenda.recarregarAgenda(); setAdicionandoRacaPreco(false); setPrecoRacaId(''); setPrecoRacaBusca(''); setPrecoRacaCentavos(0)
    } catch (error) { alert(mensagemErro(error)) }
  }

  async function removerPrecoRaca(id: string) {
    try { await desativarRegraPreco(id); await agenda.recarregarAgenda() } catch (error) { alert(mensagemErro(error)) }
  }

  async function gravarPrecoPeso() {
    if (!servicoId) return
    const minimo = Number(pesoMin.replace(',', '.'))
    const maximo = Number(pesoMax.replace(',', '.'))
    if (!Number.isFinite(minimo) || !Number.isFinite(maximo) || minimo < 0 || maximo < minimo) return alert('Informe uma faixa de peso válida.')
    const sobreposta = regrasPesoPreco.some((item) => minimo <= Number(item.pesoMax) && maximo >= Number(item.pesoMin))
    if (sobreposta) return alert('Esta faixa se sobrepõe a outra regra de peso.')
    try {
      await salvarAjustePrecoPeso(servicoId, minimo, maximo, centavosParaDecimal(pesoCentavos))
      await agenda.recarregarAgenda(); setAdicionandoPeso(false); setPesoMin(''); setPesoMax(''); setPesoCentavos(0)
    } catch (error) { alert(mensagemErro(error)) }
  }

  return <div className="servicos-page">
    <div className="servicos-header"><div><p className="servicos-kicker">Catálogo</p><h1>Serviços</h1><p>Organize o que sua equipe oferece, de um jeito simples.</p></div><Button onClick={novoServico}>+ Novo serviço</Button></div>
    <div className="servicos-lista">{agenda.servicos.map((servico) => {
      const duracao = agenda.servicoEtapas.filter((item) => item.servicoId === servico.id && item.ativo).reduce((total, item) => total + item.duracaoMinutos, 0)
      return <article className="servico-card" key={servico.id} role="button" tabIndex={0} onClick={() => editarServico(servico)} onKeyDown={(evento) => { if (evento.key === 'Enter' || evento.key === ' ') { evento.preventDefault(); editarServico(servico) } }}>
        <div><strong>{servico.nome}</strong><span>{precoDoServico(servico.precoBase)} · {duracao ? `${duracao} min estimados` : 'Duração a configurar'}</span></div>
        <span className={servico.ativo ? 'status ativo' : 'status'}>{servico.ativo ? 'Ativo' : 'Inativo'}</span>
      </article>
    })}</div>

    <Modal aberto={modalAberto} titulo={servicoId ? nome : 'Novo serviço'} onClose={() => setModalAberto(false)} maxWidth="900px">
      <form onSubmit={salvar} className="servico-form abas-servico">
        <nav className="servico-tabs" aria-label="Configuração do serviço">{([['geral', 'Geral'], ['preco', 'Precificação'], ['regras', 'Regras'], ['operacao', 'Operação']] as [Aba, string][]).map(([id, rotulo]) => <button type="button" key={id} className={aba === id ? 'ativa' : ''} onClick={() => setAba(id)}>{rotulo}</button>)}</nav>
        <div className="aba-servico-conteudo">
          {aba === 'geral' && <Geral nome={nome} setNome={setNome} descricao={descricao} setDescricao={setDescricao} ativo={ativo} setAtivo={setAtivo} agendamento={agendamentoCliente} setAgendamento={setAgendamentoCliente} />}
          {aba === 'preco' && <Precificacao precoBase={precoBaseCentavos} setPrecoBase={setPrecoBaseCentavos} ajustesPorte={ajustesPorte} setAjustesPorte={setAjustesPorte} ajustesPelagem={ajustesPelagem} setAjustesPelagem={setAjustesPelagem} ajustesTemperamento={ajustesTemperamento} setAjustesTemperamento={setAjustesTemperamento} regrasRaca={regrasRacaPreco} racas={racas} adicionandoRaca={adicionandoRacaPreco} setAdicionandoRaca={setAdicionandoRacaPreco} racaId={precoRacaId} setRacaId={setPrecoRacaId} buscaRaca={precoRacaBusca} setBuscaRaca={setPrecoRacaBusca} racaCentavos={precoRacaCentavos} setRacaCentavos={setPrecoRacaCentavos} salvarRaca={gravarPrecoRaca} removerRaca={removerPrecoRaca} regrasPeso={regrasPesoPreco} adicionandoPeso={adicionandoPeso} setAdicionandoPeso={setAdicionandoPeso} pesoMin={pesoMin} setPesoMin={setPesoMin} pesoMax={pesoMax} setPesoMax={setPesoMax} pesoCentavos={pesoCentavos} setPesoCentavos={setPesoCentavos} salvarPeso={gravarPrecoPeso} removerPeso={removerPrecoRaca} servicoSalvo={Boolean(servicoId)} />}
          {aba === 'regras' && <div className="aba-bloco"><Titulo titulo="Para quais pets este serviço está disponível?" texto="Escolha o público atendido e cadastre somente as exceções." /><h3>Espécies</h3><div className="chips"><Chip texto="Cães" marcado={especies.includes('cao')} alterar={() => alternar('cao', especies, setEspecies)} /><Chip texto="Gatos" marcado={especies.includes('gato')} alterar={() => alternar('gato', especies, setEspecies)} /></div><h3>Portes</h3><div className="chips">{todosPortes.map((item) => <Chip key={item} texto={nomesPorte[item]} marcado={portes.includes(item)} alterar={() => alternar(item, portes, setPortes)} />)}</div>
            <h3>Exceto estas raças</h3><Campo titulo="Buscar raça"><Input value={buscaRaca} placeholder="Digite para pesquisar" onChange={(e) => setBuscaRaca(e.target.value)} />{racasEncontradas.length > 0 && <ResultadosRaca racas={racasEncontradas} selecionar={(raca) => { setRacasBloqueadas([...racasBloqueadas, raca.id]); setBuscaRaca('') }} />}</Campo><div className="chips">{racasBloqueadas.map((id) => { const raca = racas.find((item) => item.id === id); return raca && <button type="button" className="chip-removivel" key={id} onClick={() => setRacasBloqueadas(racasBloqueadas.filter((item) => item !== id))}>{raca.nome} ×</button> })}</div>
            <h3>Dependências obrigatórias</h3><p className="texto-suave">Este serviço só pode ser realizado junto aos serviços selecionados.</p><div className="seletor-lista">{agenda.servicos.filter((item) => item.id !== servicoId).map((item) => <Chip key={item.id} texto={item.nome} marcado={dependencias.includes(item.id)} alterar={() => alternar(item.id, dependencias, setDependencias)} />)}</div>
          </div>}
          {aba === 'operacao' && <div className="aba-bloco"><Titulo titulo="Execução operacional" texto="Defina se este serviço possui um fluxo próprio ou acontece junto a uma etapa existente." /><Campo titulo="Como este serviço é executado"><Select value={modoExecucao} onChange={(e) => { const modo = e.target.value as ModoExecucao; setModoExecucao(modo); if (modo === 'proprio') { setServicoBaseId(''); setEtapaAlvoId('') } }} options={[{ value: 'proprio', label: 'Possui etapas próprias' }, { value: 'acoplado', label: 'Executado junto a outra etapa' }]} /></Campo>{modoExecucao === 'acoplado' && <div className="editor-inline"><div className="form-grid"><Campo titulo="Serviço base"><Select value={servicoBaseId} onChange={(e) => { const base = e.target.value; setServicoBaseId(base); setEtapaAlvoId(''); if (base && !dependencias.includes(base)) setDependencias([...dependencias, base]) }} options={[{ value: '', label: 'Selecione' }, ...agenda.servicos.filter((item) => item.id !== servicoId && item.ativo && !agenda.servicoAcoplamentos.some((acoplamento) => acoplamento.servicoId === item.id && acoplamento.ativo)).map((item) => ({ value: item.id, label: item.nome }))]} /></Campo><Campo titulo="Etapa"><Select value={etapaAlvoId} onChange={(e) => setEtapaAlvoId(e.target.value)} options={[{ value: '', label: 'Selecione' }, ...agenda.servicoEtapas.filter((item) => item.servicoId === servicoBaseId && item.ativo).map((item) => ({ value: item.id, label: item.nome }))]} /></Campo></div><p className="texto-suave">A duração adicional será calculada pela contribuição e pelas regras de duração deste serviço. Os recursos serão exigidos durante a etapa consolidada.</p></div>}<div className="divisor" /><Titulo titulo={modoExecucao === 'acoplado' ? 'Contribuição operacional' : 'Etapas'} texto={modoExecucao === 'acoplado' ? 'Configure uma única contribuição com sua duração, recursos e habilitações.' : 'Organize a sequência, a duração e os recursos necessários.'} /><div className="config-lista">{etapas.map((item) => <button type="button" key={item.id} onClick={() => abrirEtapa(item)}><span>{item.ordem}. {item.nome}</span><small>{item.duracaoMinutos} min · {rotuloRecursosEtapa(item, agenda.servicoEtapaRecursos)}</small></button>)}</div>{editandoEtapa !== undefined ? <EditorEtapa nome={etapaNome} setNome={setEtapaNome} ordem={etapaOrdem} setOrdem={setEtapaOrdem} duracao={etapaDuracao} setDuracao={setEtapaDuracao} exigeFuncionario={etapaExigeFuncionario} setExigeFuncionario={setEtapaExigeFuncionario} quantidadeFuncionarios={etapaQuantidadeFuncionarios} setQuantidadeFuncionarios={setEtapaQuantidadeFuncionarios} exigeEquipamento={etapaExigeEquipamento} setExigeEquipamento={setEtapaExigeEquipamento} equipamento={etapaEquipamento} setEquipamento={setEtapaEquipamento} quantidadeEquipamentos={etapaQuantidadeEquipamentos} setQuantidadeEquipamentos={setEtapaQuantidadeEquipamentos} politicaEspera={etapaPoliticaEspera} setPoliticaEspera={setEtapaPoliticaEspera} esperaMinutos={etapaEsperaMinutos} setEsperaMinutos={setEtapaEsperaMinutos} ativa={etapaAtiva} setAtiva={setEtapaAtiva} equipamentos={agenda.equipamentos} cancelar={() => setEditandoEtapa(undefined)} salvar={gravarEtapa} /> : servicoId && (modoExecucao === 'proprio' || etapas.length === 0) ? <Button variant="secondary" onClick={() => abrirEtapa()}>+ Adicionar {modoExecucao === 'acoplado' ? 'contribuição' : 'etapa'}</Button> : !servicoId ? <AvisoSalvar /> : null}
            <div className="divisor" /><Titulo titulo="Regras de duração" texto="Acréscimos em minutos, separados das variações de preço." /><ListaRegras regras={regrasDuracao} racas={racas} aoEditar={(item) => abrirDuracao(item as ServicoModificador)} />{etapasAtivas.length === 0 ? <p className="aviso-suave">Este serviço ainda não possui etapas. Adicione uma etapa antes de criar regras de duração.</p> : editandoDuracao !== undefined ? <EditorRegra criterio={duracaoCriterio} setCriterio={setDuracaoCriterio} valor={duracaoValor} setValor={setDuracaoValor} acrescimo={duracaoAcrescimo} setAcrescimo={setDuracaoAcrescimo} ativa={duracaoAtiva} setAtiva={setDuracaoAtiva} racas={racas} buscaRaca={duracaoRacaBusca} setBuscaRaca={setDuracaoRacaBusca} cancelar={() => setEditandoDuracao(undefined)} salvar={gravarDuracao} etapas={etapasAtivas} etapa={duracaoEtapa} setEtapa={setDuracaoEtapa} /> : servicoId && <Button variant="secondary" onClick={() => abrirDuracao()}>+ Adicionar regra</Button>}
            <div className="divisor" /><Titulo titulo="Equipe habilitada" texto="Escolha quem pode executar este serviço." /><div className="seletor-lista">{agenda.funcionarios.map((item) => <Chip key={item.id} texto={item.nome} marcado={funcionarios.includes(item.id)} alterar={() => alternar(item.id, funcionarios, setFuncionarios)} />)}</div>
          </div>}
        </div>
        <footer className="servico-modal-acoes"><Button variant="secondary" onClick={() => setModalAberto(false)}>Cancelar</Button><Button type="submit">Salvar configurações</Button></footer>
      </form>
    </Modal>
  </div>
}

function Geral(props: { nome: string; setNome: (v: string) => void; descricao: string; setDescricao: (v: string) => void; ativo: boolean; setAtivo: (v: boolean) => void; agendamento: boolean; setAgendamento: (v: boolean) => void }) { return <div className="aba-bloco"><Titulo titulo="Informações gerais" texto="Dados principais e visibilidade do serviço." /><Campo titulo="Nome"><Input value={props.nome} onChange={(e) => props.setNome(e.target.value)} /></Campo><Campo titulo="Descrição"><Input value={props.descricao} onChange={(e) => props.setDescricao(e.target.value)} /></Campo><div className="switch-lista"><Switch texto="Serviço ativo" apoio="Determina se o serviço pode ser utilizado no sistema." marcado={props.ativo} alterar={props.setAtivo} /><Switch texto="Disponível para autoagendamento" apoio="Determina se o cliente poderá selecionar este serviço no futuro autoagendamento." marcado={props.agendamento} alterar={props.setAgendamento} /></div></div> }

function Precificacao(props: {
  precoBase: number; setPrecoBase: (v: number) => void
  ajustesPorte: Record<Pet['porte'], number>; setAjustesPorte: (v: Record<Pet['porte'], number>) => void
  ajustesPelagem: Record<Pet['pelagem'], number>; setAjustesPelagem: (v: Record<Pet['pelagem'], number>) => void
  ajustesTemperamento: Record<Pet['temperamento'], number>; setAjustesTemperamento: (v: Record<Pet['temperamento'], number>) => void
  regrasRaca: ServicoRegraPreco[]; racas: Raca[]; adicionandoRaca: boolean; setAdicionandoRaca: (v: boolean) => void
  racaId: string; setRacaId: (v: string) => void; buscaRaca: string; setBuscaRaca: (v: string) => void
  racaCentavos: number; setRacaCentavos: (v: number) => void; salvarRaca: () => void; removerRaca: (id: string) => void; servicoSalvo: boolean
  regrasPeso: ServicoRegraPreco[]; adicionandoPeso: boolean; setAdicionandoPeso: (v: boolean) => void
  pesoMin: string; setPesoMin: (v: string) => void; pesoMax: string; setPesoMax: (v: string) => void
  pesoCentavos: number; setPesoCentavos: (v: number) => void; salvarPeso: () => void; removerPeso: (id: string) => void
}) {
  const racasUsadas = props.regrasRaca.map((item) => item.racaId).filter(Boolean) as string[]
  const encontradas = filtrarRacas(props.racas, props.buscaRaca, ['cao', 'gato'], racasUsadas)
  return <div className="aba-bloco precificacao">
    <Titulo titulo="Preço base" texto="Valor mínimo deste serviço antes dos ajustes." />
    <CampoMoeda valor={props.precoBase} alterar={props.setPrecoBase} destaque />

    <TabelaAjustes titulo="Ajustes por porte" colunas={['Porte', 'Acréscimo']} linhas={todosPortes.map((item) => ({ id: item, nome: nomesPorte[item], valor: props.ajustesPorte[item] }))} alterar={(id, valor) => props.setAjustesPorte({ ...props.ajustesPorte, [id]: valor })} />

    <section className="preco-grupo"><CabecalhoPreco titulo="Ajustes por raça" texto="Somente raças com valor diferente do padrão." />
      {props.regrasRaca.length > 0 ? <div className="preco-tabela"><div className="preco-linha cabecalho"><span>Raça</span><span>Acréscimo</span><span /></div>{props.regrasRaca.map((regra) => <div className="preco-linha" key={regra.id}><strong>{nomeRaca(props.racas, regra.racaId ?? '')}</strong><span>{moedaCentavos(decimalParaCentavos(regra.acrescimoValor))}</span><button type="button" className="acao-remover" onClick={() => props.removerRaca(regra.id)}>Remover</button></div>)}</div> : <p className="aviso-suave">Nenhum ajuste específico por raça.</p>}
      {props.adicionandoRaca ? <div className="editor-raca-preco"><Campo titulo="Raça"><Input value={props.buscaRaca} placeholder="Pesquisar no catálogo" onChange={(e) => { props.setBuscaRaca(e.target.value); props.setRacaId('') }} />{props.buscaRaca && !props.racaId && <ResultadosRaca racas={encontradas} selecionar={(raca) => { props.setRacaId(raca.id); props.setBuscaRaca(raca.nome) }} />}</Campo><Campo titulo="Acréscimo"><CampoMoeda valor={props.racaCentavos} alterar={props.setRacaCentavos} /></Campo><div className="editor-acoes"><Button variant="secondary" onClick={() => props.setAdicionandoRaca(false)}>Cancelar</Button><Button onClick={props.salvarRaca}>Adicionar</Button></div></div> : props.servicoSalvo ? <Button variant="secondary" onClick={() => props.setAdicionandoRaca(true)}>+ Adicionar raça</Button> : <AvisoSalvar />}
    </section>

    <section className="preco-grupo"><CabecalhoPreco titulo="Ajustes por peso" texto="Cadastre faixas que não se sobreponham." />
      {props.regrasPeso.length > 0 ? <div className="preco-tabela"><div className="preco-linha cabecalho"><span>Faixa de peso</span><span>Acréscimo</span><span /></div>{props.regrasPeso.map((regra) => <div className="preco-linha" key={regra.id}><strong>{formatarFaixaPeso(regra)}</strong><span>{moedaCentavos(decimalParaCentavos(regra.acrescimoValor))}</span><button type="button" className="acao-remover" onClick={() => props.removerPeso(regra.id)}>Remover</button></div>)}</div> : <p className="aviso-suave">Nenhum ajuste por faixa de peso.</p>}
      {props.adicionandoPeso ? <div className="editor-peso-preco"><Campo titulo="Peso inicial (kg)"><Input value={props.pesoMin} placeholder="5,01" onChange={(e) => props.setPesoMin(e.target.value)} /></Campo><Campo titulo="Peso final (kg)"><Input value={props.pesoMax} placeholder="10" onChange={(e) => props.setPesoMax(e.target.value)} /></Campo><Campo titulo="Acréscimo"><CampoMoeda valor={props.pesoCentavos} alterar={props.setPesoCentavos} /></Campo><div className="editor-acoes"><Button variant="secondary" onClick={() => props.setAdicionandoPeso(false)}>Cancelar</Button><Button onClick={props.salvarPeso}>Adicionar faixa</Button></div></div> : props.servicoSalvo ? <Button variant="secondary" onClick={() => props.setAdicionandoPeso(true)}>+ Adicionar faixa</Button> : <AvisoSalvar />}
    </section>

    <TabelaAjustes titulo="Ajustes por pelagem" colunas={['Pelagem', 'Acréscimo']} linhas={( ['curta', 'media', 'longa'] as Pet['pelagem'][]).map((item) => ({ id: item, nome: nomesPelagem[item], valor: props.ajustesPelagem[item] }))} alterar={(id, valor) => props.setAjustesPelagem({ ...props.ajustesPelagem, [id]: valor })} />
    <TabelaAjustes titulo="Ajustes por temperamento" colunas={['Temperamento', 'Acréscimo']} linhas={( ['calmo', 'moderado', 'dificil'] as Pet['temperamento'][]).map((item) => ({ id: item, nome: { calmo: 'Calmo', moderado: 'Moderado', dificil: 'Difícil' }[item], valor: props.ajustesTemperamento[item] }))} alterar={(id, valor) => props.setAjustesTemperamento({ ...props.ajustesTemperamento, [id]: valor })} />
    <p className="texto-suave">Os ajustes aplicáveis são cumulativos e serão somados ao preço base.</p>
  </div>
}

function TabelaAjustes({ titulo, colunas, linhas, alterar }: { titulo: string; colunas: string[]; linhas: { id: string; nome: string; valor: number }[]; alterar: (id: string, valor: number) => void }) { return <section className="preco-grupo"><CabecalhoPreco titulo={titulo} /><div className={`preco-tabela colunas-${colunas.length}`}><div className="preco-linha cabecalho">{colunas.map((item) => <span key={item}>{item}</span>)}</div>{linhas.map((linha) => <div className="preco-linha" key={linha.id}><strong>{linha.nome}</strong><CampoMoeda valor={linha.valor} alterar={(valor) => alterar(linha.id, valor)} /></div>)}</div></section> }
function CabecalhoPreco({ titulo, texto }: { titulo: string; texto?: string }) { return <header className="preco-grupo-titulo"><h3>{titulo}</h3>{texto && <p>{texto}</p>}</header> }
function CampoMoeda({ valor, alterar, destaque = false }: { valor: number; alterar: (v: number) => void; destaque?: boolean }) { return <input className={`input-moeda${destaque ? ' destaque' : ''}`} inputMode="numeric" value={moedaCentavos(valor)} onChange={(e) => alterar(entradaParaCentavos(e.target.value))} aria-label="Valor em reais" /> }
function Titulo({ titulo, texto }: { titulo: string; texto: string }) { return <header className="aba-titulo"><h3>{titulo}</h3><p>{texto}</p></header> }
function Campo({ titulo, children }: { titulo: string; children: React.ReactNode }) { return <label className="campo-servico"><span>{titulo}</span>{children}</label> }
function Chip({ texto, marcado, alterar }: { texto: string; marcado: boolean; alterar: () => void }) { return <button type="button" className={`chip-selecao${marcado ? ' marcado' : ''}`} onClick={alterar}>{marcado && <span>✓</span>}{texto}</button> }
function Switch({ texto, apoio, marcado, alterar }: { texto: string; apoio: string; marcado: boolean; alterar: (v: boolean) => void }) { return <label className="switch-linha"><span><strong>{texto}</strong><small>{apoio}</small></span><input type="checkbox" checked={marcado} onChange={(e) => alterar(e.target.checked)} /><i /></label> }
function AvisoSalvar() { return <p className="aviso-suave">Salve o serviço primeiro para configurar esta área.</p> }
function ResultadosRaca({ racas, selecionar }: { racas: Raca[]; selecionar: (raca: Raca) => void }) { return <div className="busca-resultados">{racas.map((raca) => <button type="button" key={raca.id} onClick={() => selecionar(raca)}>{raca.nome}</button>)}</div> }

function EditorEtapa(props: { nome: string; setNome: (v: string) => void; ordem: string; setOrdem: (v: string) => void; duracao: string; setDuracao: (v: string) => void; exigeFuncionario: boolean; setExigeFuncionario: (v: boolean) => void; quantidadeFuncionarios: string; setQuantidadeFuncionarios: (v: string) => void; exigeEquipamento: boolean; setExigeEquipamento: (v: boolean) => void; equipamento: string; setEquipamento: (v: string) => void; quantidadeEquipamentos: string; setQuantidadeEquipamentos: (v: string) => void; politicaEspera: PoliticaEsperaEtapa; setPoliticaEspera: (v: PoliticaEsperaEtapa) => void; esperaMinutos: string; setEsperaMinutos: (v: string) => void; ativa: boolean; setAtiva: (v: boolean) => void; equipamentos: { id: string; nome: string; ativo: boolean }[]; cancelar: () => void; salvar: () => void }) {
  return <div className="editor-inline">
    <div className="form-grid"><Campo titulo="Nome"><Input value={props.nome} onChange={(e) => props.setNome(e.target.value)} /></Campo><Campo titulo="Ordem"><Input type="number" value={props.ordem} onChange={(e) => props.setOrdem(e.target.value)} /></Campo><Campo titulo="Duração (min)"><Input type="number" value={props.duracao} onChange={(e) => props.setDuracao(e.target.value)} /></Campo></div>
    <div className="editor-subsecao"><h4>Recursos necessários</h4><Switch texto="Funcionário" apoio="Reserve profissionais durante a execução desta etapa." marcado={props.exigeFuncionario} alterar={props.setExigeFuncionario} />{props.exigeFuncionario && <Campo titulo="Quantidade de funcionários"><Input type="number" value={props.quantidadeFuncionarios} onChange={(e) => props.setQuantidadeFuncionarios(e.target.value)} /></Campo>}<Switch texto="Equipamento" apoio="Reserve uma ou mais unidades de um equipamento." marcado={props.exigeEquipamento} alterar={props.setExigeEquipamento} />{props.exigeEquipamento && <div className="form-grid"><Campo titulo="Equipamento"><Select value={props.equipamento} onChange={(e) => props.setEquipamento(e.target.value)} options={[{ value: '', label: 'Selecione' }, ...props.equipamentos.filter((item) => item.ativo || item.id === props.equipamento).map((item) => ({ value: item.id, label: item.nome }))]} /></Campo><Campo titulo="Quantidade de unidades"><Input type="number" value={props.quantidadeEquipamentos} onChange={(e) => props.setQuantidadeEquipamentos(e.target.value)} /></Campo></div>}</div>
    <div className="editor-subsecao"><h4>Espera antes da etapa</h4><Campo titulo="Como limitar a espera"><Select value={props.politicaEspera} onChange={(e) => props.setPoliticaEspera(e.target.value as PoliticaEsperaEtapa)} options={[{ value: 'padrao', label: 'Usar a espera padrão da Agenda' }, { value: 'personalizada', label: 'Definir um limite para esta etapa' }, { value: 'sem_limite_operacional', label: 'Sem limite fixo, respeitando o horário operacional' }]} /></Campo>{props.politicaEspera === 'personalizada' && <Campo titulo="Limite de espera (min)"><Input type="number" value={props.esperaMinutos} onChange={(e) => props.setEsperaMinutos(e.target.value)} /></Campo>}<p className="texto-suave">A espera nunca amplia o funcionamento da loja nem a jornada dos profissionais.</p></div>
    <Switch texto="Etapa ativa" apoio="Participa da execução do serviço." marcado={props.ativa} alterar={props.setAtiva} /><AcoesEditor cancelar={props.cancelar} salvar={props.salvar} rotuloSalvar="Salvar etapa" />
  </div>
}

function EditorRegra(props: { criterio: Criterio; setCriterio: (v: Criterio) => void; valor: string; setValor: (v: string) => void; acrescimo: string; setAcrescimo: (v: string) => void; ativa: boolean; setAtiva: (v: boolean) => void; racas: Raca[]; buscaRaca: string; setBuscaRaca: (v: string) => void; cancelar: () => void; salvar: () => void; monetaria?: boolean; etapas?: ServicoEtapa[]; etapa?: string; setEtapa?: (v: string) => void }) { const encontradas = filtrarRacas(props.racas, props.buscaRaca, ['cao', 'gato'], []); return <div className="editor-inline">{props.etapas && <Campo titulo="Etapa afetada"><Select value={props.etapa} onChange={(e) => props.setEtapa?.(e.target.value)} options={props.etapas.map((item) => ({ value: item.id, label: item.nome }))} /></Campo>}<div className="form-grid"><Campo titulo="Critério"><Select value={props.criterio} onChange={(e) => { props.setCriterio(e.target.value as Criterio); props.setValor(''); props.setBuscaRaca('') }} options={[{ value: 'porte', label: 'Porte' }, { value: 'pelagem', label: 'Pelagem' }, { value: 'peso', label: 'Peso mínimo' }, { value: 'raca', label: 'Raça' }, { value: 'temperamento', label: 'Temperamento' }]} /></Campo><Campo titulo={props.monetaria ? 'Acréscimo em R$' : 'Acréscimo em minutos'}><Input type="number" value={props.acrescimo} onChange={(e) => props.setAcrescimo(e.target.value)} /></Campo></div><Campo titulo="Condição"><ValorCriterio criterio={props.criterio} valor={props.valor} setValor={props.setValor} racas={encontradas} busca={props.buscaRaca} setBusca={props.setBuscaRaca} /></Campo><Switch texto="Regra ativa" apoio="Será considerada nos cálculos futuros." marcado={props.ativa} alterar={props.setAtiva} /><AcoesEditor cancelar={props.cancelar} salvar={props.salvar} /></div> }
function ValorCriterio({ criterio, valor, setValor, racas, busca, setBusca }: { criterio: Criterio; valor: string; setValor: (v: string) => void; racas: Raca[]; busca: string; setBusca: (v: string) => void }) { if (criterio === 'porte') return <Select value={valor} onChange={(e) => setValor(e.target.value)} options={[{ value: '', label: 'Selecione' }, ...todosPortes.map((item) => ({ value: item, label: nomesPorte[item] }))]} />; if (criterio === 'pelagem') return <Select value={valor} onChange={(e) => setValor(e.target.value)} options={[{ value: '', label: 'Selecione' }, ...(['curta', 'media', 'longa'] as Pet['pelagem'][]).map((item) => ({ value: item, label: nomesPelagem[item] }))]} />; if (criterio === 'temperamento') return <Select value={valor} onChange={(e) => setValor(e.target.value)} options={[{ value: '', label: 'Selecione' }, { value: 'calmo', label: 'Calmo' }, { value: 'moderado', label: 'Moderado' }, { value: 'dificil', label: 'Difícil' }]} />; if (criterio === 'peso') return <Input type="number" value={valor} placeholder="Peso em kg" onChange={(e) => setValor(e.target.value)} />; return <div><Input value={busca} placeholder="Busque uma raça" onChange={(e) => { setBusca(e.target.value); setValor('') }} />{busca && !valor && <ResultadosRaca racas={racas} selecionar={(raca) => { setValor(raca.id); setBusca(raca.nome) }} />}</div> }
function AcoesEditor({ cancelar, salvar, rotuloSalvar = 'Salvar regra' }: { cancelar: () => void; salvar: () => void; rotuloSalvar?: string }) { return <div className="editor-acoes"><Button variant="secondary" onClick={cancelar}>Cancelar</Button><Button onClick={salvar}>{rotuloSalvar}</Button></div> }
function ListaRegras({ regras, racas, monetaria = false, aoEditar }: { regras: (ServicoModificador | ServicoRegraPreco)[]; racas: Raca[]; monetaria?: boolean; aoEditar: (item: ServicoModificador | ServicoRegraPreco) => void }) { return regras.length ? <div className="config-lista">{regras.map((item) => <button type="button" key={item.id} onClick={() => aoEditar(item)}><span>{rotuloRegra(item, racas)}</span><small>+{monetaria ? moeda(Number((item as ServicoRegraPreco).acrescimoValor)) : `${(item as ServicoModificador).acrescimoMinutos} min`}</small></button>)}</div> : <p className="aviso-suave">Nenhuma regra configurada.</p> }

function valorDaRegra(item?: ServicoModificador | ServicoRegraPreco) { return item?.racaId ?? item?.porte ?? item?.pelagem ?? item?.temperamento ?? item?.pesoMin?.toString() ?? ('valor' in (item ?? {}) ? (item as ServicoModificador).valor : '') }
function valorLegado(criterio: Criterio, valor: string, racas: Raca[]) { return criterio === 'raca' ? nomeRaca(racas, valor) : valor }
function nomeRaca(racas: Raca[], id: string) { return racas.find((item) => item.id === id)?.nome ?? '' }
function filtrarRacas(racas: Raca[], busca: string, especies: Pet['especie'][], excluidas: string[]) { const termo = busca.trim().toLocaleLowerCase('pt-BR'); if (!termo) return []; return racas.filter((raca) => raca.ativo && especies.includes(raca.especie) && !excluidas.includes(raca.id)).filter((raca) => raca.nome.toLocaleLowerCase('pt-BR').includes(termo) || raca.sinonimos.some((item) => item.ativo && item.nome.toLocaleLowerCase('pt-BR').includes(termo))).slice(0, 8) }
function rotuloRegra(item: ServicoModificador | ServicoRegraPreco, racas: Raca[]) { const criterio = item.criterio; const valor = criterio === 'raca' ? nomeRaca(racas, item.racaId ?? '') : criterio === 'porte' ? nomesPorte[item.porte!] : criterio === 'pelagem' ? nomesPelagem[item.pelagem!] : criterio === 'temperamento' ? item.temperamento : `${item.pesoMin} kg`; return `${nomeCriterio(criterio)}: ${valor}` }
function nomeCriterio(criterio: Criterio) { return { porte: 'Porte', pelagem: 'Pelagem', raca: 'Raça', peso: 'Peso mínimo', temperamento: 'Temperamento' }[criterio] }
function rotuloRecursosEtapa(etapa: ServicoEtapa, recursos: ServicoEtapaRecurso[]) { const oficiais = recursos.filter((item) => item.servicoEtapaId === etapa.id && item.ativo); if (!oficiais.length) return etapa.recurso === 'funcionario' ? '1 funcionário' : etapa.recurso === 'equipamento' ? '1 equipamento' : 'sem recurso reservado'; return oficiais.map((item) => item.tipo === 'funcionario' ? `${item.quantidade} ${item.quantidade === 1 ? 'funcionário' : 'funcionários'}` : `${item.quantidade} ${item.quantidade === 1 ? 'equipamento' : 'equipamentos'}`).join(' + ') }
function ajustesPorteVazios(): Record<Pet['porte'], number> { return { mini: 0, pequeno: 0, medio: 0, grande: 0, gigante: 0 } }
function ajustesPelagemVazios(): Record<Pet['pelagem'], number> { return { curta: 0, media: 0, longa: 0 } }
function ajustesTemperamentoVazios(): Record<Pet['temperamento'], number> { return { calmo: 0, moderado: 0, dificil: 0 } }
function carregarAjustes(chaves: string[], regras: ServicoRegraPreco[], criterio: 'porte' | 'pelagem' | 'temperamento') { return Object.fromEntries(chaves.map((chave) => { const regra = regras.find((item) => item.criterio === criterio && item[criterio] === chave); return [chave, regra ? decimalParaCentavos(regra.acrescimoValor) : 0] })) }
function decimalParaCentavos(valor: number | string | null | undefined) { const numero = typeof valor === 'number' ? valor : Number(valor ?? 0); return Number.isFinite(numero) ? Math.round(numero * 100) : 0 }
function centavosParaDecimal(centavos: number) { return `${Math.floor(Math.max(0, centavos) / 100)}.${String(Math.max(0, centavos) % 100).padStart(2, '0')}` }
function moedaCentavos(centavos: number) { return (Math.max(0, centavos) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function entradaParaCentavos(valor: string) { const digitos = valor.replace(/\D/g, ''); return digitos ? Number(digitos) : 0 }
function formatarFaixaPeso(regra: ServicoRegraPreco) { const minimo = Number(regra.pesoMin).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); const maximo = Number(regra.pesoMax).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); return `${minimo} kg até ${maximo} kg` }
function alternar<T>(valor: T, lista: T[], alterar: (lista: T[]) => void) { alterar(lista.includes(valor) ? lista.filter((item) => item !== valor) : [...lista, valor]) }
function moeda(valor: number) { return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function precoDoServico(valor: number) { return Number.isFinite(valor) && valor > 0 ? `A partir de ${moeda(valor)}` : 'Preço não definido' }
function mensagemErro(error: unknown) { return typeof error === 'object' && error && 'message' in error ? String(error.message) : 'Não foi possível salvar.' }
