# HML — triagem segura das tentativas de agradecimento (23/11/2026)

## Resultado inicial validado pelo operador

A captura do navegador em `127.0.0.1:5173` confirma que o painel **Reconciliação de agradecimentos — somente leitura** e os contadores estão visíveis e zerados. A Edge anterior v2 fornecia os totais; não havia envios persistidos.

## Incremento desta etapa

A consulta `public.mensageria_hml_outbox_casos_investigacao(p_operador,p_limite)` foi instalada exclusivamente no projeto HML `jgtctzqieyorhvqxjbpk` pela migração:

`supabase/migrations/20261123163000_mensageria_hml_outbox_casos_investigacao.sql`

Ela seleciona até 20 **tentativas específicas** que necessitam revisão humana. Categorias:

- `reserva_antiga`: reserva ainda aberta após cinco minutos;
- `resultado_indeterminado`: tentativa sem conclusão comprovada;
- `status_contraditorio`: webhook verificado indica falha e entrega/leitura para o mesmo `wamid`;
- `status_falhou`: status de falha sem comprovação de entrega/leitura;
- `aceite_sem_status`: Meta aceitou, mas não há status de webhook validado;
- `entrega_sem_confirmacao`: aceite antigo com apenas status de envio e nenhuma confirmação de entrega depois de 24 horas.

**Não há alteração automática da tentativa ou da outbox. Não há reenvio, associação inferida de `wamid` ou cron.**

A RPC exige admin interno ativo em `auth.users.raw_app_meta_data`, é `SECURITY DEFINER` com `search_path=pg_catalog`, e concede `EXECUTE` apenas a `service_role`; `authenticated` e `anon` não executam.

O resultado contém somente: `tentativa_id`, categoria padronizada e data da reserva. Não retorna dados do tutor, pet, número, texto, `wamid` nem credenciais. Retorna `reenvio_automatico_autorizado=false` em qualquer consulta bem-sucedida.

A classificação de status exige webhook com assinatura marcada validada, classificação processável, WABA e Phone Number ID da homologação e correspondência exata do item a `statuses[].id/status`.

## Testes de banco

Fixture `supabase/testes/hml_casos_investigacao_rollback.sql`:
- **31 cenários SQL PASS**, antes e depois da instalação, com `BEGIN/ROLLBACK`.
- Inclui 6 testes novos: aceite sem status, admin obrigatório, limite de até 20, leitura já comprovada não gera caso, status contraditório e timeout sem `wamid`.
- Esses testes marcam a assinatura de webhooks fictícios como validada **somente dentro da transação**; não demonstram a validade de HMAC de um webhook real.
- Pós-rollback: sem atendimentos, convites ou outboxes fictícios persistidos. A consulta real retornou zero casos e reenvio automático `false`.
- Segurança: RPC `service_role=true`, `authenticated=false`, `anon=false`; advisor sem achado específico da nova RPC.

## API e painel

A Edge `mensageria-outbox-hml` foi atualizada na **HML** para **v3 ACTIVE**, com JWT obrigatório. Fonte de `handler.ts` verificada byte a byte contra o GitHub.

- Novo comando de leitura administrativa `listar_casos_investigacao` (limite 1–20), com validação estrita de todas as entradas e saídas da RPC.
- As únicas rotas funcionais continuam `simular_lote`, `diagnosticar_reconciliacao` e `listar_casos_investigacao`. As operações `enviar` e `processar_lote` retornam **503 incondicionalmente**, mesmo que alguma flag seja ativada por engano.
- Não importa Graph API, transportador Meta nem RPC de reserva/finalização.
- Interface `Mensageria → Confirmações`: botão **Consultar casos pendentes (sem enviar)**, categorias de investigação e IDs abreviados. Nenhum controle de reenvio ou resolução automática.
- Teste Node atualizado em `supabase/functions/mensageria-outbox-hml/testes.ts`, integrado a `npm run test:mensageria`.

**Pendente:** a atualização local da branch e a validação TypeScript/build no computador Windows. A captura atual comprova o painel agregado anterior, **não** o novo botão de casos.

## Próximos bloqueios

- Implementar, após definição de política de auditoria, um registro append-only das decisões humanas em homologação. Jamais liberar reenvio pelo simples encerramento de um caso.
- Resolver possível aceite Meta sem `wamid` persistido com evidência externa suficiente, nunca apenas por telefone/horário.
- Aprovar template interativo na WABA, publicar versão do agradecimento e testar fluxo real só no destinatário pessoal explicitamente autorizado.
- Provar sem duplicidade, concorrência e status `sent/delivered/read/failed` na homologação antes de qualquer publicação em produção.

**Produção, GitHub main e Vercel oficial preservados. Nenhuma mensagem real enviada.**
