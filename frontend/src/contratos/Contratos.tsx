import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Modal from "../components/ui/Modal";
import { AgendaContext } from "../context/AgendaContext";
import { SistemaContext } from "../context/SistemaContext";
import { Horarios, PainelHorariosTaxidog } from "../agenda/NovoAgendamentoModal";
import { consultarDisponibilidade, consultarDisponibilidadeDoCiclo } from "../motorDisponibilidade";
import type { OpcaoDisponibilidade, ResultadoDisponibilidade, ResultadoDisponibilidadeCiclo } from "../motorDisponibilidade";
import { ciclosAtivosNaData } from "../lib/ciclosTaxidog";
import { listarPacotes, simularPacote } from "../pacotes/clienteSupabase";
import {
  descreverRecorrencia,
  type Pacote,
  type SimulacaoPacote,
} from "../pacotes/contrato";
import { listarContratos, materializarCicloContrato, venderContrato } from "./clienteSupabase";
import type { ContratoResumoVisual } from "./clienteSupabase";
import { BarraConsumoContrato, ResumoContagemContrato } from "./ConsumoContrato";
import DetalheContrato from "./DetalheContrato";
import {
  resumoAjuste,
  type ContratoResumo,
  type ModalidadeTransporteContrato,
} from "./contrato";

