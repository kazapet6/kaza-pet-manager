import { readFileSync } from 'node:fs'

const sql = readFileSync(
  new URL('../banco/018_confirmacao_transacional_rpc.sql', import.meta.url),
  'utf8',
)

const casos = []
const caso = (codigo, descricao, validar) => casos.push({ codigo, descricao, validar })

const contem = (trecho) => sql.toLowerCase().includes(trecho.toLowerCase())
const insercao = (tabela) => contem(`insert into public.${tabela}`)

caso('EK', 'RPC recebe plano JSONB e valida estrutura', () =>
  contem('p_plano jsonb') && contem("jsonb_typeof(p_plano) <> 'object'"))
caso('EL', 'Versão de configuração obsoleta possui retorno próprio', () =>
  contem('versao_configuracao_atual <> versao_configuracao_plano')
    && contem("'codigo', 'CONFIGURACAO_ALTERADA'"))
caso('EM', 'Mesma chave e hash reutiliza confirmação existente', () =>
  contem('grupo_existente.hash_requisicao <> hash_requisicao')
    && contem("'reutilizadoPorIdempotencia', true"))
caso('EN', 'Mesma chave com hash diferente possui conflito próprio', () =>
  contem("'codigo', 'IDEMPOTENCIA_CONFLITANTE'"))
caso('EO', 'Grupo possui persistência explícita', () => insercao('grupos_agendamento'))
caso('EP', 'Atendimento possui persistência explícita', () => insercao('atendimentos'))
caso('EQ', 'Serviços possuem persistência explícita', () => insercao('atendimento_servicos'))
caso('ER', 'Origens completas possuem persistência explícita', () => insercao('atendimento_servico_origens'))
caso('ES', 'Pai canônico usa ordem e ID', () => contem('order by pai.ordem, pai.id'))
caso('ET', 'Acréscimos possuem persistência explícita', () => insercao('atendimento_servico_acrescimos'))
caso('EU', 'Etapas possuem persistência explícita', () => insercao('atendimento_etapas'))
caso('EV', 'Contribuições possuem persistência explícita', () => insercao('atendimento_etapa_contribuicoes'))
caso('EW', 'Funcionários possuem persistência explícita', () => insercao('atendimento_etapa_funcionarios'))
caso('EX', 'Equipamentos possuem persistência explícita', () => insercao('atendimento_etapa_equipamentos'))
caso('EY', 'Supervisões possuem persistência explícita', () => insercao('atendimento_etapa_equipamento_supervisoes'))
caso('EZ', 'Esperas possuem persistência explícita', () => insercao('atendimento_esperas'))
caso('FG', 'TaxiDog moderno materializa ciclo e snapshots', () =>
  contem('taxidog_ciclo_id, taxidog_ciclo_nome_snapshot')
    && contem('taxidog_conclusao_limite_snapshot'))
caso('FH', 'Total financeiro é recalculado dos serviços', () =>
  contem('sum(item.valor_final)') && contem('total_servicos <> total_informado'))
caso('FI', 'PUBLIC e anon não executam a RPC', () =>
  contem('from public, anon, authenticated'))
caso('FJ', 'authenticated não executa a RPC', () =>
  contem('from public, anon, authenticated'))
caso('FK', 'service_role executa a RPC', () =>
  contem('grant execute on function public.confirmar_agendamento_transacional(jsonb)')
    && contem('to service_role'))
caso('SEG', 'SECURITY DEFINER usa somente pg_catalog no search_path', () =>
  contem('set search_path = pg_catalog')
    && !contem('set search_path = pg_catalog, public'))
caso('FL', 'Etapa não aceita serviço externo', () =>
  contem('alvo.id = item.atendimento_servico_id'))
caso('FM', 'Funcionário não aceita etapa externa', () =>
  contem('from jsonb_to_recordset(funcionarios) item')
    && contem('alvo.id = item.atendimento_etapa_id'))
caso('FN', 'Equipamento não aceita etapa externa', () =>
  contem('from jsonb_to_recordset(equipamentos) item')
    && contem('alvo.id = item.atendimento_etapa_id'))
caso('FO', 'Supervisão não aceita reserva externa', () =>
  contem('alvo.id = item.atendimento_etapa_equipamento_id'))
caso('FP', 'Espera não aceita etapa externa', () =>
  contem('alvo.id = item.etapa_anterior_id')
    && contem('alvo.id = item.etapa_seguinte_id'))
caso('FQ', 'Contribuição não escapa do plano', () =>
  contem('from jsonb_to_recordset(contribuicoes) item'))
caso('FR', 'Origem não escapa do plano', () =>
  contem('from jsonb_to_recordset(origens) item')
    && contem('alvo.id = item.originado_por_atendimento_servico_id'))
caso('FS', 'Acréscimo não aceita serviço externo', () =>
  contem('from jsonb_to_recordset(acrescimos) item'))

let falhas = 0
for (const item of casos) {
  const passou = item.validar()
  console.log(`${passou ? 'OK' : 'FALHA'} ${item.codigo} — ${item.descricao}`)
  if (!passou) falhas += 1
}

if (falhas) process.exitCode = 1
