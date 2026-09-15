# Procedimento futuro de limpeza — não executar nesta etapa

Os arquivos `.psql` exigem o cliente `psql`; não devem ser colados no SQL
Editor. Credenciais ficam em `PGSERVICE`/`PGPASSFILE` privados, nunca na
linha de comando ou no Git.

## Ordem obrigatória

1. Suspender frontend, Edge Functions, jobs, integrações e sessões
   administrativas que possam escrever. Manter a janela até o fim da validação.
2. Confirmar projeto, host e banco. Executar
   `01_diagnostico_pre_limpeza.sql`, exportar os resultados para armazenamento
   privado e comparar o inventário com `manifesto_tabelas.json`.
3. Gerar os backups:

```powershell
$env:GO_LIVE_MANUTENCAO = 'CONFIRMADA'
& .\banco\admin\go_live\02_backup_pre_go_live.ps1 -Destino 'C:\BackupsPrivados\kaza-go-live-039'
```

4. Conferir os hashes e restaurar `public-completo.dump` em banco descartável
   e isolado. O destino precisa possuir roles, extensões e dependências de auth
   compatíveis. Confirmar que o staging restaurado conserva as contagens,
   decisões, avisos e resoluções.
5. Solicitar autorização final específica para a limpeza. Somente depois,
   executar no projeto confirmado:

```powershell
psql -X -v ON_ERROR_STOP=1 -v backup_validado=SIM_APAGAR_TESTES -f banco/admin/go_live/03_limpar_dados_teste.psql
psql -X -v ON_ERROR_STOP=1 -f banco/admin/go_live/04_diagnostico_pos_limpeza.psql
```

6. Exigir exit code zero na limpeza e zero falhas no pós-diagnóstico. Comparar
   também as contagens pré/pós e as assinaturas das 39 tabelas preservadas com
   `assinaturas_preservadas.csv` gerado no passo 3.
7. Encerrar a manutenção somente após confirmar:

   - 29 tabelas operacionais vazias;
   - clientes e pets com zero linhas;
   - sequências em `last_value=1,is_called=false`;
   - 329 clientes staging, com 328 importar e 1 ignorar;
   - 383 pets staging, com 381 importar e 2 ignorar;
   - zero mapeamentos e zero linhas promovidas;
   - configurações, funcionários, serviços, preços, raças, equipamentos,
     TaxiDog e modelos de pacote preservados.

## Barreiras de segurança

- Divergência no inventário, staging, FKs, triggers ou sequências aborta a
  transação.
- A limpeza usa `TRUNCATE ... RESTRICT`, nunca CASCADE.
- `pets` e `clientes` usam DELETE somente depois de provar que staging não
  aponta para dados operacionais.
- Todas as 39 tabelas preservadas são comparadas integralmente antes do commit.
- Nenhuma tabela de auth é incluída.
- O reset das sequências é condicional à tabela correspondente estar vazia.
- Falha exige investigação com a manutenção ativa. Não repetir a limpeza nem
  restaurar produção sem um plano revisado.
- Promoção/importação do lote é uma etapa posterior e separada.
