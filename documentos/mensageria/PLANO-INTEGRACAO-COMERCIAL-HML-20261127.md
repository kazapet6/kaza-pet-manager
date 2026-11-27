# Candidata de integração comercial e mensageria — 27/11/2026

Estado: inventário e preparação. Nenhum merge, deploy ou migration executado por esta etapa.

- Base HML validada visualmente: 544635e974d87c494004cc56a3dcc155a5e71db1
- Fonte comercial: a9bfd7fe893a183fab320dfc92c690dc6fdc3978
- Ancestral comum: 29a24ed3844084e578fea10e8a8ef1553a4e5b33
- Divergência: 256 commits HML; 11 commits comerciais.
- Arquivos alterados do lado comercial: 124; lado HML: 138.

## Sobreposições idênticas
- frontend/src/agenda/AgendaCards.css
- frontend/src/agenda/AgendaCards.tsx
- frontend/src/agenda/GradeAgenda.tsx
- frontend/src/agenda/gradeTemporal.ts

## Sobreposições que exigem reconciliação
- frontend/package.json
- frontend/src/App.tsx
- frontend/src/pages/Agenda.tsx

- App: preservar navegação e guardas HML, autenticação, Clientes com autorização WhatsApp e integrar AgendaProvider/cabeçalho comercial.
- Agenda: preservar cards como padrão e incorporar procedimentos, pagamento previsto, adicionais, pulo e aviso de renovação.
- package.json: preservar suites HML e incorporar testes comerciais; validar lockfile e existência dos scripts.

