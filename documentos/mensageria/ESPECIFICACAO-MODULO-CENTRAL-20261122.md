# KAZA PET MANAGER — Módulo de Mensageria (produto-alvo)

**Escopo real solicitado pelo proprietário em 22/11/2026.** Substitui a orientação anterior centrada em um botão na ficha do cliente. Documento de especificação e plano: **nenhuma alteração em produção autorizada**.

## Objetivo

Criar **Mensageria** como módulo próprio no menu lateral, integrado à agenda, aos pacotes/contratos, às futuras assinaturas ilimitadas e ao financeiro. O operador cria, edita, versiona, pré-visualiza, aprova e associa modelos de mensagens a eventos. Tags são resolvidas com dados reais da transação. Mensagens de histórico de consumo (usos/banhos, saldo de créditos, ciclo, próximos atendimentos) e agendamentos devem ser suportadas.

### Navegação proposta
- **Mensageria / Visão geral:** volumes, pendências, falhas, confirmações e opt-outs
- **Mensageria / Modelos:** editor com tags pesquisáveis, preview com dados fictícios e por evento, rascunho, publicação/versões e histórico de alterações
- **Mensageria / Automações:** gatilhos, atrasos, janelas de envio, consentimento, regras por serviço/plano e limites; desligadas por padrão
- **Mensageria / Confirmações:** agendamentos aguardando resposta, confirmados, pedidos de remarcação, conflitos e registros de resposta
- **Mensageria / Histórico:** eventos, texto resolvido no instante do envio, destinatário, status de transporte, comprovantes e falhas
- **Mensageria / Configurações:** integrações Meta, templates aprovados, número remetente, perfis de autorização e diagnósticos

## Tags e personalização

Usar o catálogo existente em `public.mensageria_variaveis_catalogo` como fonte de verdade. Identificadas no banco: `NOME_TUTOR`, `NOME_PET`, `DATA_AGENDAMENTO`, `HORARIO_AGENDAMENTO`, `SERVICOS`, `NOME_PACOTE`, `VALOR_CONTRATO`, `HORARIO_FIXO`, `DIA_FIXO`, `NOME_EMPRESA`, entre outras.

Sintaxe visual proposta: `{{NOME_TUTOR}}`; o editor insere pelo clique. O validador deve bloquear tags desconhecidas e contextos inadequados, permitir prévia de dados faltantes e versionar texto/templates. Futuras tags para implementar e mapear às tabelas reais: `BANHOS_UTILIZADOS`, `BANHOS_RESTANTES`, `TOTAL_BANHOS_CICLO`, `DATA_PROXIMO_BANHO`, `DATA_VENCIMENTO_CICLO`, `NOME_PLANO`, `STATUS_ASSINATURA`, `SALDO_CREDITOS`, `HISTORICO_USOS`. **Não fornecer valores estimados como fatos**. Banhos ilimitados exigem métricas de frequência/uso, não saldo fictício.

A configuração deve oferecer mensagem de ativação, lembrete de agendamento, confirmação, remarcação, falta, pet pronto, resumo semanal/mensal de usos, renovação de pacote e assinatura, cobrança e pagamentos — conforme permissões de comunicação e templates aprovados.

## Botões de resposta no WhatsApp: confirmação sem abrir site

Usar **quick reply** de WhatsApp. Mensagem utilitária aprovada pela Meta fora da janela de atendimento de 24h; quando possível, mensagens interativas permitidas dentro da janela. Não confundir botão de URL, que abre o navegador, com resposta rápida.

Fluxo lógico:
1. Novo agendamento `agendado` ou lembrete elegível → criar evento/idempotência, resolver tags e enviar template aprovado com botões `Confirmar` / `Remarcar` (e eventualmente `Cancelar` se houver regra operacional explícita).
2. Persistir associação imutável entre ID da mensagem da Meta, `atendimento_id`, destinatário, versão de modelo e versão do estado do agendamento. O payload opaco identifica uma ação vinculada à mensagem e ao agendamento; **não confiar no título do botão ou no número informado pelo navegador**.
3. Webhook assinado da Meta recebe `interactive.button_reply` ou resposta de botão de template, verifica assinatura, remetente e associação, e registra evento bruto com deduplicação por ID da Meta.
4. Processador autenticado confere vínculo, prazo de resposta, identidade do remetente, agendamento atual e transição admissível; **executa transação no banco** alterando somente `agendado`→`confirmado`, registrando origem `whatsapp_meta` no histórico. Se o agendamento foi remarcado, cancelado, concluído ou já tem outra decisão, não retroceder nem sobrescrever; registrar conflito e avisar operador.
5. A UI da agenda recebe atualização pelo mecanismo de atualização/recarga autorizado e mostra `CONFIRMADO` automaticamente. Se o botão for `Remarcar`, **não alterar horário automaticamente**: criar solicitação pendente e encaminhar à equipe/fluxo de disponibilidade.
6. Respostas repetidas e callbacks fora de ordem não mudam o status novamente. Respostas de WhatsApp Business automáticas ou textos livres não devem ser confundidos com confirmação.

