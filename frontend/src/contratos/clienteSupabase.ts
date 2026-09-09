import { supabase } from "../lib/supabase.ts";
import type {
  ContratoResumo,
  IntencaoVendaContrato,
  RespostaVendaContrato,
} from "./contrato.ts";
import { agregarCreditos, estadoCredito } from "../../../supabase/functions/_shared/credito-contrato.ts";
import type { ContagemCreditos, DetalheCicloCreditos, DetalheUnidadeCredito, EstadoCreditoContrato, ResumoContratoCreditos } from "../../../supabase/functions/_shared/credito-contrato.ts";
type L = Record<string, unknown>;
export type CicloResumoCard = ContagemCreditos & {
  id: string;
  numero: number;
  estado: string;
  inicio: string;
  fim: string;
  encerramentoPendente: boolean;
};
export type ContratoResumoVisual = ContratoResumo & {
  cicloResumo: CicloResumoCard | null;
  consumoDisponivel: boolean;
};
export async function venderContrato(i: IntencaoVendaContrato) {
  const { data, error } = await supabase.functions.invoke("vender-contrato", {
    body: i,
  });
  if (error) throw error;
  return data as RespostaVendaContrato;
}
export async function materializarCicloContrato(cicloId: string) {
  const { data, error } = await supabase.functions.invoke("materializar-ciclo", { body: { cicloId } });
  if (error) throw error;
  return data as import("../../../supabase/functions/_shared/materializacao-contrato.ts").ResultadoMaterializacaoCiclo;
}
async function creditos(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("gerenciar-creditos-contrato", { body });
  if (error) throw new Error("Não foi possível acessar os créditos do Contrato. Tente novamente.");
  if (data?.status === "erro" || data?.status === "invalido" || data?.status === "conflito") throw new Error(data.mensagem ?? "Não foi possível executar a operação.");
  return data;
}
export async function carregarResumoCreditosContrato(contratoId: string) {
  return creditos({ operacao: "resumo_contrato", contratoId }) as Promise<ResumoContratoCreditos>;
}
export async function carregarDetalheCiclo(cicloId: string) {
  return creditos({ operacao: "detalhe_ciclo", cicloId }) as Promise<DetalheCicloCreditos>;
}
export async function carregarDetalheCredito(ocorrenciaId: string, contratoItemId: string) {
  return creditos({ operacao: "detalhe_credito", ocorrenciaId, contratoItemId }) as Promise<DetalheUnidadeCredito>;
}
export async function decidirCreditoContrato(entrada: { operacao: "decidir_falta" | "corrigir_decisao" | "decidir_encerramento"; ocorrenciaId: string; contratoItemId: string; versaoEsperada: number; decisao: "perder" | "preservar"; motivo: string; chaveIdempotencia: string }) {
  return creditos(entrada);
}
export async function reverterConclusaoContrato(entrada: { atendimentoId: string; statusDestino: string; motivo: string; chaveIdempotencia: string }) {
  return creditos({ operacao: "reverter_conclusao", ...entrada });
}
export async function listarContratos(): Promise<ContratoResumoVisual[]> {
  const { data, error } = await supabase
    .from("contratos")
    .select(
      "id,cliente_id,pet_id,pacote_nome_snapshot,status,valor_contratado,data_ancora,dia_semana_fixo,horario_fixo,modalidade_transporte,renovacao_automatica,created_at,pet_nome_snapshot,clientes(nome),contrato_ciclos(estado,numero),contrato_itens(servico_id,servico_nome_snapshot,ordem_snapshot,quantidade_por_ciclo,intervalo_quantidade,intervalo_unidade,offset_inicial_quantidade,offset_inicial_unidade)",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  const contratos = ((data ?? []) as unknown as L[]).map((x) => {
    const c = Array.isArray(x.clientes)
      ? (x.clientes[0] as L)
      : (x.clientes as L);
    return {
      id: String(x.id),
      clienteId: String(x.cliente_id),
      petId: String(x.pet_id),
      clienteNome: String(c?.nome ?? ""),
      petNome: String(x.pet_nome_snapshot),
      pacoteNome: String(x.pacote_nome_snapshot),
      status: String(x.status),
      cicloEstado: ((Array.isArray(x.contrato_ciclos)?x.contrato_ciclos:[]) as L[]).sort((a,b)=>Number(b.numero)-Number(a.numero))[0]?.estado as ContratoResumo["cicloEstado"] ?? null,
      valorContratado: Number(x.valor_contratado),
      dataAncora: String(x.data_ancora),
      diaSemanaFixo: Number(x.dia_semana_fixo),
      horarioFixo: String(x.horario_fixo).slice(0, 5),
      modalidadeTransporte: String(
        x.modalidade_transporte,
      ) as ContratoResumo["modalidadeTransporte"],
      renovacaoAutomatica: Boolean(x.renovacao_automatica),
      criadoEm: String(x.created_at),
      itens: (Array.isArray(x.contrato_itens) ? x.contrato_itens : [])
        .map((i) => {
          const y = i as L;
          return {
            pacoteServicoId: "",
            servicoId: String(y.servico_id),
            servicoNome: String(y.servico_nome_snapshot),
            ordem: Number(y.ordem_snapshot),
            quantidadePorCiclo: Number(y.quantidade_por_ciclo),
            intervaloQuantidade: Number(y.intervalo_quantidade),
            intervaloUnidade: String(y.intervalo_unidade) as any,
            offsetInicialQuantidade: Number(y.offset_inicial_quantidade),
            offsetInicialUnidade: String(y.offset_inicial_unidade) as any,
          };
        })
        .sort((a, b) => a.ordem - b.ordem),
    };
  });
  return carregarResumoCards(contratos);
}

async function carregarResumoCards(contratos: ContratoResumo[]): Promise<ContratoResumoVisual[]> {
  const semResumo = () => contratos.map((contrato) => ({ ...contrato, cicloResumo: null, consumoDisponivel: false }));
  if (!contratos.length) return [];
  const { data: ciclos, error: erroCiclos } = await supabase
    .from("contrato_ciclos")
    .select("id,contrato_id,numero,estado,data_ancora_pretendida,encerramento_pendente")
    .in("contrato_id", contratos.map((contrato) => contrato.id))
    .order("numero", { ascending: false });
  if (erroCiclos) return semResumo();

  const atuais = new Map<string, L>();
  for (const ciclo of (ciclos ?? []) as L[]) {
    const contratoId = String(ciclo.contrato_id);
    const anterior = atuais.get(contratoId);
    const aberto = !["concluido", "cancelado"].includes(String(ciclo.estado));
    const anteriorAberto = anterior && !["concluido", "cancelado"].includes(String(anterior.estado));
    if (!anterior || (aberto && !anteriorAberto) || (aberto === anteriorAberto && Number(ciclo.numero) > Number(anterior.numero))) atuais.set(contratoId, ciclo);
  }
  const cicloIds = [...atuais.values()].map((ciclo) => String(ciclo.id));
  if (!cicloIds.length) return contratos.map((contrato) => ({ ...contrato, cicloResumo: null, consumoDisponivel: true }));

  const [itensResposta, ocorrenciasResposta] = await Promise.all([
    supabase.from("contrato_ciclo_ocorrencia_itens").select("ciclo_id,estado_comercial").in("ciclo_id", cicloIds),
    supabase.from("contrato_ciclo_ocorrencias").select("ciclo_id,data_operacional").in("ciclo_id", cicloIds).order("data_operacional", { ascending: true }),
  ]);
  if (itensResposta.error || ocorrenciasResposta.error) return semResumo();

  const estadosPorCiclo = new Map<string, EstadoCreditoContrato[]>();
  for (const item of (itensResposta.data ?? []) as L[]) {
    if (!estadoCredito(item.estado_comercial)) return semResumo();
    const cicloId = String(item.ciclo_id), estados = estadosPorCiclo.get(cicloId) ?? [];
    estados.push(item.estado_comercial);
    estadosPorCiclo.set(cicloId, estados);
  }
  const datasPorCiclo = new Map<string, string[]>();
  for (const ocorrencia of (ocorrenciasResposta.data ?? []) as L[]) {
    const cicloId = String(ocorrencia.ciclo_id), datas = datasPorCiclo.get(cicloId) ?? [];
    datas.push(String(ocorrencia.data_operacional));
    datasPorCiclo.set(cicloId, datas);
  }
  return contratos.map((contrato) => {
    const ciclo = atuais.get(contrato.id);
    if (!ciclo) return { ...contrato, cicloResumo: null, consumoDisponivel: true };
    const id = String(ciclo.id), datas = datasPorCiclo.get(id) ?? [], ancora = String(ciclo.data_ancora_pretendida);
    return {
      ...contrato,
      consumoDisponivel: true,
      cicloResumo: {
        id,
        numero: Number(ciclo.numero),
        estado: String(ciclo.estado),
        inicio: datas[0] ?? ancora,
        fim: datas.at(-1) ?? ancora,
        encerramentoPendente: Boolean(ciclo.encerramento_pendente),
        ...agregarCreditos((estadosPorCiclo.get(id) ?? []).map((estadoComercial) => ({ estadoComercial }))),
      },
    };
  });
}
