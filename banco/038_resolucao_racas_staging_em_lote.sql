-- Aprovação administrativa transacional de sugestões seguras de raça.
-- Atualiza somente catálogo de raças, staging e metadados do lote; não cria Pets.
begin;

create or replace function public.importacao_sugestoes_racas_seguras()
returns table(chave_original text,especie text,nome_canonico text,exige_existente boolean)
language sql immutable set search_path=pg_catalog,pg_temp as $$
 select distinct public.importacao_normalizar_duplicidade(v.original),v.especie,v.canonico,v.exige_existente
 from (values
  ('Shih Tzu','cao','Shih Tzu',false),('Shih-tzu','cao','Shih Tzu',false),('Shihtzu','cao','Shih Tzu',false),
  ('Yorkshire Terrier','cao','Yorkshire Terrier',false),
  ('SRD','cao','Sem raça definida (SRD)',true),('SRD - Sem Raça Definida','cao','Sem raça definida (SRD)',true),('Sem raça definida (SRD)','cao','Sem raça definida (SRD)',true),
  ('SRD','gato','Sem raça definida (SRD)',true),('SRD - Sem Raça Definida','gato','Sem raça definida (SRD)',true),('Sem raça definida (SRD)','gato','Sem raça definida (SRD)',true),
  ('Samoiedo','cao','Samoiedo',false),
  ('Lhasa Apso','cao','Lhasa Apso',false),('Spitz Alemão','cao','Spitz Alemão',false),('Chow Chow','cao','Chow Chow',false),
  ('Maltês','cao','Maltês',false),('Husky Siberiano','cao','Husky Siberiano',false),('Pug','cao','Pug',false),
  ('Golden Retriever','cao','Golden Retriever',false),('Pastor Alemão','cao','Pastor Alemão',false),('Border Collie','cao','Border Collie',false),
  ('Chihuahua','cao','Chihuahua',false),('Lulu da Pomerânia','cao','Lulu da Pomerânia',false),('Pequinês','cao','Pequinês',false),
  ('Pinscher Miniatura','cao','Pinscher Miniatura',false),('Pit Bull','cao','Pit Bull',false),('American Bully','cao','American Bully',false),
  ('Basset Artesiano Normando','cao','Basset Artesiano Normando',false),('Beagle','cao','Beagle',false),
  ('Cocker Spaniel Inglês','cao','Cocker Spaniel Inglês',false),('Pastor Belga','cao','Pastor Belga',false),
  ('Schnauzer Standard','cao','Schnauzer Standard',false),('Afghan Hound','cao','Afghan Hound',false),
  ('Bulldog Inglês','cao','Bulldog Inglês',false),('Buldogue Francês','cao','Buldogue Francês',false),('Bulldog Francês','cao','Buldogue Francês',false),
  ('Siamês','gato','Siamês',false),('Snowshoe','gato','Snowshoe',false)
 ) v(original,especie,canonico,exige_existente);
$$;

