-- Permite preservar como NULL dados desconhecidos do pet legado.
-- Aplicar somente depois de publicar os consumidores compatíveis com cadastro incompleto.
begin;

do $$
declare
  coluna text;
  quantidade integer;
begin
  if to_regclass('public.pets') is null then
    raise exception 'Tabela public.pets ausente';
  end if;
  foreach coluna in array array['especie','raca_id','sexo','porte','pelagem','temperamento','castrado'] loop
    if not exists (
      select 1 from pg_catalog.pg_attribute
      where attrelid = 'public.pets'::regclass and attname = coluna and not attisdropped
    ) then
      raise exception 'Coluna public.pets.% ausente', coluna;
    end if;
  end loop;
  select count(*) into quantidade
  from pg_catalog.pg_attribute
  where attrelid='public.pets'::regclass
    and attname=any(array['especie','raca_id','sexo','porte','pelagem','temperamento','castrado'])
    and attnotnull and not attisdropped;
  if quantidade<>7 then
    raise exception 'Schema de public.pets não corresponde ao estado anterior à Migration 039';
  end if;
  select count(*) into quantidade
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where a.attrelid='public.pets'::regclass and (
    (a.attname='pelagem' and pg_get_expr(d.adbin,d.adrelid) ~ '^''curta''(::text)?$') or
    (a.attname='temperamento' and pg_get_expr(d.adbin,d.adrelid) ~ '^''calmo''(::text)?$') or
    (a.attname='castrado' and lower(pg_get_expr(d.adbin,d.adrelid))='false')
  );
  if quantidade<>3 then
    raise exception 'Defaults artificiais esperados de public.pets divergiram';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid='public.pets'::regclass and contype='f'
      and pg_get_constraintdef(oid) ~ 'FOREIGN KEY \(raca_id, especie\) REFERENCES (public\.)?racas\(id, especie\)'
  ) then
    raise exception 'FK composta pets(raca_id,especie) ausente';
  end if;
  foreach coluna in array array['especie','sexo','porte','pelagem','temperamento'] loop
    if not exists (
      select 1 from pg_catalog.pg_constraint
      where conrelid='public.pets'::regclass and contype='c'
        and pg_get_constraintdef(oid) ilike '%'||coluna||'%'
        and (coluna<>'especie' or (pg_get_constraintdef(oid) ilike '%cao%' and pg_get_constraintdef(oid) ilike '%gato%'))
        and (coluna<>'sexo' or (pg_get_constraintdef(oid) ilike '%macho%' and pg_get_constraintdef(oid) ilike '%femea%'))
        and (coluna<>'porte' or (pg_get_constraintdef(oid) ilike '%mini%' and pg_get_constraintdef(oid) ilike '%pequeno%' and pg_get_constraintdef(oid) ilike '%medio%' and pg_get_constraintdef(oid) ilike '%grande%' and pg_get_constraintdef(oid) ilike '%gigante%'))
        and (coluna<>'pelagem' or (pg_get_constraintdef(oid) ilike '%curta%' and pg_get_constraintdef(oid) ilike '%media%' and pg_get_constraintdef(oid) ilike '%longa%'))
        and (coluna<>'temperamento' or (pg_get_constraintdef(oid) ilike '%calmo%' and pg_get_constraintdef(oid) ilike '%moderado%' and pg_get_constraintdef(oid) ilike '%dificil%'))
    ) then
      raise exception 'CHECK canônico de public.pets.% ausente', coluna;
    end if;
  end loop;
  if exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid='public.pets'::regclass and conname='pets_raca_exige_especie_check'
  ) then
    raise exception 'Constraint pets_raca_exige_especie_check já existe';
  end if;
  if to_regprocedure('public.importacao_validar(text,jsonb,text)') is null
    or to_regprocedure('public.importacao_promover_lote(uuid,integer,boolean)') is null then
    raise exception 'Migration 036 não instalada';
  end if;
end;
$$;

alter table public.pets
  alter column especie drop not null,
  alter column raca_id drop not null,
  alter column sexo drop not null,
  alter column porte drop not null,
  alter column pelagem drop not null,
  alter column temperamento drop not null,
  alter column castrado drop not null,
  alter column pelagem drop default,
  alter column temperamento drop default,
  alter column castrado drop default;

alter table public.pets
  add constraint pets_raca_exige_especie_check
  check (raca_id is null or especie is not null) not valid;

alter table public.pets validate constraint pets_raca_exige_especie_check;

