-- Infraestrutura permanente. NÃO aplicar automaticamente. Requer a migration 035.
begin;

-- Falhar antes de criar objetos se as dependências da 035/schema auditado divergirem.
do $$
declare r record;
begin
 for r in select * from (values
  ('public.clientes','id','text'),('public.clientes','nome','text'),('public.clientes','whatsapp','text'),
  ('public.clientes','email','text'),('public.clientes','cpf','text'),('public.clientes','cep','text'),
  ('public.clientes','endereco','text'),('public.clientes','numero','text'),('public.clientes','bairro','text'),
  ('public.clientes','complemento','text'),('public.clientes','cidade','text'),('public.clientes','estado','text'),
  ('public.clientes','data_nascimento','date'),('public.clientes','observacoes','text'),
  ('public.pets','id','text'),('public.pets','cliente_id','text'),('public.pets','nome','text'),
  ('public.pets','especie','text'),('public.pets','raca_id','uuid'),('public.pets','sexo','text'),
  ('public.pets','porte','text'),('public.pets','pelagem','text'),('public.pets','temperamento','text'),
  ('public.pets','castrado','boolean'),('public.pets','data_nascimento','text'),('public.pets','peso','numeric(7,2)'),
  ('public.pets','cor','text'),('public.pets','observacoes','text'),
  ('public.racas','id','uuid'),('public.racas','nome','text'),('public.racas','especie','text'),
  ('public.racas','ativo','boolean'),('public.racas','fonte_referencia','text'),
  ('public.raca_sinonimos','nome','text'),('public.raca_sinonimos','especie','text'),('public.raca_sinonimos','ativo','boolean'),
  ('auth.users','id','uuid')) v(tabela,coluna,tipo) loop
  if not exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=to_regclass(r.tabela)
    and a.attname=r.coluna and not a.attisdropped and pg_catalog.format_type(a.atttypid,a.atttypmod)=r.tipo) then
   raise exception 'Dependência incompatível: %.% deve existir com tipo %. Verifique a 035/schema',r.tabela,r.coluna,r.tipo;
  end if;
 end loop;
 if to_regprocedure('auth.uid()') is null or to_regprocedure('auth.jwt()') is null or to_regprocedure('auth.role()') is null then
  raise exception 'Helpers Supabase Auth ausentes';
 end if;
 if not exists(select 1 from pg_catalog.pg_roles where rolname='service_role' and rolbypassrls) then
  raise exception 'service_role sem BYPASSRLS: revisar configuração antes da 036';
 end if;
end;
$$;

create table public.importacao_lotes (
 id uuid primary key, origem text not null check(length(btrim(origem)) between 1 and 100),
 status text not null default 'rascunho' check(status in ('rascunho','analisando','pendente_revisao','pronto','importando','concluido','erro','cancelado')),
 arquivos jsonb not null default '[]', totais jsonb not null default '{}', erros jsonb not null default '[]', avisos jsonb not null default '[]',
 criado_por uuid references auth.users(id), revisao integer not null default 1,
 created_at timestamptz not null default now(), confirmed_at timestamptz, completed_at timestamptz,
 resultado jsonb not null default '{}', racas_criadas integer not null default 0
);
-- Original contém somente campos permitidos; resolvido guarda edições separadamente.
create table public.importacao_clientes_staging (
 lote_id uuid not null references public.importacao_lotes(id), external_id text not null check(length(btrim(external_id)) between 1 and 200),
 linha_original integer not null check(linha_original>0), original jsonb not null, resolvido jsonb not null,
 status_validacao text not null, erros jsonb not null default '[]', avisos jsonb not null default '[]',
 decisao_operador text not null check(decisao_operador in ('importar','ignorar','existente')),
 cliente_id_criado text references public.clientes(id), revisado_por uuid references auth.users(id), revisado_em timestamptz not null default now(),
 primary key(lote_id,external_id)
);
create table public.importacao_pets_staging (
 lote_id uuid not null references public.importacao_lotes(id), external_id text not null check(length(btrim(external_id)) between 1 and 200),
 external_cliente_id text not null, linha_original integer not null check(linha_original>0), original jsonb not null, resolvido jsonb not null,
 cliente_id_resolvido text references public.clientes(id), status_validacao text not null,
 erros jsonb not null default '[]', avisos jsonb not null default '[]',
 decisao_operador text not null check(decisao_operador in ('importar','ignorar','existente')),
 pet_id_criado text references public.pets(id), revisado_por uuid references auth.users(id), revisado_em timestamptz not null default now(),
 primary key(lote_id,external_id)
);
-- Não impor FK pet staging -> cliente staging: órfãos precisam ser retidos como pendência.
create table public.importacao_mapeamentos (
 origem text not null, tipo_entidade text not null check(tipo_entidade in ('cliente','pet')), external_id text not null,
 lote_id uuid not null references public.importacao_lotes(id),
 cliente_id text references public.clientes(id), pet_id text references public.pets(id),
 created_at timestamptz not null default now(),
 primary key(origem,tipo_entidade,external_id),
 check((tipo_entidade='cliente' and cliente_id is not null and pet_id is null) or
       (tipo_entidade='pet' and pet_id is not null and cliente_id is null))
);
create index importacao_mapeamentos_lote_idx on public.importacao_mapeamentos(lote_id);
create index importacao_pets_tutor_idx on public.importacao_pets_staging(lote_id,external_cliente_id);

