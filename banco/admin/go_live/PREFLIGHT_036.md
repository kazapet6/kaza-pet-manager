# Pre-flight final da Migration 036 — 14/09/2026

Resultado: SIM para aplicação integral da versão corrigida, como postgres, uma única vez, após a 035. Evidência: código local, diagnóstico de schema exportado em 12/09 e 25 regressões PostgreSQL isoladas. A aplicação da 035 foi confirmada pelo usuário. Não houve nova inspeção nem execução remota; isso não é uma confirmação do estado atual de produção.

## Impacto da aplicação

Cria quatro tabelas vazias, seis índices (quatro de PK), constraints, quatro policies e oito funções. Não executa importação, não altera registros de Clientes/Pets/Raças, atendimentos, contratos, Motor, preços, pacotes ou configurações operacionais. Não contém dados de teste, DELETE/TRUNCATE operacional, reset de sequences ou chamada às RPCs. Não cria sequences nem triggers de usuário.

Os únicos ALTER TABLE habilitam RLS nas quatro tabelas recém-criadas. Não há ALTER TABLE em tabela preexistente. As FKs novas criam dependências e triggers internos de integridade referencial, inclusive nos pais clientes, pets e auth.users; sua criação pode adquirir locks transitórios. Futuras exclusões de registros referenciados ficam sujeitas a NO ACTION (ON DELETE/ON UPDATE), sem cascata. Isso não altera os dados atuais.

INSERT em Clientes/Pets e Raças aparece apenas nos corpos das RPCs, para execução posterior explicitamente solicitada. A migration não chama essas funções. As concessões/revogações afetam somente os objetos novos.

## Tabelas e RLS

- public.importacao_lotes
- public.importacao_clientes_staging
- public.importacao_pets_staging
- public.importacao_mapeamentos

Cada uma habilita RLS antes do COMMIT e recebe exatamente uma policy SELECT `<nome_da_tabela>_select_internal`, TO authenticated, USING `auth.uid() is not null and (auth.jwt()->'app_metadata'->>'role')='internal'`.

| Perfil | SELECT direto | INSERT direto | UPDATE direto | DELETE direto |
|---|---|---|---|---|
| PUBLIC | Sem grant | Não | Não | Não |
| anon | Não | Não | Não | Não |
| authenticated comum | Zero linhas pela RLS | Não | Não | Não |
| authenticated internal com uid | Sim | Não | Não | Não |
| service_role | Sim | Sim | Sim | Sim |

A escrita do operador interno ocorre somente pelas RPCs autorizadas. Todos os internos podem ler todos os lotes; não existe isolamento por criador ou tenant nesta implementação. O proprietário administrativo/BYPASSRLS mantém acesso. Nenhuma nova tabela usa FORCE RLS: isso permite que as RPCs de propriedade administrativa funcionem; por isso a guarda no backend é essencial.

GRANTS/REVOKES exatos por tabela: REVOKE ALL FROM public,anon,authenticated; GRANT SELECT TO authenticated; GRANT ALL TO service_role. Não há grants/revokes de sequences, pois nenhuma é criada ou alterada.

## Funções e execução

As quatro RPCs abaixo são SECURITY DEFINER, com `search_path=pg_catalog,pg_temp`. EXECUTE é concedido a authenticated e service_role, revogado de PUBLIC e anon. Authenticated comum tem permissão de invocação, mas o corpo rejeita antes de ler/gravar; todas chamam `public.importacao_exigir_internal()`.

- public.importacao_obter_lote(uuid)
- public.importacao_salvar_lote(jsonb)
- public.importacao_promover_lote(uuid,integer,boolean)
- public.importacao_criar_raca(uuid,text,text,boolean)

Quatro helpers SECURITY INVOKER, mesmo search_path, sem EXECUTE para PUBLIC, anon, authenticated ou service_role; executáveis pelo proprietário no contexto das RPCs:

- public.importacao_exigir_internal()
- public.importacao_filtrar(jsonb,text[])
- public.importacao_data_valida(text)
- public.importacao_validar(text,jsonb,text)

