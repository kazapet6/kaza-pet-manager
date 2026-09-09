import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  dataRetorno,
  lerConclusaoDadosIntent,
  podeAbrirConclusao,
  situacaoFinanceira,
} from "./contrato.ts";
import { obterAcaoRapidaAtendimento } from "../agenda/acaoRapidaAtendimento.ts";
import {
  acaoPrincipalConclusao,
  carregarEstadoConclusao,
  etapaAnteriorConclusao,
  proximaEtapaConclusao,
  retornosForamAlterados,
} from "./fluxo.ts";
const ler = (p: string) =>
    readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8"),
  migration = ler("banco/025_financeiro_retorno_conclusao_atendimento.sql"),
  modal = ler(
    "frontend/src/conclusaoAtendimento/ConclusaoAtendimentoModal.tsx",
  ),
  agenda = ler("frontend/src/pages/Agenda.tsx"),
  edge = ler("supabase/functions/dados-conclusao-atendimento/handler.ts");
let n = 0;
function t(nome: string, f: () => void) {
  f();
  console.log(`CG${String(++n).padStart(2, "0")} ${nome}: OK`);
}
t("pendente derivado", () =>
  assert.equal(situacaoFinanceira(100, 0, false), "pendente"),
);
t("parcial derivado", () =>
  assert.equal(situacaoFinanceira(100, 40, false), "parcial"),
);
t("pago derivado", () =>
  assert.equal(situacaoFinanceira(100, 100, false), "pago"),
);
t("isento explicito", () =>
  assert.equal(situacaoFinanceira(100, 0, true), "isento"),
);
t("retorno soma dias", () =>
  assert.equal(dataRetorno("2026-08-18", 7), "2026-08-25"),
);
t("retirada abre fluxo", () =>
  assert.equal(podeAbrirConclusao("aguardando_retirada"), true),
);
t("entrega abre fluxo", () =>
  assert.equal(podeAbrirConclusao("aguardando_entrega"), true),
);
t("estado indevido nao abre", () =>
  assert.equal(podeAbrirConclusao("em_atendimento"), false),
);
t("acao concluir retirada permanece identificavel", () =>
  assert.equal(
    obterAcaoRapidaAtendimento({
      status: "aguardando_retirada",
      modalidade: "normal",
    })?.rotulo,
    "Concluir",
  ),
);
t("acao concluir entrega TaxiDog permanece identificavel", () =>
  assert.equal(
    obterAcaoRapidaAtendimento({
      status: "aguardando_entrega",
      modalidade: "taxidog",
    })?.rotulo,
    "Concluir",
  ),
);
t("acao rapida interceptada pelo destino e status", () =>
  assert.match(
    agenda,
    /acao\.novoStatus === 'concluido' && podeAbrirConclusao\(atendimento\.status\)/,
  ),
);
t("barra manual usa a mesma abertura", () =>
  assert.match(
    agenda,
    /novoStatus === 'concluido' && podeAbrirConclusao\(status\)/,
  ),
);
t("abrir fluxo nao chama alteracao", () =>
  assert.match(
    agenda,
    /if \(acao\.novoStatus === 'concluido'.*\{ setConcluindo\(atendimento\); return \}/,
  ),
);
t("finalizar normal preservado", () =>
  assert.equal(
    obterAcaoRapidaAtendimento({
      status: "em_atendimento",
      modalidade: "normal",
    })?.novoStatus,
    "aguardando_retirada",
  ),
);
t("finalizar taxidog preservado", () =>
  assert.equal(
    obterAcaoRapidaAtendimento({
      status: "em_atendimento",
      modalidade: "taxidog",
    })?.novoStatus,
    "aguardando_entrega",
  ),
);
t("fluxo quatro etapas termina em revisao", () =>
  assert.match(modal, /\['Observacoes',\s*'Pagamento',\s*'Retorno',\s*'Revisao'\]/),
);
t("observacoes oficiais carregadas", () =>
  assert.match(modal, /executarObservacoesAtendimento\(\{\s*operacao:\s*'carregar'/),
);
t("ocorrencias existentes selecionadas", () =>
  assert.match(modal, /setTipos\(resultado\.observacoes\.ocorrencias\)/),
);
t("texto existente preenchido", () =>
  assert.match(modal, /setTexto\(resultado\.observacoes\.observacao \?\? ''\)/),
);
t("observacao vazia permitida", () => assert.equal(normalizarIntent(), true));
t("avancos intermediarios nao concluem", () => {
  const avancar = modal.slice(
    modal.indexOf("async function avancar"),
    modal.indexOf("async function receber"),
  );
  assert.doesNotMatch(avancar, /onConcluir/);
});
t("voltar implementado em todas as etapas", () =>
  assert.match(modal, /etapaAnteriorConclusao/),
);
t("cancelar ou fechar nao conclui", () => {
  const fechar = modal.slice(
    modal.indexOf("function fechar"),
    modal.indexOf("return <Modal"),
  );
  assert.doesNotMatch(fechar, /onConcluir/);
});
t("duplo clique protegido", () => assert.match(modal, /trava\.current/));
t("somente confirmacao final chama infraestrutura de status", () =>
  assert.match(
    agenda,
    /onConcluir=\{\(item, statusEsperado\) => executarAcaoStatus\(item, 'concluido', false, statusEsperado\)\}/,
  ),
);
t("status esperado original e prop explicita", () =>
  assert.match(modal, /onConcluir\(atendimento, statusEsperado\)/),
);
t("agenda recarrega em sucesso e conflito", () =>
  assert.match(
    agenda,
    /resposta\.status === 'atualizado' \|\| resposta\.status === 'conflito'/,
  ),
);
t("conflito nao fecha fluxo", () =>
  assert.match(modal, /if \(resposta\.status === 'conflito'\).*else if.*else onClose\(\)/s),
);
t("sem update direto", () =>
  assert.doesNotMatch(modal, /\.from\(['"]atendimentos/),
);
t("retorno independente removido", () => {
  assert.doesNotMatch(agenda, /RetornoAtendimentoModal/);
  assert.doesNotMatch(agenda, />Retorno<\/button>/);
  assert.equal(existsSync(new URL('./RetornoAtendimentoModal.tsx', import.meta.url)), false);
});
t("retorno inalterado nao chama persistencia", () =>
  assert.match(modal, /if \(etapa === 2 && dados && retornosAlterados\)/),
);
t("comparacao comportamental evita salvar retorno inalterado", () => {
  const retornos = [{ atendimentoServicoId: 's', nome: 'Banho', intervaloDias: 30, dataRecomendada: '2026-09-18' }];
  assert.equal(retornosForamAlterados(retornos, { s: '30' }), false);
  assert.equal(retornosForamAlterados(retornos, { s: '45' }), true);
  assert.equal(retornosForamAlterados(retornos, { s: '' }), true);
});
t("observacoes independente preservada", () =>
  assert.match(agenda, /setObservacoesAberto\(true\).*Observacoes<\/button>/),
);
t("recebimentos individuais", () =>
  assert.match(migration, /create table public\.atendimento_recebimentos/),
);
t("sem unique por atendimento", () =>
  assert.doesNotMatch(migration, /unique\s*\(atendimento_id\)/i),
);
t("idempotencia propria", () =>
  assert.match(migration, /chave_idempotencia uuid not null unique/),
);
t("formas fechadas", () =>
  assert.match(migration, /'pix','dinheiro','debito','credito','outro'/),
);
t("valor positivo", () => assert.match(migration, /check \(valor > 0\)/));
t("saldo validado sob lock", () =>
  assert.match(
    migration,
    /valor_final for update|where item\.id = v_atendimento_id for update/s,
  ),
);
t("excesso rejeitado", () => assert.match(migration, /VALOR_SUPERA_SALDO/));
t("retry reutiliza", () => assert.match(migration, /'reutilizado',true/));
t("payload divergente conflita", () =>
  assert.match(migration, /IDEMPOTENCIA_CONFLITANTE/),
);
t("isencao explicita", () =>
  assert.match(migration, /isento boolean not null default false/),
);
t("isencao com recebimento rejeitada", () =>
  assert.match(migration, /ISENCAO_COM_RECEBIMENTOS/),
);
t("isento rejeita recebimento", () =>
  assert.match(migration, /ATENDIMENTO_ISENTO/),
);
t("valor final nao alterado", () =>
  assert.doesNotMatch(migration, /set\s+valor_final/i),
);
t("retorno por servico materializado", () =>
  assert.match(migration, /atendimento_servico_id uuid primary key/),
);
t("intervalo limitado", () => assert.match(migration, /between 1 and 3650/));
t("base data operacional", () =>
  assert.match(migration, /grupo\.data_operacional/),
);
t("edicao substitui anterior", () =>
  assert.match(
    migration,
    /delete from public\.atendimento_recomendacoes_retorno/,
  ),
);
t("retorno nao cria agenda", () =>
  assert.doesNotMatch(migration, /insert into public\.grupos_agendamento/),
);
t("retorno nao altera status", () =>
  assert.doesNotMatch(migration, /set status=/),
);
t("edge exige internal", () => assert.match(edge, /role!=='internal'/));
t("CORS aceita x-client-info", () => assert.match(edge, /x-client-info/));
t("intencao recebimento valida", () =>
  assert.ok(
    lerConclusaoDadosIntent({
      operacao: "receber",
      atendimentoId: "a",
      chaveIdempotencia: "k",
      valor: 1,
      formaPagamento: "pix",
    }),
  ),
);
t("intervalo invalido rejeitado", () =>
  assert.equal(
    lerConclusaoDadosIntent({
      operacao: "salvar_retornos",
      atendimentoId: "a",
      versaoEsperada: 0,
      recomendacoes: [{ atendimentoServicoId: "s", intervaloDias: 0 }],
    }),
    null,
  ),
);
t("modal explicita carregando, erro e retry", () => {
  assert.match(modal, /estadoCarregamento\.estado === 'carregando'/);
  assert.match(modal, /estadoCarregamento\.estado === 'erro'/);
  assert.match(modal, />Tentar novamente<\/Button>/);
});
t("navegacao percorre Observacoes, Pagamento, Retorno e Revisao", () => {
  let etapa: 0 | 1 | 2 | 3 = 0;
  const visitadas: Array<0 | 1 | 2 | 3> = [etapa];
  etapa = proximaEtapaConclusao(etapa);
  visitadas.push(etapa);
  etapa = proximaEtapaConclusao(etapa);
  visitadas.push(etapa);
  etapa = proximaEtapaConclusao(etapa);
  visitadas.push(etapa);
  assert.deepEqual(visitadas, [0, 1, 2, 3]);
});
t("voltar preserva os limites do fluxo", () => {
  assert.equal(etapaAnteriorConclusao(3), 2);
  assert.equal(etapaAnteriorConclusao(0), 0);
  assert.equal(proximaEtapaConclusao(3), 3);
});
t("status final pertence somente a Revisao", () => {
  assert.deepEqual([0, 1, 2, 3].map((etapa) => acaoPrincipalConclusao(etapa as 0 | 1 | 2 | 3)), ['avancar', 'avancar', 'avancar', 'concluir']);
});

const carregamentoPronto = await carregarEstadoConclusao({
  carregarObservacoes: async () => observacoesCarregadas(),
  carregarDados: async () => dadosCarregados(),
});
t("carregamento conjunto chega ao estado pronto", () => {
  assert.equal(carregamentoPronto.estado, 'pronto');
});

const carregamentoInvalido = await carregarEstadoConclusao({
  carregarObservacoes: async () => ({ status: 'invalido', codigo: 'X', mensagem: 'Observacoes indisponiveis.' }),
  carregarDados: async () => dadosCarregados(),
});
t("resposta invalida vira erro recuperavel", () => {
  assert.deepEqual(carregamentoInvalido, { estado: 'erro', mensagem: 'Observacoes indisponiveis.' });
});

const carregamentoConflito = await carregarEstadoConclusao({
  carregarObservacoes: async () => observacoesCarregadas(),
  carregarDados: async () => ({ status: 'conflito', codigo: 'ALTERADO', mensagem: 'Dados alterados.' }),
});
t("conflito de carregamento nao fica preso", () => {
  assert.deepEqual(carregamentoConflito, { estado: 'erro', mensagem: 'Dados alterados.' });
});

const carregamentoFalho = await carregarEstadoConclusao({
  carregarObservacoes: async () => { throw new Error('segredo'); },
  carregarDados: async () => dadosCarregados(),
});
t("falha tecnica vira erro sanitizado", () => {
  assert.deepEqual(carregamentoFalho, { estado: 'erro', mensagem: 'Nao foi possivel carregar os dados da conclusao.' });
});

let tentativasCarregamento = 0;
const tentarCarregar = () => carregarEstadoConclusao({
  carregarObservacoes: async () => observacoesCarregadas(),
  carregarDados: async () => ++tentativasCarregamento === 1
    ? { status: 'invalido' as const, codigo: 'TEMPORARIO', mensagem: 'Tente novamente.' }
    : dadosCarregados(),
});
const primeiraTentativa = await tentarCarregar();
const segundaTentativa = await tentarCarregar();
t("retry recupera carregamento anterior com erro", () => {
  assert.equal(primeiraTentativa.estado, 'erro');
  assert.equal(segundaTentativa.estado, 'pronto');
  assert.equal(tentativasCarregamento, 2);
});

console.log(`${n} testes de conclusao guiada aprovados.`);
function normalizarIntent() {
  return (
    lerConclusaoDadosIntent({
      operacao: "salvar_retornos",
      atendimentoId: "a",
      versaoEsperada: 0,
      recomendacoes: [],
    }) !== null
  );
}

function observacoesCarregadas() {
  return { status: 'carregado' as const, atendimentoId: 'a', versao: 0, ocorrencias: [], observacao: null, editavel: true };
}

function dadosCarregados() {
  return {
    status: 'carregado' as const,
    atendimentoId: 'a',
    financeiro: { valorFinal: 50, totalRecebido: 0, saldo: 50, situacao: 'pendente' as const, isento: false, versao: 0, recebimentos: [] },
    retornosVersao: 0,
    retornos: [],
  };
}
