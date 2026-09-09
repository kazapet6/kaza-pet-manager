-- DIAGNOSTICO SOMENTE LEITURA — FLEXIBILIZACAO STATUS OPERACIONAL 021
select
  strpos(definicao, '''agendado''') > 0 as possui_agendado,
  strpos(definicao, '''confirmado''') > 0 as possui_confirmado,
  strpos(definicao, '''recebido''') > 0 as possui_recebido,
  strpos(definicao, '''em_atendimento''') > 0 as possui_em_atendimento,
  strpos(definicao, '''aguardando_retirada''') > 0 as possui_aguardando_retirada,
  strpos(definicao, '''aguardando_entrega''') > 0 as possui_aguardando_entrega,
  strpos(definicao, '''concluido''') > 0 as possui_concluido,
  strpos(definicao, 'old.status <> all') > 0 as bloqueia_origem_nao_operacional,
  strpos(definicao, 'new.status <> all') > 0 as bloqueia_destino_nao_operacional,
  strpos(definicao, 'coalesce(old.recebido_em') > 0
    as preserva_primeiro_recebimento
from (
  select pg_get_functiondef(
    'public.validar_transicao_status_atendimento()'::regprocedure
  ) as definicao
) item;
