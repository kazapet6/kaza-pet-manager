begin;

-- Unidades posicionais. Mes e ano sao calendarios: deliberadamente nao ha
-- conversao universal para dias.
create table public.unidades_periodo (
  codigo text primary key check (codigo = lower(btrim(codigo)) and char_length(codigo) between 1 and 30),
  nome text not null unique check (nome = btrim(nome) and char_length(nome) between 1 and 60),
  natureza text not null check (natureza in ('duracao_exata', 'calendario')),
  ordem integer not null unique check (ordem > 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.unidades_periodo (codigo, nome, natureza, ordem) values
  ('dia', 'Dia', 'duracao_exata', 1),
  ('semana', 'Semana', 'duracao_exata', 2),
  ('mes', 'Mes', 'calendario', 3),
  ('ano', 'Ano', 'calendario', 4);

-- Compatibilidade expansiva com a 026 ja publicada. Os campos legados ficam
-- disponiveis ate uma migration posterior, mas deixam de ser autoridade.
alter table public.pacotes alter column tipo drop not null;
comment on column public.pacotes.tipo is 'LEGADO 026: sem autoridade apos a migration 027.';
comment on column public.pacotes.quantidade_banhos_ciclo is 'LEGADO 026: nao usar como quantidade contratada.';
comment on column public.pacotes.intervalo_semanas is 'LEGADO 026: nao usar como recorrencia.';
comment on column public.pacotes.transporte_incluido is 'LEGADO 026: transporte pertence ao futuro Contrato.';

-- Nao ha conversao segura de tipo legado em Servico. Pacotes existentes
-- precisam receber composicao explicita antes de voltar a ficar ativos.
update public.pacotes set ativo = false where ativo;

create table public.pacote_servicos (
  id uuid primary key default gen_random_uuid(),
  pacote_id uuid not null references public.pacotes(id) on delete cascade,
  servico_id uuid not null references public.servicos(id) on delete restrict,
  ordem_exibicao integer not null check (ordem_exibicao > 0),
  quantidade_por_ciclo integer not null check (quantidade_por_ciclo > 0),
  intervalo_quantidade integer not null check (intervalo_quantidade > 0),
  intervalo_unidade text not null references public.unidades_periodo(codigo) on delete restrict,
  offset_inicial_quantidade integer not null default 0 check (offset_inicial_quantidade >= 0),
  offset_inicial_unidade text not null default 'dia' references public.unidades_periodo(codigo) on delete restrict,
  preco_pacote_base_unitario numeric(10, 2) not null check (preco_pacote_base_unitario >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pacote_id, servico_id),
  unique (pacote_id, ordem_exibicao)
);

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

create index pacote_servicos_pacote_idx on public.pacote_servicos(pacote_id, ativo, ordem_exibicao);
create index pacote_servico_regras_item_idx on public.pacote_servico_regras_preco(pacote_servico_id, ativo);
create unique index pacote_servico_regras_unicas
  on public.pacote_servico_regras_preco
  (pacote_servico_id,criterio,porte,pelagem,raca_id,peso_min,peso_max,temperamento)
  nulls not distinct;

create trigger pacote_servicos_atualizar_updated_at before update on public.pacote_servicos
for each row execute function public.atualizar_updated_at();
create trigger pacote_servico_regras_atualizar_updated_at before update on public.pacote_servico_regras_preco
for each row execute function public.atualizar_updated_at();

alter table public.unidades_periodo enable row level security;
alter table public.pacote_servicos enable row level security;
alter table public.pacote_servico_regras_preco enable row level security;

revoke all on public.unidades_periodo, public.pacote_servicos, public.pacote_servico_regras_preco from public, anon, authenticated;
grant select on public.unidades_periodo, public.pacote_servicos, public.pacote_servico_regras_preco to authenticated;
grant select on public.unidades_periodo to service_role;
grant select, insert, update, delete on public.pacote_servicos, public.pacote_servico_regras_preco to service_role;

create policy unidades_periodo_select_internal on public.unidades_periodo for select to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'internal');
create policy pacote_servicos_select_internal on public.pacote_servicos for select to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'internal');
create policy pacote_servico_regras_select_internal on public.pacote_servico_regras_preco for select to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'internal');

