# Publicação HML integrada — Coolify

Rollback de código confirmado: rollback/hml-cards-20261127 / 544635e974d87c494004cc56a3dcc155a5e71db1. Frontend de produção Vercel fora do escopo.

Preparação:
- Dockerfile.hml inclui /healthz e HEALTHCHECK local (Nginx + existência de index.html); não verifica o backend remotamente.
- Flags de compilação HML integradas, publicação de modelos desabilitada por padrão, URL exclusiva do Supabase HML.
- CORS: mensageria-editor-hml v16, mensageria-confirmacao-hml v24, mensageria-outbox-hml v19, enviar-whatsapp-hml v23. Mudança única nas listas ORIGENS: adicionar https://hml.kazapetcare.com.br. Releitura confirmou todos os arquivos e JWT preservados. Nenhum segredo alterado.
- Leitura interna dos vínculos de créditos adicionada à agenda; anon e escrita direta de authenticated continuam bloqueados.
- A conta interna HML possui autorização WhatsApp; lembretes programados desativados.

Implantação: usar a branch HML existente, Dockerfile /Dockerfile.hml, contexto raiz, porta 80, variáveis HML existentes. Reexecutar build no Coolify. Nenhuma promoção à produção. Build/teste HTTP e visual ainda pendentes; não declarar PASS antes de evidência. Em falha, manter ou restaurar a versão anterior no Coolify, sem reset destrutivo do Git e sem alterar dados.
