# Central de Mensageria — primeira entrega de interface

**22/11/2026 — desenvolvimento isolado. Não mesclar nem publicar em produção.**

## Implementado nesta branch

- Novo componente `frontend/src/mensageria/MensageriaCentral.tsx` com estilo próprio verde e laranja.
- Abas **Modelos e tags / Automações / Histórico / Integrações**.
- Biblioteca de exemplos (confirmação, consumo de pacote, uso de assinatura e cobrança futura).
- Editor com inserção de tags na posição do cursor, prévia WhatsApp com valores fictícios, lista de tags utilizadas, pesquisa, criação, edição, duplicação e exclusão de rascunhos.
- Validador puro `motor.ts`: sintaxe de tags, tags desconhecidas, contexto incompatível, tags ainda não conectadas, corpo ausente e comprimento.
- Catálogo espelhado de **16 tags existentes na base HML** e futuras tags de pacotes, assinaturas e cobrança marcadas como indisponíveis.
- Rascunhos salvos **exclusivamente no armazenamento local do navegador**. Não há persistência em Supabase, publicação de template, API de envio ou automação nesta entrega.
- Homologação isolada em `WhatsAppHmlPiloto` passa a mostrar a **Central de Mensageria** como tela inicial. O envio experimental continua separado em **Piloto Cloud API**.
- Na interface operacional, menu de mensageria condicionado à flag `VITE_MENSAGERIA_STUDIO_ENABLED=true`. Não é ativado na Vercel de produção.

## Segurança

- Nenhum token da Meta no frontend; nenhum telefone real ou mensagem de cliente armazenada pelo editor.
- Nenhuma alteração nos projetos Supabase ou nas funções Edge para instalar este editor.
- Sem tentativa de enviar mensagens, alterar status de agenda ou habilitar automações.
- Prévia dos botões Confirmar e Remarcar é **apenas ilustrativa**; ainda não há callback vinculado a `atendimentos`.
- Tag futura pode ser inserida e rascunho salvo, mas recebe pendência de publicação.
- Financeiro permanece independente: modelo de cobrança apenas como rascunho, gatilho desabilitado.

## Como testar em worktree local existente

1. Encerrar Vite (Ctrl+C).
2. Conferir `git status --porcelain` e só trocar o checkout se não houver alterações de código a preservar.
3. Buscar branch `feature/mensageria-central-20261122` e fazer `git checkout --detach FETCH_HEAD` no worktree isolado `KAZA-PET-WHATSAPP-HML`.
4. Na pasta `frontend`, rodar `npm.cmd run test:mensageria`, `npm.cmd run test:whatsapp-hml` e `npm.cmd run build`.
5. Rodar `npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort`; abrir http://127.0.0.1:5173/.
6. Conferir as abas e a prévia, criar um rascunho, salvar e recarregar a página; confirmar persistência **somente local**.

## Próximos marcos

- Persistir modelos/versionamento no banco **após auditoria de ACL e contrato de API**; jamais permitir escrita direta indiscriminada no navegador.
- Implementar editor de botão de resposta rápida respeitando aprovação do template Meta; receber webhook assinado e mapear ao agendamento.
- Atualizar `agendado`→`confirmado` por operação transacional idempotente; registrar evento e atualizar agenda.
- Mensagens de pacotes/planos devem calcular saldo e histórico real no servidor; assinaturas ilimitadas não têm "créditos restantes" fictícios.
- Cobrança somente quando o Financeiro autoritativo produzir evento de inadimplência e confirmar débito ainda vigente.
- Recuperar e conciliar arquivos locais de mensageria não rastreados antes de qualquer promoção ao sistema oficial.
