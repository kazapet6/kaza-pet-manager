begin;

alter table public.contrato_itens
  add column preco_avulso_base_unitario_snapshot numeric(12,2) not null
  check (preco_avulso_base_unitario_snapshot >= 0);

-- A venda 029 preserva somente a modalidade. Ciclo TaxiDog pertence a uma
-- futura configuracao/materializacao operacional.
alter table public.contratos drop constraint contratos_modalidade_taxidog_check;
alter table public.contratos add constraint contratos_modalidade_taxidog_029_check
  check (taxidog_ciclo_id is null);

create table public.contrato_operacoes_idempotentes (
  chave_idempotencia uuid primary key,
  usuario_id uuid not null,
  hash_intencao text not null,
  contrato_id uuid references public.contratos(id) on delete restrict,
  resposta jsonb,
  created_at timestamptz not null default now(),
  concluido_em timestamptz,
  check (resposta is null or jsonb_typeof(resposta)='object')
);
revoke all on public.contrato_operacoes_idempotentes from public,anon,authenticated;
grant select,insert,update on public.contrato_operacoes_idempotentes to service_role;

create or replace function public.vender_contrato(p_intencao jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_chave uuid;v_usuario uuid;v_hash text;v_existente public.contrato_operacoes_idempotentes%rowtype;
 v_pacote public.pacotes%rowtype;v_pet public.pets%rowtype;v_contrato_id uuid;v_item jsonb;v_regra jsonb;v_item_id uuid;v_resposta jsonb;
begin
 v_chave=(p_intencao->>'chaveIdempotencia')::uuid;v_usuario=(p_intencao->>'usuarioId')::uuid;v_hash=md5((p_intencao-'usuarioId')::text);
 perform pg_advisory_xact_lock(hashtextextended(v_chave::text,0));
 select * into v_existente from public.contrato_operacoes_idempotentes where chave_idempotencia=v_chave for update;
 if found then
   if v_existente.usuario_id<>v_usuario or v_existente.hash_intencao<>v_hash then return jsonb_build_object('status','conflito','codigo','IDEMPOTENCIA_DIVERGENTE','mensagem','A chave de repetição já foi utilizada por outra venda.');end if;
   if v_existente.resposta is not null then return v_existente.resposta;end if;
 else insert into public.contrato_operacoes_idempotentes(chave_idempotencia,usuario_id,hash_intencao)values(v_chave,v_usuario,v_hash);end if;
 select * into v_pacote from public.pacotes where id=(p_intencao->>'pacoteId')::uuid for update;
 if not found or not v_pacote.ativo then return jsonb_build_object('status','invalido','codigo','PACOTE_INDISPONIVEL','mensagem','O Pacote não está disponível para venda.');end if;
 if v_pacote.versao<>(p_intencao->>'pacoteVersaoEsperada')::bigint then return jsonb_build_object('status','conflito','codigo','PACOTE_ALTERADO','mensagem','O Pacote mudou. Faça uma nova simulação antes de confirmar.');end if;
 select * into v_pet from public.pets where id=p_intencao->>'petId' for update;
 if not found or v_pet.cliente_id<>p_intencao->>'clienteId' then return jsonb_build_object('status','invalido','codigo','CLIENTE_PET_INCOMPATIVEL','mensagem','O pet não pertence ao cliente selecionado.');end if;
 if jsonb_build_object('nome',v_pet.nome,'especie',v_pet.especie,'racaId',v_pet.raca_id,'porte',v_pet.porte,'pelagem',v_pet.pelagem,'peso',v_pet.peso,'temperamento',v_pet.temperamento)<>(p_intencao->'petPerfilEsperado') then return jsonb_build_object('status','conflito','codigo','PERFIL_PET_ALTERADO','mensagem','O perfil do pet mudou. Revise os preços antes de confirmar.');end if;
 insert into public.contratos(cliente_id,pet_id,pacote_id,pacote_versao_snapshot,pacote_nome_snapshot,pet_nome_snapshot,pet_especie_snapshot,pet_raca_id_snapshot,pet_raca_nome_snapshot,pet_porte_snapshot,pet_pelagem_snapshot,pet_peso_snapshot,pet_temperamento_snapshot,data_ancora,dia_semana_fixo,horario_fixo,timezone_snapshot,modalidade_transporte,taxidog_ciclo_id,configuracao_agenda_versao_snapshot,renovacao_automatica,valor_avulso_equivalente_snapshot,valor_pacote_calculado_snapshot,valor_contratado,motivo_ajuste_valor,valor_ajustado_por,criado_por,status)
 values(p_intencao->>'clienteId',p_intencao->>'petId',v_pacote.id,v_pacote.versao,v_pacote.nome,p_intencao#>>'{petSnapshot,nome}',p_intencao#>>'{petSnapshot,especie}',(p_intencao#>>'{petSnapshot,racaId}')::uuid,p_intencao#>>'{petSnapshot,racaNome}',p_intencao#>>'{petSnapshot,porte}',p_intencao#>>'{petSnapshot,pelagem}',nullif(p_intencao#>>'{petSnapshot,peso}','')::numeric,p_intencao#>>'{petSnapshot,temperamento}',(p_intencao->>'dataAncora')::date,(p_intencao->>'diaSemanaFixo')::smallint,(p_intencao->>'horarioFixo')::time,p_intencao->>'timezone',p_intencao->>'modalidadeTransporte',nullif(p_intencao->>'taxidogCicloId','')::uuid,(p_intencao->>'configuracaoAgendaVersao')::bigint,(p_intencao->>'renovacaoAutomatica')::boolean,(p_intencao->>'totalAvulso')::numeric,(p_intencao->>'totalPacote')::numeric,(p_intencao->>'valorContratado')::numeric,nullif(p_intencao->>'motivoAjusteValor',''),case when (p_intencao->>'valorContratado')::numeric<>(p_intencao->>'totalPacote')::numeric then v_usuario else null end,v_usuario,'ativo') returning id into v_contrato_id;
 for v_item in select value from jsonb_array_elements(p_intencao->'itens') loop
  insert into public.contrato_itens(contrato_id,pacote_servico_id_origem,servico_id,servico_nome_snapshot,ordem_snapshot,quantidade_por_ciclo,intervalo_quantidade,intervalo_unidade,offset_inicial_quantidade,offset_inicial_unidade,preco_avulso_base_unitario_snapshot,preco_avulso_unitario_snapshot,preco_pacote_base_unitario_snapshot,preco_pacote_unitario_calculado_snapshot,total_avulso_snapshot,total_pacote_calculado_snapshot)
  values(v_contrato_id,(v_item->>'pacoteServicoId')::uuid,(v_item->>'servicoId')::uuid,v_item->>'servicoNome',(v_item->>'ordem')::int,(v_item->>'quantidadePorCiclo')::int,(v_item->>'intervaloQuantidade')::int,v_item->>'intervaloUnidade',(v_item->>'offsetInicialQuantidade')::int,v_item->>'offsetInicialUnidade',(v_item->>'precoAvulsoBaseUnitario')::numeric,(v_item->>'precoAvulsoUnitario')::numeric,(v_item->>'precoPacoteBaseUnitario')::numeric,(v_item->>'precoPacoteUnitario')::numeric,(v_item->>'totalAvulso')::numeric,(v_item->>'totalPacote')::numeric) returning id into v_item_id;
  for v_regra in select value from jsonb_array_elements(v_item->'regras') loop
   insert into public.contrato_item_regras_aplicadas(contrato_item_id,origem,regra_servico_id_origem,regra_pacote_id_origem,ordem,criterio,descricao_snapshot,valor_referencia_snapshot,acrescimo_valor_snapshot)
   values(v_item_id,v_regra->>'origem',nullif(v_regra->>'regraServicoId','')::uuid,nullif(v_regra->>'regraPacoteId','')::uuid,(v_regra->>'ordem')::int,v_regra->>'criterio',v_regra->>'descricao',v_regra->>'referencia',(v_regra->>'acrescimoValor')::numeric);
  end loop;
 end loop;
 insert into public.contrato_eventos(contrato_id,tipo,detalhes,registrado_por)values(v_contrato_id,'contrato_criado',jsonb_build_object('chaveIdempotencia',v_chave),v_usuario);
 v_resposta=jsonb_build_object('status','criado','contratoId',v_contrato_id);
 update public.contrato_operacoes_idempotentes set contrato_id=v_contrato_id,resposta=v_resposta,concluido_em=statement_timestamp() where chave_idempotencia=v_chave;
 return v_resposta;
end;$$;
revoke all on function public.vender_contrato(jsonb) from public,anon,authenticated;
grant execute on function public.vender_contrato(jsonb) to service_role;
comment on function public.vender_contrato(jsonb) is 'Persistência atômica e idempotente da venda já validada autoritativamente pela Edge; não cria ciclos, créditos ou atendimentos.';
commit;
