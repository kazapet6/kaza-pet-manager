# KAZA PET — Orquestrador de despacho do agradecimento (HML)
**Data:** 23/11/2026. **Escopo:** somente código versionado na branch `feature/mensageria-central-20261122`; **não conectado à Edge publicada, não executado contra a Meta.**

## Passagem de responsabilidade entre componentes

O simulador do painel HML passou no navegador: `Simular fila (sem enviar)` consultou a RPC e mostrou **zero agradecimentos elegíveis**, sem reservar nem alterar registros.

O incremento seguinte introduziu `supabase/functions/mensageria-outbox-hml/orquestradorDespachoHml.ts`, uma função pura/injetável que prepara a passagem para o transporte Meta sem fazer ela própria qualquer chamada externa.

Fluxo do orquestrador quando futuramente autorizado:

1. Exige projeto HML exato, operador válido, destinatário obtido de secret do servidor e autorização ativa com validade curta de no máximo 3 minutos. Se não houver autorização, não consulta nem reserva nada.
2. Usa a RPC `mensageria_hml_outbox_listar_pendentes` para obter no máximo **um** UUID por execução.
3. Gera chave idempotente e reserva com a RPC `mensageria_hml_outbox_reservar`. `ja_reservado` ou `nao_pronto` encerram o fluxo sem POST ou retry.
4. Depois da reserva, chama `mensageria_hml_outbox_contexto` pelo adaptador `montarRespostaDaOutbox`, validando clique inbound já assinado, janela calculada pelo timestamp do cliente, modelo publicado, agenda confirmada, dados do tutor/pet e allowlist. Os dados não podem vir do navegador.
5. Revalida autorização e destinatário **antes** de invocar um transporte `enviar` injetado.
6. Transporte 2xx com `wamid` inequívoco: tenta registrar `aceito_meta`. **Aceito pela Meta não é comprovante de entrega.**
7. HTTP 4xx explícito: registra recusa. Timeout, 5xx, 2xx sem `wamid` ou resposta inválida: registra estado indeterminado e **não envia novamente**. Se o banco falhar ao registrar aceite, o resultado é `aceito_sem_registro`, exigindo reconciliação antes de qualquer nova tentativa.
8. O módulo não cria cron, não lê token Meta, não usa `fetch`, não acrescenta rota pública e **não foi incluído no deploy `mensageria-outbox-hml` v1**.

## Testes de código

- `testesOrquestradorDespachoHml.ts` executa somente funções fake para simular seleção, reserva, contexto, transporte e conclusão. Nenhum token ou número real de cliente é usado nos mocks.
- Testa caminho completo fictício e rejeições: flag desligada, outro projeto, sessão expirada, destino divergente, fila vazia, reserva duplicada, agenda cancelada, timeout, 4xx, 5xx, `wamid` ausente/inválido, aceite sem registro e autorização que expira antes do POST.
- Adicionado `npm run test:outbox-orquestracao-hml` à suíte `npm run test:mensageria`.
- **PENDENTE:** rodar a suíte e o build no worktree isolado Windows e corrigir eventuais erros. Não declarar PASS antes do terminal mostrar os resultados.

## Limites e próximos requisitos

- A Edge em execução **continua somente leitura**, com as ações `enviar` e `processar_lote` bloqueadas incondicionalmente. Este orquestrador está **somente no GitHub**.
- Para homologar o envio real, o backend terá de implementar adaptadores das RPCs restritas, autorização temporária derivada do servidor, fonte autoritativa para `HML_TEST_RECIPIENT_E164`, transporte Meta exclusivamente para o phone id de teste e reconciliação durable em caso de resposta incerta.
- É necessário aprovar o template interativo de convite na WABA, publicar explicitamente modelo de agradecimento e testar clique real assinado com agendamento fictício persistente.
- O Financeiro e o portal de autoagendamento/remarcação são futuros e **não bloqueiam** a homologação desse fluxo.
- **Produção intocada**: não mesclar o PR, não publicar na Vercel e não habilitar flags de envio sem autorização separada.
