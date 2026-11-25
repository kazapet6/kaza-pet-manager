# HML — Consumidor de agradecimentos em simulação somente leitura
**Data:** 23/11/2026. **Escopo:** Supabase HML `jgtctzqieyorhvqxjbpk`, sem tráfego para Meta. Nenhuma alteração em produção.

## O que foi implementado

A primeira versão da seleção/consumo da fila é deliberadamente **somente leitura**:

1. `public.mensageria_hml_outbox_listar_pendentes(p_operador,p_limite)`, instalada via migração `20261123144000_mensageria_hml_outbox_listar_pendentes.sql`:
   - `SECURITY DEFINER` revogada a `PUBLIC`, `anon` e `authenticated`; somente `service_role` tem `EXECUTE`.
   - Verificação extra de admin ativo em `auth.users.raw_app_meta_data`, limite 1 a 10.
   - Seleciona somente UUIDs de `outbox.estado='pronto'`, com modelo `publicada` e ativo, convite e atendimento confirmados, horário futuro compatível, vínculo com unidade HML ativa, tutor fictício `CLI-990003`, número existente no cadastro e tentativa ainda inexistente.
   - Consulta não recupera corpo/telefone/PII e não faz update, reserva ou envio.
2. Edge `mensageria-outbox-hml` **v1**, `ACTIVE`, `verify_jwt=true`:
   - Exige projeto HML exato, `HML_OPERATOR_UUID`, `HML_TEST_RECIPIENT_E164` no secret manager e administrador autenticado via Auth + RPC.
   - `acao='simular_lote'` consulta, somente via backend, até 10 IDs. Responde apenas quantidade de elegíveis; `enviados=0`, `reservados=0`, `envio_automatico_habilitado=false`.
   - `acao='processar_lote'` e `acao='enviar'` retornam **503 sempre**, inclusive se alguma flag for habilitada por engano. O código não importa o Graph API nem chama RPC de escrita.
   - Não há cron, worker externo ou agendador vinculado.
3. A aba **Confirmações** da Central ganhou botão `Simular fila (sem enviar)`, mostrando apenas o total; nenhum nome, telefone, payload ou mensagem de cliente aparece.
4. Teste Node `supabase/functions/mensageria-outbox-hml/testes.ts`, adicionado a `npm run test:mensageria`: valida JWT/admin no mock, origem, HML exata, limitador, consulta apenas read-only e rejeição de qualquer envio mesmo com `HML_OUTBOX_SEND_ENABLED=true`.

## Evidências observadas

- Migração testada inicialmente em `BEGIN/ROLLBACK` e instalada **somente na HML**.
- Fixture `supabase/testes/hml_outbox_listar_pendentes_rollback.sql` executada novamente após a migração: **22 cenários PASS**, incluindo 6 novos casos (unidade inativa, um candidato válido, admin obrigatório, limite, modelo arquivado, reserva única sem reapresentação).
- ACL da RPC: `service_role=true`, `authenticated=false`.
- Edge real v1 `ACTIVE`, JWT, arquivos publicados idênticos à branch.
- Pós-teste: **0 agendamentos, 0 convites, 0 outbox, 0 tentativas**.
- A função HML não existe no Supabase produção. Nenhum envio Meta foi feito nesta etapa.

## Escopo NÃO implementado

- O consumidor **ainda não dispara** o agradecimento, não reserva nem altera linhas.
- Não há aprovação real de template de convite Meta; não há modelo de agradecimento publicado persistente na HML.
- O código Node novo e a UI ainda precisam de testes/build no Windows após atualizar o checkout isolado.
- Para ir ao envio real: publicar modelo autorizado, criar convite de teste Meta aprovado, persistir agendamento fictício, implementar transportador seguro com reconciliação de `wamid` após timeout e verificar E2E com clique real assinado.
- Só então decidir como acionar automaticamente o consumidor pós-commit (sem depender do navegador), testar concorrência, pacotes e taxas de entrega, e autorizar produção separadamente.

**Não mesclar para `main`, não habilitar mensagens automáticas e não usar clientes reais.**