const moeda = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }),
  dias = [
    "Domingo",
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
  ],
  diasCurtos = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export default function Contratos({ contratoInicialId = null, onContratoInicialAberto }: { contratoInicialId?: string | null; onContratoInicialAberto?: () => void }) {
  const { clientes, pets } = useContext(SistemaContext),
    [contratos, setContratos] = useState<ContratoResumoVisual[]>([]),
    [pacotes, setPacotes] = useState<Pacote[]>([]),
    [estado, setEstado] = useState<"carregando" | "pronto" | "erro">(
      "carregando",
    ),
    [erro, setErro] = useState(""),
    [sucesso,setSucesso]=useState(""),
    [venda, setVenda] = useState(false),
    [detalhe, setDetalhe] = useState<ContratoResumo | null>(null),
    [busca, setBusca] = useState(""),
    [status, setStatus] = useState("todos"),
    [transporte, setTransporte] = useState("todos");
  async function carregar() {
    setEstado("carregando");
    try {
      const [c, p] = await Promise.all([listarContratos(), listarPacotes()]);
      setContratos(c);
      setPacotes(p);
      setEstado("pronto");
    } catch (e) {
      setErro(
        e instanceof Error
          ? e.message
          : "Não foi possível carregar os contratos.",
      );
      setEstado("erro");
    }
  }
  useEffect(() => {
    void carregar();
  }, []);
  useEffect(() => {
    if (estado !== "pronto" || !contratoInicialId) return;
    const contrato = contratos.find((item) => item.id === contratoInicialId);
    if (!contrato) return;
    setBusca("");
    setStatus("todos");
    setTransporte("todos");
    setDetalhe(contrato);
    onContratoInicialAberto?.();
  }, [contratoInicialId, contratos, estado, onContratoInicialAberto]);
  const filtrados = useMemo(
    () =>
      contratos.filter((c) => {
        const q = busca.toLowerCase();
        return (
          (!q ||
            `${c.clienteNome} ${c.petNome} ${c.pacoteNome}`
              .toLowerCase()
              .includes(q)) &&
          (status === "todos" || c.status === status) &&
          (transporte === "todos" || c.modalidadeTransporte === transporte)
        );
      }),
    [contratos, busca, status, transporte],
  );
  return (
    <div className="ux-page contratos-ux">
      <header className="ux-page-head">
        <div>
          <span className="ux-eyebrow">Relacionamento recorrente</span>
          <h1>Contratos</h1>
          <p>Acompanhe os pacotes vendidos e suas condições operacionais.</p>
        </div>
        <Button onClick={() => setVenda(true)}>+ Vender pacote</Button>
      </header>
      <section className="contrato-kpis">
        <div>
          <span>Total</span>
          <strong>{contratos.length}</strong>
        </div>
        <div>
          <span>Ativos</span>
          <strong>
            {contratos.filter((c) => c.status === "ativo").length}
          </strong>
        </div>
        <div>
          <span>Com TaxiDog</span>
          <strong>
            {
              contratos.filter((c) => c.modalidadeTransporte === "taxidog")
                .length
            }
          </strong>
        </div>
        <div>
          <span>Renovação automática</span>
          <strong>
            {contratos.filter((c) => c.renovacaoAutomatica).length}
          </strong>
        </div>
      </section>
      {sucesso&&<div className="ux-success">{sucesso}</div>}
      <div className="contrato-filtros">
        <div className="ux-search">
          ⌕
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente, pet ou pacote"
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="todos">Todos os status</option>
          {[...new Set(contratos.map((c) => c.status))].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          value={transporte}
          onChange={(e) => setTransporte(e.target.value)}
        >
          <option value="todos">Todo transporte</option>
          <option value="sem_transporte">Sem transporte</option>
          <option value="taxidog">TaxiDog</option>
        </select>
      </div>
      {estado === "carregando" && (
        <Estado
          titulo="Carregando contratos…"
          texto="Organizando as vendas mais recentes."
        />
      )}
      {estado === "erro" && (
        <Estado titulo="Não foi possível carregar" texto={erro}>
          <Button onClick={() => void carregar()}>Tentar novamente</Button>
        </Estado>
      )}
      {estado === "pronto" && filtrados.length === 0 && (
        <Estado
          titulo="Nenhum contrato encontrado"
          texto={
            contratos.length
              ? "Ajuste os filtros para ampliar a busca."
              : "A primeira venda aparecerá aqui."
          }
        />
      )}
      {estado === "pronto" && (
        <section className="contrato-lista">
          {filtrados.map((c) => (
            <CardContrato contrato={c} onOpen={() => setDetalhe(c)} key={c.id} />
          ))}
        </section>
      )}
      {venda && (
        <Venda
          clientes={clientes}
          pets={pets}
          pacotes={pacotes}
          onClose={() => setVenda(false)}
          onCreated={async (c) => {
            setVenda(false);
            setSucesso("Pacote vendido e agenda criada com sucesso.");
            setDetalhe(c);
            await carregar();
          }}
        />
      )}
      {detalhe && (
        <DetalheContrato contrato={detalhe} onClose={() => setDetalhe(null)} />
      )}
    </div>
  );
}

function CardContrato({ contrato, onOpen }: { contrato: ContratoResumoVisual; onOpen: () => void }) {
  const ciclo = contrato.cicloResumo;
  const requerRevisao = (ciclo?.estado ?? contrato.cicloEstado) === "requer_revisao";
  function veioDeControleInterno(alvo: EventTarget | null, card: HTMLElement) {
    if (!(alvo instanceof Element)) return false;
    const controle = alvo.closest("button, a, input, select, textarea, [role='button'], [data-card-control]");
    return controle !== null && controle !== card;
  }
  return (
    <article
      className="contrato-card"
      role="button"
      tabIndex={0}
      aria-label={`Abrir contrato de ${contrato.petNome}`}
      onClick={(evento) => {
        if (!veioDeControleInterno(evento.target, evento.currentTarget)) onOpen();
      }}
      onKeyDown={(evento) => {
        if (veioDeControleInterno(evento.target, evento.currentTarget)) return;
        if (evento.key === "Enter" || evento.key === " ") {
          evento.preventDefault();
          onOpen();
        }
      }}
    >
      <header>
        <div className="contrato-person">
          <div className="avatar" aria-hidden="true">{contrato.petNome.slice(0, 1).toUpperCase()}</div>
          <div>
            <h2 title={contrato.petNome}>{contrato.petNome}</h2>
            <span title={contrato.clienteNome}>{contrato.clienteNome}</span>
          </div>
        </div>
        <span className={`ux-status ${contrato.status === "ativo" ? "ok" : "muted"}`}>{contrato.status}</span>
      </header>
      <section className="contrato-card-pacote">
        <strong title={contrato.pacoteNome}>{contrato.pacoteNome}</strong>
        <span>{contrato.itens.map((item) => item.servicoNome).join(" + ")}</span>
      </section>
      <div className="contrato-card-ciclo">
        <span>{ciclo ? `Ciclo ${ciclo.numero} · ${dataCurta(ciclo.inicio)} → ${dataCurta(ciclo.fim)}` : "Sem ciclo operacional"}</span>
        {requerRevisao && <strong>Requer revisão</strong>}
      </div>
      {ciclo ? (
        <>
          <BarraConsumoContrato contagem={ciclo} />
          <ResumoContagemContrato contagem={ciclo} />
        </>
      ) : (
        <div className="contrato-consumo-indisponivel">
          {contrato.consumoDisponivel ? "Sem consumo para acompanhar" : "Consumo indisponível neste ambiente"}
        </div>
      )}
      <footer>
        <div>
          <strong>{moeda.format(contrato.valorContratado)}</strong>
          <small>por ciclo</small>
        </div>
        <div>
          <strong>{diasCurtos[contrato.diaSemanaFixo]} · {contrato.horarioFixo}</strong>
          <small>{contrato.modalidadeTransporte === "taxidog" ? "TaxiDog" : "Sem transporte"}</small>
        </div>
      </footer>
      <div className="contrato-card-renovacao">
        <span aria-hidden="true">↻</span>
        {contrato.renovacaoAutomatica ? "Renovação automática" : "Renovação manual"}
      </div>
    </article>
  );
}
function Estado({
  titulo,
  texto,
  children,
}: {
  titulo: string;
  texto: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="ux-empty">
      <div className="ux-empty-icon">◇</div>
      <h2>{titulo}</h2>
      <p>{texto}</p>
      {children}
    </div>
  );
}

function Venda({
  clientes,
  pets,
  pacotes,
  onClose,
  onCreated,
}: {
  clientes: { id: string; nome: string }[];
  pets: { id: string; clienteId: string; nome: string; porte: string | null }[];
  pacotes: Pacote[];
  onClose: () => void;
  onCreated: (c: ContratoResumo) => void;
}) {
  const agenda=useContext(AgendaContext);
  const [etapa, setEtapa] = useState(1),
    [clienteId, setClienteId] = useState(""),
    [petId, setPetId] = useState(""),
    [pacote, setPacote] = useState<Pacote | null>(null),
    [sim, setSim] = useState<SimulacaoPacote | null>(null),
    [busca, setBusca] = useState(""),
    [calculando, setCalculando] = useState(false),
    [valor, setValor] = useState(0),
    [ajustar, setAjustar] = useState(false),
    [motivo, setMotivo] = useState(""),
    [hora, setHora] = useState(""),
    [ancora, setAncora] = useState(""),
    [transporte, setTransporte] =
      useState<ModalidadeTransporteContrato | "">(""),
    [cicloTaxidogId,setCicloTaxidogId]=useState(""),
    [funcionarioResponsavelId,setFuncionarioResponsavelId]=useState(""),
    [opcao,setOpcao]=useState<OpcaoDisponibilidade|null>(null),
    [disponibilidade,setDisponibilidade]=useState<ResultadoDisponibilidade|null>(null),
    [disponibilidadeCiclo,setDisponibilidadeCiclo]=useState<ResultadoDisponibilidadeCiclo|null>(null),
    [consultandoAgenda,setConsultandoAgenda]=useState(false),
    [erroAgenda,setErroAgenda]=useState<string|null>(null),
    [renovacao, setRenovacao] = useState(true),
    [erro, setErro] = useState(""),
    [salvando, setSalvando] = useState(false),
    [materializacaoPendente,setMaterializacaoPendente]=useState<{contrato:ContratoResumo;cicloId:string}|null>(null),
    [chave] = useState(() => crypto.randomUUID());
  const sequenciaConsulta=useRef(0);
  const cliente = clientes.find((c) => c.id === clienteId),
    pet = pets.find((p) => p.id === petId),
    petsCliente = pets.filter((p) => p.clienteId === clienteId),
    ativos = pacotes.filter((p) => p.ativo && p.configuracaoCompleta),
    ajuste = sim ? resumoAjuste(sim, valor) : null,
    dia = diaDaData(ancora),
    ciclos=useMemo(()=>ciclosAtivosNaData(agenda.taxidogCiclos.map(c=>({...c,diasSemana:agenda.taxidogCicloDias.filter(d=>d.cicloId===c.id&&d.ativo).map(d=>d.diaSemana)})),ancora),[agenda.taxidogCiclos,agenda.taxidogCicloDias,ancora]);
  const cicloSelecionado = ciclos.find((c) => c.id === cicloTaxidogId);
  function limparDisponibilidade(){sequenciaConsulta.current+=1;setOpcao(null);setHora("");setDisponibilidade(null);setDisponibilidadeCiclo(null);setErroAgenda(null);setConsultandoAgenda(false)}
  const consultarRotina=useCallback(async()=>{
    if(!pacote||!petId||!ancora||dia<0||!transporte||!funcionarioResponsavelId)return;
    if(transporte==="taxidog"&&!cicloTaxidogId)return;
    const consultaAtual=++sequenciaConsulta.current;
    setConsultandoAgenda(true);setErroAgenda(null);setOpcao(null);setHora("");setDisponibilidade(null);setDisponibilidadeCiclo(null);
    try{const servicoIds=pacote.servicos.map(s=>s.servicoId),base={petId,servicoIds,data:ancora,preferenciaFuncionario:"obrigatorio" as const,funcionarioPreferidoId:funcionarioResponsavelId,tipoPlanejamento:"normal" as const,modalidade:transporte,cicloTaxidogId:transporte==="taxidog"?cicloTaxidogId:null};
      if(transporte==="taxidog"){const[tc,livres]=await Promise.all([consultarDisponibilidadeDoCiclo(base),consultarDisponibilidade({...base,modalidade:"sem_transporte",cicloTaxidogId:null})]);if(consultaAtual!==sequenciaConsulta.current)return;setDisponibilidadeCiclo(tc);setDisponibilidade(livres);if(tc.disponivel&&tc.opcao){setOpcao(tc.opcao);setHora(horaDaOpcao(tc.opcao))}}
      else{const resultado=await consultarDisponibilidade(base);if(consultaAtual!==sequenciaConsulta.current)return;setDisponibilidade(resultado)}
    }catch(e){if(consultaAtual===sequenciaConsulta.current)setErroAgenda(e instanceof Error?e.message:"Não foi possível consultar a rotina.")}finally{if(consultaAtual===sequenciaConsulta.current)setConsultandoAgenda(false)}
  },[pacote,petId,ancora,dia,transporte,cicloTaxidogId,funcionarioResponsavelId]);
  useEffect(()=>{
    if(etapa!==3)return;
    void consultarRotina();
    return()=>{sequenciaConsulta.current+=1};
  },[etapa,consultarRotina]);
  async function escolherPacote(p: Pacote) {
    setPacote(p);
    setSim(null);
    setErro("");
    setCalculando(true);
    try {
      const r = await simularPacote(p.id, p.versao, petId);
      if (r.status === "calculado") {
        setSim(r.simulacao);
        setValor(r.simulacao.totalPacote);
      } else setErro(r.mensagem);
    } catch (e) {
      setErro(
        e instanceof Error ? e.message : "Não foi possível calcular o valor.",
      );
    } finally {
      setCalculando(false);
    }
  }
  function avancar() {
    setErro("");
    if (etapa === 1 && !petId) return setErro("Escolha o cliente e o pet.");
    if (etapa === 2 && !sim)
      return setErro("Escolha um pacote e aguarde o cálculo oficial.");
    setEtapa((e) => Math.min(3, e + 1));
  }
  async function confirmar() {
    if (!pacote || !sim || !pet) return;
    if (!ancora || dia < 0) {
      setErro("Escolha uma data inicial válida.");
      return;
    }
    if(!opcao){setErro("Consulte o Motor e escolha uma opção disponível.");return}
    if(!transporte){setErro("Escolha a modalidade de transporte.");return}
    if(!funcionarioResponsavelId){setErro("Escolha o funcionário responsável.");return}
    if (valor !== sim.totalPacote && !motivo.trim()) {
      setErro("Informe o motivo do ajuste comercial.");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const r = await venderContrato({
        chaveIdempotencia: chave,
        clienteId,
        petId,
        pacoteId: pacote.id,
        pacoteVersaoEsperada: pacote.versao,
        valorContratado: valor,
        motivoAjusteValor: valor === sim.totalPacote ? null : motivo.trim(),
        dataAncora: ancora,
        diaSemanaFixo: dia,
        horarioFixo: hora,
        modalidadeTransporte: transporte,
        taxidogCicloId: transporte === "taxidog" ? cicloTaxidogId : null,
        funcionarioResponsavelId,
        renovacaoAutomatica: renovacao,
      });
      if (r.status === "criado") onCreated(r.contrato);
      else if(r.status==="materializacao_pendente"){
        setMaterializacaoPendente({contrato:r.contrato,cicloId:r.cicloId});
        setErro(r.mensagem);
      } else setErro(r.mensagem);
    } catch (e) {
      setErro(
        e instanceof Error ? e.message : "Não foi possível confirmar a venda.",
      );
    } finally {
      setSalvando(false);
    }
  }
  async function tentarMaterializacaoNovamente(){
    if(!materializacaoPendente?.cicloId)return;
    setSalvando(true);setErro("");
    try{
      const resposta=await materializarCicloContrato(materializacaoPendente.cicloId);
      if(resposta.status==="materializado")onCreated(materializacaoPendente.contrato);
      else setErro(resposta.mensagem);
    }catch(e){setErro(e instanceof Error?e.message:"Não foi possível criar a Agenda do Ciclo.")}
    finally{setSalvando(false)}
  }
  return (
    <Modal
      aberto
      titulo="Vender pacote"
      onClose={onClose}
      maxWidth="1180px"
      className="ux-modal venda-modal"
    >
      <div className="ux-stepper">
        {["Cliente e pet", "Pacote e valor", "Agenda e revisão"].map((x, i) => (
          <div
            className={etapa === i + 1 ? "active" : etapa > i + 1 ? "done" : ""}
            key={x}
          >
            <span>{etapa > i + 1 ? "✓" : i + 1}</span>
            <b>{x}</b>
          </div>
        ))}
      </div>
      {etapa === 1 && (
        <div className="wizard-body">
          <div className="ux-section-title">
            <span>1</span>
            <div>
              <h3>Para quem é o pacote?</h3>
              <p>
                Encontre o cliente e selecione o pet que receberá os serviços.
              </p>
            </div>
          </div>
          <div className="ux-search">
            ⌕
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente"
            />
          </div>
          <div className="choice-grid clients">
            {clientes
              .filter((c) => c.nome.toLowerCase().includes(busca.toLowerCase()))
              .map((c) => (
                <button
                  className={clienteId === c.id ? "selected" : ""}
                  onClick={() => {
                    setClienteId(c.id);
                    setPetId("");
                  }}
                  key={c.id}
                >
                  <span className="avatar">{c.nome[0]}</span>
                  <b>{c.nome}</b>
                  <small>
                    {pets.filter((p) => p.clienteId === c.id).length} pet(s)
                  </small>
                </button>
              ))}
          </div>
          {clienteId && (
            <>
              <h4>Escolha o pet de {cliente?.nome}</h4>
              <div className="choice-grid pets">
                {petsCliente.map((p) => (
                  <button
                    className={petId === p.id ? "selected" : ""}
                    onClick={() => setPetId(p.id)}
                    key={p.id}
                  >
                    <span className="pet-icon">♢</span>
                    <b>{p.nome}</b>
                    <small>Porte {p.porte}</small>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {etapa === 2 && (
        <div className="wizard-body">
          <div className="ux-section-title">
            <span>2</span>
            <div>
              <h3>Escolha a melhor oferta</h3>
              <p>
                Valores calculados para {pet?.nome}, usando o perfil atual do
                pet.
              </p>
            </div>
          </div>
          <div className="package-choice">
            {ativos.map((p) => (
              <button
                className={pacote?.id === p.id ? "selected" : ""}
                onClick={() => void escolherPacote(p)}
                key={p.id}
              >
                <div>
                  <span className="ux-status ok">Ativo</span>
                  <h4>{p.nome}</h4>
                  <p>
                    {p.servicos
                      .map((s) => `${s.quantidadePorCiclo}× ${s.servicoNome}`)
                      .join(" · ")}
                  </p>
                </div>
                <span>Selecionar →</span>
              </button>
            ))}
          </div>
          {calculando && (
            <div className="ux-info">Calculando o valor oficial…</div>
          )}
          {sim && (
            <div className="preco-pet-list">
              {sim.linhas.map((linha) => (
                <article key={linha.pacoteServicoId}>
                  <div>
                    <h4>{linha.servicoNome}</h4>
                    <span>{linha.quantidadePorCiclo} atendimentos · {linha.descontoPercentual}% de desconto</span>
                  </div>
                  <div>
                    <small>Avulso para {pet?.nome}</small>
                    <b>{moeda.format(linha.precoAvulsoUnitario)} cada</b>
                    <span>{moeda.format(linha.totalAvulso)} no ciclo</span>
                  </div>
                  <div className="featured">
                    <small>No pacote</small>
                    <b>{moeda.format(linha.precoPacoteUnitario)} cada</b>
                    <span>{moeda.format(linha.totalPacote)} no ciclo</span>
                  </div>
                  <strong>Economia {moeda.format(linha.economia)}</strong>
                </article>
              ))}
            </div>
          )}
          {sim && (
            <div className="venda-valores">
              <div>
                <span>Equivalente avulso</span>
                <strong>{moeda.format(sim.totalAvulso)}</strong>
              </div>
              <div className="featured">
                <span>Preço calculado do pacote</span>
                <strong>{moeda.format(sim.totalPacote)}</strong>
              </div>
              <div className="saving">
                <span>Economia</span>
                <strong>{moeda.format(sim.economiaAbsoluta)}</strong>
                <small>
                  {sim.percentualEconomia?.toLocaleString("pt-BR")}%
                </small>
              </div>
            </div>
          )}
          {sim && (
            <section className="ajuste-box">
              <label className="ux-switch">
                <input
                  type="checkbox"
                  checked={ajustar}
                  onChange={(e) => {
                    setAjustar(e.target.checked);
                    if (!e.target.checked) {
                      setValor(sim.totalPacote);
                      setMotivo("");
                    }
                  }}
                />
                <span />
                <div>
                  <b>Ajustar valor desta venda</b>
                  <small>
                    O preço calculado fica preservado; o ajuste vale somente para este Contrato.
                  </small>
                </div>
              </label>
              {ajustar && (
                <div className="config-grid">
                  <label>
                    Valor efetivamente contratado
                    <div className="money-input">
                      <span>R$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={valor}
                        onChange={(e) => setValor(Number(e.target.value))}
                      />
                    </div>
                  </label>
                  <label>
                    Motivo do ajuste
                    <Input
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Ex.: condição aprovada pela gerência"
                    />
                  </label>
                </div>
              )}
              {ajuste && ajustar && (
                <p className="ajuste-resumo">
                  Diferença de {moeda.format(ajuste.diferenca)} · economia final
                  de {moeda.format(ajuste.economiaEfetiva)}
                </p>
              )}
            </section>
          )}
        </div>
      )}
      {etapa === 3 && (
        <div className={`wizard-body venda-agenda-layout ${opcao?"review-layout":""}`}>
          <main>
            <div className="ux-section-title">
              <span>3</span>
              <div>
                <h3>Combine a rotina fixa</h3>
                <p>Todos os serviços serão distribuídos nesta mesma série.</p>
              </div>
            </div>
            <div className="venda-agenda-progressiva">
              <section className="venda-decisao pronta">
                <span>1</span><div><h4>Data de início</h4><p>Ela também define o dia fixo da rotina.</p>
                <Input type="date" value={ancora} onChange={(e) => {limparDisponibilidade();setAncora(e.target.value)}} />
                {dia>=0&&<small>Rotina semanal às <b>{dias[dia]}</b></small>}</div>
              </section>
              {ancora&&dia>=0&&<section className="venda-decisao pronta">
                <span>2</span><div><h4>Modalidade de transporte</h4><div className="radio-cards">
                  <label className={transporte==="sem_transporte"?"selected":""}><input type="radio" checked={transporte==="sem_transporte"} onChange={()=>{limparDisponibilidade();setCicloTaxidogId("");setTransporte("sem_transporte")}}/><div><b>Sem transporte</b><small>Cliente leva e busca o pet</small></div></label>
                  <label className={transporte==="taxidog"?"selected":""}><input type="radio" checked={transporte==="taxidog"} onChange={()=>{limparDisponibilidade();setTransporte("taxidog")}}/><div><b>TaxiDog</b><small>Buscamos e levamos o pet</small></div></label>
                </div></div>
              </section>}
              {transporte&&<section className="venda-decisao pronta"><span>3</span><div><h4>Funcionário responsável</h4><p>A mesma pessoa será validada pelo Motor em todas as ocorrências do ciclo.</p><select value={funcionarioResponsavelId} onChange={(e)=>{limparDisponibilidade();setFuncionarioResponsavelId(e.target.value)}}><option value="">Selecione um funcionário</option>{agenda.funcionarios.filter(f=>f.ativo).map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}</select></div></section>}
              {transporte==="taxidog"&&funcionarioResponsavelId&&<section className="venda-decisao pronta"><span>4</span><div><h4>Horário do TaxiDog</h4><p>Escolha quando a coleta deve acontecer em {dias[dia]}.</p><div className="novo-ciclos venda-taxidog-periodos"><div>{ciclos.map(c=><button type="button" key={c.id} className={cicloTaxidogId===c.id?"selecionada":""} onClick={()=>{if(cicloTaxidogId===c.id)return;limparDisponibilidade();setCicloTaxidogId(c.id)}}><strong>{nomeTaxidogOperacional(c.nome)}</strong><small>Coleta entre {c.coletaInicio.slice(0,5)} e {c.coletaFim.slice(0,5)}</small></button>)}</div>{!ciclos.length&&<p className="ux-info">Não há horário do TaxiDog configurado para esta data.</p>}</div></div></section>}
              {transporte==="sem_transporte"&&funcionarioResponsavelId&&<section className="venda-decisao"><span>4</span><div><h4>Horários disponíveis pelo Motor</h4><p>Capacidade real do funcionário escolhido para todas as ocorrências.</p>{consultandoAgenda?<div className="ux-info">Consultando equipe, equipamentos e capacidade…</div>:erroAgenda?<div className="ux-error">{erroAgenda} <button onClick={()=>void consultarRotina()}>Tentar novamente</button></div>:disponibilidade?.estado==="OK"?<Horarios opcoes={disponibilidade.opcoes} selecionada={opcao} selecionar={o=>{setOpcao(o);setHora(horaDaOpcao(o))}}/>:disponibilidade?<div className="ux-info"><b>Nenhum horário disponível.</b>{disponibilidade.motivos.map(m=><p key={m}>{m}</p>)}</div>:<div className="ux-info">A consulta começará automaticamente.</div>}</div></section>}
              {transporte==="taxidog"&&cicloTaxidogId&&funcionarioResponsavelId&&<section className="venda-decisao"><span>5</span><div><h4>Horário previsto do atendimento</h4><p>O Motor verifica a capacidade do responsável para o horário de coleta escolhido.</p><PainelHorariosTaxidog linguagem="operacional" ciclo={cicloSelecionado?{...cicloSelecionado,nome:nomeTaxidogOperacional(cicloSelecionado.nome)}:undefined} horarios={disponibilidade} resultado={disponibilidadeCiclo} selecionada={opcao} consultando={consultandoAgenda} erro={erroAgenda} consultar={()=>void consultarRotina()} selecionar={o=>{setOpcao(o);setHora(horaDaOpcao(o))}}/>{opcao&&<small>Horário previsto do atendimento: <b>{horaDaMinuto(opcao.inicioOperacional)}–{horaDaMinuto(opcao.conclusaoPrevista)}</b></small>}</div></section>}
              {opcao&&<section className="venda-decisao pronta"><span>{transporte==="taxidog"?6:5}</span><div><h4>Renovação</h4><label className="ux-switch"><input type="checkbox" checked={renovacao} onChange={(e)=>setRenovacao(e.target.checked)}/><span/><div><b>Renovação automática</b><small>Criar automaticamente o próximo ciclo ao finalizar este.</small></div></label></div></section>}
            </div>
          </main>
          {opcao&&<aside className="sale-review">
            <span className="ux-eyebrow">Revisão da venda</span>
            <h3>{pacote?.nome}</h3>
            <dl>
              <div>
                <dt>Cliente</dt>
                <dd>{cliente?.nome}</dd>
              </div>
              <div>
                <dt>Pet</dt>
                <dd>
                  {pet?.nome} · porte {pet?.porte}
                </dd>
              </div>
              <div className="sale-review-services">
                <dt>Serviços</dt>
                <dd>{pacote?.servicos.map((s)=><span key={s.id}>{s.quantidadePorCiclo}× {s.servicoNome}<small>{descreverRecorrencia(s)}</small></span>)}</dd>
              </div>
              <div>
                <dt>Valor avulso</dt>
                <dd>{moeda.format(sim?.totalAvulso ?? 0)}</dd>
              </div>
              <div className="total">
                <dt>Valor contratado</dt>
                <dd>{moeda.format(valor)}</dd>
              </div>
              <div>
                <dt>Economia</dt>
                <dd>{moeda.format((sim?.totalAvulso ?? 0) - valor)}</dd>
              </div>
              <div>
                <dt>Data de início</dt>
                <dd>{dataBr(ancora)}</dd>
              </div>
              <div>
                <dt>Dia fixo</dt>
                <dd>{dias[dia]}</dd>
              </div>
              <div><dt>Funcionário responsável</dt><dd>{agenda.funcionarios.find(f=>f.id===funcionarioResponsavelId)?.nome}</dd></div>
              {transporte==="sem_transporte"?<><div><dt>Horário</dt><dd>{hora}–{horaDaMinuto(opcao.conclusaoPrevista)}</dd></div><div><dt>Transporte</dt><dd>Sem transporte</dd></div></>:<><div><dt>TaxiDog</dt><dd>TaxiDog · {nomeTaxidogOperacional(cicloSelecionado?.nome)}</dd></div><div><dt>Coleta</dt><dd>{cicloSelecionado?.coletaInicio.slice(0,5)}–{cicloSelecionado?.coletaFim.slice(0,5)}</dd></div><div><dt>Atendimento previsto</dt><dd>{horaDaMinuto(opcao.inicioOperacional)}–{horaDaMinuto(opcao.conclusaoPrevista)}</dd></div></>}
              <div>
                <dt>Renovação automática</dt>
                <dd>{renovacao ? "Sim" : "Não"}</dd>
              </div>
            </dl>
          </aside>}
        </div>
      )}
      {erro && <div className="ux-error">{erro}{materializacaoPendente&&<button type="button" disabled={salvando||!materializacaoPendente.cicloId} onClick={()=>void tentarMaterializacaoNovamente()}>{salvando?"Tentando…":"Tentar criar agenda novamente"}</button>}</div>}
      <div className="ux-modal-footer">
        <div>
          {etapa > 1 && (
            <Button variant="secondary" onClick={() => setEtapa(etapa - 1)}>
              Voltar
            </Button>
          )}
        </div>
        <div>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          {etapa < 3 ? (
            <Button onClick={avancar}>Continuar</Button>
          ) : (
            <Button disabled={salvando||!opcao||!funcionarioResponsavelId||Boolean(materializacaoPendente)} onClick={() => void confirmar()}>
              {salvando ? "Confirmando…" : "Confirmar venda"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function dataBr(v: string) {
  if (!v) return "—";
  const [a, m, d] = v.split("-");
  return `${d}/${m}/${a}`;
}
function dataCurta(v: string) {
  if (!v) return "—";
  const [ano, mes, dia] = v.slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}` : v;
}
function diaDaData(v:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return-1;const[a,m,d]=v.split("-").map(Number),data=new Date(Date.UTC(a,m-1,d));return Number.isNaN(data.getTime())?-1:data.getUTCDay()}
function horaDaMinuto(minutos:number){return`${String(Math.floor(minutos/60)).padStart(2,"0")}:${String(minutos%60).padStart(2,"0")}`}
function horaDaOpcao(opcao:OpcaoDisponibilidade){return horaDaMinuto(opcao.horarioApresentado)}
function nomeTaxidogOperacional(nome:string|undefined){const operacional=(nome??"").replace(/^ciclo\s+/i,"").trim();return operacional||"TaxiDog"}
