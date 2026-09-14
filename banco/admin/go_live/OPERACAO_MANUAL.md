# Procedimento futuro — NÃO executar nesta etapa

Pré-requisitos: aprovação das decisões de staging/raças; segurança 035 validada em
ambiente isolado; ferramentas PostgreSQL compatíveis; operador autorizado.
Os arquivos .psql usam comandos do psql e não devem ser colados no SQL Editor.
Credenciais devem ficar em PGSERVICE/PGPASSFILE privados, fora do Git e da linha de comando.

1. Suspender TODOS os escritores: frontend, Edge Functions, jobs, integrações e
   sessões administrativas. Manter a suspensão até terminar o pós-diagnóstico.
   Manutenção visual no frontend sozinha não interrompe os demais escritores.
2. Confirmar explicitamente projeto/host/banco. Executar o diagnóstico exportável
   01 somente leitura e guardar CSV privado. Comparar schema, tabelas, FKs e contagens
   com manifesto_tabelas.json. Qualquer divergência exige nova revisão, não editar
   contagens apenas para fazer a limpeza passar.
3. Em PowerShell com PGSERVICE configurado para o projeto revisado, preparar backups:

```powershell
$env:GO_LIVE_MANUTENCAO = 'CONFIRMADA'
& .\banco\admin\go_live\02_backup_pre_go_live.ps1 -Destino 'C:\BackupsPrivados\kaza-go-live-lote-revisado'
```

O destino precisa ser novo, privado e fora do repositório. Dois dumps custom são
gerados: public-completo.dump (schema público e dados) e transacionais.dump (29
tabelas, somente dados). Cada dump tem snapshot próprio; por isso a suspensão de
escritores é indispensável. Acompanham manifesto e SHA-256. pg_restore --list verifica
legibilidade, não prova restaurabilidade. O dump público não inclui auth: conservar
também a estratégia de recuperação do projeto Supabase e suas dependências externas.

4. Ensaiar restauração em banco Supabase **descartável e isolado**, nunca no serviço
   de produção. Deve possuir roles/extensões/auth compatíveis e os registros auth
   referenciados, obtidos por procedimento privado de recuperação. Revisar o TOC do
   dump para resolver dependências externas ao schema public antes do ensaio.
   Exemplo após configurar o serviço separado kaza_restore_isolado:

```powershell
pg_restore --list 'C:\BackupsPrivados\kaza-go-live-lote-revisado\public-completo.dump'
pg_restore --dbname 'service=kaza_restore_isolado' --exit-on-error --single-transaction --clean --if-exists 'C:\BackupsPrivados\kaza-go-live-lote-revisado\public-completo.dump'
```

O comando de restauração remove/recria objetos públicos do DESTINO ISOLADO. Conferir
host/banco antes dele. Exigir exit code zero, contagens do manifesto, FKs válidas,
catálogos/configurações, vínculos de contratos/atendimentos e acesso interno.
Testar 035 e o roteiro 06 nesse ambiente com fixtures conhecidas; verificar também
INSERT/UPDATE interno e negação anon/não interno em ensaio transacional isolado.
O script 06 é somente leitura e não testa essas escritas por si só.

O dump transacional é uma cópia adicional, não um restore cego autorizado: triggers
de histórico e dependências exigem plano específico. Preferir recuperação ensaiada
do dump completo; não desabilitar triggers de produção para tentar restaurar.

5. Somente depois da restauração comprovada, nova autorização explícita e confirmação
   de que a janela permanece congelada, o operador poderá executar:

```powershell
psql -X -v ON_ERROR_STOP=1 -v backup_validado=SIM_APAGAR_TESTES -f banco/admin/go_live/03_limpar_dados_teste.psql
psql -X -v ON_ERROR_STOP=1 -f banco/admin/go_live/04_diagnostico_pos_limpeza.psql
```

PGSERVICE deve apontar explicitamente para o destino autorizado; verificar novamente
antes desses comandos. 03 é destrutivo: a confirmação textual não substitui autorização.
Exigir exit code zero, 29 contagens zero, 35 contagens preservadas, sequências com
last_value=1/is_called=false e configurações intactas. A versão de ocupação avança uma vez.
Não consumir nextval para testar CLI/PET: isso gastaria o primeiro ID.

6. Não importar automaticamente ao concluir. Aprovar lote/pendências e catálogo
   em etapa separada. Persistência de staging nova exige revisão do inventário antes
   de reutilizar estes scripts. Se houver falha, manter manutenção e investigar;
   não repetir operações destrutivas ou restaurar produção sem plano revisado.
