# Páginas legais KAZA PET — serviço independente
Branch: feature/paginas-legais-20261127. Não é a aplicação de gestão. Não substituir nenhuma aplicação existente no Coolify.
## Publicação
Criar novo recurso Application no Coolify (Hostinger), repositório público kazapet6/kaza-pet-manager, branch acima, build pack Dockerfile, base directory /, Dockerfile location /legal/Dockerfile, port 80. Sem variáveis de ambiente, sem Supabase, sem cron ou tokens. Usar um domínio HTTPS livre: preferencialmente kazapetcare.com.br **apenas se não houver site ativo**; se houver, usar privacidade.kazapetcare.com.br (configurar DNS A para o VPS). Não alterar DNS existente sem verificar. Health check /healthz.
## Teste de aceitação
Após deploy e TLS, confirmar com navegador anônimo e curl -I que /privacidade, /termos-de-uso, /exclusao-de-dados e /legal.css retornam HTTP 200, /healthz retorna 200, e /rota-inexistente retorna 404. Confirmar links internos, visual móvel e botão WhatsApp (não enviar mensagem durante o teste). Não cadastrar URLs na Meta antes de validar domínio e conteúdo.
## Revisão operacional antes de publicar
- Validar razão social, endereço, número público, canal de privacidade e responsável interno pelos pedidos, inclusive atendimento presencial; confirmar fluxo para revogação de ofertas e solicitações de direitos.
- Confirmar categorias, fornecedores, transferências internacionais e mecanismos legais, retenção, cópias de segurança, procedimentos de incidentes e práticas de consentimento, inclusive se existir outro processamento não descrito.
- Os textos são uma proposta baseada na operação conhecida e LGPD; não constituem certificação de conformidade. Não afirmar procedimentos inexistentes. Revisar com responsável e jurídico quando necessário.
- Referências: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm ; https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/
- Após aprovação e deploy, preencher URLs de política, termos e instruções de exclusão com o domínio efetivamente publicado. A página de exclusão é instrução para solicitação humana, não callback automático.
