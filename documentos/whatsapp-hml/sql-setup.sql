-- Piloto exclusivamente de homologação jgtctzqieyorhvqxjbpk.
-- NÃO aplicar no projeto de produção fdnjhnzigveoypdkdwkq.
begin;
create table if not exists public.whatsapp_hml_envios_manuais (
  id uuid primary key default gen_random_uuid(),
  chave_idempotencia uuid not null unique,
  operador_id uuid not null,
  cliente_id text not null references public.clientes(id),
  telefone text not null check (telefone ~ '^55[0-9]{10,11}$'),
  texto_sha256 text not null check (texto_sha256 ~ '^[0-9a-f]{64}$'),
  estado text not null default 'reservado' check (estado in ('reservado','aceito','falha','indeterminado')),
  meta_message_id text,
  erro_codigo text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists whatsapp_hml_envios_cliente_idx
  on public.whatsapp_hml_envios_manuais (cliente_id, criado_em desc);
create index if not exists whatsapp_hml_envios_telefone_idx
  on public.whatsapp_hml_envios_manuais (telefone, criado_em desc);
alter table public.whatsapp_hml_envios_manuais enable row level security;
revoke all on public.whatsapp_hml_envios_manuais from public, anon, authenticated;
grant select, insert, update on public.whatsapp_hml_envios_manuais to service_role;
commit;
