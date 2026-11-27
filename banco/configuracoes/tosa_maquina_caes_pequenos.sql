-- Este script prepara a etapa. Habilite explicitamente os tosadores no painel.
begin;
do $$
declare servico uuid; finalizacao uuid; ordem_final integer; etapa uuid;
begin
  select id into strict servico from public.servicos
    where translate(lower(nome),'á','a')='banho e tosa na maquina' and ativo;
  if exists (select 1 from public.servico_etapas where servico_id=servico and lower(nome) like '%tosa%') then
    raise exception 'Já existe etapa de tosa. Confira a composição antes de configurar.';
  end if;
  select id,ordem into strict finalizacao,ordem_final from public.servico_etapas
    where servico_id=servico and ativo and translate(lower(nome),'çã','ca')='finalizacao';
  if (select sum(duracao_minutos) from public.servico_etapas where servico_id=servico and ativo) <> 75
    or exists (select 1 from public.servico_etapas where servico_id=servico and ordem>ordem_final) then
    raise exception 'Confira a composição existente e a posição da finalização.';
  end if;
  update public.servico_etapas set ordem=ordem_final+1 where id=finalizacao;
  insert into public.servico_etapas
    (servico_id,nome,ordem,duracao_minutos,recurso,especie_aplicavel,porte_aplicavel,habilitacao_explicita)
    values(servico,'Tosa na máquina',ordem_final,30,'funcionario','cao','pequeno',true) returning id into etapa;
  insert into public.servico_etapa_recursos(servico_etapa_id,tipo,quantidade) values(etapa,'funcionario',1);
end;
$$;
commit;
