begin;

-- 030 — Pacote oferece desconto sobre o preço avulso autoritativo do Serviço.
-- Preços e regras por perfil da 027 permanecem somente como legado auditável.
alter table public.pacote_servicos
  add column if not exists desconto_percentual numeric(5,2)
  check (desconto_percentual between 0 and 100);

comment on column public.pacote_servicos.desconto_percentual is
  'Benefício comercial do Pacote aplicado ao preço avulso oficial do Serviço para o pet. NULL identifica configuração legada que exige revisão humana.';
comment on column public.pacote_servicos.preco_pacote_base_unitario is
  'LEGADO 027: não é autoridade para novos Pacotes; preservado temporariamente para auditoria e compatibilidade histórica.';
comment on table public.pacote_servico_regras_preco is
  'LEGADO 027: regras próprias de preço do Pacote, sem uso em novas simulações ou vendas; preservadas para auditoria.';

-- Não há conversão comercial segura de valores absolutos/regras antigas para
-- percentuais. Pacotes afetados ficam indisponíveis até edição humana oficial.
update public.pacotes p set ativo=false
where exists (
  select 1 from public.pacote_servicos ps
  where ps.pacote_id=p.id and ps.ativo and ps.desconto_percentual is null
);

alter table public.contrato_itens
  add column if not exists desconto_percentual_snapshot numeric(5,2)
  check (desconto_percentual_snapshot is null or desconto_percentual_snapshot between 0 and 100);
comment on column public.contrato_itens.desconto_percentual_snapshot is
  'Desconto do item no momento da venda. NULL identifica Contrato histórico anterior à 030.';

-- NULL identifica inequivocamente o modelo histórico anterior à 030. A coluna
-- é criada SEM default para não classificar retroativamente vendas existentes;
-- o default só é definido depois, para inserts futuros.
alter table public.contratos
  add column if not exists modelo_operacional_versao smallint;
comment on column public.contratos.modelo_operacional_versao is
  'NULL = Contrato histórico anterior à arquitetura operacional 030. 30 = venda criada já com Ciclo e janela TaxiDog validados pelo Motor.';

alter table public.contratos
  alter column modelo_operacional_versao set default 30;

-- A 029 adiou TaxiDog e permitiu Contratos taxidog sem ciclo/janela. Esses
-- registros permanecem históricos (versão NULL); somente o modelo 030 exige a
-- referência logística oficial, sem inventar informação retroativa.
alter table public.contratos drop constraint if exists contratos_modalidade_taxidog_029_check;
alter table public.contratos drop constraint if exists contratos_modalidade_taxidog_check;
alter table public.contratos drop constraint if exists contratos_modalidade_taxidog_030_check;
alter table public.contratos add constraint contratos_modalidade_taxidog_030_check check (
  modelo_operacional_versao is null
  or (
    modelo_operacional_versao=30
    and (
      (modalidade_transporte='sem_transporte' and taxidog_ciclo_id is null)
      or (modalidade_transporte='taxidog' and taxidog_ciclo_id is not null)
    )
  )
);

create or replace function public.validar_modelo_operacional_contrato()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  if tg_op='INSERT' and new.modelo_operacional_versao is null then
    raise exception 'Novo Contrato exige modelo_operacional_versao.' using errcode='23514';
  end if;
  if tg_op='UPDATE' and old.modelo_operacional_versao is distinct from new.modelo_operacional_versao then
    raise exception 'A versão do modelo operacional do Contrato é imutável.' using errcode='23514';
  end if;
  return new;
end;$$;
drop trigger if exists contratos_validar_modelo_operacional on public.contratos;
create trigger contratos_validar_modelo_operacional
before insert or update on public.contratos
for each row execute function public.validar_modelo_operacional_contrato();

create or replace function public.validar_desconto_snapshot_contrato_030()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  if new.desconto_percentual_snapshot is null and exists(
    select 1 from public.contratos c
    where c.id=new.contrato_id and c.modelo_operacional_versao=30
  ) then
    raise exception 'Item de Contrato 030 exige desconto_percentual_snapshot.' using errcode='23514';
  end if;
  return new;