create or replace function public.importacao_validar(p_tipo text,p jsonb,p_decisao text) returns jsonb
language plpgsql stable set search_path=pg_catalog,pg_temp as $$
declare e jsonb='[]'; k text; v text;
begin
 if p_decisao='ignorar' then return e; end if;
 if p_decisao='existente' then
  if p_tipo='cliente' then
   if not exists(select 1 from public.clientes where id=p->>'existente_id') then e=e||jsonb_build_array('Cliente existente não encontrado'); end if;
  else
   if not exists(select 1 from public.pets where id=p->>'existente_id') then e=e||jsonb_build_array('Pet existente não encontrado'); end if;
  end if;
  return e;
 end if;
 if nullif(btrim(p->>'nome'),'') is null then e=e||jsonb_build_array('Nome obrigatório'); end if;
 if not public.importacao_data_valida(p->>'data_nascimento') then e=e||jsonb_build_array('Nascimento inválido: use AAAA-MM-DD'); end if;
 if p_tipo='cliente' then
  if coalesce(regexp_replace(p->>'whatsapp','\D','','g'),'')='' then e=e||jsonb_build_array('WhatsApp pendente'); end if;
 else
  foreach k in array array['especie','sexo','porte','pelagem','temperamento'] loop
   v=nullif(p->>k,'');
   if v is not null and not (case k when 'especie' then v in ('cao','gato') when 'sexo' then v in ('macho','femea')
    when 'porte' then v in ('mini','pequeno','medio','grande','gigante') when 'pelagem' then v in ('curta','media','longa')
    when 'temperamento' then v in ('calmo','moderado','dificil') else false end) then e=e||jsonb_build_array(k||' inválido'); end if;
  end loop;
  if p ? 'castrado' and jsonb_typeof(p->'castrado') not in ('boolean','null') then e=e||jsonb_build_array('castrado inválido'); end if;
  if nullif(p->>'raca_id','') is not null and nullif(p->>'especie','') is null then e=e||jsonb_build_array('espécie obrigatória quando a raça é informada');
  elsif nullif(p->>'raca_id','') is not null and not exists(select 1 from public.racas where id::text=p->>'raca_id' and especie=p->>'especie' and ativo and btrim(nome)<>'2') then e=e||jsonb_build_array('raça inválida'); end if;
  -- Peso já é anulável no cadastro. Texto legado não numérico permanece no
  -- original/resolvido do staging e é promovido como NULL, sem inventar valor.
 end if;
 return e;
end;
$$;

create or replace function public.importacao_promover_lote(p_id uuid,p_revisao integer,p_confirmar boolean) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare l public.importacao_lotes; c record; p record; n jsonb; iid text; tutor text; erros_linha jsonb;
 cc integer=0; pp integer=0; pend integer; dup integer;
