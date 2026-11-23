# HML — teste transacional de confirmação por botão (22/11/2026)

**Resultado da validação do backend: PASS para os dois fluxos em transação com ROLLBACK.**

## Escopo

- Projeto Supabase **exclusivamente HML** `jgtctzqieyorhvqxjbpk`.
- Migração do processador: `supabase/migrations/20261122220000_mensageria_hml_confirmacao_inbox_outbox.sql`.
- Reutiliza `public.atendimentos`, `public.grupos_agendamento`, os triggers comerciais e o escopo de `mensageria_interna.agenda_grupos`.
- `public.mensageria_hml_processar_confirmacao(item_id,operador_id)` aceita exclusivamente evento já persistido na inbox cujo webhook tem `assinatura_validada_at`; o processo de autenticação HMAC do webhook externo **não foi simulado criptograficamente neste teste SQL**.
- O teste inseriu temporariamente pet, agendamentos, convites, tokens, webhook *sintético marcado como validado* e itens inbound **somente dentro de BEGIN ... ROLLBACK**. Nenhum objeto de teste foi mantido.
- Nenhum token da Meta foi usado. Nenhum WhatsApp foi enviado. Nenhuma Edge Function foi habilitada.

## Resultados observados

| Cenário SQL | Processamento | Status do atendimento | Evento de auditoria | Resposta pendente na outbox | Repetição |
|---|---|---|---:|---:|---|
| Confirmar | confirmado | confirmado | 1 | 1 | ja_processado |
| Remarcar | remarcacao_pendente | agendado (inalterado) | 0 | 1 | ja_processado |

As duas ações foram testadas sobre agendamentos fictícios **avulsos**, não em contrato/pacote com créditos. O fluxo contratado precisa de homologação própria. Um item inbound inexistente, mas chamado com operador admin, retorna `WEBHOOK_NAO_VALIDADO`; operador aleatório é rejeitado. Nenhuma concessão a `anon`/`authenticated` foi criada.

## Guardrails

- Assinatura de webhook, WABA, número da empresa, mensagem original, token SHA-256 e remetente correto precisam concordar.
- Processar apenas eventos `button` ou `interactive.button_reply`; **texto livre não altera status**.
- Clique duplicado não cria novo status, solicitação de remarcação ou agradecimento.
- Remarcar não muda a reserva.
- Agradecimento é colocado em `mensageria_hml_respostas_outbox` no commit com estado `aguardando_integracao`, portanto **não é enviado automaticamente**.
- O status confirmado gera `atendimento_status_eventos` com origem WhatsApp; status operacional de contratos ainda precisa de teste específico.
- Função SQL é SECURITY DEFINER e executável somente por `service_role`. Tabelas de convite/estado não concedem SELECT direto a `authenticated` ou `service_role`.
- Migração HML não foi aplicada à produção; `main` e Vercel oficial não foram modificadas.

## Validação de não persistência depois do ROLLBACK

- `public.atendimentos`: 0
- `public.atendimento_status_eventos`: 0
- `public.mensageria_hml_convites_confirmacao`: 0
- `public.mensageria_hml_convite_processamentos`: 0
- `public.mensageria_hml_respostas_outbox`: 0
- Envios HML piloto já existentes: 1 (não aumentou)

## Próximos passos, ainda não concluídos

1. Criar cadastro/expedição segura do convite, gerando **dois tokens opacos** (Confirmar/Remarcar) e associando IDs Meta da saída à agenda HML fictícia.
2. Homologar um *template interativo real* aprovado na Meta e recebimento do botão assinado em uma conversa de teste, sem ampliar destinatários.
3. Conectar o worker de entrada à RPC restrita, com deduplicação durável e controle de erro/retry; não permitir processamento no navegador.
4. Implementar consumidor da outbox para **enviar imediatamente após commit** o agradecimento configurável na mesma conversa, com idempotência, status, retries e janela Meta; apenas após autorização para novo envio real.
5. Testar contrato com crédito, alteração de agendamento entre envio e resposta, token expirado, telefone falso, convite obsoleto, concorrência e indisponibilidade da API Meta.
6. Conectar agenda visual por mecanismo autorizado de atualização sem refresh; manter produção isolada.
7. Futuro: link individual HTTPS para remarcação/cancelamento, **não bloqueante**.

Não considerar o resultado SQL como E2E pela Meta; a comunicação real com botões ainda está pendente.
