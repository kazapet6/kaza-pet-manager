-- DIAGNOSTICO SOMENTE LEITURA — CANCELAMENTO E FALTA 022
with definicao as (
  select lower(pg_get_functiondef(
    'public.validar_transicao_status_atendimento()'::regprocedure
  )) as sql
)
select
  strpos(sql, 'new.status = ''cancelado''') > 0 as possui_cancelamento,
  strpos(sql, 'new.status = ''faltou''') > 0 as possui_falta,
  strpos(sql, 'old.status in (''cancelado'', ''faltou'')') > 0
    as terminais_bloqueados,
  strpos(sql, 'old.status not in (''agendado'', ''confirmado'')') > 0
    as falta_restrita,
  strpos(sql, 'v_origens_cancelamento') > 0 as cancelamento_restrito,
  strpos(sql, 'coalesce(old.recebido_em') > 0 as timestamps_preservados
from definicao;

select
  has_table_privilege('anon', 'public.atendimentos', 'update') as anon_update,
  has_table_privilege('authenticated', 'public.atendimentos', 'update')
    as authenticated_update,
  has_table_privilege('service_role', 'public.atendimentos', 'update')
    as service_role_update;
