# Próximo marco: WhatsApp na ficha real de clientes (KAZA PET MANAGER)

Data: 22/11/2026. Documento de integração; **não autoriza implantação em produção**.

## O que está validado

- Piloto de homologação: Meta Cloud API aceitou uma mensagem enviada por clique no aplicativo local, e o destinatário confirmou recebimento.
- Supabase HML `jgtctzqieyorhvqxjbpk`: `whatsapp_hml_envios_manuais` contém **1** tentativa aceita, com message ID registrado e cliente fictício `CLI-990003`.
- Teste restrito ao telefone pessoal autorizado, sem disparo para clientes reais.
- Não há evento de status de entrega associado ao teste no banco HML até a conferência desta etapa; não rotular como entregue pelo webhook.
- Servidor HML possui check de sessão administrativa, destinatário único, janela de 24h e autorização de curta duração; índice exclusivo do piloto impede múltiplos envios reservados/aceitos/indeterminados ao mesmo telefone.
- A função `enviar-whatsapp-hml` não existe no Supabase de produção `fdnjhnzigveoypdkdwkq`.
- A versão Vercel oficial consultada foi gerada por **CLI** (não assumir equivalência com GitHub `main`).

## Impedimento de integração direta

O diretório local original do operador `KAZA-PET-MANAGER` tem arquivos **não rastreados** que não estão neste GitHub, entre eles:
- `frontend/src/mensageria/`
- `supabase/functions/webhook-whatsapp/`
- `supabase/functions/_shared/`
- `supabase/functions/renovar-contrato/`
- scripts de migração e validação de mensageria.

Não sobrescrever os arquivos locais nem presumir que estão obsoletos. Obter **primeiro somente uma listagem de nomes de arquivos**, sem conteúdo ou tokens. Depois examinar funções existentes, contratos do banco e arquitetura antes de propor mudanças no aplicativo publicado.

## Plano para entrega segura

1. **Inventário e reconciliação do código**: mapear arquivos locais não versionados; comparar com GitHub e com versão Vercel publicada. Preparar worktree ou cópia isolada para integração.
2. **Contrato de API real**: função de envio autenticada e auditável, vinculada a `cliente_id` e unidade, consulta autorizada ao número no banco, nunca telefone livre do navegador; proteção por RLS/ACL. Não reutilizar hardcode do cliente fictício.
3. **Envio e mensagens**: registrar `message_id` Meta, tentativas, motivos de erro, idempotência, status de entrega/leitura por callbacks assinados e trilha de auditoria.
4. **Conformidade**: janela de 24h para texto livre, templates Meta aprovados fora da janela, consentimento para mensagens comerciais, opt-out, restrições de volume e LGPD.
5. **Interface de clientes**: botão 'WhatsApp' na ficha real com histórico, composição de mensagem manual, confirmação de destino, envio sob permissão; automações separadas e desligadas no MVP.
6. **Homologação E2E e promoção controlada**: validar autenticação negativa, prevenção de duplicatas/concorrência, estabilidade, callbacks, rollback, escopo do token e cenário com serviço indisponível. Somente após autorização específica avaliar migração e publicação em produção.

## Situação de segurança

Não modificar `main`, Vercel produção, segredos produção ou Supabase produção na fase de inventário. O token Meta pertence exclusivamente ao backend. Não é necessário enviar outro WhatsApp enquanto se constrói a integração.

**Próximo comando do operador:** inventariar apenas caminhos/nome dos arquivos existentes de mensageria no checkout local original.
