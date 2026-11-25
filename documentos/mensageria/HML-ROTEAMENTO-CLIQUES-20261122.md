# HML — roteamento de cliques WhatsApp em lote (22/11/2026)

## Motivação

O receptor Meta já valida assinatura HMAC e persiste o evento em `mensageria_webhooks_meta` e `mensageria_webhook_itens_meta`. Não substituir, reconfigurar nem reimplantar o consumidor genérico existente. O novo fluxo de confirmação usa **seleção paralela restrita** de cliques de botão já armazenados e **não envia mensagens**.

## Implementação

1. `supabase/migrations/20261122234500_mensageria_hml_cliques_pendentes.sql`
   - RPC `public.mensageria_hml_listar_cliques_pendentes(p_operador,p_limite)`, `SECURITY DEFINER`, `EXECUTE` somente service_role.
   - Verifica operador admin em `auth.users.raw_app_meta_data` e exige limite 1 a 10.
   - Seleciona somente eventos `mensagem_inbound` do tipo `button` ou `interactive`, de webhook `classificacao='processavel'` com `assinatura_validada_at` preenchida.
   - Confere WABA, `phone_number_id`, `message_id`, contexto da mensagem anterior, token `KPAG1_<uuid>` com hash associado ao convite, origem Meta correspondente ao número autorizado e convite ativo não vencido.
   - Não seleciona eventos já processados. Retorna **somente IDs UUID dos itens**, nunca payload, token, contato ou nome.
2. `supabase/functions/mensageria-confirmacao-hml/handler.ts`:
   - Ação `processar_lote` adicionada ao endpoint HML já autenticado com JWT e verificação administrativa.
   - Exige `HML_CONFIRMATION_PROCESSOR_ENABLED=true` no backend; como a configuração permanece desligada, responde `PROCESSAMENTO_DESATIVADO` antes de consultar candidatos.
   - Quando habilitada futuramente, chama a RPC de seleção e a transação `mensageria_hml_processar_confirmacao` para cada ID. Limite máximo de 10 por solicitação, contabilizando resultados e erros, sem emitir Meta.
   - Não altera a rotina do consumidor HML original nem cria scheduler/cron; **o lote não roda automaticamente nesta entrega**.
3. `supabase/functions/mensageria-confirmacao-hml/testes.ts`:
   - Testes offline/mocks para flag desligada, usuário não autorizado, origem rejeitada, limite inválido, fila simulada quando flag autorizada e ausência de chamadas externas.
4. `supabase/testes/hml_selecionar_processar_cliques_rollback.sql`:
   - Fixture sintética explicitamente marcada como webhook validado **apenas dentro de BEGIN/ROLLBACK**, não prova criptográfica de HMAC real.
   - Cria pet/atendimento fictício, convite/quick reply, três eventos de botão: um válido, um com token errado, outro de remetente diferente.
   - O seletor retorna somente o válido. A transação confirma o atendimento, produz um único agradecimento na outbox; repetir a seleção retorna vazio.

## Evidências observadas

- Teste SQL integrado, após instalação da migração: **4 PASS**.
- Endpoint `mensageria-confirmacao-hml` publicado exclusivamente na HML `jgtctzqieyorhvqxjbpk`, versão **2**, `verify_jwt=true`.
- `handler.ts` publicado é igual ao código da branch; nenhum endpoint de Graph API presente.
- ACL da nova RPC: service_role `true`, authenticated `false`, anon `false`.
- Após ROLLBACK: 0 agendamentos, 0 convites, 0 cliques e 0 respostas pendentes. O único envio antigo do piloto foi preservado; **nenhum novo WhatsApp foi enviado**.
- Supabase de produção sem a função HML, GitHub `main` não atualizado e sem publicação Vercel.

## Pendências obrigatórias antes do clique real

- Rodar a suíte Node atualizada `npm run test:mensageria`, `npm run test:whatsapp-hml` e `npm run build` no worktree Windows isolado.
- Obter **template Meta aprovado** com botões Confirmar/Remarcar, cadastrar um atendimento fictício persistente HML e vincular envio aceito ao `wamid`.
- Homologar HMAC real no webhook, resposta interativa do próprio WhatsApp, consumos de crédito, concorrência de cliques, convite alterado/expirado, indisponibilidade de banco/Meta.
- Só após autorização explícita e janela controlada habilitar a flag do lote. O processamento normal posterior deverá ser agendado/acionado de forma segura; não confiar em chamada do navegador para operação automática.
- Desenvolver consumidor de outbox do agradecimento pós-commit, com proteção contra duplicatas e controle de janela Meta. Não prometer resposta instantânea sem validar o ciclo de envio e retry.
- Futuro portal de remarcação/cancelamento e Financeiro não bloqueiam o desenvolvimento atual.

**Segurança:** não liberar `HML_CONFIRMATION_PROCESSOR_ENABLED` nem flags de envio sem nova autorização e testes de ponta a ponta.