A guarda exige auth.role()=authenticated, auth.uid() não nulo e app_metadata.role=internal. Há exceção administrativa explícita para service_role. Não confia em user_metadata nem em status enviado pelo frontend. Objetos da aplicação e helpers auth são qualificados por schema; pg_catalog tem precedência, pg_temp fica por último e public foi removido do caminho. Referência: https://www.postgresql.org/docs/current/sql-createfunction.html

## Promoção e raça

Promoção: transação da chamada, bloqueio de revisão/linha e advisory lock por origem, revalidação das linhas candidatas, resolução do tutor pelo mapeamento externo/interno e geração CLI/PET pelos defaults existentes. Linhas já mapeadas são reutilizadas; ignoradas não são importadas. Idempotência é por origem/tipo/external_id, não uma fusão automática por nome/telefone. Possíveis duplicidades cadastrais geram avisos e decisões de revisão; IDs externos distintos podem representar pessoas diferentes. Pendências ficam no staging e o lote não é marcado concluído enquanto existirem. Uma chamada pode promover a parte válida e manter o restante pendente; falha SQL impeditiva reverte toda essa chamada. Sequences PostgreSQL podem ter lacunas após uma promoção abortada, comportamento normal, sem reset.

Raça: confirmação explícita obrigatória, lote aberto, autorização interna (ou administração service_role), nome não vazio até 100 caracteres, espécie cao/gato, bloqueio de nome 2, duplicatas por caixa/acentos portugueses/espaço/hífen e sinônimos ativos. Não cria aliases nem associa raça automaticamente. Não altera pets. Advisory lock serializa a mesma chave canônica entre chamadas dessa RPC; outras rotas externas não compartilham esse lock. O índice preexistente de raça protege a igualdade exata normalizada, não toda equivalência canônica possível.

## Correções deste pre-flight

1. Search_path das oito funções passou de public,pg_temp para pg_catalog,pg_temp.
2. Policies agora também exigem uid não nulo.
3. Helpers revogam EXECUTE de service_role, mantendo acesso às quatro RPCs.
4. RPC de raça rejeita nulls e duplicidades canônicas/sinônimos com lock por chave.
5. DO inicial verifica colunas/tipos necessários, helpers Auth e service_role BYPASSRLS antes de criar objetos. Divergências abortam sem assumir schema.

O diff integral da migration nesta revisão está em 036_preflight.diff. Outros arquivos desta revisão: script local de testes, consulta pós-aplicação e este relatório. Alterações anteriores de frontend não foram modificadas neste pre-flight.

## Aplicação, alertas e pós-validação

A transação contém dois DO corretamente fechados e oito corpos de função fechados; BEGIN/COMMIT foram executados com sucesso no PostgreSQL isolado. Erro intermediário reverte os objetos; ausência da 035 aborta no início. Não é uma migration para repetir: CREATE TABLE/FUNCTION não usa IF NOT EXISTS. Objetos já existentes fazem a execução falhar e reverter.

A criação das tabelas, RLS e revogações é publicada conjuntamente pelo COMMIT. Não há janela de exposição das novas tabelas para outras sessões, desde que o script completo seja executado integralmente na mesma transação.

Avisos abaixo são possibilidades, não alertas observados nesta entrega:

- “Creates a table without enabling RLS”: analisador pode não reconhecer os ALTER posteriores. Para esta versão integral, se esse for o aviso, escolher **Run without RLS**; o SQL já habilita RLS nas quatro tabelas dentro da transação. Não remover os ALTER nem executar apenas um trecho.
- “Destructive operations”: REVOKE e comandos de escrita nos corpos das funções podem provocar classificação conservadora. Não há DROP TABLE/COLUMN, DELETE ou TRUNCATE operacional. Confirmar a execução integral somente se o editor estiver contendo exatamente a versão auditada.
- SECURITY DEFINER: quatro RPCs administrativas são intencionais. O Database Advisor pode apontar função DEFINER executável por authenticated; há guarda interna no corpo. Search_path mutável não é esperado após a correção.
- FKs sem índice próprio podem gerar alertas de desempenho; PKs e os dois índices explícitos não cobrem individualmente todas as FKs. Não representam exposição de PII.

Os nomes de botões podem variar na versão do Studio. Se o aviso mencionar um objeto/comando diferente dos auditados, não aprovar com base neste relatório. Documentação: https://supabase.com/docs/guides/api/securing-your-api e https://supabase.com/docs/guides/database/database-advisors

