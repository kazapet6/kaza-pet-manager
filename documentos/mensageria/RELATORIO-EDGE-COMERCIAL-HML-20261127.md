# Implantação das Edge Functions comerciais — HML

Origem de código: commit 1a352e1f68fd7f80232d53c8fcd46c77a183ea0c. Projeto de destino exclusivamente jgtctzqieyorhvqxjbpk.

## Inventário confirmado

Todas ACTIVE e verify_jwt=true.
- Versão 1: alterar-status-atendimento, materializar-ciclo, simular-preco-pacote, confirmar-agendamento, remarcar-atendimento, gerenciar-pacotes, vender-contrato, dados-conclusao-atendimento.
- Versão 2: reaproveitar-credito, gerenciar-creditos-contrato, renovar-contrato, salvar-observacoes-atendimento.
- As sete Edges de mensageria já existentes conservaram suas versões.

## Reprodução do pacote HML
Resolver imports relativos recursivamente a partir de supabase/functions/<slug>/index.ts, incluir deno.json e deno.lock quando presentes. O conteúdo de referência é o commit acima. Os arquivos recuperados da versão implantada em produção foram reutilizados somente após comparação SHA-1 do blob Git, completando dependências no commit de referência. Não copiar secrets.
Alterações exclusivamente no bundle HML:
1. Após a declaração COMPLETA de const url = Deno.env.get('SUPABASE_URL') (inclusive anon e secret quando declarados na mesma linha), inserir:
   if (url !== 'https://jgtctzqieyorhvqxjbpk.supabase.co') throw new Error('HML_PROJECT_MISMATCH')
2. Em _shared/cors.ts, trocar https://kaza-pet-manager.vercel.app por https://hml.kazapetcare.com.br e retornar new Set<string>(ORIGENS_OFICIAIS), sem adicionar origens externas configuradas. Manter localhost e 127.0.0.1 para testes.
3. Exigir JWT no gateway e preservar validação de usuário e app_metadata.role internal no handler.
Quatro entrypoints de declaração múltipla precisaram de republicação corretiva; releitura confirmou correspondência exata com código fonte e proteção após a declaração completa.

Migration hml_acessos_backend_comercial_20261127 aplicada: oito grants SELECT ao service_role e um grant EXECUTE de alterar_status_atendimento_com_creditos(jsonb). Verificação por SET LOCAL ROLE service_role aprovada; nenhuma concessão ao frontend.

## Portão de validação
Implantação e releitura aprovadas. Ainda não há teste HTTP autenticado/compilação completa do frontend integrado nem teste ponta a ponta. Não liberar produção. Nenhum envio de mensagem, cobrança ou dado real alterado.