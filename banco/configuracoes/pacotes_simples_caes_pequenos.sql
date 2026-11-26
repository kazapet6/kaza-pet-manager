-- Configuração comercial a aplicar somente após aprovação da candidata.
begin;

do $$
declare
  banho_id uuid;
  pacote_novo uuid;
  oferta record;
begin
  select id into strict banho_id from public.servicos where nome = 'Banho' and ativo;
  for oferta in select * from (values
    ('Semanal simples • cão pequeno', 4, 7, 44.00::numeric, 20.00::numeric),
    ('Quinzenal simples • cão pequeno', 2, 14, 50.00::numeric, 9.09::numeric)
  ) as dados(nome, quantidade, intervalo, unitario, desconto)
  loop
    if exists (select 1 from public.pacotes where nome = oferta.nome) then
      raise exception 'Confira a configuração da oferta existente: %', oferta.nome;
    end if;
    insert into public.pacotes (nome, ativo, transporte_incluido, especie_elegivel, porte_elegivel)
      values (oferta.nome, false, true, 'cao', 'pequeno')
      returning id into pacote_novo;
    insert into public.pacote_servicos
      (pacote_id, servico_id, ordem_exibicao, quantidade_por_ciclo, intervalo_quantidade,
       intervalo_unidade, preco_pacote_base_unitario, desconto_percentual, preco_unitario_fixo)
      values (pacote_novo, banho_id, 1, oferta.quantidade, oferta.intervalo,
        'dia', oferta.unitario, oferta.desconto, oferta.unitario);
    update public.pacotes set ativo = true where id = pacote_novo;
  end loop;
end;
$$;

commit;
