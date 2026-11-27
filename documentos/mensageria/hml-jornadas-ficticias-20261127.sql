-- HML: jornadas ficticias para validar a interface; nao representa escala real.
DO $guard$ BEGIN
 IF (SELECT count(*) FROM public.funcionarios WHERE ativo)<>3 OR (SELECT count(*) FROM public.funcionarios WHERE ativo AND (nome ILIKE '%HML%' OR nome ILIKE '%fict%'))<>3 OR EXISTS(SELECT 1 FROM public.funcionario_jornadas) OR (SELECT count(*) FROM public.estabelecimento_blocos WHERE ativo AND dia_semana BETWEEN 2 AND 6 AND inicio='09:00' AND fim='18:00')<>5 THEN RAISE EXCEPTION 'HML_PRECONDICAO_JORNADAS'; END IF;
END $guard$;
INSERT INTO public.funcionario_jornadas(funcionario_id,dia_semana,inicio,fim,ativo)
SELECT f.id,b.dia_semana,b.inicio,b.fim,true FROM public.funcionarios f CROSS JOIN public.estabelecimento_blocos b WHERE f.ativo AND (f.nome ILIKE '%HML%' OR f.nome ILIKE '%fict%') AND b.ativo AND b.dia_semana BETWEEN 2 AND 6 AND b.inicio='09:00' AND b.fim='18:00';
-- Sem alteracao de atendimentos, habilitacoes, mensagens ou escala real.