alter table public.importacao_lotes enable row level security;
alter table public.importacao_clientes_staging enable row level security;
alter table public.importacao_pets_staging enable row level security;
alter table public.importacao_mapeamentos enable row level security;
do $$
declare t text;
begin
 foreach t in array array['importacao_lotes','importacao_clientes_staging','importacao_pets_staging','importacao_mapeamentos'] loop
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('create policy %I on public.%I for select to authenticated using (auth.uid() is not null and (auth.jwt()->''app_metadata''->>''role'')=''internal'')',t||'_select_internal',t);
 end loop;
end;
$$;

create function public.importacao_exigir_internal() returns void
language plpgsql stable set search_path = pg_catalog, pg_temp as $$
begin
 if coalesce(auth.role(),'')<>'service_role' and
    (coalesce(auth.role(),'')<>'authenticated' or coalesce(auth.jwt()->'app_metadata'->>'role','')<>'internal' or auth.uid() is null) then
  raise exception 'Acesso interno obrigatório' using errcode='42501';
 end if;
end;
$$;

-- Defesa independente do frontend: somente valores escalares textuais de chaves permitidas.
create function public.importacao_filtrar(p jsonb, chaves text[]) returns jsonb
language sql immutable set search_path=pg_catalog,pg_temp as $$
 select coalesce(jsonb_object_agg(k, p->k),'{}'::jsonb) from unnest(chaves) k
 where p ? k and jsonb_typeof(p->k) in ('string','boolean','null');
$$;
create function public.importacao_data_valida(p text) returns boolean
language plpgsql immutable set search_path=pg_catalog,pg_temp as $$
begin
 if p is null or p='' then return true; end if;
 return p ~ '^\d{4}-\d{2}-\d{2}$' and to_char(p::date,'YYYY-MM-DD')=p;
exception when others then return false;
end;
$$;
create function public.importacao_validar(p_tipo text,p jsonb,p_decisao text) returns jsonb
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
   v=coalesce(p->>k,'');
   if not (case k when 'especie' then v in ('cao','gato') when 'sexo' then v in ('macho','femea')
    when 'porte' then v in ('mini','pequeno','medio','grande','gigante') when 'pelagem' then v in ('curta','media','longa')
    when 'temperamento' then v in ('calmo','moderado','dificil') else false end) then e=e||jsonb_build_array(k||' pendente'); end if;
  end loop;
  if coalesce(jsonb_typeof(p->'castrado'),'null')<>'boolean' then e=e||jsonb_build_array('castrado pendente'); end if;
  if not exists(select 1 from public.racas where id::text=p->>'raca_id' and especie=p->>'especie' and ativo and btrim(nome)<>'2') then e=e||jsonb_build_array('raça pendente'); end if;
  v=coalesce(p->>'peso','');
  if v<>'' then
   if v !~ '^\d{1,5}(\.\d{1,2})?$' then e=e||jsonb_build_array('Peso inválido'); end if;
  end if;
 end if;
 return e;
