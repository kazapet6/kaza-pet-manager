# Central de Mensageria HML — motor de confirmação e diagnóstico (22/11/2026)

## Entregue neste incremento

- SQL em `supabase/migrations/20261122230000_mensageria_hml_diagnostico_confirmacoes.sql` adiciona RPC **somente agregada** `mensageria_hml_diagnostico_confirmacoes(p_operador)`.
- A RPC só tem `EXECUTE` concedido a `service_role`; funcionários e anônimos continuam sem acesso direto. Validado em banco com identidade administrativa e papel de serviço. Não retorna nomes, telefones, payloads ou tokens.
- Edge Function exclusiva `mensageria-confirmacao-hml`, versão inicial 1, `verify_jwt=true`, publicada **somente** em `jgtctzqieyorhvqxjbpk`.
- A função confere projeto exato, sessão JWT, ID administrativo autorizado e RPC de autorização em HML. A ação `diagnostico` lê apenas contadores.
- A ação `processar_item` só pode rodar com `HML_CONFIRMATION_PROCESSOR_ENABLED=true` **explicitamente configurado** no servidor, após autorização; nenhum segredo foi habilitado neste incremento.
- Nova aba **Confirmações** no frontend da Central de Mensageria HML; exibe agendamentos, convites, confirmações, cliques, remarcações, respostas pendentes e templates cadastrados, com mensagem de ausência de conexão Meta. Sem botão de disparo ou execução de processamento.
- Em `templateConfirmacao.ts`, função **pura** e apenas de backend monta a estrutura para envio de template utilitário com dois botões quick reply (índices 0 e 1), gera tokens UUID diferentes com prefixo `KPAG1_` e dois hashes SHA-256. O destinatário precisa coincidir com a allowlist fornecida pelo backend. **Não chama a Meta, não registra convite e não envia mensagens.**
- Testes Node adicionados à suíte `npm run test:mensageria`: pré-voo CORS, negação de acesso, flag off, papel de administrador, modo explicitamente habilitado com RPC falsa e construção de template com tokens distintos.

## Estado verificado no banco após a instalação

- Agendamentos HML: 0
- Convites HML: 0
- Cliques processados: 0
- Agradecimentos aguardando integração: 0
- Templates Meta cadastrados em HML: 0
- Envios manuais históricos do piloto: 1 (inalterado)

A função de diagnóstico rodou com `service_role` e retornou `status=ok` e contadores zero; uma identidade inexistente recebeu `nao_autorizado`. `anon` e `authenticated` não têm autorização para executar a RPC.

## Limites de verificação

- A nova interface e os novos testes Node **ainda precisam de build e validação funcional no worktree Windows**. A versão anterior do build passou antes deste incremento.
- A nova Edge ficou `ACTIVE` após deploy, mas **a autenticação e o diagnóstico pela interface ainda precisam ser validados por uma sessão real do administrador**.
- Não existe template Meta aprovado cadastrado para este fluxo na HML. O nome `confirmacao_agendamento_kaza` dos testes é exemplo e não foi submetido à Meta.
- Não foi implementada a expedição efetiva dos convites, associação do `wamid` da mensagem enviada, roteamento automático pelo consumidor assinado, despacho da outbox ou atualização em tempo real da agenda.
- O teste transacional anterior de `Confirmar`/`Remarcar` foi sintético com webhook marcado como validado dentro de `BEGIN/ROLLBACK`; não equivale a teste criptográfico com HMAC real nem a clique real no WhatsApp.
- A homologação de pacotes com créditos e concorrência entre cliques ainda está pendente.
- **Nenhuma mensagem WhatsApp real foi enviada nesta entrega**, nenhuma automação foi ligada, nenhuma alteração no Supabase produção, `main` ou na Vercel oficial.

## Próxima cadeia de implementação

1. Homologar um **template utilitário interativo aprovado pela Meta** (texto de confirmação + botões Confirmar e Remarcar), respeitando variáveis de corpo e nome aprovados.
2. Construir envio controlado (somente destinatário autorizado) com registro do convite, tokens em hash, associação ao `wamid` retornado pela Meta e vínculo ao atendimento/cliente.
3. Encadear callback HMAC real → `mensageria_webhook_itens_meta` → `mensageria_hml_processar_confirmacao` com reprocessamento idempotente.
4. Implementar consumer seguro para `mensageria_hml_respostas_outbox` com confirmação pós-commit, controle de janela de 24h, retries e status, sem falsa confirmação em erro.
5. Testar cliques reais, cancelamentos, remarcação pendente, crédito de pacote, convites expirados e duplicatas. Habilitar passo a passo e nunca em produção sem autorização.
6. Portal externo para remarcar/cancelar **futuro e não bloqueante**.

## Como validar no Windows

No worktree isolado `KAZA-PET-WHATSAPP-HML`, buscar e atualizar a branch `feature/mensageria-central-20261122` sem remover `frontend/supabase/`. Em `frontend`:

```powershell
npm.cmd run test:mensageria
npm.cmd run test:whatsapp-hml
npm.cmd run build
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Abrir a aba **Confirmações** e clicar em **Atualizar**. Esperado: todos os contadores 0, processamento bloqueado e envios automáticos bloqueados.