create or replace function public.importacao_resolver_racas_lote(
 p_lote uuid,p_revisao integer,p_grupos jsonb,p_confirmar boolean
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare l public.importacao_lotes; item jsonb; chave text; chave_especie_original text; especie_alvo text;
 canonico text; canonico_esperado text; exige_existente boolean; esperado integer; atual integer;
 ids uuid[]; rid uuid; todas_ativas boolean; novas integer=0; resolvidas integer=0; pend integer;
 pet record; novo_resolvido jsonb; erros_linha jsonb;
begin
 perform public.importacao_exigir_internal();
 if p_confirmar is distinct from true then raise exception 'Confirmação explícita obrigatória'; end if;
 if jsonb_typeof(p_grupos) is distinct from 'array' or jsonb_array_length(p_grupos) not between 1 and 100 then raise exception 'Seleção de grupos inválida'; end if;
 if exists(select 1 from jsonb_array_elements(p_grupos) x where jsonb_typeof(x) is distinct from 'object'
  or exists(select 1 from jsonb_object_keys(x) k where k not in ('chave_original','chave_especie_original','especie','nome_canonico','quantidade'))) then raise exception 'Formato de grupo inválido'; end if;
 if exists(select 1 from jsonb_array_elements(p_grupos) x group by x->>'chave_original',x->>'chave_especie_original',x->>'especie' having count(*)>1) then raise exception 'Grupo repetido na seleção'; end if;

 select * into l from public.importacao_lotes where id=p_lote;
 if not found then raise exception 'Lote não encontrado'; end if;
 perform pg_advisory_xact_lock(hashtextextended('importacao:'||l.origem,0));
 select * into l from public.importacao_lotes where id=p_lote for update;
 if l.revisao is distinct from p_revisao then raise exception 'Lote mudou. Reabra antes de confirmar'; end if;
 if l.status in ('concluido','cancelado','importando') then raise exception 'Lote não está aberto para revisão'; end if;

 for item in select value from jsonb_array_elements(p_grupos) loop
  chave=item->>'chave_original'; chave_especie_original=item->>'chave_especie_original'; especie_alvo=item->>'especie'; canonico=item->>'nome_canonico';
  begin esperado=(item->>'quantidade')::integer; exception when others then raise exception 'Quantidade de grupo inválida'; end;
  if coalesce(chave,'')='' or chave is distinct from public.importacao_normalizar_duplicidade(chave)
   or coalesce(chave_especie_original,'')='' or chave_especie_original is distinct from public.importacao_normalizar_duplicidade(chave_especie_original)
   or especie_alvo not in ('cao','gato') or coalesce(btrim(canonico),'')='' or esperado<1 then raise exception 'Identidade do grupo inválida'; end if;
  select s.nome_canonico,s.exige_existente into canonico_esperado,exige_existente
  from public.importacao_sugestoes_racas_seguras() s where s.chave_original=chave and s.especie=especie_alvo;
  if not found or canonico is distinct from canonico_esperado then raise exception 'Sugestão não é segura para aprovação coletiva'; end if;

  select count(*) into atual from public.importacao_pets_staging p where p.lote_id=p_lote and p.decisao_operador='importar' and p.pet_id_criado is null
   and public.importacao_normalizar_duplicidade(p.original->>'raca')=chave
   and public.importacao_normalizar_duplicidade(p.original->>'especie')=chave_especie_original
   and p.resolvido->>'especie'=especie_alvo
   and not exists(select 1 from public.racas r where r.id::text=p.resolvido->>'raca_id' and r.ativo and r.especie=especie_alvo and r.nome<>'2');
  if atual is distinct from esperado then raise exception 'Grupo mudou. Reabra a revisão antes de confirmar'; end if;

  perform pg_advisory_xact_lock(hashtextextended('importacao-raca:'||especie_alvo||':'||public.importacao_normalizar_duplicidade(canonico),0));
  select array_agg(distinct c.id),bool_and(c.ativa) into ids,todas_ativas from (
   select r.id,r.ativo as ativa from public.racas r where r.especie=especie_alvo and public.importacao_normalizar_duplicidade(r.nome)=public.importacao_normalizar_duplicidade(canonico)
   union all
   select r.id,(r.ativo and s.ativo) from public.raca_sinonimos s join public.racas r on r.id=s.raca_id
    where s.especie=especie_alvo and public.importacao_normalizar_duplicidade(s.nome)=public.importacao_normalizar_duplicidade(canonico)
  ) c;
  if coalesce(cardinality(ids),0)>1 then raise exception 'Conflito entre raças cadastradas; revisão manual obrigatória'; end if;
  if cardinality(ids)=1 and not coalesce(todas_ativas,false) then raise exception 'Raça ou sinônimo correspondente está inativo'; end if;
  if cardinality(ids)=1 then rid=ids[1];
  elsif exige_existente then raise exception 'SRD da espécie não encontrado de forma única';
  else
   insert into public.racas(nome,especie,fonte_referencia) values(canonico,especie_alvo,'Aprovação administrativa em lote') returning id into rid;
   novas=novas+1;
  end if;

  for pet in select p.* from public.importacao_pets_staging p where p.lote_id=p_lote and p.decisao_operador='importar' and p.pet_id_criado is null
   and public.importacao_normalizar_duplicidade(p.original->>'raca')=chave
   and public.importacao_normalizar_duplicidade(p.original->>'especie')=chave_especie_original
   and p.resolvido->>'especie'=especie_alvo
   and not exists(select 1 from public.racas r where r.id::text=p.resolvido->>'raca_id' and r.ativo and r.especie=especie_alvo and r.nome<>'2')
  loop
   novo_resolvido=jsonb_set(pet.resolvido,'{raca_id}',to_jsonb(rid::text),true);
   erros_linha=public.importacao_validar('pet',novo_resolvido,pet.decisao_operador);
   if not exists(select 1 from public.importacao_clientes_staging c where c.lote_id=p_lote and c.external_id=pet.external_cliente_id and c.status_validacao in ('pronto','ja_importado')) then erros_linha=erros_linha||jsonb_build_array('Tutor pendente: resolver cliente do ID externo'); end if;
   update public.importacao_pets_staging set resolvido=novo_resolvido,erros=erros_linha,
    status_validacao=case when erros_linha='[]'::jsonb then 'pronto' else 'pendente_revisao' end,
    revisado_por=auth.uid(),revisado_em=now() where lote_id=p_lote and external_id=pet.external_id;
   resolvidas=resolvidas+1;
  end loop;
 end loop;

 if resolvidas<>(select sum((x->>'quantidade')::integer) from jsonb_array_elements(p_grupos) x) then raise exception 'Quantidade resolvida divergiu da confirmação'; end if;
 select count(*) into pend from (select status_validacao from public.importacao_clientes_staging where lote_id=p_lote union all select status_validacao from public.importacao_pets_staging where lote_id=p_lote) s where status_validacao='pendente_revisao';
 update public.importacao_lotes set revisao=revisao+1,racas_criadas=racas_criadas+novas,status=case when pend>0 then 'pendente_revisao' else 'pronto' end,
  totais=jsonb_set(totais,'{pendentes}',to_jsonb(pend),true),
  erros=coalesce((select jsonb_agg(jsonb_build_object('entidade',entidade,'external_id',external_id,'erros',erros)) from
   (select 'cliente' entidade,external_id,erros from public.importacao_clientes_staging where lote_id=p_lote union all select 'pet',external_id,erros from public.importacao_pets_staging where lote_id=p_lote) e where erros<>'[]'::jsonb),'[]')
  where id=p_lote;
 return public.importacao_obter_lote(p_lote);
end;
$$;

revoke all on function public.importacao_sugestoes_racas_seguras() from public,anon,authenticated,service_role;
revoke all on function public.importacao_resolver_racas_lote(uuid,integer,jsonb,boolean) from public,anon;
grant execute on function public.importacao_resolver_racas_lote(uuid,integer,jsonb,boolean) to authenticated,service_role;

commit;
