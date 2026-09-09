import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { obterAcaoRapidaAtendimento } from "./acaoRapidaAtendimento.ts";

const agenda = readFileSync("src/pages/Agenda.tsx", "utf8");
const cliente = readFileSync(
  "src/statusAtendimento/clienteSupabase.ts",
  "utf8",
);
const alerta = readFileSync("src/agenda/alertaOperacional.ts", "utf8");
const grade = readFileSync("src/agenda/GradeAgenda.tsx", "utf8");
let aprovados = 0;
function teste(codigo: string, nome: string, executar: () => void) {
  executar();
  aprovados++;
  console.log(`${codigo} — ${nome}: OK`);
}
const acao = (status: string, modalidade: "normal" | "taxidog" = "normal") =>
  obterAcaoRapidaAtendimento({ status, modalidade });

teste("AR01", "agendado oferece Receber", () =>
  assert.deepEqual(acao("agendado"), {
    rotulo: "Receber",
    novoStatus: "recebido",
  }),
);
teste("AR02", "confirmado oferece Receber", () =>
  assert.deepEqual(acao("confirmado"), {
    rotulo: "Receber",
    novoStatus: "recebido",
  }),
);
teste("AR03", "recebido oferece Iniciar atendimento", () =>
  assert.deepEqual(acao("recebido"), {
    rotulo: "Iniciar atendimento",
    novoStatus: "em_atendimento",
  }),
);
teste("AR04", "execução normal finaliza para retirada", () =>
  assert.deepEqual(acao("em_atendimento"), {
    rotulo: "Finalizar",
    novoStatus: "aguardando_retirada",
  }),
);
teste("AR05", "execução TaxiDog finaliza para entrega", () =>
  assert.deepEqual(acao("em_atendimento", "taxidog"), {
    rotulo: "Finalizar",
    novoStatus: "aguardando_entrega",
  }),
);
teste("AR06", "aguardando retirada oferece Concluir", () =>
  assert.deepEqual(acao("aguardando_retirada"), {
    rotulo: "Concluir",
    novoStatus: "concluido",
  }),
);
teste("AR07", "aguardando entrega oferece Concluir", () =>
  assert.deepEqual(acao("aguardando_entrega"), {
    rotulo: "Concluir",
    novoStatus: "concluido",
  }),
);
for (const [codigo, status] of [
  ["AR08", "concluido"],
  ["AR09", "cancelado"],
  ["AR10", "faltou"],
] as const)
  teste(codigo, `${status} não possui ação`, () =>
    assert.equal(acao(status), null),
  );
teste("AR11", "ação usa statusEsperado carregado e preserva o original", () =>
  assert.ok(
    agenda.includes("statusEsperado = atendimento.status") &&
      agenda.includes("const base = { atendimentoId: atendimento.id, statusEsperado }"),
  ),
);
teste("AR12", "ação usa atendimentoId carregado", () =>
  assert.ok(agenda.includes("atendimentoId: atendimento.id")),
);
teste("AR13", "processamento bloqueia duplo clique", () =>
  assert.ok(
    agenda.includes("acaoRapidaEmAndamento.current") &&
      grade.includes("disabled={atualizando}") &&
      grade.includes("'Atualizando…'"),
  ),
);
teste("AR14", "frontend não faz UPDATE direto", () =>
  assert.ok(
    cliente.includes("functions.invoke('alterar-status-atendimento'") &&
      !agenda.includes(".from('atendimentos').update"),
  ),
);
teste("AR15", "clique da ação não abre modal", () =>
  assert.ok(
    grade.includes("e.stopPropagation();acao(a)") &&
      !agenda.includes('<button type="button" className="agenda-card"'),
  ),
);
teste("AR16", "segmento abre modal com teclado e clique", () =>
  assert.ok(grade.includes('role="button" tabIndex={0}') && grade.includes("e.target===e.currentTarget") && grade.includes('onClick={()=>abrir(a)}'))
);
teste("AR17", "TaxiDog é decidido pela modalidade real", () =>
  assert.ok(
    acao("em_atendimento", "taxidog")?.novoStatus === "aguardando_entrega" &&
      !readFileSync("src/agenda/acaoRapidaAtendimento.ts", "utf8").includes(
        "agenda-taxidog",
      ),
  ),
);
teste("AR18", "erro não atualiza status otimisticamente", () =>
  assert.ok(
    agenda.indexOf("await executarAcaoStatus") <
      agenda.indexOf("setSucesso(`Atendimento atualizado"),
  ),
);
teste("AR19", "conflito provoca reload oficial", () =>
  assert.ok(
    agenda.includes(
      "resposta.status === 'atualizado' || resposta.status === 'conflito'",
    ) &&
      agenda.includes(
        "carregarAgendaDiaria(supabase, atendimento.dataOperacional)",
      ),
  ),
);
teste("AR20", "sucesso provoca reload oficial", () =>
  assert.ok(
    agenda.includes("const atualizada = await carregarAgendaDiaria") &&
      agenda.includes("setAgenda(atualizada)"),
  ),
);
teste("AR21", "timestamps não são escritos pelo frontend", () =>
  ["recebido_em", "iniciado_em", "finalizado_em", "concluido_em"].forEach(
    (campo) => assert.ok(!agenda.includes(`${campo}:`)),
  ),
);
teste("AR22", "alerta não é manipulado pela ação rápida", () =>
  assert.ok(!agenda.includes("setAlerta") && !alerta.includes(".update(")),
);
teste("AR23", "cancelamento e falta ficam fora das ações rápidas", () =>
  assert.equal(acao("cancelado"), null),
);
teste("AR24", "barra livre dos sete status permanece no modal", () =>
  assert.ok(
    agenda.includes("opcoesStatusOperacional.map") &&
      agenda.includes('className="agenda-status-opcoes"'),
  ),
);

console.log(`${aprovados} testes AR01–AR24 aprovados.`);