Após a aplicação, o usuário executou `validar_036_pos_aplicacao.sql`: 191 verificações OK, zero falhas e quatro contagens de staging em zero. O arquivo usa transação READ ONLY e ROLLBACK, não chama RPC nem exporta PII.

## Testes

25 testes PostgreSQL embutido PGlite em memória, somente fixtures sintéticas, zero conexão remota: aplicação 035+036, RLS/ACL, anon/não interno/internal/service_role, uid ausente, shadowing, dados/sequences preservados na aplicação, promoção/vínculos/idempotência, pendências/órfãos, revisão concorrente, rollback de promoção e de DDL, dependência 035, originais imutáveis, raça/confirmacão/nulls/duplicatas/sinônimos, retomada parcial. Não foi executada importação real nem a consulta pós-migration. Validação de whitespace adicional por git diff --check; nenhuma mudança funcional frontend neste pre-flight.

## Inventário exato obtido no PostgreSQL isolado

Nomes automáticos de constraints NOT NULL e triggers internos podem variar com a versão PostgreSQL. Abaixo estão as definições sem incluir nomes internos de triggers de FK.

### Índices

- `importacao_clientes_staging_pkey`: `CREATE UNIQUE INDEX importacao_clientes_staging_pkey ON public.importacao_clientes_staging USING btree (lote_id, external_id)`

- `importacao_lotes_pkey`: `CREATE UNIQUE INDEX importacao_lotes_pkey ON public.importacao_lotes USING btree (id)`

- `importacao_mapeamentos_lote_idx`: `CREATE INDEX importacao_mapeamentos_lote_idx ON public.importacao_mapeamentos USING btree (lote_id)`

- `importacao_mapeamentos_pkey`: `CREATE UNIQUE INDEX importacao_mapeamentos_pkey ON public.importacao_mapeamentos USING btree (origem, tipo_entidade, external_id)`

- `importacao_pets_staging_pkey`: `CREATE UNIQUE INDEX importacao_pets_staging_pkey ON public.importacao_pets_staging USING btree (lote_id, external_id)`

- `importacao_pets_tutor_idx`: `CREATE INDEX importacao_pets_tutor_idx ON public.importacao_pets_staging USING btree (lote_id, external_cliente_id)`

### PK, FKs e CHECKs

- `importacao_clientes_staging.importacao_clientes_staging_cliente_id_criado_fkey`: `FOREIGN KEY (cliente_id_criado) REFERENCES clientes(id)`

- `importacao_clientes_staging.importacao_clientes_staging_decisao_operador_check`: `CHECK ((decisao_operador = ANY (ARRAY['importar'::text, 'ignorar'::text, 'existente'::text])))`

- `importacao_clientes_staging.importacao_clientes_staging_external_id_check`: `CHECK (((length(btrim(external_id)) >= 1) AND (length(btrim(external_id)) <= 200)))`

- `importacao_clientes_staging.importacao_clientes_staging_linha_original_check`: `CHECK ((linha_original > 0))`

- `importacao_clientes_staging.importacao_clientes_staging_lote_id_fkey`: `FOREIGN KEY (lote_id) REFERENCES importacao_lotes(id)`

- `importacao_clientes_staging.importacao_clientes_staging_pkey`: `PRIMARY KEY (lote_id, external_id)`

- `importacao_clientes_staging.importacao_clientes_staging_revisado_por_fkey`: `FOREIGN KEY (revisado_por) REFERENCES auth.users(id)`

- `importacao_lotes.importacao_lotes_criado_por_fkey`: `FOREIGN KEY (criado_por) REFERENCES auth.users(id)`

- `importacao_lotes.importacao_lotes_origem_check`: `CHECK (((length(btrim(origem)) >= 1) AND (length(btrim(origem)) <= 100)))`

- `importacao_lotes.importacao_lotes_pkey`: `PRIMARY KEY (id)`

- `importacao_lotes.importacao_lotes_status_check`: `CHECK ((status = ANY (ARRAY['rascunho'::text, 'analisando'::text, 'pendente_revisao'::text, 'pronto'::text, 'importando'::text, 'concluido'::text, 'erro'::text, 'cancelado'::text])))`

