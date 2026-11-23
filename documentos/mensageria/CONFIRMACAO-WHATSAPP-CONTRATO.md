# Confirmação de agendamento no próprio WhatsApp — contrato técnico V1

**Escopo:** homologação isolada. Não há envio de template, alteração de status ou publicação na produção nesta fase.

## O que já foi implementado nesta branch

- Parser puro em `frontend/src/mensageria/confirmacaoWhatsapp.ts` e testes em `testesConfirmacaoWhatsapp.ts`.
- Recebe ambos os tipos de resposta da Meta:
  - **template quick reply**: `messages[].type='button'` e `button.payload`;
  - **interactive button reply**: `messages[].type='interactive'` e `interactive.button_reply.id`.
- **Exige** WABA ID e Phone Number ID esperados, `message.id` recebido, `from` válido, `context.id` da mensagem original e token opaco `KPAG1_<uuid>`.
- Ignora texto livre ("Confirmar"), títulos de botão e respostas de origem não correspondente.
- Deduplica `message.id` dentro do próprio lote. O banco deverá fazer dedupe global entre webhooks/retries.
- Regra pura: `agendado` + `confirmar` → `confirmado`; `agendado` + `remarcar` → solicitação pendente **sem mudar horário/status**; demais estados → conflito.

## Arquitetura necessária para conectar ao KAZA PET MANAGER

`mensageria_eventos` (agendamento) → `mensageria_regras/modelo_versoes` → template Meta aprovado com quick replies → `mensageria_mensagens` / envio → correspondência segura na tabela de ações → webhook assinado → inbox idempotente → processador → transação de confirmação → `atendimento_status_eventos` → agenda atualizada.

### Dados a persistir ANTES do envio

- `atendimento_id`, `cliente_id`, `pet_id`, unidade, identificador de versão do agendamento, início previsto;
- destino Meta e variantes brasileiras verificadas, `phone_number_id`, ID da mensagem outbound `wamid`;
- para **cada botão**, token UUID opaco aleatório individual; guardar somente seu hash, tipo de ação, validade e estado;
- modelo/template e versão Meta efetivamente enviados, idempotency key e consentimento;
- associação de cada ação com **uma mensagem outbound específica**, para evitar confirmar um agendamento diferente.

### Condições obrigatórias antes de alterar a agenda

1. Assinatura HMAC do webhook validada contra corpo bruto (já existente no receptor); escopo WABA/número da empresa exato.
2. Resposta `type=button` ou `interactive.button_reply`, nunca texto livre.
3. Token e `context.id` correspondem a **um** convite ativo e não expirado, com destinatário correspondente.
4. `message.id` do clique novo ou reaproveitado idempotentemente; não duplicar eventos mesmo com entregas repetidas.
5. O agendamento pertence ao convite, a data/horário não mudaram e `status='agendado'`.
6. Aplicar mudança em transação/lock serializado e registrar `origem='whatsapp_meta'` em `atendimento_status_eventos`, respeitando regras de créditos dos contratos existentes. Reutilizar fluxo de status existente quando seguro; **não executar UPDATE cego**.
7. Resposta a convite antigo, após remarcação ou cancelamento, vira conflito, sem alterar agenda.
8. Em `Remarcar`, abrir solicitação visível à equipe; somente operação autorizada do motor de disponibilidade pode efetivar mudança.
9. Não enviar mensagens ou ativar flags a partir da simples resposta do cliente; automações são uma etapa separada.

### Retorno imediato na mesma conversa (requisito 22/11/2026)

**CONFIRMAR:** somente depois de a transação alterar efetivamente `agendado → confirmado` e registrar auditoria, o backend deve **enfileirar no mesmo commit** uma única resposta de agradecimento, por exemplo:

> Perfeito, {{NOME_TUTOR}}! 💚🐾 O horário de {{NOME_PET}} está confirmado para {{DATA_AGENDAMENTO}} às {{HORARIO_AGENDAMENTO}}. Obrigado por confirmar! — {{NOME_EMPRESA}}

