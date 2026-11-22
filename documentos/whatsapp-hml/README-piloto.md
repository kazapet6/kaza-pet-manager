# KAZA PET — WhatsApp manual, piloto isolado (22/11/2026)

## Situação e limites

**Este commit é um rascunho para revisão. Não implantar no projeto de produção.**

- Supabase HML: `jgtctzqieyorhvqxjbpk`; produção: `fdnjhnzigveoypdkdwkq`.
- Webhook Meta HML e consumidor HML foram testados anteriormente e funcionam.
- A Cloud API também aceitou e entregou uma mensagem por teste manual privado.
- O novo módulo desta branch **ainda não foi implantado** nem validado por E2E.
- O envio só será permitido se `HML_MANUAL_SEND_ENABLED=true` no **backend HML**, com destino único `HML_TEST_RECIPIENT_E164`.
- Não enviar para clientes comerciais neste piloto. Não habilitar `HML_WEBHOOK_ENABLED`, `HML_CONSUMER_ENABLED` ou `HML_AUTO_CONSUME` automaticamente.

## Interface

A ação **WhatsApp (teste HML)** aparece na ficha do cliente apenas quando:
1. `VITE_SUPABASE_URL` coincide *exatamente* com o projeto HML;
2. `VITE_WHATSAPP_HML_ENABLED=true`;
3. o usuário autenticado tem `app_metadata.whatsapp_admin=true`.

A interface registra a autorização manual do operador e exige confirmação antes de enviar, mostra histórico e distingue **aceito pela Meta** de **entregue/lido**. A entrega só é indicada quando existe evento de status no webhook.

## Backend

Nova Edge Function `enviar-whatsapp-hml` — **não publicar em produção**.

- Autentica cada solicitação via `/auth/v1/user`, verifica `app_metadata.role='internal'` e `whatsapp_admin=true`, UUID exato do operador e RPC que confirma a sessão ativa.
- Obriga correspondência exata com a identidade do projeto HML.
- Nunca aceita telefone arbitrário do navegador: busca o cliente na base HML e compara com destinatário único, configurado no servidor.
- Para mensagens de texto livre, exige evidência de mensagem inbound do destino nas últimas 24 horas (até 100 envelopes recentes) e aplica limitação conservadora de 60 segundos.
- Usa chave idempotente por tentativa, registra estado *reservado*, *aceito*, *falha* ou *indeterminado* no banco HML, armazena apenas SHA-256 do texto e nunca registra token/corpo.
- Consulta os callbacks de status `sent`, `delivered`, `read`, `failed` quando disponíveis. Não confunde HTTP 200 com entrega.
- Se houver falha de rede de resultado incerto, não executa repetição automática.

## Preparação para homologação — requer autorização separada

1. Revisar o script `documentos/whatsapp-hml/sql-setup.sql` e aplicá-lo **exclusivamente** ao projeto HML após aprovação. Ele cria a tabela RLS `public.whatsapp_hml_envios_manuais` acessível somente ao serviço backend.
2. Configurar no projeto HML os segredos privados: `HML_META_ACCESS_TOKEN` (token da Meta válido), `HML_TEST_RECIPIENT_E164` (telefone pessoal autorizado) e `HML_MANUAL_SEND_ENABLED=false` inicialmente. Preservar `HML_PROJECT_REF`, `HML_OPERATOR_UUID` e `HML_META_PHONE_NUMBER_ID` já conhecidos. Não colocar tokens em arquivos versionados nem em variáveis `VITE_`.
3. Publicar exclusivamente a nova função no projeto HML, com **verify_jwt=true**. Confirmar via listagem que a função existe somente na HML. Evitar alterações nas duas funções HML já existentes.
4. Preparar checkout local da branch, copiando `frontend/.env.whatsapp-hml.example` para `frontend/.env.local` e inserindo apenas a chave **publicável** da HML. Nunca apontar a Vercel publicada ao HML.
5. Executar `npm ci` e `npm run build` no checkout local; iniciar `npm run dev`. Acessar uma conta HML de operador. O cliente fictício deve ter o número pessoal de teste permitido.
6. Só durante a janela de teste aprovada, mudar `HML_MANUAL_SEND_ENABLED=true`, testar uma única mensagem dentro das 24h da última mensagem do destinatário, verificar o histórico/Meta, e restaurar `false` logo após.
7. Verificar a ausência de envios para outros destinatários, usuários comuns e projeto de produção; testar repetição com a mesma chave, envio fora da janela de 24h e indisponibilidade do token.

## Testes

`cd frontend && npm run test:whatsapp-hml`

Os testes unitários atualmente cobrem normalização de telefone e validação da mensagem. **Ainda não equivalem** a testes de autenticação, idempotência em concorrência ou E2E de envio pela Meta.

## Requisitos antes de produção

- Credencial persistente e com escopo mínimo do System User da Meta; rotação e armazenamento em secret manager.
- Gestão de consentimento, LGPD, janelas de atendimento, templates aprovados e opt-out.
- Regras de autorização granular, auditoria, controles de volume e testes de concorrência na idempotência.
- Integração aos contratos, modelos e filas de mensageria oficiais já existentes, sem duplicar o motor de produção.
- CI/E2E, revisão de segurança, migrações aprovadas e plano de rollback.
