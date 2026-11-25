# HML — Integração dos adaptadores RPC e transporte Meta em rede simulada
**Data:** 23/11/2026
**Projeto:** `jgtctzqieyorhvqxjbpk`
**Status:** Implementado no GitHub; execução dos novos testes no Windows pendente. **Não publicado na Edge.**

## Escopo

Depois da validação do usuário `TRANSPORTE META HML - PASS`, foi criado o adaptador `supabase/functions/mensageria-outbox-hml/adaptadorRpcOutboxHml.ts` para integrar o orquestrador às quatro operações do Supabase:

1. `mensageria_hml_outbox_listar_pendentes` — lista um UUID elegível, leitura somente backend.
2. `mensageria_hml_outbox_reservar` — cria uma reserva idempotente na transação SQL futura.
3. `mensageria_hml_outbox_contexto` — verifica vínculo do webhook assinado, agenda, número autorizado e modelo publicado; fornece o contexto para renderizar tags.
4. `mensageria_hml_outbox_finalizar` — registra `aceito_meta`, `recusado_meta` ou `indeterminado`, distinguindo aceitação de entrega.

Essas operações são invocadas pelo código do orquestrador `orquestradorDespachoHml.ts`; o transporte externo permanece uma dependência **injetada**, nunca chamada diretamente pelo adaptador RPC.

## Condições de segurança

- O adaptador aceita somente o projeto HML exato e precisa de `HML_OUTBOX_RPC_ENABLED=true`, flag **nova, desligada na HML atual**.
- `SUPABASE_SERVICE_ROLE_KEY` e `HML_OPERATOR_UUID` são lidos **exclusivamente do backend**, jamais do navegador.
- Sem autorização válida, não realiza chamadas de rede nem gravações.
- O identificador de operador em cada RPC precisa ser exatamente o do backend. UUIDs, destinatário permitido e respostas JSON são validados.
- Rotas de RPC são fixas: o chamador não pode selecionar endpoint arbitrário nem fornecer URL.
- A guarda da janela de envio da Meta continua separada, com `HML_OUTBOX_SEND_ENABLED=true` **desligada** e expiração temporária no backend. Em caso de timeout, a tentativa fica indeterminada e **não pode ser reenviada automaticamente**.
- `service_role` é restrito ao backend; o módulo não é exportado para o frontend.

## Teste de integração, sem conexões externas

`supabase/functions/mensageria-outbox-hml/testesAdaptadorRpcOutboxHml.ts` simula o fluxo completo:
- solicita lista da outbox via HTTP fake;
- reserva uma tentativa, valida chave e operador;
- recupera contexto falso de tutor/pet/agendamento e monta a mensagem;
- valida URL e corpo do transporte Meta usando **fetch fake**;
- registra aceite falso com `wamid`;
- confirma `aceitosMeta=1` mas `entregues=0`;
- impede segundo envio da mesma reserva;
- trata agenda cancelada, token/flag de RPC ausente, destino errado, erro de banco e timeout.

**Este teste não cria registros no Supabase e não envia WhatsApp.** Nem o adaptador nem o teste foram importados pela Edge publicada `mensageria-outbox-hml` v1.

Scripts: `npm run test:adaptador-rpc-outbox-hml` e inclusão automática em `npm run test:mensageria`. **Aguardar a execução no Windows para declarar PASS.**

## Bloqueios para envio real

- Aprovação de template Quick Replies pela Meta e versão publicada do modelo de agradecimento na HML;
- autorização explícita e temporária para enviar somente ao número pessoal permitido;
- mecanismo de reconciliação durável para aceite Meta não gravado no banco; monitorar status `delivered/read/failed`;
- revisão de simultaneidade e cancelamento, pacotes/créditos e recuperação de falhas;
- publicação controlada de uma Edge nova com testes E2E e revisão de segurança.

**Não mexer no main, Vercel, Supabase produção ou flags. Nenhum envio real nesta etapa.**