- Usar o modelo **AGENDAMENTO_CONFIRMADO_WHATSAPP** do editor, que é editável pelo administrador e versionado. O corpo precisa usar valores do agendamento confirmado, não dados fornecidos pelo clique. O envelope deve correlacionar o chat por `wa_id` e, quando suportado, `context.message_id` para responder na mesma conversa.
- Processador da outbox tenta enviar logo após o commit e registra sucesso, falha, entrega e retry. **Envio rápido é objetivo, não garantia de latência zero**; o cliente não deve ver confirmação falsa se o banco falhar. Se a Meta falhar após o commit, não reverter o agendamento: manter `confirmado`, enfileirar retry e deixar alerta operacional.
- Chave de idempotência imutável por convite/decisão confirmada. Duplicatas de webhook, reprocessamento, respostas tardias e cliques repetidos **não** produzem um segundo agradecimento. Se o estado for conflito, não enviar texto dizendo que o horário está confirmado.
- Um clique em quick reply é mensagem de entrada do cliente e normalmente abre janela de atendimento de 24 horas para resposta de texto livre; o envio deve validar a janela e seguir a política vigente da Meta. Fora da janela, exige template adequado aprovado.

**REMARCAR:** o portal de agendamento autônomo **é um projeto futuro e não bloqueia Mensageria**. Regra provisória: um clique válido registra **solicitação de remarcação**, sem alterar data/horário, e responde no mesmo chat com o modelo **REMARCACAO_SOLICITADA_WHATSAPP**, por exemplo:

> Recebemos seu pedido para remarcar o atendimento de {{NOME_PET}}. Nossa equipe vai ajudar você a escolher outro horário. O agendamento atual ainda não foi alterado. 💚

- O futuro evento de remarcação, quando o portal estiver pronto, deverá incluir **link externo individual, HTTPS, assinado, de curta duração e vinculado ao agendamento**. A URL será gerada somente pelo backend, validada por domínio configurado e poderá permitir **remarcar ou cancelar** mediante as regras de disponibilidade, TaxiDog, créditos e contratos. Sem portal ou URL válida, **não exibir link falso ou quebrado**.
- A futura tag `{{LINK_REMARCACAO}}` está marcada como *indisponível* no editor enquanto o portal não existir. Não gerar URL genérica nem permitir que o frontend informe URL arbitrária ao servidor.
- Uma solicitação de remarcação não significa desmarcação/cancelamento; a confirmação do novo horário exigirá transação própria e notificações adicionais.

**Estado em código (primeira fase):** `respostaAoCliqueWhatsapp.ts` implementa **somente a decisão pura** de qual evento de retorno será permitido. `testesRespostaAoCliqueWhatsapp.ts` valida a proibição de retorno antes do commit, em falhas/conflitos/duplicatas, e a exigência de link HTTPS autorizado quando o autoatendimento estiver habilitado. **Ainda não existe dispatcher/outbox conectado à Meta ou confirmação transacional funcionando de ponta a ponta.**

## Verificações ao conectar o ambiente HML

- O banco HML possui tabela `atendimentos`, mas a consulta de 22/11/2026 retornou **0 agendamentos**. Criar apenas atendimento fictício e isolado de teste, vinculado ao número de teste autorizado.
- `service_role` não possui SELECT/UPDATE diretamente nas tabelas de agenda; manter controle por RPC restrita que encapsule a transição.
- Não ampliar GRANT para `anon` ou `authenticated` e não reutilizar a RPC administrativa do editor para alterações de agenda.
- O webhook existente armazena callbacks, mas o consumidor ainda precisa do roteamento explícito para a ação e de autorização de processamento para teste.
- A atualização visual da agenda deverá ser automática (evento Realtime autorizado ou reconsulta), sem recarregar manualmente.

## Cenários de aceitação

1. Clique legítimo Confirmar: `agendado` → `confirmado` uma vez, com histórico.
2. Remarcar: gera solicitação pendente, horário inalterado.
3. Clique repetido/evento redelivery: zero alterações adicionais.
4. Mensagem diferente, destino diferente, WABA diferente, telefone diferente, token falso: nenhum status alterado.
5. Convite vencido: não confirma.
6. Agendamento já remarcado, concluído, cancelado ou faltou: conflito e trilha de auditoria.
7. Dois eventos concorrentes de ações diferentes: uma decisão e registro da outra como conflito.
8. API/DB fora do ar: efeito pendente, reprocessamento idempotente, nenhum falso CONFIRMADO.
9. Botões disponíveis no WhatsApp do cliente e **sem abrir URL**.
10. Contagem de agendamentos/pacotes/créditos permaneça consistente após confirmação.

## Estado da integração

O **parser e as regras de transição pura** estão codificados, mas **não estão ligados ao webhook real**. Não há template interativo aprovado/produzido aqui, nem registro de ação vinculada, nem transação automática em produção. Esta distinção é obrigatória ao reportar o PASS dos testes.
