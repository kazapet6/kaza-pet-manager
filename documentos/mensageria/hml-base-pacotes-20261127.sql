-- Exclusivo HML. Extratos de 027, 028 e 030. Preserva tabelas e triggers existentes.
DO $guard$ BEGIN
 IF (SELECT count(*) FROM public.clientes)<>3 OR (SELECT count(*) FROM public.pets)<>3 OR EXISTS(SELECT 1 FROM public.pacotes) OR EXISTS(SELECT 1 FROM public.contratos) THEN RAISE EXCEPTION 'HML_PRECONDICAO'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('pacote_servico_regras_preco','pacote_operacoes_idempotentes','contrato_item_regras_aplicadas')) OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('salvar_pacote_completo','preservar_contrato_regra_snapshot')) THEN RAISE EXCEPTION 'HML_OBJETO_EXISTENTE'; END IF;
 IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename IN ('pacotes','pacote_servicos')) THEN RAISE EXCEPTION 'HML_POLITICAS_PREEXISTENTES'; END IF;
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pacote_servicos' AND column_name='desconto_percentual') THEN RAISE EXCEPTION 'HML_DESCONTO_AUSENTE'; END IF;
END $guard$;
create table public.pacote_servico_regras_preco (
  id uuid primary key default gen_random_uuid(),
  pacote_servico_id uuid not null references public.pacote_servicos(id) on delete cascade,
  criterio text not null check (criterio in ('porte', 'pelagem', 'raca', 'peso', 'temperamento')),
  porte text check (porte in ('mini', 'pequeno', 'medio', 'grande', 'gigante')),
  pelagem text check (pelagem in ('curta', 'media', 'longa')),
  raca_id uuid references public.racas(id) on delete restrict,
  peso_min numeric(8, 2) check (peso_min >= 0),
  peso_max numeric(8, 2) check (peso_max >= 0),
  temperamento text check (temperamento in ('calmo', 'moderado', 'dificil')),
  acrescimo_valor numeric(10, 2) not null check (acrescimo_valor >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pacote_servico_regra_peso_intervalo_check check (
    peso_max is null or peso_min is null or peso_max >= peso_min
  ),
  constraint pacote_servico_regra_criterio_check check (
    (criterio = 'porte' and porte is not null and pelagem is null and raca_id is null and peso_min is null and peso_max is null and temperamento is null)
    or (criterio = 'pelagem' and porte is null and pelagem is not null and raca_id is null and peso_min is null and peso_max is null and temperamento is null)
    or (criterio = 'raca' and porte is null and pelagem is null and raca_id is not null and peso_min is null and peso_max is null and temperamento is null)
    or (criterio = 'peso' and porte is null and pelagem is null and raca_id is null and (peso_min is not null or peso_max is not null) and temperamento is null)
    or (criterio = 'temperamento' and porte is null and pelagem is null and raca_id is null and peso_min is null and peso_max is null and temperamento is not null)
  )
);
create index pacote_servico_regras_item_idx on public.pacote_servico_regras_preco(pacote_servico_id, ativo);
create unique index pacote_servico_regras_unicas
  on public.pacote_servico_regras_preco
  (pacote_servico_id,criterio,porte,pelagem,raca_id,peso_min,peso_max,temperamento)
  nulls not distinct;
create trigger pacote_servico_regras_atualizar_updated_at before update on public.pacote_servico_regras_preco
for each row execute function public.atualizar_updated_at();
create table public.pacote_operacoes_idempotentes (
  chave_idempotencia uuid primary key,
  hash_requisicao text not null,
  resposta jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.pacote_operacoes_idempotentes enable row level security;
revoke all on public.pacote_operacoes_idempotentes from public, anon, authenticated;
grant select, insert on public.pacote_operacoes_idempotentes to service_role;
create table public.contrato_item_regras_aplicadas (
  id uuid primary key default gen_random_uuid(),
  contrato_item_id uuid not null references public.contrato_itens(id) on delete restrict,
  origem text not null check (origem in ('servico_avulso', 'pacote')),
  regra_servico_id_origem uuid references public.servico_regras_preco(id) on delete set null,
  regra_pacote_id_origem uuid references public.pacote_servico_regras_preco(id) on delete set null,
  ordem integer not null check (ordem > 0),
  criterio text not null check (criterio in ('porte', 'pelagem', 'raca', 'peso', 'temperamento')),
  descricao_snapshot text not null check (nullif(btrim(descricao_snapshot), '') is not null),
  valor_referencia_snapshot text not null,
  acrescimo_valor_snapshot numeric(12, 2) not null check (acrescimo_valor_snapshot >= 0),
  created_at timestamptz not null default now(),
  constraint contrato_item_regra_origem_check check (
    (origem = 'servico_avulso' and regra_pacote_id_origem is null)
    or (origem = 'pacote' and regra_servico_id_origem is null)
  ),
  unique (contrato_item_id, origem, ordem)
);

create index contrato_item_regras_item_idx
  on public.contrato_item_regras_aplicadas(contrato_item_id, origem, ordem);
create or replace function public.preservar_contrato_regra_snapshot()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if tg_op='DELETE' then raise exception 'Snapshots do Contrato são imutáveis.' using errcode='23514';end if;
 if new is distinct from old and not (
   ((old.regra_pacote_id_origem is not null and new.regra_pacote_id_origem is null)
     or (old.regra_servico_id_origem is not null and new.regra_servico_id_origem is null))
   and (to_jsonb(new)-'regra_pacote_id_origem'-'regra_servico_id_origem')=(to_jsonb(old)-'regra_pacote_id_origem'-'regra_servico_id_origem')
 ) then raise exception 'Snapshots do Contrato são imutáveis.' using errcode='23514';end if;
 return new;
end;$$;
revoke all on function public.preservar_contrato_regra_snapshot() from public,anon,authenticated;
create trigger contrato_item_regras_imutaveis before delete or update on public.contrato_item_regras_aplicadas for each row execute function public.preservar_contrato_regra_snapshot();
create or replace function public.salvar_pacote_completo(p_intencao jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_operacao text;v_chave uuid;v_hash text;v_nome text;v_ativo boolean;v_pacote_id uuid;
 v_versao_esperada bigint;v_versao_atual bigint;v_servicos jsonb;v_item jsonb;v_item_id uuid;
 v_resposta jsonb;v_existente public.pacote_operacoes_idempotentes%rowtype;v_desconto numeric;
begin
 if p_intencao is null or jsonb_typeof(p_intencao)<>'object' then return jsonb_build_object('status','invalido','codigo','INTENCAO_INVALIDA','mensagem','Intenção inválida.');end if;
 v_operacao=p_intencao->>'operacao';v_chave=(p_intencao->>'chaveIdempotencia')::uuid;v_hash=md5((p_intencao-'chaveIdempotencia')::text);
 v_nome=btrim(p_intencao->>'nome');v_ativo=(p_intencao->>'ativo')::boolean;v_servicos=p_intencao->'servicos';
 if v_operacao not in('criar','editar') or v_chave is null or char_length(v_nome) not between 1 and 120 or jsonb_typeof(v_servicos)<>'array' then return jsonb_build_object('status','invalido','codigo','INTENCAO_INVALIDA','mensagem','Dados do Pacote inválidos.');end if;
 if v_ativo and jsonb_array_length(v_servicos)=0 then return jsonb_build_object('status','invalido','codigo','COMPOSICAO_OBRIGATORIA','mensagem','Pacote ativo precisa possuir Serviços.');end if;
 perform pg_advisory_xact_lock(hashtextextended('pacote:'||v_chave::text,0));
 select * into v_existente from public.pacote_operacoes_idempotentes where chave_idempotencia=v_chave;
 if found then if v_existente.hash_requisicao<>v_hash then return jsonb_build_object('status','invalido','codigo','IDEMPOTENCIA_CONFLITANTE','mensagem','A chave de tentativa pertence a outra operação.');end if;return v_existente.resposta;end if;
 if exists(select 1 from jsonb_array_elements(v_servicos) e group by e->>'servicoId' having count(*)>1) then return jsonb_build_object('status','invalido','codigo','SERVICO_DUPLICADO','mensagem','Um Serviço aparece mais de uma vez no Pacote.');end if;
 if v_operacao='criar' then v_pacote_id=gen_random_uuid();insert into public.pacotes(id,nome,tipo,transporte_incluido,ativo,versao)values(v_pacote_id,v_nome,null,true,false,0);v_versao_atual=0;
 else v_pacote_id=(p_intencao->>'pacoteId')::uuid;v_versao_esperada=(p_intencao->>'versaoEsperada')::bigint;select versao into v_versao_atual from public.pacotes where id=v_pacote_id for update;if not found then return jsonb_build_object('status','invalido','codigo','PACOTE_NAO_ENCONTRADO','mensagem','Pacote não encontrado.');end if;if v_versao_atual<>v_versao_esperada then return jsonb_build_object('status','conflito','codigo','VERSAO_DIVERGENTE','mensagem','O Pacote foi alterado por outra sessão. Recarregue e tente novamente.');end if;delete from public.pacote_servicos where pacote_id=v_pacote_id;end if;
 for v_item in select value from jsonb_array_elements(v_servicos) loop
  v_desconto=(v_item->>'descontoPercentual')::numeric;
  if v_desconto is null or v_desconto<0 or v_desconto>100 then raise exception 'DESCONTO_INVALIDO';end if;
  if not exists(select 1 from public.servicos where id=(v_item->>'servicoId')::uuid and ativo) then raise exception 'SERVICO_INDISPONIVEL';end if;
  if not exists(select 1 from public.unidades_periodo where codigo=v_item->>'intervaloUnidade' and ativo) or not exists(select 1 from public.unidades_periodo where codigo=v_item->>'offsetInicialUnidade' and ativo) then raise exception 'UNIDADE_INVALIDA';end if;
  v_item_id=gen_random_uuid();
  insert into public.pacote_servicos(id,pacote_id,servico_id,ordem_exibicao,quantidade_por_ciclo,intervalo_quantidade,intervalo_unidade,offset_inicial_quantidade,offset_inicial_unidade,preco_pacote_base_unitario,desconto_percentual,ativo)
  values(v_item_id,v_pacote_id,(v_item->>'servicoId')::uuid,(v_item->>'ordem')::integer,(v_item->>'quantidadePorCiclo')::integer,(v_item->>'intervaloQuantidade')::integer,v_item->>'intervaloUnidade',(v_item->>'offsetInicialQuantidade')::integer,v_item->>'offsetInicialUnidade',0,v_desconto,true);
 end loop;
 update public.pacotes set nome=v_nome,ativo=v_ativo,versao=v_versao_atual+1 where id=v_pacote_id;
 v_resposta=jsonb_build_object('status','salvo','pacoteId',v_pacote_id,'versao',v_versao_atual+1);
 insert into public.pacote_operacoes_idempotentes(chave_idempotencia,hash_requisicao,resposta)values(v_chave,v_hash,v_resposta);return v_resposta;
exception when unique_violation then return jsonb_build_object('status','invalido','codigo','DUPLICIDADE','mensagem','Nome, Serviço ou ordem duplicada.');
 when check_violation or foreign_key_violation or invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('status','invalido','codigo','DADOS_INVALIDOS','mensagem','A composição possui dados inválidos.');
 when others then if sqlerrm in('SERVICO_INDISPONIVEL','UNIDADE_INVALIDA','DESCONTO_INVALIDO') then return jsonb_build_object('status','invalido','codigo',sqlerrm,'mensagem','A composição referencia configuração indisponível ou inválida.');end if;raise;
end;$$;
revoke all on function public.salvar_pacote_completo(jsonb) from public,anon,authenticated;
grant execute on function public.salvar_pacote_completo(jsonb) to service_role;
create or replace function public.validar_pacote_ativo_com_composicao()
returns trigger language plpgsql set search_path = pg_catalog as $$
declare v_pacote_id uuid;
begin
  if tg_table_name = 'pacotes' then
    if new.ativo and (
      not exists(select 1 from public.pacote_servicos where pacote_id=new.id and ativo)
      or exists(select 1 from public.pacote_servicos where pacote_id=new.id and ativo and desconto_percentual is null)
    ) then raise exception 'Pacote ativo precisa possuir composição revisada.' using errcode='23514'; end if;
    return new;
  end if;
  v_pacote_id := case when tg_op='DELETE' then old.pacote_id else new.pacote_id end;
  if exists(select 1 from public.pacotes where id=v_pacote_id and ativo) and (
    not exists(select 1 from public.pacote_servicos where pacote_id=v_pacote_id and ativo)
    or exists(select 1 from public.pacote_servicos where pacote_id=v_pacote_id and ativo and desconto_percentual is null)
  ) then raise exception 'Pacote ativo precisa possuir composição revisada.' using errcode='23514'; end if;
  if tg_op='DELETE' then return old; end if; return new;
end;$$;
revoke all on function public.validar_pacote_ativo_com_composicao() from public,anon,authenticated;
grant select,insert,update on public.pacotes to service_role;
grant select,insert,update,delete on public.pacote_servicos,public.pacote_servico_regras_preco to service_role;
grant select,insert on public.contrato_item_regras_aplicadas to service_role;
alter table public.pacote_servico_regras_preco enable row level security;
alter table public.contrato_item_regras_aplicadas enable row level security;
DO $pol$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['pacotes','pacote_servicos','pacote_servico_regras_preco','contrato_item_regras_aplicadas'] LOOP
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 EXECUTE format('CREATE POLICY hml_catalogo_pacotes_leitura_interna ON public.%I FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL AND ((SELECT auth.jwt())->''app_metadata''->>''role'')=''internal'')',t);
END LOOP; END $pol$;
NOTIFY pgrst,'reload schema';
