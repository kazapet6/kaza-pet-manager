-- Permitir vários pulos legítimos do mesmo atendimento, sem permitir replay.
CREATE UNIQUE INDEX contrato_pulo_chave_059 ON public.contrato_eventos (contrato_id, ((detalhes->>'chaveIdempotencia'))) WHERE tipo='banho_pulado' AND detalhes->>'chaveIdempotencia' IS NOT NULL;
CREATE UNIQUE INDEX contrato_pulo_legado_059 ON public.contrato_eventos (contrato_id, ((detalhes->>'atendimentoId'))) WHERE tipo='banho_pulado' AND detalhes->>'chaveIdempotencia' IS NULL;
DROP INDEX public.contrato_pulo_atendimento_046;