## Arquivos exclusivos da alteração comercial (inventário, não autorização de execução)
- banco/042_estado_materializacao_contratos.sql (added)
- banco/048_perfil_e_hidratacoes_venda.sql (added)
- banco/049_valores_negociados_agendamento.sql (added)
- banco/050_forma_pagamento_prevista.sql (added)
- banco/051_editar_forma_pagamento_prevista.sql (added)
- banco/052_preco_e_elegibilidade_de_oferta.sql (added)
- banco/053_procedimento_incluso_em_servico.sql (added)
- banco/054_adicional_com_credito_de_pacote.sql (added)
- banco/055_etapa_operacional_por_perfil.sql (added)
- banco/056_recebimento_data_efetiva.sql (added)
- banco/057_procedimentos_inclusos_snapshot.sql (added)
- banco/058_remocao_adicional_pendente.sql (added)
- banco/configuracoes/pacotes_simples_caes_pequenos.sql (added)
- banco/configuracoes/procedimentos_inclusos_banho.sql (added)
- banco/configuracoes/servicos_avulsos_unhas_tesoura.sql (added)
- banco/configuracoes/tosa_maquina_caes_pequenos.sql (added)
- banco/configuracoes/tosa_tesoura_adicional.sql (added)
- banco/propostas/central-notificacoes/confirmacao-agendamento.sql (added)
- documentos/RELEASE-COMERCIAL-20261125.md (added)
- frontend/src/App.css (modified)
- frontend/src/agenda/INTEGRACAO-AGENDA-CARDS.md (added)
- frontend/src/agenda/NovoAgendamentoModal.tsx (modified)
- frontend/src/agenda/RemarcarAtendimentoModal.tsx (modified)
- frontend/src/agenda/financeiroAtendimento.ts (modified)
- frontend/src/agenda/novoAgendamento.ts (modified)
- frontend/src/agenda/testesGradeTemporal.ts (modified)
- frontend/src/agenda/testesNovoAgendamento.ts (modified)
- frontend/src/components/EditorPet.tsx (added)
- frontend/src/components/ui/Input.tsx (modified)
- frontend/src/components/ui/Select.tsx (modified)
- frontend/src/conclusaoAtendimento/ConclusaoAtendimentoModal.tsx (modified)
- frontend/src/conclusaoAtendimento/EditarFormaPrevista.tsx (added)
- frontend/src/conclusaoAtendimento/ReceberAdicionais.tsx (added)
- frontend/src/conclusaoAtendimento/ReceberPacoteAntecipado.tsx (added)
- frontend/src/conclusaoAtendimento/contrato.ts (modified)
- frontend/src/conclusaoAtendimento/testesRecebimentoDataEfetiva.ts (added)
- frontend/src/confirmacao/clienteSupabase.ts (modified)
- frontend/src/confirmacao/dev.ts (modified)
- frontend/src/confirmacao/testesFaseG.ts (modified)
- frontend/src/contratos/Contratos.tsx (modified)
- frontend/src/contratos/DetalheContrato.tsx (modified)
- frontend/src/contratos/ReaproveitarCredito.tsx (added)
- frontend/src/contratos/RenovarContrato.tsx (added)
- frontend/src/contratos/clienteReaproveitamento.ts (added)
- frontend/src/contratos/clienteRenovacao.ts (added)
- frontend/src/contratos/clienteSupabase.ts (modified)
- frontend/src/contratos/reaproveitamentoFluxo.ts (added)
- frontend/src/contratos/renovacaoFluxo.ts (added)
- frontend/src/contratos/rotinaVenda.ts (modified)
- frontend/src/contratos/testes.ts (modified)
- frontend/src/contratos/testesMaterializacao.ts (modified)
- frontend/src/data/agenda.ts (modified)
- frontend/src/data/agendaDiaria.ts (modified)
- frontend/src/data/configuracaoAgenda.ts (modified)
- frontend/src/data/testesAgendaDiaria.ts (modified)
- frontend/src/data/testesPetsIncompletos.ts (modified)
- frontend/src/data/testesSubmissaoPet.ts (modified)
- frontend/src/main.tsx (modified)
- frontend/src/motorDisponibilidade/index.ts (modified)
- frontend/src/motorDisponibilidade/testes.ts (modified)
- frontend/src/pages/Pets.tsx (modified)
- frontend/src/remarcacao/contrato.ts (modified)
- frontend/src/remarcacao/testes.ts (modified)
- frontend/src/remarcacao/testesRetiradaAdicional.ts (added)
- frontend/src/statusAtendimento/testes.ts (modified)
- frontend/src/types/Agenda.ts (modified)
- frontend/src/types/AgendaDiaria.ts (modified)
- supabase/functions/_shared/confirmacao/contrato.ts (modified)
- supabase/functions/_shared/confirmacao/observabilidade.ts (modified)
- supabase/functions/_shared/contrato-renovacao.ts (added)
- supabase/functions/_shared/contrato-venda.ts (modified)
- supabase/functions/_shared/credito-contrato.ts (modified)
- supabase/functions/_shared/materializacao-ciclo.ts (modified)
- supabase/functions/_shared/materializacao-contrato.ts (modified)
- supabase/functions/_shared/motor/cadastroPet.ts (modified)
- supabase/functions/_shared/motor/motor.ts (modified)
- supabase/functions/_shared/motor/procedimentos.ts (added)
- supabase/functions/_shared/motor/recursos.ts (modified)
- supabase/functions/_shared/motor/regras.ts (modified)
- supabase/functions/_shared/motor/responsavel.ts (added)
- supabase/functions/_shared/motor/supabase.ts (modified)
- supabase/functions/_shared/motor/tipos.ts (modified)
- supabase/functions/_shared/precificacao.ts (modified)
- supabase/functions/_shared/reaproveitamento-044.ts (added)
- supabase/functions/_shared/reaproveitamento-credito.ts (added)
- supabase/functions/_shared/recorrencia-contrato.ts (modified)
- supabase/functions/_shared/simulacao-pacote.ts (modified)
- supabase/functions/_shared/status-atendimento.ts (modified)
- supabase/functions/alterar-status-atendimento/handler.ts (modified)
- supabase/functions/alterar-status-atendimento/index.ts (modified)
- supabase/functions/alterar-status-atendimento/servico.ts (modified)
- supabase/functions/confirmar-agendamento/handler.ts (modified)
- supabase/functions/confirmar-agendamento/index.ts (modified)
- supabase/functions/confirmar-agendamento/servico.ts (modified)
- supabase/functions/dados-conclusao-atendimento/handler.ts (modified)
- supabase/functions/dados-conclusao-atendimento/index.ts (modified)
- supabase/functions/dados-conclusao-atendimento/servico.ts (modified)
- supabase/functions/gerenciar-creditos-contrato/index.ts (modified)
- supabase/functions/gerenciar-creditos-contrato/servico.ts (modified)
- supabase/functions/reaproveitar-credito/assinatura.ts (added)
- supabase/functions/reaproveitar-credito/deno.json (added)
- supabase/functions/reaproveitar-credito/handler.ts (added)
- supabase/functions/reaproveitar-credito/index.ts (added)
- supabase/functions/reaproveitar-credito/planejamento.ts (added)
- supabase/functions/reaproveitar-credito/servico.ts (added)
- supabase/functions/remarcar-atendimento/handler.ts (modified)
- supabase/functions/remarcar-atendimento/index.ts (modified)
- supabase/functions/remarcar-atendimento/servico.ts (modified)
- supabase/functions/renovar-contrato/assinatura.ts (added)
- supabase/functions/renovar-contrato/deno.json (added)
- supabase/functions/renovar-contrato/handler.ts (added)
- supabase/functions/renovar-contrato/index.ts (added)
- supabase/functions/renovar-contrato/pendencias.ts (added)
- supabase/functions/renovar-contrato/planejamento.ts (added)
- supabase/functions/renovar-contrato/servico.ts (added)
- supabase/functions/vender-contrato/servico.ts (modified)
- supabase/functions/vender-contrato/test.ts (added)

## Portões de liberação
1. Revisar e consolidar fontes na branch candidata; preservar todos os arquivos exclusivos HML e os cinco arquivos de cards já aprovados, reconciliando Agenda.tsx.
2. Conferir dependências e executar build/testes comerciais e mensageria em ambiente isolado.
3. Inventariar schema/RPC/Edges efetivamente implantados, com especial atenção à confirmação integrada, às migrations anteriores não autorizadas e à diferença entre fontes Git e versões Edge HML. Não executar SQL em produção por este documento. Não reaplicar migrations cegamente.
4. Testar com dados fictícios em HML, sem liberar disparo real fora do destinatário de teste.
5. Somente após aprovação, planejar publicação produtiva com rollback, mantendo Vercel até validação do novo frontend. Não migrar banco por necessidade do frontend.