end;$$;
drop trigger if exists contrato_itens_validar_desconto_030 on public.contrato_itens;
create trigger contrato_itens_validar_desconto_030
before insert or update on public.contrato_itens
for each row execute function public.validar_desconto_snapshot_contrato_030();

create table public.contrato_ciclos (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.contratos(id) on delete restrict,
  numero integer not null check(numero>0),
  estado text not null check(estado in ('reservado','requer_revisao','em_andamento','concluido','cancelado')),
  situacao_financeira text not null default 'pendente' check(situacao_financeira in ('pendente','parcial','pago','isento')),
  data_ancora_pretendida date not null,
  dia_semana_pretendido smallint not null check(dia_semana_pretendido between 0 and 6),
  horario_pretendido time not null,
  modalidade_transporte_pretendida text not null check(modalidade_transporte_pretendida in ('sem_transporte','taxidog')),
  taxidog_ciclo_id_pretendido uuid references public.taxidog_ciclos(id) on delete restrict,
  configuracao_agenda_versao bigint,
  ocupacao_agenda_versao bigint,
  motivo_revisao text,
  criado_por uuid not null,
  created_at timestamptz not null default now(),
  concluido_em timestamptz,
  unique(contrato_id,numero),
  check(extract(dow from data_ancora_pretendida)::smallint=dia_semana_pretendido),
  check((modalidade_transporte_pretendida='sem_transporte' and taxidog_ciclo_id_pretendido is null)
    or (modalidade_transporte_pretendida='taxidog' and taxidog_ciclo_id_pretendido is not null)),
  check((estado='requer_revisao' and nullif(btrim(motivo_revisao),'') is not null)
    or (estado<>'requer_revisao' and motivo_revisao is null))
);

create table public.contrato_ciclo_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  ciclo_id uuid not null references public.contrato_ciclos(id) on delete restrict,
  ordem integer not null check(ordem>0),
  data_operacional date not null,
  horario_apresentado time not null,
  inicio_operacional timestamptz not null,
  conclusao_prevista timestamptz not null,
  taxidog_ciclo_id uuid references public.taxidog_ciclos(id) on delete restrict,
  plano_operacional jsonb not null check(jsonb_typeof(plano_operacional)='object'),
  estado text not null default 'reservada' check(estado in ('reservada','materializada','concluida','cancelada')),
  atendimento_id uuid references public.atendimentos(id) on delete restrict,
  created_at timestamptz not null default now(),
  materializada_em timestamptz,
  concluida_em timestamptz,
  unique(ciclo_id,ordem),
  unique(id,ciclo_id),
  check(inicio_operacional<conclusao_prevista),
  check((estado='reservada' and atendimento_id is null and materializada_em is null)
    or (estado in ('materializada','concluida') and atendimento_id is not null and materializada_em is not null)
    or estado='cancelada')
);

create table public.contrato_ciclo_ocorrencia_itens (
  ocorrencia_id uuid not null,
  ciclo_id uuid not null,
  contrato_item_id uuid not null references public.contrato_itens(id) on delete restrict,
  ordinal_no_item integer not null check(ordinal_no_item>0),
  primary key(ocorrencia_id,contrato_item_id),
  foreign key(ocorrencia_id,ciclo_id) references public.contrato_ciclo_ocorrencias(id,ciclo_id) on delete restrict,
  unique(ciclo_id,contrato_item_id,ordinal_no_item)
);

create unique index contrato_ciclo_um_aberto_idx on public.contrato_ciclos(contrato_id)
where estado in ('reservado','requer_revisao','em_andamento');
create index contrato_ocorrencias_reservadas_data_idx
on public.contrato_ciclo_ocorrencias(data_operacional,inicio_operacional)
where estado='reservada' and atendimento_id is null;
create or replace function public.validar_item_ocorrencia_contrato()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if not exists(select 1 from public.contrato_ciclos c join public.contrato_itens i on i.contrato_id=c.contrato_id where c.id=new.ciclo_id and i.id=new.contrato_item_id) then raise exception 'Item e ocorrência pertencem a Contratos diferentes.' using errcode='23514';end if;
 return new;
end;$$;
create trigger contrato_ocorrencia_item_validar before insert or update on public.contrato_ciclo_ocorrencia_itens for each row execute function public.validar_item_ocorrencia_contrato();

