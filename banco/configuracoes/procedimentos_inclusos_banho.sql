-- Configuração explícita dos procedimentos aprovados pelo proprietário.
-- Executar apenas depois da configuração de serviços avulsos e da migration 057.
-- Os procedimentos não são novas linhas de cobrança, nem acrescentam duração.
begin;
do $$
declare
  nome_servico text;
  id_servico uuid;
begin
  foreach nome_servico in array array['Banho','Banho e tosa bebê','Banho e tosa na maquina','Banho e tosa na tesoura'] loop
    select id into strict id_servico from public.servicos where nome = nome_servico and ativo;
    update public.servicos set procedimentos_inclusos = array['tosa_higienica','limpeza_ouvidos','corte_unhas']::text[]
      where id = id_servico;
  end loop;
  select id into strict id_servico from public.servicos where nome = 'Corte de unhas' and ativo;
  update public.servicos set procedimento_avulso_codigo = 'corte_unhas' where id = id_servico;
end;
$$;
commit;
