# HML — contexto autoritativo do agradecimento (23/11/2026)

**Projeto:** Supabase HML `jgtctzqieyorhvqxjbpk`. **Não é uma integração de envio ativa.** GitHub `main`, Supabase de produção e Vercel oficial permanecem inalterados.

## Etapas já confirmadas

1. O webhook Meta registra evento apenas após verificar HMAC sobre o corpo bruto (isso foi testado anteriormente no recebimento real).
2. O processador SQL autoritativo só confirma o atendimento se reconhecer token/convite/`wamid` e mantém a mudança `agendado → confirmado` e a criação da outbox na mesma transação.
3. A outbox é reservada **uma vez** por mensagem, com chave de idempotência e auditoria; o modelo precisa estar publicado (não um rascunho).
4. **Nova:** RPC somente backend `public.mensageria_hml_outbox_contexto(p_outbox,p_chave,p_operador,p_destinatario_permitido)` resolve os dados reais da agenda e do clique para o texto de agradecimento:
   - modelo publicado e ativo do evento `AGENDAMENTO_CONFIRMADO_WHATSAPP`;
   - atendimentos e convites confirmados, mesmo grupo/empresa/unidade, mesmo horário e chegada do convite;
   - tutor e pet da ficha fictícia HML `CLI-990003`, destino igual ao número autorizado pelo servidor, remetente do clique compatível;
   - tentativa da outbox já reservada para aquele operador/chave;
   - processamento de clique previamente registrado, vinculado a item de webhook assinado, mensagem Meta original e `wamid`/WABA/phone id exatos;
   - unidade com confirmação expressamente ativada e operador administrativo habilitado.
5. **Correção da janela de atendimento:** a idade da resposta é calculada pelo `timestamp` da **mensagem recebida do cliente** dentro do payload Meta validado. O momento de inserção do webhook no banco NÃO é usado para ampliar artificialmente as 24 horas. Margem de 5 minutos aplicada.
6. A RPC retorna um objeto de contexto com data/hora, modelo, destinatário, nome do pet/tutor/empresa e `context.message_id` da resposta; os campos são acessíveis apenas ao `service_role`.
7. **Novo:** `contextoOutboxBackendHml.ts` conecta a estrutura da RPC (injetada/mocada) ao renderizador `prepararAgradecimentoHml`, validando formato, projeto, tentativa e allowlist. Não contém POST ou chamada Meta. `testesContextoOutboxBackendHml.ts` cobre resultado válido, permissão, divergências, cancelamento, janela, tags e indisponibilidade.

## Migrações HML

- `20261123135000_mensageria_hml_contexto_autoritativo_outbox.sql`: consulta com todos os vínculos, sem escrita.
- `20261123141000_mensageria_hml_contexto_tempo_meta.sql`: substituição explícita para usar o `timestamp` original do clique assinado, com validação estrita de formato e idade.
- Ambas foram aplicadas **somente na HML** depois de ensaios `BEGIN/ROLLBACK`.

## Testes

- `hml_outbox_contexto_autoritativo_rollback.sql`: 23 PASS no ensaio e depois da instalação, incluindo reserva, modelo publicado, unidade desativada, allowlist, operador, snapshots de horário e idempotência.
- `hml_outbox_contexto_timestamp_meta_rollback.sql`: **25 PASS depois da migração final**. Acrescenta teste de clique com `timestamp` Meta vencido (mesmo com webhook recebido agora) e de webhook classificado como irrelevante.
- Fixtures usam HMAC *marcado sinteticamente* como verificado dentro de uma transação de teste. **Não equivalem a um novo teste real de assinatura Meta.**
- Depois do rollback: 0 agendamentos, 0 convites, 0 tentativas, 0 respostas na outbox e 0 modelos publicados por este teste.
- ACL: a nova RPC só pode ser executada por `service_role`; roles `anon` e `authenticated` não podem executar. Advisors não identificaram alerta para essa RPC.

## O que falta

- Executar `npm run test:mensageria`, `npm run test:whatsapp-hml` e `npm run build` no worktree isolado Windows após atualizar branch.
- A consulta autoritativa foi preparada para **ser chamada pela Edge futura, mas ainda não foi conectada ao transporte Meta**. O código TypeScript também não foi implantado nesta etapa.
- Aprovar template de convite na WABA, publicar uma versão de modelo de agradecimento **somente por ação administrativa explícita** e criar agendamento HML fictício persistente.
- Provar todo o ciclo real: botão Meta → HMAC → mudança na agenda → reserva outbox → consulta autoritativa → envio de agradecimento → status de entrega. **Isso só poderá ser ativado com autorização explícita para o número pessoal de teste**.
- Resolver o caso de aceitação HTTP pela Meta seguida de perda da resposta SQL (`wamid` não persistido). Não reenviar cegamente.
- Testar concorrência, histórico, créditos de pacote, mudanças de horário, falhas e reconciliação antes de pensar em produção.

**Não mesclar este código no `main` ou publicar na Vercel sem aprovação separada. Nenhum novo WhatsApp foi enviado.**