- `importacao_mapeamentos.importacao_mapeamentos_check`: `CHECK ((((tipo_entidade = 'cliente'::text) AND (cliente_id IS NOT NULL) AND (pet_id IS NULL)) OR ((tipo_entidade = 'pet'::text) AND (pet_id IS NOT NULL) AND (cliente_id IS NULL))))`

- `importacao_mapeamentos.importacao_mapeamentos_cliente_id_fkey`: `FOREIGN KEY (cliente_id) REFERENCES clientes(id)`

- `importacao_mapeamentos.importacao_mapeamentos_lote_id_fkey`: `FOREIGN KEY (lote_id) REFERENCES importacao_lotes(id)`

- `importacao_mapeamentos.importacao_mapeamentos_pet_id_fkey`: `FOREIGN KEY (pet_id) REFERENCES pets(id)`

- `importacao_mapeamentos.importacao_mapeamentos_pkey`: `PRIMARY KEY (origem, tipo_entidade, external_id)`

- `importacao_mapeamentos.importacao_mapeamentos_tipo_entidade_check`: `CHECK ((tipo_entidade = ANY (ARRAY['cliente'::text, 'pet'::text])))`

- `importacao_pets_staging.importacao_pets_staging_cliente_id_resolvido_fkey`: `FOREIGN KEY (cliente_id_resolvido) REFERENCES clientes(id)`

- `importacao_pets_staging.importacao_pets_staging_decisao_operador_check`: `CHECK ((decisao_operador = ANY (ARRAY['importar'::text, 'ignorar'::text, 'existente'::text])))`

- `importacao_pets_staging.importacao_pets_staging_external_id_check`: `CHECK (((length(btrim(external_id)) >= 1) AND (length(btrim(external_id)) <= 200)))`

- `importacao_pets_staging.importacao_pets_staging_linha_original_check`: `CHECK ((linha_original > 0))`

- `importacao_pets_staging.importacao_pets_staging_lote_id_fkey`: `FOREIGN KEY (lote_id) REFERENCES importacao_lotes(id)`

- `importacao_pets_staging.importacao_pets_staging_pet_id_criado_fkey`: `FOREIGN KEY (pet_id_criado) REFERENCES pets(id)`

- `importacao_pets_staging.importacao_pets_staging_pkey`: `PRIMARY KEY (lote_id, external_id)`

- `importacao_pets_staging.importacao_pets_staging_revisado_por_fkey`: `FOREIGN KEY (revisado_por) REFERENCES auth.users(id)`

### NOT NULL por tabela

- `importacao_clientes_staging`: lote_id, external_id, linha_original, original, resolvido, status_validacao, erros, avisos, decisao_operador, revisado_em

- `importacao_lotes`: id, origem, status, arquivos, totais, erros, avisos, revisao, created_at, resultado, racas_criadas

- `importacao_mapeamentos`: origem, tipo_entidade, external_id, lote_id, created_at

- `importacao_pets_staging`: lote_id, external_id, external_cliente_id, linha_original, original, resolvido, status_validacao, erros, avisos, decisao_operador, revisado_em

### Assinaturas, modo e configuração de funções

- `importacao_criar_raca(p_lote uuid, p_nome text, p_especie text, p_confirmar boolean)`: SECURITY DEFINER; `search_path=pg_catalog, pg_temp`.

- `importacao_data_valida(p text)`: SECURITY INVOKER; `search_path=pg_catalog, pg_temp`.

- `importacao_exigir_internal()`: SECURITY INVOKER; `search_path=pg_catalog, pg_temp`.

- `importacao_filtrar(p jsonb, chaves text[])`: SECURITY INVOKER; `search_path=pg_catalog, pg_temp`.

- `importacao_obter_lote(p_id uuid)`: SECURITY DEFINER; `search_path=pg_catalog, pg_temp`.

- `importacao_promover_lote(p_id uuid, p_revisao integer, p_confirmar boolean)`: SECURITY DEFINER; `search_path=pg_catalog, pg_temp`.

- `importacao_salvar_lote(p_documento jsonb)`: SECURITY DEFINER; `search_path=pg_catalog, pg_temp`.

- `importacao_validar(p_tipo text, p jsonb, p_decisao text)`: SECURITY INVOKER; `search_path=pg_catalog, pg_temp`.
