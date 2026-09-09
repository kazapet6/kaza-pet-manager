begin;

update public.funcionarios
set nome = 'Agata'
where nome = 'Funcionário operacional';

alter table public.equipamentos
  add column separar_por_sexo boolean not null default false;

alter table public.funcionario_jornadas
  add column ativo boolean not null default true;

alter table public.funcionario_intervalos
  add column ativo boolean not null default true;

alter table public.equipamento_perfis_capacidade
  add column ativo boolean not null default true;

alter table public.equipamento_perfil_itens
  add column ativo boolean not null default true;

alter table public.servico_etapas
  add column ativo boolean not null default true;

alter table public.servico_modificadores
  add column servico_etapa_id uuid references public.servico_etapas(id) on delete restrict,
  add column ativo boolean not null default true;

alter table public.servico_modificadores
  drop constraint if exists servico_modificadores_servico_id_criterio_valor_key;

alter table public.servico_modificadores
  add constraint servico_modificadores_etapa_criterio_valor_key
  unique (servico_etapa_id, criterio, valor);

create table public.funcionario_etapas (
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  servico_etapa_id uuid not null references public.servico_etapas(id) on delete cascade,
  ativo boolean not null default true,
  primary key (funcionario_id, servico_etapa_id)
);

alter table public.funcionario_etapas enable row level security;
grant select, insert, update on public.funcionario_etapas to anon, authenticated;

create policy funcionario_etapas_select_sem_autenticacao
  on public.funcionario_etapas for select to anon, authenticated using (true);
create policy funcionario_etapas_insert_sem_autenticacao
  on public.funcionario_etapas for insert to anon, authenticated with check (true);
create policy funcionario_etapas_update_sem_autenticacao
  on public.funcionario_etapas for update to anon, authenticated using (true) with check (true);

create index funcionario_etapas_etapa_idx
  on public.funcionario_etapas (servico_etapa_id, ativo);
create index servico_modificadores_etapa_idx
  on public.servico_modificadores (servico_etapa_id, ativo);

update public.equipamentos
set separar_por_sexo = true
where nome = 'Máquina de secagem';

update public.equipamento_perfis_capacidade
set nome = '3 minis'
where nome = '2 minis'
  and equipamento_id = (
    select id from public.equipamentos where nome = 'Máquina de secagem'
  );

update public.equipamento_perfil_itens item
set quantidade = 3
from public.equipamento_perfis_capacidade perfil
join public.equipamentos equipamento on equipamento.id = perfil.equipamento_id
where item.perfil_id = perfil.id
  and equipamento.nome = 'Máquina de secagem'
  and perfil.nome = '3 minis'
  and item.porte = 'mini';

insert into public.servicos (nome, descricao)
values
  ('Banho', ''),
  ('Banho e Tosa', ''),
  ('Carding', ''),
  ('Hidratação', ''),
  ('Escovação de Dentes', '')
on conflict (nome) do nothing;

commit;
