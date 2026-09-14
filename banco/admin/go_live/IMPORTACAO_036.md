# Importação por staging — implementação local

Migration 035 aplicada pelo usuário, com novo login e acesso a Clientes/Pets confirmados por ele.
Migration 036 aplicada pelo usuário no Supabase. A consulta pós-aplicação retornou 191 verificações OK, zero falhas e todas as quatro tabelas vazias.
Nenhum dado real foi salvo em staging, promovido, apagado ou enviado a RPC remota nestes testes.

## Infraestrutura

`banco/036_importacao_clientes_pets_staging.sql` cria:

- importacao_lotes: origem, arquivos, totais, erros/avisos agregados, autor, revisão, estado e timestamps.
- importacao_clientes_staging: ID externo, número de linha, original permitido, resolvido, decisão, erros/avisos e CLI criado/associado.
- importacao_pets_staging: mesmos campos, external_cliente_id imutável, cliente_id_resolvido e PET criado/associado.
- importacao_mapeamentos: chave única origem + tipo_entidade + external_id, FKs tipadas para CLI/PET.

Todos os campos úteis solicitados são preservados nos objetos JSONB `original` e `resolvido`.
Exemplos: `original.createdAt` é created_at_original; `original.clienteId` é também a coluna
external_cliente_id; `resolvido.especie`, raca_id, sexo, porte, pelagem, temperamento e castrado
são as resoluções separadas dos valores originais. Não há armazenamento do upload bruto.
As listas fechadas são aplicadas novamente no backend, descartando senha, tokenSenha,
tokenSenhaExpira, tokenVerificacao, emailVerificado e tenantId. Avisos do cliente são ignorados
pelo servidor e recalculados. Dados reais e screenshots pessoais não foram adicionados ao Git.

RLS é habilitado explicitamente nas quatro tabelas. Authenticated/internal pode ler;
escritas são somente pelas RPCs, que repetem a autorização e usam search_path fixo.
Anon não recebe privilégios de tabela ou execução. Service_role permanece administrativo.
Nenhuma tabela operacional de Pets, Motor, Agenda, contratos ou precificação foi modificada.

RPCs (sem Edge nova):

- importacao_salvar_lote: sanitização, validação no servidor, original imutável, revisão otimista.
- importacao_obter_lote: snapshot autorizado, incluindo mapeamentos já existentes.
- importacao_promover_lote: confirmação explícita e transação única de cadastros/mapas/status.
- importacao_criar_raca: confirmação explícita, nome/espécie e lote aberto; ação separada da promoção.

A origem tem bloqueio transacional contra importações concorrentes. A promoção gera CLI/PET
pelos defaults; nunca usa IDs externos como IDs operacionais. Tutor é resolvido somente por
external_cliente_id -> mapeamento de cliente, nunca telefone/nome. Pet marcado existente precisa
pertencer ao tutor resolvido. Cadastros existentes não são sobrescritos. Reenvio encontra o mapa.
Erro impeditivo reverte a chamada inteira: lote não fica falsamente concluído. Pendências de
validação ficam no lote e permitem promover os demais prontos; nova revisão retoma sem duplicar.
Sequências PostgreSQL podem ter lacunas após rollback; não são reiniciadas pela importação.

## Fluxo da tela

Menu **Importação de dados**, ao lado de Configurações. Selecionar -> analisar -> resumo ->
resolver clientes -> resolver pets -> revisar -> confirmar -> resultado.
Análise local só consulta catálogo e mapas. Salvar lote é a primeira ação que grava dados pessoais
em staging; não cria Clientes/Pets. Revisão não salva bloqueia a confirmação. A promoção exige
checkbox de autorização explícita. Exportação de pendências/avisos usa CSV UTF-8 com BOM,
delimitador `;` e neutralização de fórmulas. Não exporta credenciais.

Editor por linha com busca/filtro de pendências; decisões importar, ignorar ou associar a ID
existente. Tutor original fica visível e fixo. Novas raças pedem nome/espécie e confirmação;
aplicar a outras linhas equivalentes é uma escolha explícita. Raça “2” é excluída da seleção
automática e da promoção. Criação de raça não é parte do rollback posterior da importação:
a tela avisa que é uma gravação administrativa separada. Evitar repetir uma criação após
resposta incerta; consultar o catálogo/lote antes.

## Arquivos reais — resultado de parsing/preview

329 clientes, 383 pets, 383 vínculos encontrados e zero órfãos.

