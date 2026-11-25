# Mensageria HML — resposta pós-confirmação (incremento de 22/11/2026)

**Escopo:** somente código preparatório na branch HML. Não envia WhatsApp, não publica template, não ativa automações e não altera produção.

## Regra de negócio

Ao clicar em **Confirmar** num template interativo Meta:
1. Webhook Meta validado por HMAC e armazenado na inbox.
2. Identificar convite/atendimento usando `wamid` original, token SHA-256, remetente, WABA/phone_id e prazo de validade.
3. Confirmar `agendado → confirmado` com regras da agenda e audit trail em uma transação.
4. Criar **uma única linha na outbox na mesma transação**.
5. **Após o commit**, consultar agenda/tutor/pet atuais, modelo publicado e a última resposta de botão validada.
6. Preparar mensagem personalizada com tags `{{NOME_TUTOR}}`, `{{NOME_PET}}`, `{{DATA_AGENDAMENTO}}`, `{{HORARIO_AGENDAMENTO}}` e `{{NOME_EMPRESA}}`, preenchidas exclusivamente no backend.
7. Enviar texto na **mesma conversa**; o corpo Cloud API leva `context.message_id` do clique recebido, após validar a janela de atendimento de 24h, com margem operacional de segurança.
8. Registrar identificador Meta da resposta e status de entrega; em timeout ou aceite sem registro, **não reenviar automaticamente**, exigir reconciliação.

Ao clicar em **Remarcar**, registrar solicitação sem alterar horário. Uma resposta opcional na mesma conversa informa que a equipe ajudará. Link individual de remarcação/cancelamento e `{{LINK_REMARCACAO}}` ficam desabilitados até existir portal de autoatendimento externo.

## Novo código

- `respostaOutboxHml.ts`: constrói `type:'text'` e `context.message_id` com tags e dados de agenda, verificando:
  - modelo **publicado** e validado (não rascunho local);
  - status efetivo `confirmado` + convite confirmado para agradecimento;
  - status `agendado` + pedido de remarcação para resposta alternativa;
  - horário futuro e **idêntico ao snapshot** do convite;
  - remetente correspondente ao destinatário, identificador de mensagem Meta e janela de 24h;
  - tags desconhecidas, data, tamanho e URL de remarcação ainda inexistente.
- `orquestradorRespostaOutboxHml.ts`: orquestra somente operações **injetadas/mocks**, com autorização HML e janela de envio de curta duração; exige reserva idempotente, revalida autorização antes da chamada Meta e trata resposta indeterminada sem reenvio.
- Testes Node `testesRespostaOutboxHml.ts` e `testesOrquestradorRespostaOutboxHml.ts`, incluídos em `npm run test:mensageria`.

## Limites importantes

**Não confundir código preparado com E2E funcionando:** essas rotinas **ainda não foram ligadas à Edge Function** nem ao banco de modelos publicados. A outbox atualmente tem estado `aguardando_integracao` e não possui lease/reserva durável. A implementação destas operações em RPC auditável com controle de concorrência, registro de aceite Meta e reconciliação é **obrigatória** antes de habilitar qualquer envio.

Não há modelo aprovado na Meta, nem publicação de rascunho no catálogo autoritativo. A chamada de transporte das suítes é inteiramente simulada. Os testes Node novos ainda precisam ser executados no worktree Windows antes de reportar PASS.

A Meta permite respostas de texto livres durante a janela de atendimento aberta por mensagens do cliente; a própria Cloud API valida essa janela. Não prometer entrega instantânea se houver indisponibilidade Meta, falha de banco ou janela fechada.

Referências:
- https://www.postman.com/meta/whatsapp-business-platform/request/73yi2uj/send-reply-to-text-message
- https://developers.facebook.com/docs/whatsapp/api/messages/message-templates/interactive-message-templates/

## Próximo marco

1. Validação local de testes e build.
2. Criar versionamento/publicação do modelo aprovado de agradecimento em HML.
3. RPC de reserva, conclusão e estado indeterminado da outbox; recuperar aceite Meta sem duplicar envio.
4. Implantar Edge de envio da outbox com `HML_*_SEND_ENABLED=false` e destinatário limitado; executar E2E ao número pessoal de teste apenas com autorização explícita.
5. Verificação de template Meta de convite e, quando possível, E2E com botão real, webhook assinado, agenda e agradecimento.
6. Homologar pacotes e contratos com créditos, indisponibilidade Meta e concorrência antes de produção.