alter table public.contrato_ciclos enable row level security;
alter table public.contrato_ciclo_ocorrencias enable row level security;
alter table public.contrato_ciclo_ocorrencia_itens enable row level security;
revoke all on public.contrato_ciclos,public.contrato_ciclo_ocorrencias,public.contrato_ciclo_ocorrencia_itens from public,anon,authenticated;
grant select on public.contrato_ciclos,public.contrato_ciclo_ocorrencias,public.contrato_ciclo_ocorrencia_itens to authenticated;
grant select,insert,update on public.contrato_ciclos,public.contrato_ciclo_ocorrencias to service_role;
grant select,insert on public.contrato_ciclo_ocorrencia_itens to service_role;
create policy contrato_ciclos_select_internal on public.contrato_ciclos for select to authenticated using((auth.jwt()->'app_metadata'->>'role')='internal');
create policy contrato_ocorrencias_select_internal on public.contrato_ciclo_ocorrencias for select to authenticated using((auth.jwt()->'app_metadata'->>'role')='internal');
create policy contrato_ocorrencia_itens_select_internal on public.contrato_ciclo_ocorrencia_itens for select to authenticated using((auth.jwt()->'app_metadata'->>'role')='internal');

comment on table public.contrato_ciclos is 'Unidade finita que compromete capacidade; mês civil não delimita Ciclo.';
comment on table public.contrato_ciclo_ocorrencias is 'Reservas finitas produzidas pelo Motor. Ao materializar, atendimento_id impede dupla contagem.';
comment on column public.contrato_ciclo_ocorrencias.plano_operacional is 'Snapshot do plano autoritativo do Motor, incluindo alocações efetivas; não representa preço nem crédito.';

-- Exclusão/recriação de itens do catálogo pode anular apenas a referência de
-- origem. Todo conteúdo comercial do snapshot continua imutável.
drop trigger if exists contrato_itens_imutaveis on public.contrato_itens;
create or replace function public.preservar_contrato_item_snapshot()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if tg_op='DELETE' then raise exception 'Snapshots do Contrato são imutáveis.' using errcode='23514';end if;
 if new is distinct from old and not (
   old.pacote_servico_id_origem is not null and new.pacote_servico_id_origem is null
   and (to_jsonb(new)-'pacote_servico_id_origem')=(to_jsonb(old)-'pacote_servico_id_origem')
 ) then raise exception 'Snapshots do Contrato são imutáveis.' using errcode='23514';end if;
 return new;
end;$$;
create trigger contrato_itens_imutaveis before update or delete on public.contrato_itens
for each row execute function public.preservar_contrato_item_snapshot();

drop trigger if exists contrato_item_regras_imutaveis on public.contrato_item_regras_aplicadas;
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
create trigger contrato_item_regras_imutaveis before update or delete on public.contrato_item_regras_aplicadas
for each row execute function public.preservar_contrato_regra_snapshot();

