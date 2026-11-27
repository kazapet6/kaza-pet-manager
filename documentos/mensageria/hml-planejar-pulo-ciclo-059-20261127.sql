-- 059: Planejamento de datas do pulo. Não muda reservas, créditos ou pagamentos.
CREATE OR REPLACE FUNCTION public.datas_pulo_ciclo_059(p_data date,p_dia_fixo int,p_periodicidade int,p_quantidade int)
RETURNS date[] LANGUAGE sql IMMUTABLE STRICT SET search_path TO 'pg_catalog' AS $fn$
 SELECT CASE WHEN p_dia_fixo BETWEEN 0 AND 6 AND p_periodicidade IN (7,14) AND p_quantidade BETWEEN 1 AND 366
 THEN ARRAY(SELECT date_trunc('week',p_data::timestamp)::date+7+((p_dia_fixo+6)%7)+n*p_periodicidade FROM generate_series(0,p_quantidade-1) n)
 ELSE NULL END
$fn$;
REVOKE ALL ON FUNCTION public.datas_pulo_ciclo_059(date,int,int,int) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.planejar_pulo_ciclo_059(p_atendimento_id uuid,p_usuario_id uuid,p_inicio_esperado timestamptz,p_autorizado boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog' AS $fn$
DECLARE c public.contrato_ciclos%rowtype; ct public.contratos%rowtype; a public.atendimentos%rowtype; o public.contrato_ciclo_ocorrencias%rowtype; g public.grupos_agendamento%rowtype; n int; dias int; qtd int; datas date[]; alvos jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_usuario_id AND raw_app_meta_data->>'role'='internal') THEN
  RETURN jsonb_build_object('status','invalido','codigo','PULO_INDISPONIVEL','mensagem','Operador inválido.'); END IF;
 SELECT * INTO a FROM public.atendimentos WHERE id=p_atendimento_id;
 IF NOT FOUND OR a.status NOT IN ('agendado','confirmado') OR a.inicio_operacional_planejado IS DISTINCT FROM p_inicio_esperado THEN
  RETURN jsonb_build_object('status','invalido','codigo','PULO_INDISPONIVEL','mensagem','O atendimento foi alterado. Atualize a agenda.'); END IF;
 SELECT * INTO o FROM public.contrato_ciclo_ocorrencias WHERE atendimento_id=a.id;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','invalido','codigo','PULO_INDISPONIVEL','mensagem','Atendimento não pertence à sequência original do pacote.'); END IF;
 SELECT * INTO c FROM public.contrato_ciclos WHERE id=o.ciclo_id;
 SELECT * INTO ct FROM public.contratos WHERE id=c.contrato_id;
 SELECT * INTO g FROM public.grupos_agendamento WHERE id=a.grupo_agendamento_id;
 IF c.estado NOT IN ('reservado','em_andamento') OR c.materializacao_estado<>'materializado' OR ct.status<>'ativo' OR EXISTS(SELECT 1 FROM public.contrato_ciclos x WHERE x.contrato_id=ct.id AND x.numero>c.numero) THEN
  RETURN jsonb_build_object('status','invalido','codigo','PULO_INDISPONIVEL','mensagem','Somente o ciclo vigente e materializado pode ser prorrogado.'); END IF;
 SELECT count(*) INTO n FROM public.contrato_eventos WHERE contrato_id=ct.id AND tipo='banho_pulado' AND detalhes->>'cicloId'=c.id::text;
 IF n>=2 AND NOT(coalesce(p_autorizado,false) AND EXISTS(SELECT 1 FROM auth.users WHERE id=p_usuario_id AND raw_app_meta_data->>'role'='internal' AND raw_app_meta_data->'creditos_admin'='true'::jsonb)) THEN
  RETURN jsonb_build_object('status','invalido','codigo','PULO_EXIGE_ADMIN','mensagem','A partir do terceiro pulo, é necessária autorização administrativa.'); END IF;
 SELECT min(CASE intervalo_unidade WHEN 'semana' THEN intervalo_quantidade*7 WHEN 'dia' THEN intervalo_quantidade END) INTO dias FROM public.contrato_itens WHERE contrato_id=ct.id AND lower(btrim(servico_nome_snapshot))='banho';
 SELECT count(*) INTO qtd FROM public.contrato_ciclo_ocorrencias WHERE ciclo_id=c.id AND ordem>=o.ordem;
 datas:=public.datas_pulo_ciclo_059(g.data_operacional,c.dia_semana_pretendido::int,dias,qtd);
 IF datas IS NULL THEN RETURN jsonb_build_object('status','invalido','codigo','PULO_INDISPONIVEL','mensagem','Periodicidade não compatível com o pulo semanal/quinzenal.'); END IF;
 IF EXISTS(SELECT 1 FROM public.contrato_ciclo_ocorrencias x LEFT JOIN public.atendimentos at ON at.id=x.atendimento_id
  WHERE x.ciclo_id=c.id AND x.ordem>=o.ordem AND (x.estado<>'materializada' OR at.status IS NULL OR at.status NOT IN ('agendado','confirmado')
   OR EXISTS(SELECT 1 FROM public.contrato_credito_vinculos_044 v WHERE v.ciclo_id=c.id AND (v.atendimento_id=at.id OR v.atendimento_anterior_id=at.id))
   OR NOT EXISTS(SELECT 1 FROM public.contrato_ciclo_ocorrencia_itens u JOIN public.contrato_itens i ON i.id=u.contrato_item_id WHERE u.ocorrencia_id=x.id AND lower(btrim(i.servico_nome_snapshot))='banho' AND u.estado_comercial='reservado')
   OR EXISTS(SELECT 1 FROM public.contrato_ciclo_ocorrencia_itens u WHERE u.ocorrencia_id=x.id AND u.estado_comercial<>'reservado'))) THEN
  RETURN jsonb_build_object('status','invalido','codigo','PULO_INDISPONIVEL','mensagem','Há atendimentos ou créditos posteriores que exigem revisão antes do pulo.'); END IF;
 SELECT jsonb_agg(jsonb_build_object('ordem',x.ordem,'ocorrenciaId',x.id,'atendimentoId',at.id,'grupoId',at.grupo_agendamento_id,'petId',at.pet_id,'status',at.status,'inicioEsperado',at.inicio_operacional_planejado,'responsavelAtual',at.funcionario_responsavel_id,'dataAnterior',ga.data_operacional,'dataNova',datas[x.ordem-o.ordem+1]) ORDER BY x.ordem)
 INTO alvos FROM public.contrato_ciclo_ocorrencias x JOIN public.atendimentos at ON at.id=x.atendimento_id JOIN public.grupos_agendamento ga ON ga.id=at.grupo_agendamento_id WHERE x.ciclo_id=c.id AND x.ordem>=o.ordem;
 IF alvos IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(alvos) t WHERE (t->>'dataNova') IS NULL OR (t->>'dataNova')::date<=(t->>'dataAnterior')::date) THEN
  RETURN jsonb_build_object('status','invalido','codigo','PULO_INDISPONIVEL','mensagem','O recálculo anteciparia um atendimento já postergado. Revise a rotina.'); END IF;
 RETURN jsonb_build_object('status','planejado','cicloId',c.id,'contratoId',ct.id,'numeroPulo',n+1,'periodicidadeDias',dias,'modalidade',c.modalidade_transporte_pretendida,'horarioFixo',c.horario_pretendido,'cicloTaxidogId',c.taxidog_ciclo_id_pretendido,'responsavelPadrao',c.funcionario_responsavel_padrao_id,'configuracaoVersao',(SELECT versao FROM public.agenda_versao_configuracao WHERE id),'ocupacaoVersao',(SELECT versao FROM public.agenda_versao_ocupacao WHERE id),'alvos',alvos);
END;$fn$;
REVOKE ALL ON FUNCTION public.planejar_pulo_ciclo_059(uuid,uuid,timestamptz,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.planejar_pulo_ciclo_059(uuid,uuid,timestamptz,boolean) TO service_role;
