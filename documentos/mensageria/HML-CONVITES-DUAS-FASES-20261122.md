# HML — convite de confirmação em duas fases (22/11/2026)

## O problema resolvido

A Mensageria não pode ativar um botão de confirmação enquanto não souber qual mensagem a Meta aceitou. Tampouco deve perder o vínculo entre os hashes dos botões e o `wamid` se a API da Meta falhar ou for repetida.

### Contrato implementado (somente no Supabase HML)

1. **`mensageria_hml_preparar_convite`** reserva o convite exclusivamente para um agendamento fictício `CLI-990003`, depois de verificar `agendado`, snapshots de horário, vínculo de tutor/pet/unidade e operador admin; associa UUID de idempotência e dois SHA-256 diferentes (`Confirmar` e `Remarcar`). Preparo expira em 10 minutos. Não aceita telefone livre.
2. **Envio Meta futuro (NÃO IMPLEMENTADO neste incremento):** Edge Function de backend deverá consultar template utilitário aprovado, gerar tokens e enviar exclusivamente ao número do teste autorizado. O envio só poderá ocorrer mediante autorização de teste. Se Meta recusar, chamar abandono; se aceitar, usar `wamid` da resposta.
3. **`mensageria_hml_vincular_convite_aceito`** vincula `wamid` ao preparo, repete validação do status e snapshots e torna o convite **ativo**. Validade no máximo 24 horas e anterior ao horário do atendimento. Repetição de mesmo ID é idempotente; `wamid` divergente é conflito.
4. **`mensageria_hml_abandonar_preparo`** encerra apenas preparo não vinculado; não permite abandonar convite já ativo para contornar regras de idempotência.
5. **`mensageria_hml_processar_confirmacao`** (já existente) recebe exclusivamente clique de webhook assinado e persistido, verifica token SHA-256 + `context.id` do `wamid`, telefone/escopo, altera `agendado→confirmado` transacionalmente ou cria pedido de remarcação e evento na outbox. Nunca envia Meta nessa transação.

### Segurança

- As três RPCs novas são `SECURITY DEFINER`, com `EXECUTE` concedido **somente ao `service_role`** e checagem adicional da identidade administrativa `auth.users.raw_app_meta_data`. O navegador, `anon` e `authenticated` não têm execução.
- Preparação restrita ao cadastro **fictício** `CLI-990003`. A futura Edge também deverá comparar o número recebido do banco com `HML_TEST_RECIPIENT_E164` no secret manager antes de qualquer POST externo.
- Meta WABA e Phone Number ID limitados à configuração de teste HML; não há API pública para registrar convite ou fornecer `wamid` arbitrário.
- Tokens brutos **não** são persistidos; somente hashes. Retry de envio e caso de resultado HTTP incerto ainda exigem política de recuperação antes do primeiro teste real com template.
- Índice exclusivo por atendimento `where estado in ('preparado','ativo')` impede dois convites simultâneos. Reservas vencidas são encerradas quando se prepara novo convite.
- Não habilita processamento de cliques nem envio automático, e não introduz nova rota pública nesta etapa.

### Evidência dos testes

Migração `20261122233000_mensageria_hml_convites_duas_fases.sql` executada inicialmente em `BEGIN/ROLLBACK` e com fixture fictícia, depois instalada **somente na HML**. Após instalação, arquivo `supabase/testes/hml_convite_preparar_e_vincular_rollback.sql` executado em transação reversível:

| Cenário | Resultado esperado e observado |
|---|---|
| Preparar convite | `preparado` |
| Repetir com mesma chave e hashes | `ja_preparado` |
| Reutilizar chave alterando hash | `conflito` |
| Preparar outro convite enquanto um está ativo | `conflito` |
| Vincular `wamid` fictício à reserva | `vinculado` |
| Repetir `wamid` idêntico | `ja_vinculado` |
| Vincular `wamid` diferente | `conflito` |
| Abandonar convite já ativo | `rejeitado` |

Consultas pós-`ROLLBACK`: 0 convites, 0 hashes de convite, 0 agradecimentos em fila, 0 agendamentos; role `authenticated` não pode executar as novas RPCs.

**Não é teste pela Meta real:** não houve template aprovado, nenhum POST Graph API, nenhum clique de WhatsApp e nenhum cliente real envolvido.

## Próximos passos

- Ligação da Edge de backend ao ciclo preparo → Graph API (com template realmente aprovado e destinatário allowlisted) → `wamid` → vínculo; proteger contra aceite da Meta com resultado SQL incerto e vazamento de tokens.
- Rotear evento de clique do webhook HMAC validado até a RPC `mensageria_hml_processar_confirmacao`; ativar somente em homologação controlada.
- Consumir outbox após commit para resposta imediata de agradecimento na mesma conversa; idempotência da Meta e retries.
- Testes com agendamentos de pacotes/créditos, concorrência, alteração de horário e cancelamento.
- Disponibilizar atualização automática dos cards da agenda; remarcação por portal será etapa independente.

**O portal autônomo de remarcação e o Financeiro não bloqueiam esta integração.**