end;
$$;

create function public.importacao_obter_lote(p_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare resposta jsonb;
begin
 perform public.importacao_exigir_internal();
 select jsonb_build_object('id',l.id,'origem',l.origem,'revisao',l.revisao,'status',l.status,'arquivos',l.arquivos,'resultado',l.resultado,
 'clientes',coalesce((select jsonb_agg(jsonb_build_object('external_id',s.external_id,'linha_original',s.linha_original,'original',s.original,'resolvido',s.resolvido,
 'decisao_operador',s.decisao_operador,'erros',s.erros,'avisos',s.avisos,'status_validacao',s.status_validacao,'internal_id',coalesce(s.cliente_id_criado,m.cliente_id)) order by s.linha_original)
 from public.importacao_clientes_staging s left join public.importacao_mapeamentos m on m.origem=l.origem and m.tipo_entidade='cliente' and m.external_id=s.external_id where s.lote_id=l.id),'[]'),
 'pets',coalesce((select jsonb_agg(jsonb_build_object('external_id',s.external_id,'linha_original',s.linha_original,'original',s.original,'resolvido',s.resolvido,
 'decisao_operador',s.decisao_operador,'erros',s.erros,'avisos',s.avisos,'status_validacao',s.status_validacao,'internal_id',coalesce(s.pet_id_criado,m.pet_id)) order by s.linha_original)
 from public.importacao_pets_staging s left join public.importacao_mapeamentos m on m.origem=l.origem and m.tipo_entidade='pet' and m.external_id=s.external_id where s.lote_id=l.id),'[]')) into resposta
 from public.importacao_lotes l where l.id=p_id;
 if resposta is null then raise exception 'Lote não encontrado'; end if;
 return resposta;
end;
$$;

create function public.importacao_salvar_lote(p_documento jsonb) returns jsonb
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
 -- Duplicidades são avisos, nunca fusão automática. Comparação não altera originais.
 update public.importacao_clientes_staging c set avisos=(
  select coalesce(jsonb_agg(codigo),'[]') from (values
   ('telefone: POSSIVEL_DUPLICIDADE',regexp_replace(coalesce(c.resolvido->>'whatsapp',''),'\D','','g'), 'whatsapp'),
   ('cpf: POSSIVEL_DUPLICIDADE',regexp_replace(coalesce(c.resolvido->>'cpf',''),'\D','','g'),'cpf'),
   ('email: POSSIVEL_DUPLICIDADE',lower(btrim(coalesce(c.resolvido->>'email',''))),'email')) v(codigo,valor,campo)
  where valor<>'' and exists(select 1 from public.importacao_clientes_staging x where x.lote_id=lid and x.external_id<>c.external_id and
   case when campo='email' then lower(btrim(coalesce(x.resolvido->>campo,''))) else regexp_replace(coalesce(x.resolvido->>campo,''),'\D','','g') end=valor)) where c.lote_id=lid;
 update public.importacao_pets_staging p set avisos=case when exists(select 1 from public.importacao_pets_staging x where x.lote_id=lid and x.external_id<>p.external_id and x.external_cliente_id=p.external_cliente_id and lower(btrim(x.resolvido->>'nome'))=lower(btrim(p.resolvido->>'nome'))) then '["tutor+nome: POSSIVEL_DUPLICIDADE"]'::jsonb else '[]'::jsonb end where p.lote_id=lid;
 update public.importacao_clientes_staging c set avisos=avisos||'["nome+telefone: POSSIVEL_DUPLICIDADE"]'::jsonb where c.lote_id=lid and nullif(regexp_replace(c.resolvido->>'whatsapp','\D','','g'),'') is not null and exists
  (select 1 from public.importacao_clientes_staging x where x.lote_id=lid and x.external_id<>c.external_id and lower(btrim(x.resolvido->>'nome'))=lower(btrim(c.resolvido->>'nome')) and regexp_replace(x.resolvido->>'whatsapp','\D','','g')=regexp_replace(c.resolvido->>'whatsapp','\D','','g'));
 update public.importacao_clientes_staging set avisos=avisos||'["nome: NOME_NUMERICO"]'::jsonb where lote_id=lid and resolvido->>'nome' ~ '^[0-9\s()+-]+$';
 update public.importacao_pets_staging p set avisos=avisos||'["tutor+nome+raca: POSSIVEL_DUPLICIDADE"]'::jsonb where p.lote_id=lid and nullif(btrim(p.original->>'raca'),'') is not null and exists
  (select 1 from public.importacao_pets_staging x where x.lote_id=lid and x.external_id<>p.external_id and x.external_cliente_id=p.external_cliente_id and lower(btrim(x.resolvido->>'nome'))=lower(btrim(p.resolvido->>'nome')) and lower(btrim(x.original->>'raca'))=lower(btrim(p.original->>'raca')));
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

create function public.importacao_promover_lote(p_id uuid,p_revisao integer,p_confirmar boolean) returns jsonb
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
 -- Qualquer exceção aborta toda a RPC: cadastros, mapas e status são revertidos juntos.
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
   values(tutor,n->>'nome',n->>'especie',(n->>'raca_id')::uuid,n->>'sexo',n->>'porte',n->>'pelagem',n->>'temperamento',(n->>'castrado')::boolean,coalesce(n->>'data_nascimento',''),nullif(n->>'peso','')::numeric,coalesce(n->>'cor',''),coalesce(n->>'observacoes','')) returning id into iid;
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

create function public.importacao_criar_raca(p_lote uuid,p_nome text,p_especie text,p_confirmar boolean) returns uuid
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare rid uuid; nome_canonico text; nome_chave text;
begin
 perform public.importacao_exigir_internal();
 nome_canonico=btrim(regexp_replace(p_nome,'[[:space:]]+',' ','g'));
 if p_confirmar is distinct from true or coalesce(p_especie,'') not in ('cao','gato') or coalesce(length(nome_canonico),0) not between 1 and 100 or nome_canonico='2' then raise exception 'Nome, espécie e confirmação obrigatórios'; end if;
 perform 1 from public.importacao_lotes where id=p_lote and status not in ('concluido','cancelado') for update;
 if not found then raise exception 'Salve um lote aberto antes de criar raça'; end if;
 -- Comparação conservadora, sem extensão unaccent e sem criar/fundir aliases.
 nome_chave=btrim(regexp_replace(translate(lower(nome_canonico),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'),'[-–—[:space:]]+',' ','g'));
 if nome_chave='' then raise exception 'Nome canônico inválido'; end if;
 perform pg_advisory_xact_lock(hashtextextended('importacao-raca:'||p_especie||':'||nome_chave,0));
 if exists(select 1 from public.racas r where r.especie=p_especie and
   btrim(regexp_replace(translate(lower(r.nome),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'),'[-–—[:space:]]+',' ','g'))=nome_chave)
  or exists(select 1 from public.raca_sinonimos s where s.especie=p_especie and s.ativo and
   btrim(regexp_replace(translate(lower(s.nome),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'),'[-–—[:space:]]+',' ','g'))=nome_chave) then
  raise exception 'Raça ou sinônimo já cadastrado para a espécie. Associe o existente na revisão';
 end if;
 insert into public.racas(nome,especie,fonte_referencia) values(nome_canonico,p_especie,'Revisão explícita de importação') returning id into rid;
 update public.importacao_lotes set racas_criadas=racas_criadas+1,revisao=revisao+1 where id=p_lote;
 return rid;
end;
$$;

-- Helpers não são API. Só quatro RPCs públicas; autorização repetida em cada uma.
revoke all on function public.importacao_exigir_internal(),public.importacao_filtrar(jsonb,text[]),public.importacao_data_valida(text),public.importacao_validar(text,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.importacao_obter_lote(uuid),public.importacao_salvar_lote(jsonb),public.importacao_promover_lote(uuid,integer,boolean),public.importacao_criar_raca(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.importacao_obter_lote(uuid),public.importacao_salvar_lote(jsonb),public.importacao_promover_lote(uuid,integer,boolean),public.importacao_criar_raca(uuid,text,text,boolean) to authenticated,service_role;
commit;
