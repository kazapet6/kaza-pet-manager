# KAZA PET — Outbox durável de agradecimentos (HML)

**Validação: 22/11/2026 — somente projeto Supabase HML `jgtctzqieyorhvqxjbpk`.**

## Objetivo

Depois que o cliente tocar em **Confirmar**, a agenda precisa ser confirmada por transação e criar **um único evento de agradecimento**. O envio deve acontecer em uma etapa **posterior ao commit**, com modelo publicado e controle idempotente. O objetivo é responder rapidamente na mesma conversa, mas não declarar entregue só porque a Meta aceitou o HTTP.

O portal de remarcação e o Financeiro não bloqueiam essa etapa.

## Estrutura implantada (não envia nada)

Migração: `supabase/migrations/20261122235000_mensageria_hml_outbox_duravel.sql`.

- `public.mensageria_hml_respostas_outbox.modelo_versao_id` vincula versão de modelo que só pode estar **publicada** no catálogo, pertencente ao evento de agradecimento e ativa.
- Novos estados da outbox: `pronto`, `reservado`, `aceito_meta`, `recusado_meta`, `indeterminado`, preservando os estados históricos.
- Tabela `mensageria_hml_respostas_tentativas`: **uma linha por outbox**, índice único em `outbox_id` e em chave de idempotência, estado auditável, identificador Meta e código de resultado. Não armazena corpo/segredo do WhatsApp.
- RPC `mensageria_hml_outbox_preparar`: exige modelo realmente publicado, não um rascunho, valida atendimento/convite confirmados e dados da agenda. O evento de remarcação não pode ser ativado por esta função ainda.
- RPC `mensageria_hml_outbox_reservar`: exige outbox `pronto`, modelo publicado, status ainda confirmado, horário imutável e clique recente. Reserva única sob lock da linha. Não aceita uma segunda tentativa, inclusive se a primeira acabou em timeout ou erro.
- RPC `mensageria_hml_outbox_finalizar`: registra aceite `wamid`, recusa categorizada ou resultado indeterminado. Retry de finalização **igual** é idempotente; tentativa de alterar um estado terminal retorna conflito.
- Todas as novas RPCs são `SECURITY DEFINER` com `EXECUTE` exclusivo `service_role` e identidade administrativa conferida em `app_metadata`. Nenhuma nova permissão direta à tabela para navegador ou backend.

## Testes executados

Três fixtures em `supabase/testes/`, todas com transação e `ROLLBACK`, foram executadas antes e depois da migração:

- `hml_outbox_reserva_e_aceite_rollback.sql` — 16 PASS, incluindo bloqueio de rascunhos, publicação fictícia, autorização, reserva, `wamid` válido e idempotência.
- `hml_outbox_indeterminado_rollback.sql` — 16 PASS, inclusive timeout/resultado indeterminado e proibição de reenvio.
- `hml_outbox_recusado_meta_rollback.sql` — 16 PASS, inclusive recusa explícita e proteção de encerramento.

Esses testes simulam o recebimento Meta e a publicação do modelo **dentro da transação SQL**. Não executam um teste real HMAC/Meta. Depois do rollback: nenhuma agenda, convite, outbox, tentativa ou publicação de teste persistiu.

O modelo real de agradecimento **ainda não foi publicado**, e os convites com botões não foram aprovados na Meta.

## Visibilidade administrativa

Migração `20261122235500_mensageria_hml_diagnostico_outbox.sql` estende a RPC agregada de diagnóstico. A Edge `mensageria-confirmacao-hml` v3 publica contadores **somente para admin autenticado**, sem telefones nem payloads. A aba **Confirmações** exibe:

- aguardando modelo, pronto, reservado;
- aceito pela Meta **não significa entregue**;
- recusado e resultado indeterminado, que exigem verificação antes de qualquer reenvio.

A nova aba ainda precisa ser validada no navegador Windows após atualizar a branch e executar os testes/build. A Edge v3 está `ACTIVE`, `verify_jwt=true`, código idêntico à branch HML. O processamento de cliques e o envio automático continuam **desabilitados**.

## Limites operacionais

- Não existe consumer de outbox conectado à Cloud API nesta entrega; o orquestrador TypeScript foi testado apenas com transporte simulado.
- Não existe recuperação automática de aceite da Meta se houver falha antes de persistir seu `wamid`. A tentativa indeterminada **não é reenviada**; exige reconciliação via evidências confiáveis.
- A reserva SQL oferece garantias de **no máximo uma tentativa de início por outbox**. Não promete *exactly-once delivery* da Meta.
- Ainda precisam ser verificados template APPROVED, vínculo a agendamento fictício persistido, clique real assinado, janela Meta, status de entrega, pacote com créditos, concorrência e falhas de rede.

**Sem disparos reais nesta etapa. Não mesclar no `main`, não alterar produção e não habilitar flags sem autorização explícita.**