begin
 perform public.importacao_exigir_internal();
 if p_confirmar is distinct from true then raise exception 'Confirmação explícita obrigatória'; end if;
 select * into l from public.importacao_lotes where id=p_id;
 if not found then raise exception 'Lote não encontrado'; end if;
 perform pg_advisory_xact_lock(hashtextextended('importacao:'||l.origem,0));
 select * into l from public.importacao_lotes where id=p_id for update;
 if l.status='concluido' then return public.importacao_obter_lote(p_id); end if;
 if l.revisao is distinct from p_revisao or l.status not in ('pronto','pendente_revisao') then raise exception 'Lote mudou. Reabra antes de confirmar'; end if;
 update public.importacao_lotes set status='importando',confirmed_at=now() where id=p_id;
 for c in select * from public.importacao_clientes_staging where lote_id=p_id order by linha_original loop
  select cliente_id into iid from public.importacao_mapeamentos where origem=l.origem and tipo_entidade='cliente' and external_id=c.external_id;
  if iid is not null then
   update public.importacao_clientes_staging set cliente_id_criado=iid,status_validacao='ja_importado',erros='[]' where lote_id=p_id and external_id=c.external_id; continue;
  end if;
  if c.decisao_operador='ignorar' then continue; end if;
  n=c.resolvido; erros_linha=public.importacao_validar('cliente',n,c.decisao_operador);
  if erros_linha<>'[]'::jsonb then update public.importacao_clientes_staging set erros=erros_linha,status_validacao='pendente_revisao' where lote_id=p_id and external_id=c.external_id; continue; end if;
  if c.decisao_operador='existente' then iid=n->>'existente_id'; else
   insert into public.clientes(nome,whatsapp,email,cpf,cep,endereco,numero,bairro,complemento,cidade,estado,data_nascimento,observacoes)
   values(n->>'nome',n->>'whatsapp',nullif(n->>'email',''),nullif(n->>'cpf',''),nullif(n->>'cep',''),coalesce(n->>'endereco',''),nullif(n->>'numero',''),coalesce(n->>'bairro',''),nullif(n->>'complemento',''),coalesce(n->>'cidade',''),nullif(n->>'estado',''),nullif(n->>'data_nascimento','')::date,coalesce(n->>'observacoes','')) returning id into iid;
   cc=cc+1;
  end if;
  insert into public.importacao_mapeamentos(origem,tipo_entidade,external_id,lote_id,cliente_id) values(l.origem,'cliente',c.external_id,p_id,iid);
  update public.importacao_clientes_staging set cliente_id_criado=iid,status_validacao='ja_importado',erros='[]' where lote_id=p_id and external_id=c.external_id;
 end loop;
 for p in select * from public.importacao_pets_staging where lote_id=p_id order by linha_original loop
  select pet_id into iid from public.importacao_mapeamentos where origem=l.origem and tipo_entidade='pet' and external_id=p.external_id;
  if iid is not null then
   update public.importacao_pets_staging set pet_id_criado=iid,status_validacao='ja_importado',erros='[]' where lote_id=p_id and external_id=p.external_id; continue;
  end if;
  if p.decisao_operador='ignorar' then continue; end if;
  n=p.resolvido; erros_linha=public.importacao_validar('pet',n,p.decisao_operador);
  select m.cliente_id into tutor from public.importacao_mapeamentos m join public.importacao_clientes_staging s on s.lote_id=p_id and s.external_id=m.external_id
   where m.origem=l.origem and m.tipo_entidade='cliente' and m.external_id=p.external_cliente_id and s.status_validacao='ja_importado';
  if tutor is null then erros_linha=erros_linha||jsonb_build_array('Tutor pendente: resolver cliente do ID externo'); end if;
  if p.decisao_operador='existente' and tutor is not null and not exists(select 1 from public.pets where id=n->>'existente_id' and cliente_id=tutor) then erros_linha=erros_linha||jsonb_build_array('Pet existente pertence a outro tutor'); end if;
  if erros_linha<>'[]'::jsonb then update public.importacao_pets_staging set erros=erros_linha,status_validacao='pendente_revisao' where lote_id=p_id and external_id=p.external_id; continue; end if;
  if p.decisao_operador='existente' then iid=n->>'existente_id'; else
   insert into public.pets(cliente_id,nome,especie,raca_id,sexo,porte,pelagem,temperamento,castrado,data_nascimento,peso,cor,observacoes)
   values(tutor,n->>'nome',nullif(n->>'especie',''),nullif(n->>'raca_id','')::uuid,nullif(n->>'sexo',''),nullif(n->>'porte',''),nullif(n->>'pelagem',''),nullif(n->>'temperamento',''),
    case when jsonb_typeof(n->'castrado')='boolean' then (n->>'castrado')::boolean else null end,
    coalesce(n->>'data_nascimento',''),case when coalesce(n->>'peso','') ~ '^\d{1,5}(\.\d{1,2})?$' then (n->>'peso')::numeric else null end,coalesce(n->>'cor',''),coalesce(n->>'observacoes','')) returning id into iid;
   pp=pp+1;
  end if;
  insert into public.importacao_mapeamentos(origem,tipo_entidade,external_id,lote_id,pet_id) values(l.origem,'pet',p.external_id,p_id,iid);
  update public.importacao_pets_staging set pet_id_criado=iid,cliente_id_resolvido=tutor,status_validacao='ja_importado',erros='[]' where lote_id=p_id and external_id=p.external_id;
 end loop;
 select count(*) into pend from (select status_validacao from public.importacao_clientes_staging where lote_id=p_id union all select status_validacao from public.importacao_pets_staging where lote_id=p_id) s where status_validacao='pendente_revisao';
 select count(*) into dup from (select avisos,status_validacao from public.importacao_clientes_staging where lote_id=p_id union all select avisos,status_validacao from public.importacao_pets_staging where lote_id=p_id) s where avisos::text like '%POSSIVEL_DUPLICIDADE%' and status_validacao='ja_importado';
 update public.importacao_lotes set status=case when pend=0 then 'concluido' else 'pendente_revisao' end,revisao=revisao+1,completed_at=case when pend=0 then now() else null end,
 resultado=jsonb_build_object('clientes_criados',coalesce((resultado->>'clientes_criados')::integer,0)+cc,'pets_criados',coalesce((resultado->>'pets_criados')::integer,0)+pp,
 'clientes_ignorados',(select count(*) from public.importacao_clientes_staging where lote_id=p_id and status_validacao='ignorado'),
 'pets_ignorados',(select count(*) from public.importacao_pets_staging where lote_id=p_id and status_validacao='ignorado'),
 'clientes_pendentes',(select count(*) from public.importacao_clientes_staging where lote_id=p_id and status_validacao='pendente_revisao'),
 'pets_pendentes',(select count(*) from public.importacao_pets_staging where lote_id=p_id and status_validacao='pendente_revisao'),
 'racas_criadas',racas_criadas,'duplicidades_mantidas',dup,'erros',pend),
 totais=totais||jsonb_build_object('pendentes',pend),
 erros=coalesce((select jsonb_agg(jsonb_build_object('entidade',entidade,'external_id',external_id,'erros',erros)) from
  (select 'cliente' as entidade,external_id,erros from public.importacao_clientes_staging where lote_id=p_id union all select 'pet',external_id,erros from public.importacao_pets_staging where lote_id=p_id) s where erros<>'[]'::jsonb),'[]') where id=p_id;
 return public.importacao_obter_lote(p_id);
end;
$$;

revoke all on function public.importacao_validar(text,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.importacao_promover_lote(uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.importacao_promover_lote(uuid,integer,boolean) to authenticated,service_role;

commit;
