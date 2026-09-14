# Revisão em lote — 14/09/2026

Implementada localmente, antes da revisão individual. Não modifica migration 036,
Motor, schema de Pets, RPCs de promoção ou dados remotos.

## Fluxo

Na Importação, após analisar/resumir, acessar **Resolver valores em lote**.
Escolher raça, espécie, sexo, porte, pelagem, temperamento ou castrado.
Cada grupo mostra originais, destino atual, quantidade editável, sugestão e pendências.
Raças são agrupadas pela dupla espécie original + raça original normalizadas;
caixa, acentos, espaços e hífens são normalizados. Aliases apenas sugeridos não são fundidos.

Confirmar resolução aplica o destino a todos os pets editáveis daquele grupo,
sem modificar originais ou tutores. Importados/ignorados/associados a existentes não são alterados.
Para valor vazio, nenhuma seleção é predefinida: abrir Selecionar pets e marcar
os desejados, ou escolher Selecionar todos explicitamente. Só os selecionados mudam.
Essa exigência inclui raça vazia; a antiga aplicação em massa da ficha individual foi removida.

Raças permitem associar existente, confirmar SRD da espécie, manter pendente ou criar
nova raça através da confirmação administrativa existente. Primeiro salvar a revisão;
a criação da raça é separada, e depois sua associação ao grupo fica local até salvar novamente.
A espécie da criação em grupo é fixada à dos pets afetados. Raça 2 é rejeitada.
Se espécies resolvidas diferirem dentro de um grupo de raça, é necessário resolvê-las
antes de aplicar uma única raça compatível. Não se infere espécie a partir da raça.

O botão de equivalências inequívocas só completa resoluções vazias cujo valor original
possui mapeamento aprovado. Não preenche originais vazios e não sobrescreve decisões.
Micro -> mini, manso -> calmo e grafias apenas sugeridas de raça continuam sem aprovação automática.

Contadores de clientes/pets prontos/pendentes, raça e cada campo são recalculados.
A revisão individual abre filtrada para pendentes; os demais ficam disponíveis apenas
quando o operador desmarca o filtro. O cliente sem WhatsApp permanece pendente.
Todas as resoluções usam funções puras, sem insert/update/RPC operacional. Salvar staging
e promover cadastros continuam ações separadas. Nenhum novo endpoint foi criado.

## CSVs reais e limites do resultado

329 clientes, 383 pets, 383 vínculos, zero órfãos. 328 clientes prontos e 1 pendente.
53 combinações originais de raça resultam em **50 grupos normalizados**, somando 383 pets.
A lista completa de grupos e quantidades está em `grupos_racas_normalizados.csv`, sem dados pessoais.

Maiores grupos:

| Espécie original | Raça original | Pets |
|---|---|---:|
| Cachorro | Shih-tzu | 120 |
| Cachorro | SRD - Sem Raça Definida | 86 |
| Cachorro | Yorkshire Terrier | 25 |
| vazia | vazia | 22 |
| Cachorro | Lhasa Apso | 9 |
| Cachorro | Spitz Alemão | 9 |
| Gato | SRD - Sem Raça Definida | 9 |
| vazia | SRD / Srd | 8 |
| Cachorro | Poodle Mini | 8 |

Antes: 0 pets prontos / 383 pendentes. Depois de aplicar somente equivalências já
inequivocamente aprovadas: **0 prontos / 383 pendentes**. O parser anterior já aplicava
essas equivalências; agrupamento não cria informação ausente nem aprova aliases sugeridos.
Isso não obriga abrir 383 fichas: decisões repetidas e seleção múltipla agora se resolvem
na etapa em lote. O número de fichas individuais restantes depende das escolhas do operador.

Pendências sobrepostas após as equivalências: raça 383, temperamento 382, castrado 319,
sexo 131, porte 48, espécie 41 e pelagem 41. Entre elas, 275 temperamentos estão vazios;
há também 27 raças vazias e 7 portes Micro sem equivalência aprovada.
O catálogo do diagnóstico não possui sinônimos aprovados; as 97 propostas de SRD ainda
exigem ação explícita. Nenhuma dessas decisões foi tomada em nome do operador nos dados reais.

## Validação e arquivos

15 testes de grupos com arquivos reais (14 com fixtures): raça múltipla, seis campos,
ausências, seleção parcial, espécie incompatível, raça 2, exclusão de importados/ignorados,
preservação de originais, contadores e ausência de dependências de persistência.
Parser e preview anteriores continuam passando. Navegador isolado com TODAS as chamadas
externas simuladas validou os 50 grupos reais sem gravação, e com fixtures confirmou
contadores 0 -> 1 -> 2 após seleção explícita, nenhuma escrita durante resolução,
filtro individual, desktop e 390x844. Nenhum screenshot de fichas reais foi salvo no Git.
TypeScript, lint, Deno check e build local; aviso de bundle grande permanece.

Arquivos desta etapa:

- frontend/src/importacao/grupos.ts
- frontend/src/importacao/RevisaoEmLote.tsx
- frontend/src/importacao/testesGrupos.ts
- frontend/src/importacao/Importacao.tsx
- frontend/src/importacao/importacao.css
- frontend/package.json
- scripts/admin/testar-importacao-browser.mjs
- banco/admin/go_live/grupos_racas_normalizados.csv
- banco/admin/go_live/REVISAO_EM_LOTE.md

Testes: `npm.cmd run test:importacao` em frontend. Teste dos arquivos reais:
`node --experimental-strip-types frontend/src/importacao/testesGrupos.ts <clientes.csv> <pets.csv>`.
Quarto argumento opcional grava somente o relatório agregado de raças.
Não houve aplicação de migration, deploy, importação remota, limpeza, commit ou push.
