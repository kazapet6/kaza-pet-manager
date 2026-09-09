-- DIAGNOSTICO SOMENTE LEITURA — STATUS OPERACIONAL 020
select
  column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'atendimentos'
  and column_name in ('recebido_em', 'iniciado_em', 'finalizado_em', 'concluido_em')
order by ordinal_position;

select
  pg_get_constraintdef(oid) as constraint_status
from pg_constraint
where conrelid = 'public.atendimentos'::regclass
  and conname = 'atendimentos_status_check';

select
  to_regprocedure('public.validar_transicao_status_atendimento()') is not null
    as possui_validador_transicao,
  has_table_privilege('anon', 'public.atendimentos', 'UPDATE') as anon_update,
  has_table_privilege('authenticated', 'public.atendimentos', 'UPDATE')
    as authenticated_update,
  has_table_privilege('service_role', 'public.atendimentos', 'UPDATE')
    as service_role_update;

select
  strpos(pg_get_functiondef(
    'public.validar_reserva_funcionario()'::regprocedure
  ), '''recebido''') > 0 as funcionario_inclui_recebido,
  strpos(pg_get_functiondef(
    'public.validar_capacidade_unidade_equipamento()'::regprocedure
  ), '''em_atendimento''') > 0 as equipamento_inclui_em_atendimento,
  strpos(pg_get_functiondef(
    'public.revalidar_reservas_ao_ativar_atendimento()'::regprocedure
  ), '''recebido''') > 0 as reativacao_inclui_recebido;
