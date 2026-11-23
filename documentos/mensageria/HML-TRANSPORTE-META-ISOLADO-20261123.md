# HML — Adaptador isolado WhatsApp Cloud API (23/11/2026)

**Escopo:** branch `feature/mensageria-central-20261122`, sem inclusão na Edge publicada e **sem envio real**.

## Implementação

`supabase/functions/mensageria-outbox-hml/transporteMetaHml.ts` prepara exclusivamente respostas de texto contextualizadas da outbox para `POST /messages` pela Graph API da Meta, alinhado com o endpoint que já era utilizado no piloto manual de homologação.

### Condições exigidas ANTES de qualquer tentativa

- `HML_PROJECT_REF=jgtctzqieyorhvqxjbpk` e `SUPABASE_URL` exatamente da HML.
- `HML_META_PHONE_NUMBER_ID` confere com o **Phone Number ID de testes HML** fixado no módulo. Não aceitar Phone Number ID vindo do navegador.
- `HML_OUTBOX_SEND_ENABLED='true'` e `HML_OUTBOX_SEND_EXPIRES_AT` no futuro por **no máximo 3 minutos**. Ambos são **requisitos novos** e **não foram habilitados**.
- `HML_TEST_RECIPIENT_E164` fornecido exclusivamente por secret no servidor. O campo `to` do corpo já validado precisa coincidir exatamente; destino não é recebido por formulário.
- `HML_META_ACCESS_TOKEN` somente no backend, mínimo de 32 caracteres. Jamais expor em GitHub, browser, logs ou respostas da API.
- Mensagem com `messaging_product=whatsapp`, `recipient_type=individual`, tipo texto, corpo não vazio até 4.096 caracteres, `context.message_id` de clique inbound com formato `wamid` e `preview_url=false`.
- Verificação dupla de janela de autorização antes do POST. A validade da **janela de atendimento Meta de 24h** e de todos os dados de agenda/convite já é exigida pela RPC autoritativa e pelo renderizador anterior.

### Resposta e tratamento de falhas

- O transporte é injetável: `criarTransporteMetaHml({ambiente,requisitar,agora})`. O fluxo de testes passa **exclusivamente um fetch falso**, não realiza HTTP externo.
- A resposta HTTP de aceite só é reconhecida se trouxer `messaging_product='whatsapp'` e `messages[0].id` com `wamid` válido. Se houver `contacts[0].input`, ele precisa corresponder ao destinatário solicitado. `contacts[0].wa_id` pode diferir devido à normalização Meta.
- Um aceite HTTP não comprova entrega. O orquestrador registra `aceito_meta`; o status real dependerá do webhook de entrega.
- HTTP 4xx explícito é recusa; 5xx, resposta não JSON, resposta 2xx sem `wamid` e timeout são indeterminados. **Não há retry dentro do transporte.**
- Nenhum corpo de mensagem ou segredo Meta é registrado nos logs. Os erros expostos pelo adaptador são códigos genéricos sem dados pessoais.

### Testes

`testesTransporteMetaHml.ts` cobre: chamada fake de sucesso, URL fixada, Authorization fictícia, projeto HML exato, phone ID, allowlist, token, expiração, alteração de destinatário ou mensagem, expiração durante preparação, 400, 503, 200 sem ID, `contacts.input` divergente, `wa_id` normalizado e timeout.

Registrado em `npm run test:transporte-meta-hml` e `npm run test:mensageria`.

**PENDENTE:** executar os testes no Windows e o build. Não declarar PASS sem capturar o resultado.

## O que esta entrega NÃO altera

- A Edge `mensageria-outbox-hml` **v1** permanece com `simular_lote` apenas. `processar_lote` e `enviar` continuam respondendo `503`.
- O adaptador **não foi importado nem implantado na Edge**. Nenhuma flag nova foi ativada ou secret criado nesta entrega.
- `main`, Vercel de produção e Supabase de produção preservados.
- Nenhum cliente real, agendamento, modelo Meta ou WhatsApp foi acionado.

## Próxima barreira antes do E2E com Meta

- Confirmar template interativo `UTILITY pt_BR` com botões realmente `APPROVED` e permissão da WABA de homologação.
- Publicar uma versão real de agradecimento na HML por ação administrativa explícita, sem ativar envio.
- Criar atendimento fictício de HML vinculado ao convite e habilitar teste somente para o número pessoal aprovado, com autorização específica para exatamente uma mensagem.
- Criar mecanismo de **reconciliação de resultados indeterminados** e estados de webhook; não confiar em ausência de `wamid` para repetir POST.
- Revisar separação de retorno instantâneo versus entrega dependente da Meta. Preparar envio pós-commit assíncrono e confirmar o fluxo completo pelo webhook assinado.
- Homologar concorrência, bloqueios de agenda, pacotes e créditos antes de qualquer plano de produção.

Documentação oficial Meta:

- https://www.postman.com/meta/whatsapp-business-platform/request/8gvd47s/send-text-message
- https://www.postman.com/meta/whatsapp-business-platform/request/73yi2uj/send-reply-to-text-message
