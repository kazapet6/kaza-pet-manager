# HML — validação de integração da auditoria (24/11/2026)

## Evidência e escopo

Registro baseado no relatório do Codex das etapas 129–132 encaminhado pelo operador. Os logs e o dump privados permanecem no computador do operador e não foram inspecionados diretamente nesta revisão. Não anexar o dump, credenciais, catálogo integral ou fixtures com dados reais ao GitHub.

- Commit testado: `17b5945a02b5e62574871caffedec738b16913fc`.
- Blob Git do candidato SQL conferido no GitHub: `c3745f4f9a0e1c36d93aaf27cb5dea899e0e7591`.
- 43/43 cenários de integração únicos; ON_ERROR_STOP, exit 0 e ROLLBACK explícito.
- Hash pré/pós relatado idêntico: `784C636A9394BFEE4B4FBA72D425A89ACD229F418B2F3F3AA52844261200C110`. Zero decisões residuais.
- Evidências anteriores: 14/14 sintéticos, 2/2 concorrência, 2/2 verificações complementares de segurança, 8/8 negativos e 2/2 controles positivos das asserções.
- Baseline schema-only: 1.215 entradas estruturais; SHA-256 relatado do dump `E4B84D2C368F60739C5EC10864FF18DB484AD0E982E458A37D085B462F093A93`.
- Comparação: 1.211 blocos idênticos, quatro diferenças explicadas (substituição esperada da RPC de triagem e três diferenças de parênteses). Nova RPC e ACL esperadas no public.
- PostgreSQL HML 17.11, réplica 17.6, Vault 0.3.2 omitido sem referências identificadas no SQL, logins gerenciados desabilitados, concedente local distinto nos memberships. Essas diferenças delimitam a conclusão, não demonstram equivalência absoluta.
- Dados fictícios de versionamento e placeholders preparados sem enfraquecer triggers ou asserções. Sem rede externa na réplica. Recursos descartáveis removidos segundo o relatório.

## Próximo portão: instalação controlada HML (não autorizada por este documento)

Somente projeto `jgtctzqieyorhvqxjbpk`. Produção `fdnjhnzigveoypdkdwkq` excluída. Nenhuma escrita remota, implantação ou ativação neste registro.

1. Após autorização específica, verificar drift em leitura no HML: comparar as definições, owners, ACLs, dependências e papéis da RPC de triagem e relações envolvidas contra o baseline testado; confirmar ausência do schema/RPC novos e bloqueios de integração. Interromper se houver divergência não explicada. Confirmar executor/proprietário compatível com a réplica.
2. Preparar reversão a partir da definição e ACL efetivas da RPC anterior, preservadas privadamente. Ensaiar instalação e reversão em réplica descartável, sem CASCADE; não remover auditoria se já houver decisões, sem plano de preservação e autorização separados.
3. Usar exclusivamente o candidato SQL validado (blob acima), com controle transacional, timeout e verificação do destino. Não executar a fixture de 43 cenários na HML remota. Registrar a mudança de schema pelo mecanismo de migração acordado, sem aplicar outras migrations.
4. Validar instalação: objetos, RLS, owners, grants efetivos e ausência de acesso direto pelos papéis de aplicação; RPC nova somente service_role; triagem existente ainda funcional; sem decisões fictícias persistidas nem alteração operacional. Conferir avisos de segurança relevantes. Parar em qualquer falha e comunicar.
5. Edge Function, histórico administrativo, autenticação de sessão, interface e teste funcional são etapas posteriores independentes. Nenhum envio real, chamada à Meta, publicação de template, alteração de flags, merge na main ou promoção para produção está autorizado.

Conclusão: evidência SQL suficiente para solicitar autorização específica de instalação HML, condicionada aos portões acima; não equivale à homologação ponta a ponta da funcionalidade nem autoriza produção.