-- A RPC de venda mantém os snapshots antigos e acrescenta o benefício explícito.
-- O restante da validação e da transação continua definido pela 029.
create or replace function public.vender_contrato(p_intencao jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_chave uuid;v_usuario uuid;v_hash text;v_existente public.contrato_operacoes_idempotentes%rowtype;v_pacote public.pacotes%rowtype;v_pet public.pets%rowtype;v_contrato_id uuid;v_item jsonb;v_regra jsonb;v_item_id uuid;v_resposta jsonb;v_ciclo_id uuid;v_ocorrencia jsonb;v_ocorrencia_id uuid;v_ocupacao bigint;v_configuracao bigint;v_item_ref jsonb;
begin
 v_chave=(p_intencao->>'chaveIdempotencia')::uuid;v_usuario=(p_intencao->>'usuarioId')::uuid;v_hash=md5((p_intencao-'usuarioId')::text);perform pg_advisory_xact_lock(hashtextextended(v_chave::text,0));perform pg_advisory_xact_lock(hashtextextended('agenda:ocupacao',0));select versao into v_ocupacao from public.agenda_versao_ocupacao where id=true for update;select versao into v_configuracao from public.agenda_versao_configuracao where id=true;if v_ocupacao<>(p_intencao->>'ocupacaoAgendaVersao')::bigint or v_configuracao<>(p_intencao->>'configuracaoAgendaVersao')::bigint then return jsonb_build_object('status','conflito','codigo','DISPONIBILIDADE_ALTERADA','mensagem','A disponibilidade ou a configuração mudou. Consulte novamente antes de vender.');end if;if jsonb_typeof(p_intencao->'ocorrencias')<>'array' or jsonb_array_length(p_intencao->'ocorrencias')=0 then return jsonb_build_object('status','invalido','codigo','CICLO_SEM_RESERVAS','mensagem','A venda exige um primeiro Ciclo integralmente validado pelo Motor.');end if;select * into v_existente from public.contrato_operacoes_idempotentes where chave_idempotencia=v_chave for update;
 if found then if v_existente.usuario_id<>v_usuario or v_existente.hash_intencao<>v_hash then return jsonb_build_object('status','conflito','codigo','IDEMPOTENCIA_DIVERGENTE','mensagem','A chave de repetição já foi utilizada por outra venda.');end if;if v_existente.resposta is not null then return v_existente.resposta;end if;else insert into public.contrato_operacoes_idempotentes(chave_idempotencia,usuario_id,hash_intencao)values(v_chave,v_usuario,v_hash);end if;
 select * into v_pacote from public.pacotes where id=(p_intencao->>'pacoteId')::uuid for update;if not found or not v_pacote.ativo then return jsonb_build_object('status','invalido','codigo','PACOTE_INDISPONIVEL','mensagem','O Pacote não está disponível para venda.');end if;if v_pacote.versao<>(p_intencao->>'pacoteVersaoEsperada')::bigint then return jsonb_build_object('status','conflito','codigo','PACOTE_ALTERADO','mensagem','O Pacote mudou. Faça uma nova simulação antes de confirmar.');end if;
 select * into v_pet from public.pets where id=p_intencao->>'petId' for update;if not found or v_pet.cliente_id<>p_intencao->>'clienteId' then return jsonb_build_object('status','invalido','codigo','CLIENTE_PET_INCOMPATIVEL','mensagem','O pet não pertence ao cliente selecionado.');end if;if jsonb_build_object('nome',v_pet.nome,'especie',v_pet.especie,'racaId',v_pet.raca_id,'porte',v_pet.porte,'pelagem',v_pet.pelagem,'peso',v_pet.peso,'temperamento',v_pet.temperamento)<>(p_intencao->'petPerfilEsperado') then return jsonb_build_object('status','conflito','codigo','PERFIL_PET_ALTERADO','mensagem','O perfil do pet mudou. Revise os preços antes de confirmar.');end if;
 insert into public.contratos(cliente_id,pet_id,pacote_id,pacote_versao_snapshot,pacote_nome_snapshot,pet_nome_snapshot,pet_especie_snapshot,pet_raca_id_snapshot,pet_raca_nome_snapshot,pet_porte_snapshot,pet_pelagem_snapshot,pet_peso_snapshot,pet_temperamento_snapshot,data_ancora,dia_semana_fixo,horario_fixo,timezone_snapshot,modalidade_transporte,taxidog_ciclo_id,configuracao_agenda_versao_snapshot,renovacao_automatica,valor_avulso_equivalente_snapshot,valor_pacote_calculado_snapshot,valor_contratado,motivo_ajuste_valor,valor_ajustado_por,criado_por,status,modelo_operacional_versao)
 values(p_intencao->>'clienteId',p_intencao->>'petId',v_pacote.id,v_pacote.versao,v_pacote.nome,p_intencao#>>'{petSnapshot,nome}',p_intencao#>>'{petSnapshot,especie}',(p_intencao#>>'{petSnapshot,racaId}')::uuid,p_intencao#>>'{petSnapshot,racaNome}',p_intencao#>>'{petSnapshot,porte}',p_intencao#>>'{petSnapshot,pelagem}',nullif(p_intencao#>>'{petSnapshot,peso}','')::numeric,p_intencao#>>'{petSnapshot,temperamento}',(p_intencao->>'dataAncora')::date,(p_intencao->>'diaSemanaFixo')::smallint,(p_intencao->>'horarioFixo')::time,p_intencao->>'timezone',p_intencao->>'modalidadeTransporte',nullif(p_intencao->>'taxidogCicloId','')::uuid,(p_intencao->>'configuracaoAgendaVersao')::bigint,(p_intencao->>'renovacaoAutomatica')::boolean,(p_intencao->>'totalAvulso')::numeric,(p_intencao->>'totalPacote')::numeric,(p_intencao->>'valorContratado')::numeric,nullif(p_intencao->>'motivoAjusteValor',''),case when (p_intencao->>'valorContratado')::numeric<>(p_intencao->>'totalPacote')::numeric then v_usuario else null end,v_usuario,'ativo',30) returning id into v_contrato_id;
 for v_item in select value from jsonb_array_elements(p_intencao->'itens') loop
  insert into public.contrato_itens(contrato_id,pacote_servico_id_origem,servico_id,servico_nome_snapshot,ordem_snapshot,quantidade_por_ciclo,intervalo_quantidade,intervalo_unidade,offset_inicial_quantidade,offset_inicial_unidade,preco_avulso_base_unitario_snapshot,preco_avulso_unitario_snapshot,preco_pacote_base_unitario_snapshot,preco_pacote_unitario_calculado_snapshot,total_avulso_snapshot,total_pacote_calculado_snapshot,desconto_percentual_snapshot)
  values(v_contrato_id,(v_item->>'pacoteServicoId')::uuid,(v_item->>'servicoId')::uuid,v_item->>'servicoNome',(v_item->>'ordem')::int,(v_item->>'quantidadePorCiclo')::int,(v_item->>'intervaloQuantidade')::int,v_item->>'intervaloUnidade',(v_item->>'offsetInicialQuantidade')::int,v_item->>'offsetInicialUnidade',(v_item->>'precoAvulsoBaseUnitario')::numeric,(v_item->>'precoAvulsoUnitario')::numeric,(v_item->>'precoPacoteBaseUnitario')::numeric,(v_item->>'precoPacoteUnitario')::numeric,(v_item->>'totalAvulso')::numeric,(v_item->>'totalPacote')::numeric,(v_item->>'descontoPercentual')::numeric) returning id into v_item_id;
  for v_regra in select value from jsonb_array_elements(v_item->'regras') loop insert into public.contrato_item_regras_aplicadas(contrato_item_id,origem,regra_servico_id_origem,regra_pacote_id_origem,ordem,criterio,descricao_snapshot,valor_referencia_snapshot,acrescimo_valor_snapshot)values(v_item_id,v_regra->>'origem',nullif(v_regra->>'regraServicoId','')::uuid,nullif(v_regra->>'regraPacoteId','')::uuid,(v_regra->>'ordem')::int,v_regra->>'criterio',v_regra->>'descricao',v_regra->>'referencia',(v_regra->>'acrescimoValor')::numeric);end loop;
 end loop;
 insert into public.contrato_ciclos(contrato_id,numero,estado,situacao_financeira,data_ancora_pretendida,dia_semana_pretendido,horario_pretendido,modalidade_transporte_pretendida,taxidog_ciclo_id_pretendido,configuracao_agenda_versao,ocupacao_agenda_versao,criado_por)
 values(v_contrato_id,1,'reservado','pendente',(p_intencao->>'dataAncora')::date,(p_intencao->>'diaSemanaFixo')::smallint,(p_intencao->>'horarioFixo')::time,p_intencao->>'modalidadeTransporte',nullif(p_intencao->>'taxidogCicloId','')::uuid,(p_intencao->>'configuracaoAgendaVersao')::bigint,v_ocupacao,v_usuario) returning id into v_ciclo_id;
 for v_ocorrencia in select value from jsonb_array_elements(p_intencao->'ocorrencias') loop
  insert into public.contrato_ciclo_ocorrencias(ciclo_id,ordem,data_operacional,horario_apresentado,inicio_operacional,conclusao_prevista,taxidog_ciclo_id,plano_operacional)
  values(v_ciclo_id,(v_ocorrencia->>'ordem')::int,(v_ocorrencia->>'data')::date,(v_ocorrencia->>'horarioApresentado')::time,(((v_ocorrencia->>'data')::date+(v_ocorrencia->>'inicioOperacional')::time) at time zone (p_intencao->>'timezone')),(((v_ocorrencia->>'data')::date+(v_ocorrencia->>'conclusaoPrevista')::time) at time zone (p_intencao->>'timezone')),nullif(v_ocorrencia->>'taxidogCicloId','')::uuid,v_ocorrencia->'plano') returning id into v_ocorrencia_id;
  for v_item_ref in select value from jsonb_array_elements(v_ocorrencia->'itens') loop
   insert into public.contrato_ciclo_ocorrencia_itens(ocorrencia_id,ciclo_id,contrato_item_id,ordinal_no_item)
   select v_ocorrencia_id,v_ciclo_id,id,(v_item_ref->>'ordinal')::int from public.contrato_itens where contrato_id=v_contrato_id and servico_id=(v_item_ref->>'servicoId')::uuid;
  end loop;
 end loop;
 update public.agenda_versao_ocupacao set versao=versao+1,updated_at=statement_timestamp() where id=true;
 insert into public.contrato_eventos(contrato_id,tipo,detalhes,registrado_por)values(v_contrato_id,'contrato_criado',jsonb_build_object('chaveIdempotencia',v_chave),v_usuario);v_resposta=jsonb_build_object('status','criado','contratoId',v_contrato_id);update public.contrato_operacoes_idempotentes set contrato_id=v_contrato_id,resposta=v_resposta,concluido_em=statement_timestamp() where chave_idempotencia=v_chave;return v_resposta;
end;$$;
revoke all on function public.vender_contrato(jsonb) from public,anon,authenticated;grant execute on function public.vender_contrato(jsonb) to service_role;

-- Chamado por uma Edge que acabou de recalcular o próximo Ciclo no Motor.
-- A ausência de capacidade não impede a renovação: cria a pendência sem reserva.
create or replace function public.renovar_ciclo_contrato(p_intencao jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_contrato public.contratos%rowtype;v_atual public.contrato_ciclos%rowtype;v_novo uuid;v_numero int;v_usuario uuid;v_disponivel boolean;v_ocupacao bigint;v_o jsonb;v_oid uuid;v_ref jsonb;
begin
 v_usuario=(p_intencao->>'usuarioId')::uuid;v_disponivel=(p_intencao->>'disponivel')::boolean;
 perform pg_advisory_xact_lock(hashtextextended('contrato:'||(p_intencao->>'contratoId'),0));perform pg_advisory_xact_lock(hashtextextended('agenda:ocupacao',0));
 select * into v_contrato from public.contratos where id=(p_intencao->>'contratoId')::uuid for update;
 if not found then return jsonb_build_object('status','invalido','codigo','CONTRATO_NAO_ENCONTRADO');end if;
 select * into v_atual from public.contrato_ciclos where contrato_id=v_contrato.id order by numero desc limit 1 for update;
 if not found or v_atual.estado<>'concluido' then return jsonb_build_object('status','invalido','codigo','CICLO_ATUAL_NAO_CONCLUIDO');end if;
 if exists(select 1 from public.contrato_ciclos where contrato_id=v_contrato.id and estado in('reservado','requer_revisao','em_andamento')) then return jsonb_build_object('status','conflito','codigo','CICLO_ABERTO_EXISTENTE');end if;
 if not v_contrato.renovacao_automatica and coalesce((p_intencao->>'renovacaoManual')::boolean,false)=false then return jsonb_build_object('status','sem_renovacao');end if;
 v_numero=v_atual.numero+1;select versao into v_ocupacao from public.agenda_versao_ocupacao where id=true for update;
 if v_disponivel and v_ocupacao<>(p_intencao->>'ocupacaoAgendaVersao')::bigint then return jsonb_build_object('status','conflito','codigo','DISPONIBILIDADE_ALTERADA');end if;
 insert into public.contrato_ciclos(contrato_id,numero,estado,situacao_financeira,data_ancora_pretendida,dia_semana_pretendido,horario_pretendido,modalidade_transporte_pretendida,taxidog_ciclo_id_pretendido,configuracao_agenda_versao,ocupacao_agenda_versao,motivo_revisao,criado_por)
 values(v_contrato.id,v_numero,case when v_disponivel then 'reservado' else 'requer_revisao' end,'pendente',(p_intencao->>'dataAncora')::date,(p_intencao->>'diaSemanaFixo')::smallint,(p_intencao->>'horarioFixo')::time,p_intencao->>'modalidadeTransporte',nullif(p_intencao->>'taxidogCicloId','')::uuid,nullif(p_intencao->>'configuracaoAgendaVersao','')::bigint,case when v_disponivel then v_ocupacao else null end,case when v_disponivel then null else coalesce(nullif(btrim(p_intencao->>'motivoRevisao'),''),'A rotina anterior não possui mais capacidade.') end,v_usuario) returning id into v_novo;
 if v_disponivel then
  if jsonb_typeof(p_intencao->'ocorrencias')<>'array' or jsonb_array_length(p_intencao->'ocorrencias')=0 then raise exception 'CICLO_SEM_RESERVAS';end if;
  for v_o in select value from jsonb_array_elements(p_intencao->'ocorrencias') loop
   insert into public.contrato_ciclo_ocorrencias(ciclo_id,ordem,data_operacional,horario_apresentado,inicio_operacional,conclusao_prevista,taxidog_ciclo_id,plano_operacional)
   values(v_novo,(v_o->>'ordem')::int,(v_o->>'data')::date,(v_o->>'horarioApresentado')::time,(((v_o->>'data')::date+(v_o->>'inicioOperacional')::time) at time zone v_contrato.timezone_snapshot),(((v_o->>'data')::date+(v_o->>'conclusaoPrevista')::time) at time zone v_contrato.timezone_snapshot),nullif(v_o->>'taxidogCicloId','')::uuid,v_o->'plano') returning id into v_oid;
   for v_ref in select value from jsonb_array_elements(v_o->'itens') loop insert into public.contrato_ciclo_ocorrencia_itens(ocorrencia_id,ciclo_id,contrato_item_id,ordinal_no_item)select v_oid,v_novo,id,(v_ref->>'ordinal')::int from public.contrato_itens where contrato_id=v_contrato.id and servico_id=(v_ref->>'servicoId')::uuid;end loop;
  end loop;
  update public.agenda_versao_ocupacao set versao=versao+1,updated_at=statement_timestamp() where id=true;
 end if;
 insert into public.contrato_eventos(contrato_id,tipo,detalhes,registrado_por)values(v_contrato.id,case when v_disponivel then 'ciclo_renovado' else 'renovacao_requer_revisao' end,jsonb_build_object('cicloId',v_novo,'numero',v_numero),v_usuario);
 return jsonb_build_object('status',case when v_disponivel then 'reservado' else 'requer_revisao' end,'cicloId',v_novo,'numero',v_numero);
end;$$;
revoke all on function public.renovar_ciclo_contrato(jsonb) from public,anon,authenticated;grant execute on function public.renovar_ciclo_contrato(jsonb) to service_role;

create or replace function public.vincular_ocorrencia_ciclo_atendimento(p_ocorrencia_id uuid,p_atendimento_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare v_ocorrencia public.contrato_ciclo_ocorrencias%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended('agenda:ocupacao',0));
 select * into v_ocorrencia from public.contrato_ciclo_ocorrencias where id=p_ocorrencia_id for update;
 if not found or v_ocorrencia.estado<>'reservada' or v_ocorrencia.atendimento_id is not null then raise exception 'OCORRENCIA_NAO_RESERVADA';end if;
 if not exists(select 1 from public.atendimentos where id=p_atendimento_id) then raise exception 'ATENDIMENTO_NAO_ENCONTRADO';end if;
 update public.contrato_ciclo_ocorrencias set estado='materializada',atendimento_id=p_atendimento_id,materializada_em=statement_timestamp() where id=p_ocorrencia_id;
 -- Não incrementa a versão: dentro da mesma transação a reserva apenas troca
 -- de fonte e o Motor jamais deve enxergar reserva + atendimento juntos.
end;$$;
revoke all on function public.vincular_ocorrencia_ciclo_atendimento(uuid,uuid) from public,anon,authenticated;
grant execute on function public.vincular_ocorrencia_ciclo_atendimento(uuid,uuid) to service_role;

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
commit;
