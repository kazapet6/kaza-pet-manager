# HML — política candidata de auditoria da triagem (24/11/2026)

## Marco de retomada

O operador demonstrou no navegador local a rolagem corrigida no commit f00992f e a consulta autenticada com a mensagem "Nenhuma tentativa exige investigação neste momento". A tela indica processamento de cliques, envio automático de agradecimentos e reenvio automático bloqueados. A captura não comprova um caso não vazio, execução de envio, nem a eficácia do HMAC real. As suítes locais e a build anteriores ao ajuste visual passaram; a build posterior foi solicitada ao operador.

## Escopo e invariantes

Política candidata para a próxima implementação, exclusivamente na HML jgtctzqieyorhvqxjbpk. Não é uma autorização de deploy ou de envio. O registro de decisão humana é separado da tentativa, da outbox, do atendimento e dos webhooks. Nenhuma dessas entidades pode ser modificada pela operação de auditoria. O registro jamais encerra ou oculta automaticamente um caso técnico ainda ativo, associa um wamid, autoriza retry, publica modelo ou chama a Meta. A classificação técnica continua calculada pelo mecanismo existente.

## Decisões administrativas propostas

- `manter_em_investigacao`: evidência insuficiente.
- `solicitar_verificacao_externa`: necessidade de verificar evidências oficiais fora do painel.
- `registrar_revisao_sem_reenvio`: operador revisou o caso; não afirma entrega nem falha e não altera a classificação técnica.

Motivos padronizados: `evidencia_insuficiente`, `status_inconsistente`, `identificador_ausente`, `aguardando_evidencia`, `revisao_realizada`. Sem texto livre, anexos, telefone, nome, conteúdo de mensagem ou identificador externo na primeira entrega. Novas evidências não devem ser copiadas para este registro.

## Contrato candidato

Entrada: tentativa UUID, categoria observada, decisão, motivo e chave UUID de idempotência. A identidade do operador é derivada da sessão autenticada na Edge; jamais aceita do corpo HTTP. Revalidação no banco de usuário interno ativo e whatsapp_admin, utilizando raw_app_meta_data, não user_metadata. Verificar a existência e elegibilidade atual da tentativa no fluxo de agradecimento HML; categoria divergente ou caso não mais ativo implica rejeição de nova decisão. A verificação deve usar a classificação autoritativa de uma tentativa específica, não a presença numa listagem limitada a 20. Não introduzir duplicação silenciosa de regras.

Persistência append-only: ID de evento, tentativa, operador UUID, categoria, decisão, motivo, chave de idempotência e instante atribuído pelo banco. Proibir UPDATE/DELETE/TRUNCATE para papéis de execução; não usar exclusão em cascata; documentar que privilégios administrativos do proprietário permanecem fora dessa garantia. RLS e grants explícitos: nenhum acesso direto de anon/authenticated; preferir escrita por RPC restrita a service_role, sem grants diretos de mutação à tabela. Fixar search_path e qualificar relações quando houver função privilegiada. Reutilizar a autorização HML existente e verificar ACL efetiva.

Idempotência: unicidade por operador e chave; replay exato retorna o mesmo evento (após autorização, mesmo se a classificação mudou); mesma chave com payload diferente rejeitada. Testar colisão concorrente e rollback. Nova chave registra nova revisão explícita, nunca substitui a anterior. Retornar apenas metadados mínimos do evento e reenvio_automatico_autorizado=false. Não devolver identidade pessoal ou credenciais do operador em listagens da interface.

## Portões de validação

1. Auditar schema, privilégios, contrato de autorização e reutilização da classificação antes de propor migração.
2. Validar candidatos em ambiente descartável/isolado, depois aprovação explícita para aplicar SQL apenas no projeto HML.
3. Testes: operador válido; anônimo e não admin negados; admin banido/deletado negado; tentativa inexistente, outro evento, categoria desatualizada e valores inválidos rejeitados; replay idêntico; conflito de chave; concorrência; append-only; grants e RLS; ausência de PII; invariância de outbox/tentativa/agenda/webhook; ações de envio continuam 503. Fixtures com rollback e prova de ausência de resíduo.
4. Só após testes de banco e autorização de deploy HML, preparar Edge e interface administrativa com confirmação explícita de registro. Não ligar automações.
5. Template Meta, teste real autorizado, conciliação de wamid por evidência exata e promoção à produção são marcos distintos e permanecem bloqueados.

Este documento não implementa tabela, RPC, Edge, interface ou migração. Nenhuma alteração remota de banco é realizada por este commit.
