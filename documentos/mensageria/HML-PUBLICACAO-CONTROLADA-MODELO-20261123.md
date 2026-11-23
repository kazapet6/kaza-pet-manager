# HML — publicação controlada do modelo de agradecimento (23/11/2026)

**Projeto exclusivo:** `jgtctzqieyorhvqxjbpk`. **Nenhum rascunho foi publicado nesta etapa. Nenhuma mensagem foi enviada.**

## Problema corrigido

O editor novo salva tags como `{{NOME_TUTOR}}`, `{{NOME_PET}}` e `{{NOME_EMPRESA}}`. O catálogo legado também tem modelos que usam `{NOME_TUTOR}`. O motor `respostaOutboxHml.ts` agora substitui ambos os formatos com segurança, impedindo tags desconhecidas; novos testes Node foram adicionados.

Salvar rascunho no editor não significa publicar. Uma versão publicada passa a ser a única base autorizada para o agradecimento automático, e não é substituída por mudanças de rascunho não publicadas.

## Estrutura implantada na HML

Migração `supabase/migrations/20261123120000_mensageria_hml_publicacao_modelo_controlada.sql`:

- Tabela auditável `mensageria_hml_publicacoes` com rascunho, versão original, ID da versão publicada, operador, hash SHA-256, data/hora e chave idempotente.
- Função `mensageria_hml_publicar_modelo(p_operador,p_rascunho,p_versao_esperada,p_chave)`, `SECURITY DEFINER`, com `EXECUTE` exclusivo `service_role` e verificação adicional de admin em `auth.users.raw_app_meta_data`.
- Apenas `AGENDAMENTO_CONFIRMADO_WHATSAPP` (contexto `agenda`) está autorizado inicialmente. Outros eventos, inclusive cobrança e link de remarcação, não podem ser publicados por esta função.
- Bloqueia rascunho de outro operador, excluído, com versão desatualizada, texto inválido, tags ainda indisponíveis, chave reutilizada ou publicação duplicada.
- Cria a versão canônica `publicada` no catálogo `mensageria_modelo_versoes` com numeração incremental. Versões publicadas anteriores são arquivadas, sem apagar auditoria.
- A tabela de auditoria tem RLS habilitado e **nenhum grant direto** para `anon`, `authenticated` ou `service_role`.

### Verificação SQL

`supabase/testes/hml_publicacao_modelo_rollback.sql` passou em **9 casos** com `BEGIN/ROLLBACK`, antes e depois da migração:
1. Operador não autorizado rejeitado.
2. Versão divergente rejeitada.
3. Tag `LINK_REMARCACAO` rejeitada.
4. Primeira versão publicada (apenas dentro da transação).
5. Repetição com a mesma chave idempotente.
6. Outra chave para a mesma versão rejeitada.
7. Reutilização da chave para outra versão rejeitada.
8. Segunda versão publicada.
9. Versão anterior arquivada e auditoria preservada.

Após a execução: **zero linhas em `mensageria_hml_publicacoes`, zero versões com `estado='publicada'`, zero atendimentos e zero tentativas de outbox**.

Permissões verificadas: `service_role` consegue executar a função, `authenticated` e `anon` não; nem `service_role` tem SELECT direto na nova tabela.

## API e interface

- A Edge `mensageria-editor-hml` foi atualizada na HML para v3 e aceita a ação `publicar`, **mas a rejeita por padrão** com `PUBLICACAO_DESATIVADA`, a menos que `HML_MODEL_PUBLISH_ENABLED=true` seja habilitado separadamente no backend.
- A mesma autenticação de operador administrativo ativo é exigida para publicação como para salvar rascunhos.
- A UI da Central agora mostra um botão **Publicar versão na HML** somente para rascunho HML do evento de agradecimento; o botão permanece desabilitado, a menos que `VITE_MENSAGERIA_HML_PUBLICAR_UI_ENABLED=true` seja configurada para um teste administrativo posterior.
- Mesmo após eventual publicação, **isso não enviaria mensagens**: as flags de envio, processamento de cliques e do transporte da Meta permanecem desativadas.
- `testesPublicacaoGuard.ts` exercita guarda do pedido e chave de idempotência; suíte adicionada a `npm run test:mensageria`.
- `testesRespostaOutboxHml.ts` inclui os casos de tag legada simples e tag dupla do editor.

## Próximas etapas

1. Validar `npm run test:mensageria`, `npm run test:whatsapp-hml` e `npm run build` no Windows, após atualizar a branch HML.
2. Verificar no navegador que a edição funciona, o botão de publicação está desabilitado e nenhum envio Meta é possível.
3. Somente em janela controlada e com aprovação específica, habilitar publicação em HML para publicar a versão de agradecimento escolhida pelo operador (não publicar automaticamente os rascunhos antigos).
4. Criar consulta autoritativa dos dados necessários ao worker de outbox e verificação do modelo, com RPC de reserva e reconciliação.
5. Submeter e aprovar o template de **convite** na Meta e homologar E2E com clique assinado e envio de agradecimento ao número pessoal autorizado — exigirá autorização específica de envio.
6. Não mesclar nem publicar na produção antes dos testes completos.

**Nota:** publicação de modelo no catálogo HML NÃO significa aprovação do template WhatsApp na Meta. São operações independentes.
