# Go-live de clientes e pets — estado após a Migration 039

Preparação local. Estes arquivos não são migrations e não foram executados no
Supabase. O objetivo é remover dados operacionais de teste e preservar sem
alteração toda a configuração e o lote real já revisado.

## Base da auditoria

O repositório contém migrations numeradas de 002 a 039; a criação inicial de
`clientes` e `pets` não está registrada em um arquivo 001 local. O inventário
parte do diagnóstico real exportado em 12/09/2026 (64 tabelas públicas) e soma
as quatro tabelas criadas pela 036. As migrations 037, 038 e 039 não criam
tabelas. O manifesto final contém, portanto, 68 tabelas públicas.

O script destrutivo compara esse inventário fechado com `pg_catalog` e aborta
se houver qualquer tabela nova ou ausente. Assim, o arquivo 001 local ausente
não é substituído por uma suposição durante a operação.

## Escopo

Serão esvaziadas 29 tabelas operacionais: 27 por `TRUNCATE ... RESTRICT` e,
depois, `pets` e `clientes` por `DELETE`. O uso de DELETE nesses dois
cadastros é necessário porque a Migration 036 adicionou FKs opcionais de
staging para eles; PostgreSQL impediria TRUNCATE RESTRICT mesmo quando essas
FKs não tivessem linhas apontando para cadastros.

Antes do DELETE, a limpeza exige:

- um lote;
- 329 clientes staging, sendo 328 importar e 1 ignorar;
- 383 pets staging, sendo 381 importar e 2 ignorar;
- zero mapeamentos;
- zero IDs criados/resolvidos e zero status `ja_importado`;
- nenhum lote concluído.

As quatro tabelas de importação são preservadas:

- `importacao_lotes`;
- `importacao_clientes_staging`;
- `importacao_pets_staging`;
- `importacao_mapeamentos`.

A limpeza guarda em tabela temporária uma cópia JSON canônica de todas as 39
tabelas preservadas e compara o conteúdo novamente antes do commit. Isso cobre
integralmente originais, resolvidos, erros, avisos, decisões e metadados do
lote, além de funcionários, jornadas, habilitações, serviços, preços, regras,
catálogo, raças, equipamentos, TaxiDog, configurações, modelos de pacote e
versões da Agenda.

O schema `auth` fica fora do manifesto e não é bloqueado, alterado ou apagado.
Não há CASCADE, desativação de triggers, edição de raças ou seleção por nome de
cliente/pet.

## Sequências

`clientes_codigo_seq` e `pets_codigo_seq` só recebem `RESTART WITH 1`
depois que a tabela correspondente foi confirmada vazia e a associação da
sequência ao ID foi validada. O pós-diagnóstico lê `last_value/is_called` sem
chamar `nextval`. O primeiro INSERT futuro deverá gerar `CLI-000001` e
`PET-000001`.

## Arquivos

- `00_manifesto.psql`: inventário fechado e expectativas do staging.
- `manifesto_tabelas.json`: versão exportável do mesmo inventário.
- `01_diagnostico_pre_limpeza.sql`: inventário, contagens, FKs, triggers,
  staging, assinaturas e sequências, somente leitura.
- `02_backup_pre_go_live.ps1`: dump completo de public, dump operacional,
  dump dedicado do staging, contagens, assinaturas e hashes em diretório privado.
- `03_limpar_dados_teste.psql`: limpeza transacional e reset condicional.
- `04_diagnostico_pos_limpeza.psql`: valida 29 tabelas vazias, staging,
  estruturas e sequências, e emite assinaturas para comparação com o backup.
- `OPERACAO_MANUAL.md`: ordem e barreiras operacionais.

Os CSVs reais e os backups nunca devem ser gravados no repositório.
