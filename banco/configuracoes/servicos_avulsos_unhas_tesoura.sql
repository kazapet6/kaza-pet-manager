-- Configuração comercial para execução após autorização.
begin;

do $$
declare
  banho_id uuid;
  unhas_id uuid;
  tesoura_id uuid;
begin
  select id into strict banho_id from public.servicos where nome = 'Banho' and ativo;
  if exists (select 1 from public.servicos where lower(nome) in ('corte de unhas','banho e tosa na tesoura')) then
    raise exception 'Confira os serviços já existentes antes de aplicar a configuração.';
  end if;

  insert into public.servicos (nome, preco_base, procedimento_incluso_em_servico_id)
    values ('Corte de unhas', 10.00, banho_id) returning id into unhas_id;
  insert into public.servicos (nome, preco_base)
    values ('Banho e tosa na tesoura', 110.00) returning id into tesoura_id;

  -- A elegibilidade do corte de unhas avulso não depende de banho.
  insert into public.servico_especies (servico_id, especie)
    select unhas_id, especie from public.servico_especies where servico_id = banho_id and ativo
    union all select tesoura_id, 'cao';
  insert into public.servico_portes (servico_id, porte)
    select unhas_id, porte from public.servico_portes where servico_id = banho_id and ativo
    union all select tesoura_id, 'pequeno';

  insert into public.servico_etapas (servico_id, ordem, nome, duracao_minutos, recurso) values
    (unhas_id, 1, 'Corte de unhas', 5, 'funcionario'),
    (tesoura_id, 1, 'Banho', 15, 'funcionario'),
    (tesoura_id, 2, 'Secagem', 33, 'funcionario'),
    (tesoura_id, 3, 'Tosa na tesoura', 60, 'funcionario'),
    (tesoura_id, 4, 'Finalização', 10, 'funcionario');

  insert into public.servico_etapa_recursos (servico_etapa_id, tipo, quantidade)
    select id, 'funcionario', 1 from public.servico_etapas where servico_id in (unhas_id, tesoura_id);
end;
$$;

commit;