create or replace function public.validar_pacote_ativo_com_composicao()
returns trigger language plpgsql set search_path = pg_catalog as $$
declare v_pacote_id uuid;
begin
  if tg_table_name = 'pacotes' then
    if new.ativo and not exists(select 1 from public.pacote_servicos where pacote_id=new.id and ativo) then
      raise exception 'Pacote ativo precisa possuir composicao.' using errcode='23514';
    end if;
    return new;
  end if;
  v_pacote_id := case when tg_op='DELETE' then old.pacote_id else new.pacote_id end;
  if exists(select 1 from public.pacotes where id=v_pacote_id and ativo)
     and not exists(select 1 from public.pacote_servicos where pacote_id=v_pacote_id and ativo) then
    raise exception 'Pacote ativo precisa possuir composicao.' using errcode='23514';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger pacotes_exigir_composicao before insert or update of ativo on public.pacotes
for each row execute function public.validar_pacote_ativo_com_composicao();
create constraint trigger pacote_servicos_preservar_composicao
after insert or update or delete on public.pacote_servicos
deferrable initially deferred for each row execute function public.validar_pacote_ativo_com_composicao();

create table public.pacote_operacoes_idempotentes (
  chave_idempotencia uuid primary key,
  hash_requisicao text not null,
  resposta jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.pacote_operacoes_idempotentes enable row level security;
revoke all on public.pacote_operacoes_idempotentes from public, anon, authenticated;
grant select, insert on public.pacote_operacoes_idempotentes to service_role;

create or replace function public.salvar_pacote_completo(p_intencao jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_operacao text;
  v_chave uuid;
  v_hash text;
  v_nome text;
  v_ativo boolean;
  v_pacote_id uuid;
  v_versao_esperada bigint;
  v_versao_atual bigint;
  v_servicos jsonb;
  v_item jsonb;
  v_regra jsonb;
  v_item_id uuid;
  v_resposta jsonb;
  v_existente public.pacote_operacoes_idempotentes%rowtype;
begin
  if p_intencao is null or jsonb_typeof(p_intencao) <> 'object' then
    return jsonb_build_object('status','invalido','codigo','INTENCAO_INVALIDA','mensagem','Intencao invalida.');
  end if;
  v_operacao := p_intencao ->> 'operacao';
  v_chave := (p_intencao ->> 'chaveIdempotencia')::uuid;
  v_hash := md5((p_intencao - 'chaveIdempotencia')::text);
  v_nome := btrim(p_intencao ->> 'nome');
  v_ativo := (p_intencao ->> 'ativo')::boolean;
  v_servicos := p_intencao -> 'servicos';
  if v_operacao not in ('criar','editar') or v_chave is null or char_length(v_nome) not between 1 and 120
     or jsonb_typeof(v_servicos) <> 'array' then
    return jsonb_build_object('status','invalido','codigo','INTENCAO_INVALIDA','mensagem','Dados do pacote invalidos.');
  end if;
  if v_ativo and jsonb_array_length(v_servicos) = 0 then
    return jsonb_build_object('status','invalido','codigo','COMPOSICAO_OBRIGATORIA','mensagem','Pacote ativo precisa possuir servicos.');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pacote:' || v_chave::text, 0));
  select * into v_existente from public.pacote_operacoes_idempotentes where chave_idempotencia = v_chave;
  if found then
    if v_existente.hash_requisicao <> v_hash then
      return jsonb_build_object('status','invalido','codigo','IDEMPOTENCIA_CONFLITANTE','mensagem','A chave de tentativa pertence a outra operacao.');
    end if;
    return v_existente.resposta;
  end if;

  if exists (select 1 from jsonb_array_elements(v_servicos) elemento
    group by elemento ->> 'servicoId' having count(*) > 1) then
    return jsonb_build_object('status','invalido','codigo','SERVICO_DUPLICADO','mensagem','Um servico aparece mais de uma vez no pacote.');
  end if;

  if v_operacao = 'criar' then
    v_pacote_id := gen_random_uuid();
    insert into public.pacotes(id,nome,tipo,transporte_incluido,ativo,versao)
    values(v_pacote_id,v_nome,null,true,false,0);
    v_versao_atual := 0;
  else
    v_pacote_id := (p_intencao ->> 'pacoteId')::uuid;
    v_versao_esperada := (p_intencao ->> 'versaoEsperada')::bigint;
    select versao into v_versao_atual from public.pacotes where id = v_pacote_id for update;
    if not found then
      return jsonb_build_object('status','invalido','codigo','PACOTE_NAO_ENCONTRADO','mensagem','Pacote nao encontrado.');
    end if;
    if v_versao_atual <> v_versao_esperada then
      return jsonb_build_object('status','conflito','codigo','VERSAO_DIVERGENTE','mensagem','O pacote foi alterado por outra sessao. Recarregue e tente novamente.');
    end if;
    delete from public.pacote_servicos where pacote_id = v_pacote_id;
  end if;

  for v_item in select value from jsonb_array_elements(v_servicos) loop
    if not exists (select 1 from public.servicos where id = (v_item ->> 'servicoId')::uuid and ativo) then
      raise exception 'SERVICO_INDISPONIVEL';
    end if;
    if not exists (select 1 from public.unidades_periodo where codigo = v_item ->> 'intervaloUnidade' and ativo)
       or not exists (select 1 from public.unidades_periodo where codigo = v_item ->> 'offsetInicialUnidade' and ativo) then
      raise exception 'UNIDADE_INVALIDA';
    end if;
    v_item_id := gen_random_uuid();
    insert into public.pacote_servicos(
      id,pacote_id,servico_id,ordem_exibicao,quantidade_por_ciclo,
      intervalo_quantidade,intervalo_unidade,offset_inicial_quantidade,
      offset_inicial_unidade,preco_pacote_base_unitario,ativo
    ) values (
      v_item_id,v_pacote_id,(v_item ->> 'servicoId')::uuid,(v_item ->> 'ordem')::integer,
      (v_item ->> 'quantidadePorCiclo')::integer,(v_item ->> 'intervaloQuantidade')::integer,
      v_item ->> 'intervaloUnidade',(v_item ->> 'offsetInicialQuantidade')::integer,
      v_item ->> 'offsetInicialUnidade',(v_item ->> 'precoPacoteBaseUnitario')::numeric,true
    );
    if jsonb_typeof(coalesce(v_item -> 'regrasPreco','[]'::jsonb)) <> 'array' then raise exception 'REGRAS_INVALIDAS'; end if;
    for v_regra in select value from jsonb_array_elements(coalesce(v_item -> 'regrasPreco','[]'::jsonb)) loop
      insert into public.pacote_servico_regras_preco(
        pacote_servico_id,criterio,porte,pelagem,raca_id,peso_min,peso_max,temperamento,acrescimo_valor,ativo
      ) values (
        v_item_id,v_regra ->> 'criterio',nullif(v_regra ->> 'porte',''),nullif(v_regra ->> 'pelagem',''),
        nullif(v_regra ->> 'racaId','')::uuid,nullif(v_regra ->> 'pesoMin','')::numeric,
        nullif(v_regra ->> 'pesoMax','')::numeric,nullif(v_regra ->> 'temperamento',''),
        (v_regra ->> 'acrescimoValor')::numeric,true
      );
    end loop;
  end loop;

  update public.pacotes set nome=v_nome,ativo=v_ativo,versao=v_versao_atual+1 where id=v_pacote_id;
  v_resposta := jsonb_build_object('status','salvo','pacoteId',v_pacote_id,'versao',v_versao_atual+1);
  insert into public.pacote_operacoes_idempotentes(chave_idempotencia,hash_requisicao,resposta) values(v_chave,v_hash,v_resposta);
  return v_resposta;
exception
  when unique_violation then return jsonb_build_object('status','invalido','codigo','DUPLICIDADE','mensagem','Nome, servico ou ordem duplicada.');
  when check_violation or foreign_key_violation or invalid_text_representation or numeric_value_out_of_range then
    return jsonb_build_object('status','invalido','codigo','DADOS_INVALIDOS','mensagem','A composicao possui dados invalidos.');
  when others then
    if sqlerrm in ('SERVICO_INDISPONIVEL','UNIDADE_INVALIDA','REGRAS_INVALIDAS') then
      return jsonb_build_object('status','invalido','codigo',sqlerrm,'mensagem','A composicao referencia configuracao indisponivel ou invalida.');
    end if;
    raise;
end;
$$;

revoke all on function public.salvar_pacote_completo(jsonb) from public, anon, authenticated;
grant execute on function public.salvar_pacote_completo(jsonb) to service_role;

comment on table public.pacote_servicos is 'Composicao comercial: quantidade fechada por ciclo e recorrencia posicional independente.';
comment on column public.pacote_servicos.quantidade_por_ciclo is 'Quantidade autoritativa adquirida por ciclo; nunca derivada do calendario.';
comment on column public.pacote_servicos.intervalo_unidade is 'Unidade posicional aplicada futuramente sobre a data ancora do Contrato.';

commit;
