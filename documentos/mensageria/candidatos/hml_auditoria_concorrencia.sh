#!/bin/sh
# SOMENTE container postgres descartavel, sem rede e sem volumes persistentes.
set -eu
cd /tmp
export PGHOST=/var/run/postgresql PGUSER=postgres PGDATABASE=kaza_auditoria_sintetica PGCONNECT_TIMEOUT=5
export PGOPTIONS='-c statement_timeout=30000 -c lock_timeout=25000'
p() { psql -X -v ON_ERROR_STOP=1 -Atq "$@"; }
cat > /tmp/kaza_setup.sql <<'SQL'
-- Somente PostgreSQL descartavel, sem dados reais e sem rede.
\set ON_ERROR_STOP on
begin;
do $$
begin
  if current_database() <> 'kaza_auditoria_sintetica' or
     to_regclass('public.mensageria_hml_respostas_tentativas') is not null or
     to_regnamespace('auth') is not null then
    raise exception 'BANCO NAO DESCARTAVEL';
  end if;
end $$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
 id uuid primary key, deleted_at timestamptz, banned_until timestamptz,
 raw_app_meta_data jsonb not null
);
create table public.mensageria_hml_respostas_outbox (
 id uuid primary key, evento_codigo text not null
);
create table public.mensageria_hml_respostas_tentativas (
 id uuid primary key, outbox_id uuid not null references public.mensageria_hml_respostas_outbox(id),
 estado text not null, meta_message_id text, reservado_em timestamptz not null,
 concluido_em timestamptz
);
create table public.mensageria_webhooks_meta (
 id uuid primary key, provedor text not null, classificacao text not null,
 assinatura_validada_at timestamptz, payload jsonb not null
);
create table public.mensageria_webhook_itens_meta (
 webhook_id uuid references public.mensageria_webhooks_meta(id),
 provedor text not null, mensagem_externa_id text not null, status_meta text not null
);
\ir hml_auditoria_triagem.sql


insert into auth.users(id,raw_app_meta_data) values
 ('00000000-0000-4000-8000-000000000001','{"role":"internal","whatsapp_admin":true}');
insert into public.mensageria_hml_respostas_outbox values
 ('00000000-0000-4000-8000-000000000002','AGENDAMENTO_CONFIRMADO_WHATSAPP');
insert into public.mensageria_hml_respostas_tentativas values
 ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','indeterminado',null,now(),now());
commit;
SQL
p -f /tmp/kaza_setup.sql
run_case() {
  tag=$1; key=$2; decision=$3; expected=$4
  rm -f /tmp/kaza_a.out /tmp/kaza_b.out /tmp/kaza_a.err /tmp/kaza_b.err /tmp/kaza_release
  call="public.mensageria_hml_registrar_decisao_auditoria('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','resultado_indeterminado',"
  first="select ${call}'manter_em_investigacao','evidencia_insuficiente','$key')->>'status';"
  second="select ${call}'$decision','evidencia_insuficiente','$key')->>'status';"
  { printf '%s\n' 'begin;' 'set local role service_role;' "$first" "\\! i=0; while [ ! -f /tmp/kaza_release ] && [ \$i -lt 20 ]; do sleep 1; i=\$((i+1)); done; test -f /tmp/kaza_release" 'commit;'; } > /tmp/kaza_a.sql
  PGAPPNAME=kaza_a p -f /tmp/kaza_a.sql > /tmp/kaza_a.out 2>/tmp/kaza_a.err &
  pa=$!
  # A deve estar idle em transacao: a chamada ocorreu, mas ainda nao houve commit.
  ready=0; i=0
  while [ "$i" -lt 10 ]; do
    if [ "$(p -c "select count(*) from pg_stat_activity where application_name='kaza_a' and state='idle in transaction'")" = 1 ]; then ready=1; break; fi
    i=$((i+1)); sleep 1
  done
  if [ "$ready" != 1 ]; then touch /tmp/kaza_release; wait "$pa" || true; cat /tmp/kaza_a.err; echo 'A_NAO_PRONTA'; exit 1; fi
  PGAPPNAME=kaza_b p -c "set role service_role; $second" > /tmp/kaza_b.out 2>/tmp/kaza_b.err &
  pb=$!
  blocked=0; i=0
  while [ "$i" -lt 8 ]; do
    if [ "$(p -c "select count(*) from pg_stat_activity b join pg_stat_activity a on a.pid=any(pg_blocking_pids(b.pid)) where b.application_name='kaza_b' and a.application_name='kaza_a' and b.wait_event_type='Lock' and b.wait_event='advisory'")" = 1 ]; then blocked=1; break; fi
    i=$((i+1)); sleep 1
  done
  touch /tmp/kaza_release
  wait "$pa" || { cat /tmp/kaza_a.err; exit 1; }
  wait "$pb" || { cat /tmp/kaza_b.err; exit 1; }
  if [ "$blocked" != 1 ]; then echo 'CONCORRENCIA_NAO_COMPROVADA'; exit 1; fi
  if [ "$(cat /tmp/kaza_a.out)" != registrado ] || [ "$(cat /tmp/kaza_b.out)" != "$expected" ]; then cat /tmp/kaza_a.out /tmp/kaza_b.out; exit 1; fi
  if [ "$(p -c "select count(*) from mensageria_hml_auditoria_interna.decisoes where chave_idempotencia='$key'")" != 1 ]; then echo 'DUPLICIDADE'; exit 1; fi
  echo "PASS $tag: espera advisory comprovada; A=registrado B=$expected; 1 evento"
}
run_case replay 00000000-0000-4000-8000-000000000004 manter_em_investigacao ja_registrado
run_case conflito 00000000-0000-4000-8000-000000000005 solicitar_verificacao_externa conflito_idempotencia
test "$(p -c 'select count(*) from mensageria_hml_auditoria_interna.decisoes')" = 2
echo 'PASS_CONCORRENCIA_2_CENARIOS'
