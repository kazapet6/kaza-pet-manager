begin;

delete from public.funcionario_intervalos intervalo
using public.funcionario_intervalos duplicado
where intervalo.funcionario_id = duplicado.funcionario_id
  and intervalo.dia_semana = duplicado.dia_semana
  and intervalo.id > duplicado.id;

create unique index funcionario_intervalos_funcionario_dia_uidx
  on public.funcionario_intervalos (funcionario_id, dia_semana);

with agata as (
  select id from public.funcionarios where nome = 'Agata' order by created_at limit 1
), dias as (
  select * from (values
    (1, false),
    (2, true),
    (3, true),
    (4, true),
    (5, true),
    (6, true),
    (0, false)
  ) as configuracao(dia_semana, ativo)
)
insert into public.funcionario_jornadas (
  funcionario_id, dia_semana, inicio, fim, ativo
)
select agata.id, dias.dia_semana, '09:00', '18:00', dias.ativo
from agata cross join dias
on conflict (funcionario_id, dia_semana)
do update set inicio = excluded.inicio, fim = excluded.fim, ativo = excluded.ativo;

with agata as (
  select id from public.funcionarios where nome = 'Agata' order by created_at limit 1
)
insert into public.funcionario_intervalos (
  funcionario_id, dia_semana, inicio, fim, descricao, ativo
)
select agata.id, dia_semana, '12:00', '13:00', 'Almoço', true
from agata cross join generate_series(2, 6) as dia_semana
on conflict (funcionario_id, dia_semana)
do update set inicio = excluded.inicio, fim = excluded.fim,
  descricao = excluded.descricao, ativo = excluded.ativo;

commit;
