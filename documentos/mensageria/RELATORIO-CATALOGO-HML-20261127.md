# Homologação — configuração operacional

Migration HML: hml_catalogo_operacional_sanitizado_20261127. Aplicada com sucesso. Não executar em produção.

Foram importados 350 registros em 25 tabelas de configuração, com novos UUIDs gerados no banco e chaves estrangeiras remapeadas. A leitura da origem foi exclusivamente de catálogo, configuração e identificadores de funcionários para remapeamento. Dois funcionários operacionais fictícios substituem os nomes reais. Nenhum cliente, pet, atendimento, pagamento, segredo ou identificador de usuário foi copiado. A configuração detalhada não é publicada neste repositório; o histórico da migration permanece no projeto HML.

A tentativa inicial foi revertida atomicamente por colunas geradas de pacotes; a versão aplicada exclui essas colunas da inserção. Os cálculos originais foram preservados. Os três funcionários, o serviço e os seis atendimentos fictícios anteriores foram preservados.

Validação: totais por tabela e constraints conferidos; RLS em todas as 25 tabelas; leitura de service_role e operador interno aprovada; conta externa sem acesso às linhas; anon e escrita direta de authenticated bloqueados. Não foram criados contratos ou recebimentos. Lembretes programados continuam desativados.

Pendências: verificar habilitação da escovação de dentes (sem funcionário habilitado na origem), não inferir atribuição real; validar disponibilidade pelo motor e distinguir recursos antigos de fixtures dos dois funcionários operacionais nos testes. Implantar e testar Edge Functions comerciais antes de qualquer promoção de frontend. Produção não alterada.
