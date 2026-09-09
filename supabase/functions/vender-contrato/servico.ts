import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.2";
import type {
  IntencaoVendaContrato,
  RespostaVendaContrato,
} from "../_shared/contrato-venda.ts";
import { executarSimulacaoPacote } from "../_shared/simulacao-pacote.ts";
import {
  ocorrenciasDoCiclo,
  validarDistribuicaoContrato,
  type ItemRecorrente,
} from "../_shared/recorrencia-contrato.ts";
import { calcularDisponibilidade, calcularDisponibilidadeNoHorario } from "../_shared/motor/motor.ts";
import { carregarDadosDisponibilidadeComCliente } from "../_shared/motor/supabase.ts";
import { materializarCiclo } from "../_shared/materializacao-ciclo.ts";
type Linha = Record<string, unknown>;
type Usuario = { id: string };
const consultaPacote =
  "id,nome,ativo,versao,pacote_servicos(id,servico_id,ordem_exibicao,quantidade_por_ciclo,intervalo_quantidade,intervalo_unidade,offset_inicial_quantidade,offset_inicial_unidade,desconto_percentual,ativo,servicos(nome))";
export async function executarVendaContrato(
  i: IntencaoVendaContrato,
  u: Usuario,
  admin: SupabaseClient,
): Promise<RespostaVendaContrato> {
  const [
    { data: pet, error: ep },
    { data: pacote, error: epa },
    { data: deps, error: ed },
    { data: config, error: ec },
  ] = await Promise.all([
    admin
      .from("pets")
      .select(
        "id,cliente_id,nome,especie,raca_id,sexo,porte,pelagem,peso,temperamento,raca:racas!pets_raca_especie_fkey(nome)",
      )
      .eq("id", i.petId)
      .single(),
    admin.from("pacotes").select(consultaPacote).eq("id", i.pacoteId).single(),
    admin
      .from("servico_dependencias")
      .select("servico_id,dependencia_servico_id")
      .eq("ativo", true),
    admin
      .from("configuracao_agenda")
      .select("timezone")
      .eq("id", true)
      .single(),
  ]);
  if (ep || !pet) return invalido("PET_NAO_ENCONTRADO", "Pet não encontrado.");
  const p = pet as unknown as Linha;
  if (String(p.cliente_id) !== i.clienteId)
    return invalido(
      "CLIENTE_PET_INCOMPATIVEL",
      "O pet não pertence ao cliente selecionado.",
    );
  if (epa || !pacote)
    return invalido("PACOTE_NAO_ENCONTRADO", "Pacote não encontrado.");
  if (ec || !config)
    return invalido("AGENDA_NAO_CONFIGURADA", "A configuração da Agenda não está disponível.");
  const { data: funcionario, error: erroFuncionario } = await admin.from("funcionarios")
    .select("id,ativo").eq("id", i.funcionarioResponsavelId).single();
  if (erroFuncionario || !funcionario || !(funcionario as Linha).ativo)
    return invalido("FUNCIONARIO_INVALIDO", "Escolha um funcionário responsável ativo.");
  const pk = pacote as unknown as Linha;
  if (!pk.ativo)
    return invalido(
      "PACOTE_INATIVO",
      "Somente Pacotes ativos podem ser vendidos.",
    );
  if (Number(pk.versao) !== i.pacoteVersaoEsperada)
    return conflito(
      "PACOTE_ALTERADO",
      "O Pacote mudou. Faça uma nova simulação.",
    );
  const itensRaw = (
    Array.isArray(pk.pacote_servicos) ? pk.pacote_servicos : []
  ).filter((x) => Boolean((x as Linha).ativo)) as Linha[];
  if (!itensRaw.length)
    return invalido(
      "PACOTE_REQUER_CONFIGURACAO",
      "Configure a composição do Pacote antes da venda.",
    );
  const itens: ItemRecorrente[] = itensRaw.map((x) => ({
    servicoId: String(x.servico_id),
    servicoNome: nomeRelacao(x.servicos),
    quantidadePorCiclo: Number(x.quantidade_por_ciclo),
    intervaloQuantidade: Number(x.intervalo_quantidade),
    intervaloUnidade: String(
      x.intervalo_unidade,
    ) as ItemRecorrente["intervaloUnidade"],
    offsetInicialQuantidade: Number(x.offset_inicial_quantidade),
    offsetInicialUnidade: String(
      x.offset_inicial_unidade,
    ) as ItemRecorrente["offsetInicialUnidade"],
  }));
  if (ed)
    return invalido(
      "DEPENDENCIAS_INDISPONIVEIS",
      "Não foi possível validar as dependências dos Serviços.",
    );
  const distribuicao = validarDistribuicaoContrato(
    itens,
    ((deps ?? []) as unknown as Linha[]).map((x) => ({
      servicoId: String(x.servico_id),
      dependenciaServicoId: String(x.dependencia_servico_id),
    })),
    i.dataAncora,
  );
  if (!distribuicao.valido)
    return invalido("DEPENDENCIA_IMPOSSIVEL", distribuicao.mensagem);
  const { data: versaoOcupacao, error: erroVersaoOcupacao } = await admin
    .from("agenda_versao_ocupacao").select("versao").eq("id", true).single();
  const { data: versaoConfiguracao, error: erroVersaoConfiguracao } = await admin
    .from("agenda_versao_configuracao").select("versao").eq("id", true).single();
  if (erroVersaoOcupacao || !versaoOcupacao || erroVersaoConfiguracao || !versaoConfiguracao) throw new Error("Versões da Agenda indisponíveis.");
  const ocorrencias = [] as Record<string, unknown>[];
  for (const ocorrencia of ocorrenciasDoCiclo(itens, i.dataAncora)) {
    const entrada = {
      petId: i.petId, servicoIds: ocorrencia.itens.map((x) => x.servicoId), data: ocorrencia.data,
      preferenciaFuncionario: "obrigatorio" as const, funcionarioPreferidoId: i.funcionarioResponsavelId,
      tipoPlanejamento: "normal" as const, modalidade: i.modalidadeTransporte,
      cicloTaxidogId: i.taxidogCicloId,
    };
    const dados = await carregarDadosDisponibilidadeComCliente(entrada, admin);
    const resultado = i.modalidadeTransporte === "taxidog"
      ? calcularDisponibilidade(entrada, dados)
      : calcularDisponibilidadeNoHorario(entrada, dados, horaMinutos(i.horarioFixo));
    const opcao = resultado.opcoes[0];
    if (!opcao) return conflito("ROTINA_SEM_CAPACIDADE", `Não há capacidade para a ocorrência de ${ocorrencia.data}. Escolha outra rotina.`);
    if (i.modalidadeTransporte === "taxidog" && opcao.horarioApresentado !== horaMinutos(i.horarioFixo))
      return conflito("JANELA_TAXIDOG_DIVERGENTE", "A janela TaxiDog escolhida não corresponde à rotina informada.");
    ocorrencias.push({
      ordem: ocorrencia.ordem, data: ocorrencia.data,
      horarioApresentado: horaTexto(opcao.horarioApresentado), inicioOperacional: horaTexto(opcao.inicioOperacional),
      conclusaoPrevista: horaTexto(opcao.conclusaoPrevista), taxidogCicloId: opcao.cicloTaxidog?.id ?? null,
      itens: ocorrencia.itens, plano: { ...opcao, petPorte: p.porte, petSexo: p.sexo },
    });
  }
  const simulada = await executarSimulacaoPacote(
    {
      pacoteId: i.pacoteId,
      pacoteVersaoEsperada: i.pacoteVersaoEsperada,
      petId: i.petId,
    },
    admin,
  );
  if (simulada.status !== "calculado") return simulada;
  if (
    i.valorContratado !== simulada.simulacao.totalPacote &&
    !i.motivoAjusteValor
  )
    return invalido(
      "MOTIVO_AJUSTE_OBRIGATORIO",
      "Informe o motivo do ajuste comercial.",
    );
  const perfil = perfilPet(p),
    regrasAvulsas = await regrasAvulsasAplicadas(
      admin,
      itens.map((x) => x.servicoId),
      perfil,
    ),
    linhas = simulada.simulacao.linhas.map((linha, ordem) => {
      const origem = itensRaw.find(
          (x) => String(x.id) === linha.pacoteServicoId,
        )!,
        avulsas = regrasAvulsas.get(linha.servicoId) ?? [],
        descontoPercentual = Number(origem.desconto_percentual);
      return {
        ...linha,
        ordem: ordem + 1,
        intervaloQuantidade: Number(origem.intervalo_quantidade),
        intervaloUnidade: String(origem.intervalo_unidade),
        offsetInicialQuantidade: Number(origem.offset_inicial_quantidade),
        offsetInicialUnidade: String(origem.offset_inicial_unidade),
        precoAvulsoBaseUnitario:
          Math.round(
            (linha.precoAvulsoUnitario -
              avulsas.reduce((s, r) => s + Number(r.acrescimoValor), 0)) *
              100,
          ) / 100,
        descontoPercentual,
        precoPacoteBaseUnitario: linha.precoPacoteUnitario,
        regras: avulsas,
      };
    });
  const raca = Array.isArray(p.raca) ? (p.raca[0] as Linha) : (p.raca as Linha);
  const payload = {
    ...i,
    usuarioId: u.id,
    petPerfilEsperado: {
      nome: p.nome,
      especie: p.especie,
      racaId: p.raca_id,
      porte: p.porte,
      pelagem: p.pelagem,
      peso: p.peso,
      temperamento: p.temperamento,
    },
    petSnapshot: {
      nome: p.nome,
      especie: p.especie,
      racaId: p.raca_id,
      racaNome: raca?.nome,
      porte: p.porte,
      pelagem: p.pelagem,
      peso: p.peso,
      temperamento: p.temperamento,
    },
    timezone: String((config as Linha).timezone),
    configuracaoAgendaVersao: Number((versaoConfiguracao as Linha).versao),
    ocupacaoAgendaVersao: Number((versaoOcupacao as Linha).versao),
    totalAvulso: simulada.simulacao.totalAvulso,
    totalPacote: simulada.simulacao.totalPacote,
    itens: linhas,
    ocorrencias,
  };
  const { data, error } = await admin.rpc("vender_contrato", {
    p_intencao: payload,
  });
  if (error)
    throw new Error(
      `Persistência transacional indisponível: ${error.code ?? "erro"}.`,
    );
  const resposta = data as Record<string, unknown>;
  if (resposta.status !== "criado") return resposta as RespostaVendaContrato;
  const contrato = await carregarContrato(String(resposta.contratoId), admin);
  const { data: ciclo, error: erroCiclo } = await admin.from("contrato_ciclos")
    .select("id").eq("contrato_id", contrato.id).eq("numero", 1).single();
  if (erroCiclo || !ciclo) return {
    status: "materializacao_pendente", contrato, cicloId: "",
    codigo: "CICLO_NAO_RECARREGADO",
    mensagem: "O Contrato foi criado, mas o primeiro Ciclo não pôde ser preparado para a Agenda. Tente novamente.",
  };
  const cicloId = String((ciclo as Linha).id);
  try {
    const materializacao = await materializarCiclo(cicloId, u.id, admin);
    if (materializacao.status !== "materializado") return {
      status: "materializacao_pendente", contrato, cicloId,
      codigo: materializacao.codigo, mensagem: materializacao.mensagem,
    };
    return { status: "criado", contrato, materializacao: { cicloId, quantidadeAtendimentos: materializacao.atendimentos.length } };
  } catch (erro) {
    console.error({ evento: "venda_materializacao_pendente", contratoId: contrato.id, cicloId, mensagem: erro instanceof Error ? erro.message : "Falha desconhecida" });
    return {
      status: "materializacao_pendente", contrato, cicloId,
      codigo: "MATERIALIZACAO_INDISPONIVEL",
      mensagem: "O Contrato foi criado, mas a Agenda ainda não. Tente novamente com segurança.",
    };
  }
}
async function regrasAvulsasAplicadas(
  admin: SupabaseClient,
  ids: string[],
  perfil: ReturnType<typeof perfilPet>,
) {
  const { data, error } = await admin
    .from("servico_regras_preco")
    .select(
      "id,servico_id,criterio,porte,pelagem,raca_id,peso_min,peso_max,temperamento,acrescimo_valor,ativo",
    )
    .in("servico_id", ids);
  if (error) throw new Error("Regras avulsas indisponíveis.");
  const m = new Map<string, Record<string, unknown>[]>();
  for (const r of (data ?? []) as unknown as Linha[])
    if (r.ativo && aplica(r, perfil)) {
      const id = String(r.servico_id),
        a = m.get(id) ?? [];
      a.push(regraSnapshot(r, "servico_avulso", a.length + 1, perfil));
      m.set(id, a);
    }
  return m;
}
function regraSnapshot(
  r: Linha,
  origem: string,
  ordem: number,
  p: ReturnType<typeof perfilPet>,
) {
  const c = String(r.criterio);
  return {
    origem,
    regraServicoId: origem === "servico_avulso" ? String(r.id) : "",
    regraPacoteId: origem === "pacote" ? String(r.id) : "",
    ordem,
    criterio: c,
    descricao: `Acréscimo por ${c}`,
    referencia: String(
      c === "raca" ? p.racaNome : (p[c as keyof typeof p] ?? ""),
    ),
    acrescimoValor: Number(r.acrescimo_valor),
  };
}
function aplica(r: Linha, p: ReturnType<typeof perfilPet>) {
  const c = String(r.criterio);
  if (c === "peso")
    return (
      p.peso !== null &&
      (r.peso_min == null || p.peso >= Number(r.peso_min)) &&
      (r.peso_max == null || p.peso <= Number(r.peso_max))
    );
  const chave = c === "raca" ? "racaId" : c;
  return (
    String(r[c === "raca" ? "raca_id" : c] ?? "") ===
    String(p[chave as keyof typeof p] ?? "")
  );
}
function perfilPet(p: Linha) {
  const r = Array.isArray(p.raca) ? (p.raca[0] as Linha) : (p.raca as Linha);
  return {
    porte: String(p.porte),
    pelagem: String(p.pelagem),
    racaId: String(p.raca_id),
    racaNome: String(r?.nome ?? ""),
    peso: p.peso == null ? null : Number(p.peso),
    temperamento: String(p.temperamento),
  };
}
async function carregarContrato(id: string, admin: SupabaseClient) {
  const { data, error } = await admin
    .from("contratos")
    .select("*,clientes(nome),contrato_itens(*)")
    .eq("id", id)
    .single();
  if (error || !data) throw new Error("Contrato criado, mas não recarregado.");
  const x = data as unknown as Linha;
  return {
    id: String(x.id),
    clienteId: String(x.cliente_id),
    petId: String(x.pet_id),
    clienteNome: nomeRelacao(x.clientes),
    petNome: String(x.pet_nome_snapshot),
    pacoteNome: String(x.pacote_nome_snapshot),
    status: String(x.status),
    valorContratado: Number(x.valor_contratado),
    dataAncora: String(x.data_ancora),
    diaSemanaFixo: Number(x.dia_semana_fixo),
    horarioFixo: String(x.horario_fixo).slice(0, 5),
    modalidadeTransporte: String(x.modalidade_transporte) as
      "sem_transporte" | "taxidog",
    renovacaoAutomatica: Boolean(x.renovacao_automatica),
    criadoEm: String(x.created_at),
    itens: [],
  };
}
function nomeRelacao(v: unknown) {
  const x = Array.isArray(v) ? (v[0] as Linha) : (v as Linha);
  return String(x?.nome ?? "");
}
function horaMinutos(v:string){const[h,m]=v.split(":").map(Number);return h*60+m}
function horaTexto(v:number){const minutos=((v%1440)+1440)%1440;return `${String(Math.floor(minutos/60)).padStart(2,"0")}:${String(minutos%60).padStart(2,"0")}`}
function invalido(c: string, m: string): RespostaVendaContrato {
  return { status: "invalido", codigo: c, mensagem: m };
}
function conflito(c: string, m: string): RespostaVendaContrato {
  return { status: "conflito", codigo: c, mensagem: m };
}
