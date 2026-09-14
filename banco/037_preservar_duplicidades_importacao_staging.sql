-- Alinha a normalização de duplicidades entre preview e staging.
-- Não altera dados existentes; lotes abertos são recalculados no próximo salvar.
begin;

create or replace function public.importacao_normalizar_duplicidade(p_valor text) returns text
language sql immutable set search_path=pg_catalog,pg_temp as $$
 select btrim(regexp_replace(
  translate(lower(coalesce(p_valor,'')),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'),
  '[-–—[:space:]]+',' ','g'));
$$;

create or replace function public.importacao_salvar_lote(p_documento jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare lid uuid; origem_lote text; atual public.importacao_lotes; novo boolean; tipo text; tabela text;
 r jsonb; o jsonb; n jsonb; e jsonb; a jsonb; anterior jsonb; decisao text; ext text; tutor text; m text; qtd integer; pend integer;
 chaves text[]; normais text[];
begin
 perform public.importacao_exigir_internal();
 if octet_length(p_documento::text)>20000000 then raise exception 'Lote excede limite'; end if;
 lid=(p_documento->>'id')::uuid; origem_lote=btrim(p_documento->>'origem');
 if coalesce(origem_lote,'')='' then raise exception 'Origem obrigatória'; end if;
 perform pg_advisory_xact_lock(hashtextextended('importacao:'||origem_lote,0));
 select * into atual from public.importacao_lotes where id=lid for update;
 novo=not found;
 if novo then
  insert into public.importacao_lotes(id,origem,arquivos,criado_por) values(lid,origem_lote,
   coalesce((select jsonb_agg(left(value#>>'{}',200)) from jsonb_array_elements(p_documento->'arquivos') where jsonb_typeof(value)='string'),'[]'),auth.uid());
 else
  if atual.origem<>origem_lote or atual.revisao is distinct from (p_documento->>'revisao')::integer then raise exception 'Lote mudou. Reabra antes de salvar'; end if;
  if atual.status in ('concluido','cancelado') then raise exception 'Lote encerrado'; end if;
 end if;
 foreach tipo in array array['clientes','pets'] loop
  if jsonb_typeof(p_documento->tipo) is distinct from 'array' then raise exception 'Lista de linhas inválida'; end if;
  if jsonb_array_length(p_documento->tipo)>10000 then raise exception 'Lista de linhas inválida'; end if;
  if exists(select 1 from jsonb_array_elements(p_documento->tipo) x group by x->>'external_id' having count(*)>1) then raise exception 'ID externo duplicado no lote'; end if;
  tabela='importacao_'||tipo||'_staging';
  if not novo then
   execute format('select count(*) from public.%I where lote_id=$1',tabela) into qtd using lid;
   if qtd<>jsonb_array_length(p_documento->tipo) then raise exception 'Linhas originais não podem ser removidas/adicionadas ao lote salvo'; end if;
  end if;
  if tipo='clientes' then
   chaves=array['id','nome','telefone','email','cpf','dataNascimento','cep','endereco','numero','bairro','complemento','cidade','estado','observacoes','createdAt'];
   normais=array['nome','whatsapp','email','cpf','cep','endereco','numero','bairro','complemento','cidade','estado','data_nascimento','observacoes','existente_id'];
  else
   chaves=array['id','clienteId','nome','especie','raca','genero','tamanho','pelo','nascimento','peso','castrado','cor','comportamento','observacoes','situacao','createdAt'];
   normais=array['nome','especie','raca_id','sexo','porte','pelagem','temperamento','castrado','data_nascimento','peso','cor','observacoes','existente_id'];
  end if;
  for r in select value from jsonb_array_elements(p_documento->tipo) loop
   o=public.importacao_filtrar(r->'original',chaves); n=public.importacao_filtrar(r->'resolvido',normais);
   ext=r->>'external_id'; decisao=r->>'decisao_operador';
   if ext is distinct from o->>'id' then raise exception 'ID externo diverge do original'; end if;
   if not novo then
    execute format('select original from public.%I where lote_id=$1 and external_id=$2',tabela) into anterior using lid,ext;
    if anterior is distinct from o then raise exception 'Linha original é imutável'; end if;
   end if;
   e=public.importacao_validar(case when tipo='clientes' then 'cliente' else 'pet' end,n,decisao);
   -- Avisos enviados pelo cliente são ignorados. Códigos são recalculados abaixo.
   a='[]';
   select coalesce(cliente_id,pet_id) into m from public.importacao_mapeamentos where origem=origem_lote and tipo_entidade=case when tipo='clientes' then 'cliente' else 'pet' end and external_id=ext;
   if m is not null then e='[]'; end if;
   if tipo='clientes' then
    insert into public.importacao_clientes_staging(lote_id,external_id,linha_original,original,resolvido,decisao_operador,status_validacao,erros,avisos,cliente_id_criado,revisado_por)
    values(lid,ext,(r->>'linha_original')::integer,o,n,decisao,case when m is not null then 'ja_importado' when decisao='ignorar' then 'ignorado' when e='[]'::jsonb then 'pronto' else 'pendente_revisao' end,e,a,m,auth.uid())
    on conflict(lote_id,external_id) do update set resolvido=excluded.resolvido,decisao_operador=excluded.decisao_operador,status_validacao=excluded.status_validacao,
      erros=excluded.erros,avisos=excluded.avisos,cliente_id_criado=excluded.cliente_id_criado,revisado_por=auth.uid(),revisado_em=now();
   else
    tutor=coalesce(o->>'clienteId','');
    if m is null and decisao<>'ignorar' and not exists(select 1 from public.importacao_clientes_staging c where c.lote_id=lid and c.external_id=tutor and c.status_validacao in ('pronto','ja_importado')) then e=e||jsonb_build_array('Tutor pendente: resolver cliente do ID externo'); end if;
    insert into public.importacao_pets_staging(lote_id,external_id,external_cliente_id,linha_original,original,resolvido,decisao_operador,status_validacao,erros,avisos,pet_id_criado,revisado_por)
    values(lid,ext,tutor,(r->>'linha_original')::integer,o,n,decisao,case when m is not null then 'ja_importado' when decisao='ignorar' then 'ignorado' when e='[]'::jsonb then 'pronto' else 'pendente_revisao' end,e,a,m,auth.uid())
    on conflict(lote_id,external_id) do update set resolvido=excluded.resolvido,decisao_operador=excluded.decisao_operador,status_validacao=excluded.status_validacao,
      erros=excluded.erros,avisos=excluded.avisos,pet_id_criado=excluded.pet_id_criado,revisado_por=auth.uid(),revisado_em=now();
   end if;
  end loop;
 end loop;
 -- Cada categoria é preservada por linha. O KPI conta linhas únicas com ao menos uma categoria.
 update public.importacao_clientes_staging c set avisos=(
  select coalesce(jsonb_agg(codigo),'[]') from (values
   ('cpf: POSSIVEL_DUPLICIDADE',regexp_replace(coalesce(c.resolvido->>'cpf',''),'\D','','g'),'cpf'),
   ('telefone: POSSIVEL_DUPLICIDADE',regexp_replace(coalesce(c.resolvido->>'whatsapp',''),'\D','','g'),'whatsapp'),
   ('email: POSSIVEL_DUPLICIDADE',lower(btrim(coalesce(c.resolvido->>'email',''))),'email')) v(codigo,valor,campo)
  where valor<>'' and exists(select 1 from public.importacao_clientes_staging x where x.lote_id=lid and x.external_id<>c.external_id and
   case when campo='email' then lower(btrim(coalesce(x.resolvido->>campo,''))) else regexp_replace(coalesce(x.resolvido->>campo,''),'\D','','g') end=valor)) where c.lote_id=lid;
 update public.importacao_pets_staging p set avisos=case when exists(select 1 from public.importacao_pets_staging x where x.lote_id=lid and x.external_id<>p.external_id and x.external_cliente_id=p.external_cliente_id and public.importacao_normalizar_duplicidade(x.resolvido->>'nome')=public.importacao_normalizar_duplicidade(p.resolvido->>'nome')) then '["tutor+nome: POSSIVEL_DUPLICIDADE"]'::jsonb else '[]'::jsonb end where p.lote_id=lid;
 update public.importacao_clientes_staging c set avisos=avisos||'["nome+telefone: POSSIVEL_DUPLICIDADE"]'::jsonb where c.lote_id=lid and nullif(regexp_replace(c.resolvido->>'whatsapp','\D','','g'),'') is not null and exists
  (select 1 from public.importacao_clientes_staging x where x.lote_id=lid and x.external_id<>c.external_id and public.importacao_normalizar_duplicidade(x.resolvido->>'nome')=public.importacao_normalizar_duplicidade(c.resolvido->>'nome') and regexp_replace(x.resolvido->>'whatsapp','\D','','g')=regexp_replace(c.resolvido->>'whatsapp','\D','','g'));
 update public.importacao_clientes_staging set avisos=avisos||'["nome: NOME_NUMERICO"]'::jsonb where lote_id=lid and resolvido->>'nome' ~ '^[0-9\s()+-]+$';
 update public.importacao_pets_staging p set avisos=avisos||'["tutor+nome+raca: POSSIVEL_DUPLICIDADE"]'::jsonb where p.lote_id=lid and nullif(btrim(p.original->>'raca'),'') is not null and exists
  (select 1 from public.importacao_pets_staging x where x.lote_id=lid and x.external_id<>p.external_id and x.external_cliente_id=p.external_cliente_id and public.importacao_normalizar_duplicidade(x.resolvido->>'nome')=public.importacao_normalizar_duplicidade(p.resolvido->>'nome') and public.importacao_normalizar_duplicidade(x.original->>'raca')=public.importacao_normalizar_duplicidade(p.original->>'raca'));
 update public.importacao_pets_staging set avisos=avisos||'["Situação histórica sem campo operacional: revise a decisão de importar ou ignorar."]'::jsonb where lote_id=lid and lower(original->>'situacao') in ('inativo','bloqueado');
 select count(*) into pend from (select status_validacao from public.importacao_clientes_staging where lote_id=lid union all select status_validacao from public.importacao_pets_staging where lote_id=lid) s where status_validacao='pendente_revisao';
 update public.importacao_lotes set revisao=case when novo then 1 else revisao+1 end,status=case when pend>0 then 'pendente_revisao' else 'pronto' end,
 totais=jsonb_build_object('clientes',jsonb_array_length(p_documento->'clientes'),'pets',jsonb_array_length(p_documento->'pets'),'pendentes',pend),
 erros=coalesce((select jsonb_agg(jsonb_build_object('entidade',entidade,'external_id',external_id,'erros',erros)) from
  (select 'cliente' as entidade,external_id,erros from public.importacao_clientes_staging where lote_id=lid union all select 'pet',external_id,erros from public.importacao_pets_staging where lote_id=lid) s where erros<>'[]'::jsonb),'[]'),
 avisos=coalesce((select jsonb_agg(jsonb_build_object('entidade',entidade,'external_id',external_id,'avisos',avisos)) from
  (select 'cliente' as entidade,external_id,avisos from public.importacao_clientes_staging where lote_id=lid union all select 'pet',external_id,avisos from public.importacao_pets_staging where lote_id=lid) s where avisos<>'[]'::jsonb),'[]') where id=lid;
 return public.importacao_obter_lote(lid);
end;
$$;

revoke all on function public.importacao_normalizar_duplicidade(text) from public,anon,authenticated,service_role;
revoke all on function public.importacao_salvar_lote(jsonb) from public,anon;
grant execute on function public.importacao_salvar_lote(jsonb) to authenticated,service_role;

commit;
