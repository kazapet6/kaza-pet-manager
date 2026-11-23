# HML — Diagnóstico de reconciliação por `wamid` (23/11/2026)

**Escopo:** Supabase de homologação `jgtctzqieyorhvqxjbpk`. **Não altera a agenda, não registra reenvio e não faz POST à Meta.**

## Problema e regra de segurança

A API da Meta pode responder HTTP 200 com `wamid`, sem garantir entrega, e a persistência do aceite no banco pode falhar. Um timeout também pode ocorrer após a Meta ter recebido a requisição.

**Sem `wamid` confiável ligado à tentativa, não existe ligação segura entre um webhook de status isolado e a outbox.** Por isso, nunca reconciliar automaticamente um status órfão com uma tentativa indeterminada por coincidência de número ou horário. Nenhuma ausência de webhook autoriza reenvio.

## Migração aplicada exclusivamente na HML

`supabase/migrations/20261123151500_mensageria_hml_reconciliacao_diagnostico.sql`

Implementa a RPC `public.mensageria_hml_outbox_diagnosticar_reconciliacao(p_operador)`:
- Somente administrador interno ativo da HML e `service_role` têm permissão.
- `SECURITY DEFINER` com `search_path=pg_catalog`; `EXECUTE` revogado de `PUBLIC`, `anon` e `authenticated`.
- Compara tentativa com `meta_message_id` salvo ao status real da Meta **por `wamid` exato**. Cada evidência exige webhook com assinatura validada, classificação `processavel`, payload de `whatsapp_business_account`, WABA de teste e Phone Number ID de teste.
- Confere que o ID e estado do item extraído correspondem a `statuses[].id/status` dentro do payload assinado.
- Agrupa webhooks duplicados por `wamid`. O status `read` é apresentado separadamente do status `delivered`; contradições entre `failed` e `read/delivered` viram uma contagem de investigação.
- Retorna **apenas contadores** de reservas antigas, indeterminados, recusados, aceitos, aceitos sem status, enviados, entregues, lidos, falhas, contradições e status sem vínculo. **Não retorna telefone, `wamid`, corpo ou identificadores pessoais.**
- Sempre informa `reenvio_automatico_autorizado=false` e não escreve em nenhuma tabela.

## Evidências SQL

Fixture `supabase/testes/hml_reconciliacao_somente_leitura_rollback.sql`:
- **25 verificações PASS antes e após a migração**, executadas com `BEGIN/ROLLBACK`.
- Nove novos testes: não confundir aceite com entrega; exigir admin; vincular entrega e manter webhook órfão; ignorar duplicatas; rejeitar webhooks irrelevantes; priorizar leitura; ignorar outra WABA; sinalizar entrega/falha contraditórias; manter timeout sem `wamid` sem associação automática.
- Webhooks fictícios têm `assinatura_validada_at` **marcada em banco no teste**, NÃO são prova de HMAC real.
- Após rollback: **zero agendamentos, zero outbox, zero tentativas e zero publicações**.
- ACL verificada: `service_role=true`, `authenticated=false`, `anon=false`; assessor de segurança sem achados para a nova função.

## API e UI

A Edge `mensageria-outbox-hml` **v2 ACTIVE**, `verify_jwt=true`, foi republicada somente na HML:
- `acao=simular_lote` continua leitura;
- nova `acao=diagnosticar_reconciliacao` consulta RPC e retorna apenas os contadores permitidos;
- `acao=enviar` e `acao=processar_lote` ainda são **503 incondicionais**;
- não importa `adaptadorRpcOutboxHml`, `orquestradorDespachoHml` ou `transporteMetaHml`; nenhum transporte Meta está implantado;
- arquivos publicados conferidos como idênticos aos da branch.

Na aba **Confirmações** foi adicionado botão **Conferir status de entrega (sem enviar)**, com contadores e aviso de reenvio bloqueado. Alteração de UI **ainda não validada no Windows**.

Teste Node do handler atualizado para validar endpoint de diagnóstico e bloquear todas as rotas de envio. A suíte `npm run test:mensageria` já inclui `test:outbox-consumidor-hml`.

## Limitações e pendências

- O diagnóstico **não repara automaticamente** um `wamid` perdido pelo backend; mostra o caso para investigação e não autoriza reenvio. Para vinculação manual futura é preciso uma trilha segura independente, aprovação administrativa e revisão contra conflitos.
- A evidência de status depende do webhook real de entrega recebido pelo backend e persistido. O fluxo real de status ainda requer homologação ponta a ponta.
- O botão da UI e teste TypeScript do handler ainda precisam de validação no PowerShell após atualizar branch.
- O template interativo Meta precisa ser aprovado e um modelo de agradecimento publicado separadamente, com autorização específica.
- Nenhum cron, flag de envio, template ou mensagem real ativado. `main`, Vercel oficial e Supabase produção preservados.

**Não publicar produção ou mesclar PR enquanto não houver teste E2E autorizado e reconciliação auditável completa.**
