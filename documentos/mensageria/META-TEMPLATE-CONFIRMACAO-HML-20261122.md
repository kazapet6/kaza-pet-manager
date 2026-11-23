# Meta — template de confirmação da agenda HML (proposta de aprovação)

**Data:** 22/11/2026. Apenas documentação e código preparatório. **Não submetido à Meta, não aprovado, não enviado.**

## Proposta de template

- Nome proposto: `kaza_confirmacao_agendamento_hml`
- Idioma: `pt_BR`
- Categoria pretendida: `UTILITY` (a categoria final é determinada pela Meta)
- Corpo, com quatro parâmetros posicionais:

> Olá, {{1}}! 🐾
>
> O banho de {{2}} está agendado para {{3}} às {{4}} na KAZA PET.
>
> Podemos confirmar esse horário?

- Exemplos de variáveis: `{{1}}=Mariana` (tutora), `{{2}}=Thor` (pet), `{{3}}=24/11/2026` (data), `{{4}}=09:00` (horário).
- Botão **Quick Reply 0:** `Confirmar`
- Botão **Quick Reply 1:** `Remarcar`
- Sem botão URL; o portal de remarcação/cancelamento permanece projeto independente e futuro.

O arquivo `supabase/functions/mensageria-confirmacao-hml/solicitacaoTemplateMeta.ts` gera o objeto de configuração para revisão/submissão. O arquivo `templateConfirmacao.ts` monta **separadamente** a mensagem de envio no formato `components` da Cloud API com `sub_type='quick_reply'`, `index='0'/'1'` e parâmetros `type='payload'` diferentes e aleatórios.

Referências técnicas:
- https://developers.facebook.com/docs/whatsapp/api/messages/message-templates/interactive-message-templates/
- https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/message_templates/
- https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/types/component_object/

## Motor de convite de teste sem chamadas externas

`orquestradorConviteHml.ts` contém a orquestração **pura e injetável**, ainda **não importada em nenhuma Edge publicada**:

1. Exige projeto HML exato, habilitação de envio explícita e validade de autorização de até 3 minutos; antes disso, zero operações de banco ou Meta.
2. Exige destinatário exato de allowlist, template configurado e validação de parâmetros de corpo; em produção futura o contexto deve vir de RPC autoritativa com confirmação de aprovação do template.
3. Gera dois tokens aleatórios diferentes e seus hashes.
4. Reserva no banco via RPC `preparar_convite`.
5. **Somente depois da reserva** chama transporte Meta injetado. Após HTTP 2xx com identificador `wamid` válido, vincula a resposta à reserva.
6. Se houver recusa HTTP 4xx explícita, tenta encerrar preparo. Se houver erro de rede, timeout, 5xx, identificador de resposta ausente ou falha do banco pós-aceite, retorna estado `indeterminado` ou `aceito_sem_vinculo` e **não repete o envio** automaticamente.
7. Preparos repetidos nunca geram um segundo POST à Meta.

O código ainda não fornece mecanismo de **recuperação durável** em caso de aceite Meta com falha de persistência posterior; esta reconciliação, junto com consulta do status de aprovação do template real, é **pré-requisito** para qualquer teste de envio real. Não habilitar flags até estar concluída.

### O que falta para aprovação e teste real

- Verificar no Gerenciador do WhatsApp da HML se há WABA compatível e permissão de administração de templates (a leitura do WABA esteve restrita em etapas anteriores).
- Submeter o template utilitário acima à Meta e esperar status `APPROVED` com idioma `pt_BR` e ambos os botões na ordem correta. O nome proposto pode ser ajustado antes da submissão; nunca presumir aprovação.
- Registrar modelo/versão e template Meta aprovado no catálogo HML. Os rascunhos atuais não são mensagens automaticamente publicadas.
- Criar agendamento fictício persistente na HML para o pet de teste, destinatário restrito por `HML_TEST_RECIPIENT_E164`.
- Implantar novo serviço de envio, com chaves de ativação de curta duração, idempotência, bloqueio de repetições, reconciliação de POST aceito sem vínculo, auditoria e limite de destinatário.
- Com autorização específica do operador: envio único ao número pessoal de teste, clique real no WhatsApp, webhook com HMAC validado, atualização `agendado→confirmado`, geração de outbox e resposta de agradecimento.
- Ensaiar crédito de pacote e cancelamento/remarcação com eventual portal futuro.

### Limites atuais

Todos os testes do orquestrador são com **fakes**, sem chamadas de rede. A suíte foi adicionada à `npm run test:mensageria`, mas precisa ser validada no worktree Windows.

Nenhum template foi criado na Meta, nenhuma API de envio real foi acionada e nenhuma alteração ocorreu no GitHub `main`, Supabase de produção ou Vercel oficial.