## Evidência já confirmada na produção (somente leitura)

- Tabelas `public.mensageria_modelos`, `mensageria_modelo_versoes`, `mensageria_variaveis_catalogo`, `mensageria_eventos_catalogo`, `mensageria_regras`, `mensageria_eventos`, `mensageria_mensagens`, `mensageria_tentativas`, `mensageria_templates_meta`, `mensageria_preferencias`, `mensageria_webhooks_meta` e `mensageria_webhook_itens_meta`.
- `public.atendimentos.status` aceita `agendado` e `confirmado`.
- `public.atendimento_status_eventos` registra origem, status anterior/novo, horário, responsável, motivo.
- Existem RPCs de transição/status; **reutilizar ou introduzir operação transacional específica**, sem UPDATE direto desprotegido do webhook.
- Eventos do catálogo `NOVO_AGENDAMENTO`, `LEMBRETE_AGENDAMENTO`, `PACOTE_ATIVADO`, `PET_PRONTO` existem, porém constam como reservados e não conectáveis; não ativá-los sem homologação.
- Piloto isolado de envio Meta Cloud API aprovado; não equipará-lo a automações validadas.
- Código operacional local anterior possui arquivos não rastreados de mensageria, que precisam de inventário antes de substituição.

## Segurança e regras

- RLS/ACL, autorização por unidade e função administrativa; operadores comuns não alteram templates críticos.
- Token Meta exclusivamente em Edge Function/secret manager; verificar assinatura do webhook e `phone_number_id`, origem e identidades autorizadas.
- Consentimento e opt-out, horários apropriados, retenção mínima e LGPD; trilha auditável de versão do texto enviado.
- Respeitar política Meta de templates e janela de 24h; novos modelos utilitários e botões devem ser submetidos/aprovados conforme a categoria.
- Idempotência por `message_id`/botão e concorrência transacional, não apenas bloqueio de 60 segundos.
- Eventos sensíveis (pagamento, plano, cancelamento, remarcação) têm tratamento e política próprios.
- Fluxos automáticos desativados até testes completos e autorização explícita. **Não enviar mensagens nem alterar produção nesta fase.**

## Entregas por marcos

1. **Inventário/reconciliação:** ler arquivos locais e tabelas; mapear domínio, colunas/RPC e eventos reais.
2. **Editor e módulo:** navegação Mensageria, CRUD versionado, catálogo de tags e prévia, regras controladas.
3. **Motor e histórico:** resolução de tags por contexto, fila de tentativas, webhooks, políticas de envio.
4. **Confirmação interativa:** templates Meta + callbacks assinados + transação de status `agendado`→`confirmado` + acompanhamento da agenda.
5. **Pacotes e planos:** histórico de banhos, saldo para pacotes limitados, uso e recorrência para assinaturas ilimitadas, resumo automático controlado.
6. **Homologação E2E:** respostas reais `Confirmar`, `Remarcar`, duplicadas, atrasadas e conflitantes; autenticação, consentimento, rollback.
7. **Promoção gradual:** somente mediante autorização separada, migrar componente revisado para versão oficial sem substituir arquivos locais ou builds que não correspondem à branch `main`.

## Critérios de aceite

- Operador cria e edita modelos com tags pela interface, sem editar código.
- Prévia resolve dados por cliente/agendamento/contrato e explica tags faltantes.
- Pode configurar mensagens de usos de pacotes e planos.
- Cliente confirma pelo botão do **próprio WhatsApp**, sem abrir navegador.
- Agenda reflete `CONFIRMADO` automaticamente com trilha de auditoria e nenhuma confirmação indevida.
- Mensagens e reações ficam no histórico; nenhum disparo duplicado ou a destinatário errado.
- Sem alteração silenciosa da produção na implementação.
