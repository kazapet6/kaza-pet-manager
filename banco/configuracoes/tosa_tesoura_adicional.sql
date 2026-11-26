begin;
do $$
declare banho uuid; tosa uuid; etapa uuid;
begin
  select id into strict banho from public.servicos where nome = 'Banho' and ativo;
  insert into public.servicos(nome, preco_base, exige_credito_de_servico_id)
    values ('Tosa na tesoura', 60, banho) returning id into tosa;
  insert into public.servico_especies(servico_id, especie) values (tosa, 'cao');
  insert into public.servico_portes(servico_id, porte) values (tosa, 'pequeno');
  insert into public.servico_etapas(servico_id, ordem, nome, duracao_minutos, recurso)
    values (tosa, 1, 'Tosa na tesoura', 60, 'funcionario') returning id into etapa;
  insert into public.servico_etapa_recursos(servico_etapa_id, tipo, quantidade)
    values (etapa, 'funcionario', 1);
end;
$$;
commit;