| Resultado | Quantidade |
|---|---:|
| Clientes prontos | 328 |
| Clientes pendentes (WhatsApp ausente) | 1 |
| Pets prontos | 0 |
| Pets pendentes | 383 |
| Raças associadas automaticamente | 0 |
| Pets com raça a resolver | 383 |
| Linhas com alertas de duplicidade | 4 |

O catálogo usado foi o export recebido (SRD cão, SRD gato, raça “2”, sem sinônimos).
O relatório tem 53 combinações e 97 sugestões de SRD de espécie conhecida, mas sugestões
não são aliases aprovados. Por isso nenhuma dessas sugestões foi gravada automaticamente.
As contagens de já importados no preview local usam um mapa vazio de teste; o servidor real
revalida os mapeamentos quando instalado. O teste não certifica o conteúdo remoto atual.

Pendências sobrepostas: espécie 41, sexo 131, porte 48 (inclui Micro sem regra aprovada),
pelagem 41, temperamento 382, castrado 319. Há 27 raças vazias. Não usar defaults calmo/false.
Situação histórica Inativo/Bloqueado é preservada e gera aviso de ausência de campo operacional.
Datas de nascimento ISO com espaço ou T são convertidas à parte de calendário AAAA-MM-DD;
original permanece intacto. Datas inválidas não são inferidas nem descartadas silenciosamente.

Duplicidades: duas linhas por categoria CPF, telefone, email, nome+telefone e tutor+nome;
categorias se sobrepõem. Nenhuma dupla tutor+nome+raça no arquivo atual. Dois nomes numéricos
geram aviso adicional. Não houve fusão. Telefone/CPF são comparados sem máscara, email sem
distinção de caixa; os valores úteis originais são preservados.

## Testes e reprodução

- `cd frontend; npm.cmd run test:importacao`: parser e preview com fixtures.
- `node --experimental-strip-types frontend/src/importacao/testesStaging.ts <clientes.csv> <pets.csv>`: análise real somente local, saída agregada.
- `node --experimental-strip-types scripts/admin/testar-importacao-local.mjs <runtime-temporario>`:
  PostgreSQL PGlite em memória, com schema mínimo sintético equivalente às constraints relevantes.
  Requer @electric-sql/pglite instalado somente no runtime externo; nenhuma dependência nova da aplicação.
- `node scripts/admin/testar-importacao-browser.mjs <runtime-playwright> <clientes.csv> <pets.csv> <destino-temporario>`:
  Vite em 127.0.0.1:5186; Chrome headless isolado; TODAS as chamadas externas interceptadas.
  CSV real só no preview; salvar/promover testados apenas com dados sintéticos e respostas simuladas.
- TypeScript, lint, build, Deno check nos módulos puros e git diff --check.
- Regressões existentes de Motor, novo agendamento, contratos, materialização e Agenda.

18 testes PostgreSQL cobrem aplicação da 036, RLS/anon/não interno/internal/service_role,
filtragem de credenciais, idempotência, IDs/vínculos, revisão, pendências, duplicidades,
associação existente, retomada parcial, criação de raça e rollback provocado por trigger.
São complementares ao teste visual desktop/390x844 e aos 14 testes de parser + 10 de preview real.
Não substituem ensaio no schema Supabase completo com seus triggers e extensões.
Build passou com aviso de bundle acima de 500 kB; nenhuma refatoração de módulos alheios foi feita.

## Próximas ações manuais, ainda não executadas

Arquivos desta implementação: banco/036_importacao_clientes_pets_staging.sql;
frontend/src/importacao/csv.ts, modelo.ts, api.ts, Importacao.tsx, importacao.css,
testesStaging.ts (testes.ts anterior reutilizado); frontend/src/App.tsx;
frontend/package.json; scripts/admin/testar-importacao-local.mjs;
scripts/admin/testar-importacao-browser.mjs; banco/admin/go_live/README.md e este relatório.
A migration 035 e os demais scripts administrativos anteriores não foram modificados nesta etapa.

1. Revisar a 036 e ensaiar em Supabase isolado com o schema completo e fixtures.
2. Concluído pelo usuário: aplicar a 036 e confirmar RLS, acesso internal e privilégios com a consulta pós-aplicação.
3. Publicar frontend somente em etapa autorizada (não existe nova Edge a publicar).
4. Aprovar catálogo/aliases e resolver pendências antes da importação real.
5. Reauditar limpeza/backup antes do go-live: as quatro tabelas novas e seus mapeamentos
   mudam o inventário e criam FKs para Clientes/Pets. O manifesto antigo de 64 tabelas fica
   desatualizado após 036 e o script de limpeza deve abortar, não ser contornado.
6. Limpeza, reset de sequências e promoção real continuam sendo etapas separadas, não executadas.
