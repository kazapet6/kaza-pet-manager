-- TESTES COMPORTAMENTAIS RPC 018 — UMA SESSAO / ROLLBACK INTEGRAL
-- Execute o arquivo inteiro no SQL Editor como postgres. Ele termina com
-- ROLLBACK e nao reutiliza clientes, pets ou atendimentos reais.

select 'ocupacao_antes_do_teste' as marco, versao
from public.agenda_versao_ocupacao
where id;

begin;

create temporary table rpc018_fixture (
  cliente_id text not null,
  pet_id text not null,
  raca_id uuid not null,
  servico_id uuid not null,
  servico_etapa_id uuid not null,
  regra_preco_id uuid,
  funcionario_id uuid,
  funcionario_2_id uuid,
  equipamento_id uuid,
  equipamento_unidade_id uuid,
  taxidog_ciclo_id uuid,
  taxidog_ciclo_ordem integer
) on commit drop;

with raca as (
  insert into public.racas (especie, nome, fonte_referencia)
  values ('cao', 'TESTE_RPC_018_RACA', 'Teste transacional RPC 018')
  returning id
), cliente as (
  insert into public.clientes (
    nome, whatsapp, endereco, bairro, cidade, observacoes
  ) values (
    'TESTE_RPC_018_CLIENTE', '00000000000', '', '', '',
    'Removido por ROLLBACK'
  )
  returning id
), pet as (
  insert into public.pets (
    cliente_id, nome, especie, raca_id, sexo, porte, pelagem,
    peso, cor, data_nascimento, castrado, temperamento, observacoes
  )
  select cliente.id, 'TESTE_RPC_018_PET', 'cao', raca.id,
    'macho', 'pequeno', 'curta', 8, 'teste', '2020-01-01',
    true, 'calmo', 'Removido por ROLLBACK'
  from cliente cross join raca
  returning id, cliente_id, raca_id
), servico as (
  insert into public.servicos (
    nome, descricao, ativo, preco_base, agendamento_cliente
  ) values (
    'TESTE_RPC_018_SERVICO', 'Removido por ROLLBACK', true, 50, false
  )
  returning id
), etapa as (
  insert into public.servico_etapas (
    servico_id, nome, ordem, duracao_minutos, recurso,
    equipamento_id, ativo
  )
  select servico.id, 'TESTE_RPC_018_ETAPA', 1, 30, 'nenhum', null, true
  from servico
  returning id, servico_id
)
insert into rpc018_fixture (
  cliente_id, pet_id, raca_id, servico_id, servico_etapa_id
)
select pet.cliente_id, pet.id, pet.raca_id, servico.id, etapa.id
from pet cross join servico cross join etapa;

with regra as (
  insert into public.servico_regras_preco (
    servico_id, criterio, porte, acrescimo_valor, ativo
  )
  select servico_id, 'porte', 'pequeno', 10, true
  from rpc018_fixture
  returning id
)
update rpc018_fixture
set regra_preco_id = (select id from regra);

with funcionarios as (
  insert into public.funcionarios (nome, ativo)
  values
    ('TESTE_RPC_018_FUNCIONARIO', true),
    ('TESTE_RPC_018_FUNCIONARIO_2', true)
  returning id, nome
), equipamento as (
  insert into public.equipamentos (
    nome, tipo, quantidade_unidades, ativo,
    separar_por_sexo, exige_supervisao_humana
  ) values (
    'TESTE_RPC_018_EQUIPAMENTO', 'teste', 1, true, false, true
  )
  returning id
), unidade as (
  insert into public.equipamento_unidades (
    equipamento_id, numero, nome, ativo
  )
  select equipamento.id, 1, 'TESTE_RPC_018_UNIDADE', true
  from equipamento
  returning id, equipamento_id
), perfil as (
  insert into public.equipamento_perfis_capacidade (
    equipamento_id, nome, ativo
  )
  select equipamento.id, 'TESTE_RPC_018_CAPACIDADE_2', true
  from equipamento
  returning id
), item as (
  insert into public.equipamento_perfil_itens (
    perfil_id, porte, quantidade, ativo
  )
  select perfil.id, 'pequeno', 2, true from perfil
), ciclo as (
  insert into public.taxidog_ciclos (
    nome, ordem, coleta_inicio, coleta_fim, conclusao_limite, ativo
  )
  select 'TESTE_RPC_018_CICLO', coalesce(max(ordem), 0) + 1000000,
    '08:00', '09:00', '12:00', true
  from public.taxidog_ciclos
  returning id, ordem
)
update rpc018_fixture fixture
set funcionario_id = (
      select id from funcionarios
      where nome = 'TESTE_RPC_018_FUNCIONARIO'
    ),
    funcionario_2_id = (
      select id from funcionarios
      where nome = 'TESTE_RPC_018_FUNCIONARIO_2'
    ),
    equipamento_id = equipamento.id,
    equipamento_unidade_id = unidade.id,
    taxidog_ciclo_id = ciclo.id,
    taxidog_ciclo_ordem = ciclo.ordem
from equipamento cross join unidade cross join ciclo;

create temporary table rpc018_dominio (
  servico_b_id uuid not null,
  servico_c_id uuid not null,
  servico_h_id uuid not null,
  etapa_c_id uuid not null,
  etapa_h_id uuid not null
) on commit drop;

with servicos as (
  insert into public.servicos (
    nome, descricao, ativo, preco_base, agendamento_cliente
  ) values
    ('TESTE_RPC_018_SERVICO_B', 'Removido por ROLLBACK', true, 20, false),
    ('TESTE_RPC_018_SERVICO_C', 'Removido por ROLLBACK', true, 10, false),
    ('TESTE_RPC_018_HIDRATACAO', 'Removido por ROLLBACK', true, 15, false)
  returning id, nome
), etapas as (
  insert into public.servico_etapas (
    servico_id, nome, ordem, duracao_minutos, recurso,
    equipamento_id, ativo
  )
  select id, nome || '_ETAPA', 1, 5, 'nenhum', null, true
  from servicos
  where nome in ('TESTE_RPC_018_SERVICO_C', 'TESTE_RPC_018_HIDRATACAO')
  returning id, servico_id
)
insert into rpc018_dominio
select
  (select id from servicos where nome = 'TESTE_RPC_018_SERVICO_B'),
  (select id from servicos where nome = 'TESTE_RPC_018_SERVICO_C'),
  (select id from servicos where nome = 'TESTE_RPC_018_HIDRATACAO'),
  (select etapas.id from etapas join servicos on servicos.id = etapas.servico_id
    where servicos.nome = 'TESTE_RPC_018_SERVICO_C'),
  (select etapas.id from etapas join servicos on servicos.id = etapas.servico_id
    where servicos.nome = 'TESTE_RPC_018_HIDRATACAO');

insert into public.servico_dependencias (
  servico_id, dependencia_servico_id, ativo
)
select fixture.servico_id, dominio.servico_c_id, true
from rpc018_fixture fixture cross join rpc018_dominio dominio
union all
select dominio.servico_b_id, dominio.servico_c_id, true
from rpc018_dominio dominio
union all
select dominio.servico_h_id, fixture.servico_id, true
from rpc018_fixture fixture cross join rpc018_dominio dominio;

insert into public.servico_acoplamentos (
  servico_id, etapa_alvo_id, ativo
)
select dominio.servico_h_id, fixture.servico_etapa_id, true
from rpc018_fixture fixture cross join rpc018_dominio dominio;

create or replace function pg_temp.montar_plano_rpc018(
  p_chave uuid,
  p_hash text,
  p_valor_total numeric default 50
)
returns jsonb
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  with dados as (
    select fixture.*,
      gen_random_uuid() as atendimento_servico_id,
      gen_random_uuid() as atendimento_etapa_id,
      (select versao from public.agenda_versao_configuracao where id)
        as configuracao_versao
    from pg_temp.rpc018_fixture fixture
  )
  select jsonb_build_object(
    'grupo', jsonb_build_object(
      'chaveIdempotencia', p_chave,
      'hashRequisicao', p_hash,
      'configuracaoVersao', configuracao_versao,
      'clienteId', cliente_id,
      'modalidade', 'normal',
      'dataOperacional', '2099-01-05',
      'horarioChegadaComprometido', '2099-01-05T10:00:00+00:00',
      'retiradaPrevista', '2099-01-05T10:30:00+00:00',
      'observacoes', 'TESTE_RPC_018'
    ),
    'atendimento', jsonb_build_object(
      'petId', pet_id,
      'inicioOperacionalPlanejado', '2099-01-05T10:00:00+00:00',
      'conclusaoOperacionalPrevista', '2099-01-05T10:30:00+00:00',
      'preferenciaFuncionario', 'automatico',
      'funcionarioPreferidoId', null,
      'petNomeSnapshot', 'TESTE_RPC_018_PET',
      'petEspecieSnapshot', 'cao',
      'petRacaIdSnapshot', raca_id,
      'petRacaNomeSnapshot', 'TESTE_RPC_018_RACA',
      'petSexoSnapshot', 'macho',
      'petPorteSnapshot', 'pequeno',
      'petPelagemSnapshot', 'curta',
      'petPesoSnapshot', 8,
      'petTemperamentoSnapshot', 'calmo',
      'valorCalculado', p_valor_total,
      'valorFinal', p_valor_total,
      'observacoes', 'TESTE_RPC_018'
    ),
    'servicos', jsonb_build_array(jsonb_build_object(
      'id', atendimento_servico_id,
      'servico_id', servico_id,
      'ordem', 1,
      'origem', 'solicitado',
      'pai_canonico_id', null,
      'nome_snapshot', 'TESTE_RPC_018_SERVICO',
      'preco_base_snapshot', 50,
      'valor_calculado', 50,
      'valor_final', 50
    )),
    'origens', '[]'::jsonb,
    'acrescimos', '[]'::jsonb,
    'etapas', jsonb_build_array(jsonb_build_object(
      'id', atendimento_etapa_id,
      'servico_etapa_id', servico_etapa_id,
      'inicio_planejado', '2099-01-05T10:00:00+00:00',
      'fim_planejado', '2099-01-05T10:30:00+00:00',
      'atendimento_servico_id', atendimento_servico_id,
      'nome_snapshot', 'TESTE_RPC_018_ETAPA',
      'ordem_snapshot', 1,
      'duracao_minutos_snapshot', 30,
      'recursos_snapshot', '[]'::jsonb
    )),
    'contribuicoes', '[]'::jsonb,
    'funcionarios', '[]'::jsonb,
    'equipamentos', '[]'::jsonb,
    'supervisoes', '[]'::jsonb,
    'esperas', '[]'::jsonb
  )
  from dados;
$$;

create or replace function pg_temp.montar_plano_recurso_rpc018(
  p_chave uuid,
  p_hash text,
  p_incluir_funcionario boolean,
  p_cobertura text
)
returns jsonb
language plpgsql
volatile
set search_path = pg_catalog, pg_temp
as $$
declare
  plano jsonb;
  etapa_id uuid;
  reserva_id uuid := gen_random_uuid();
  funcionario_id uuid;
  funcionario_2_id uuid;
  unidade_id uuid;
  supervisoes jsonb := '[]'::jsonb;
begin
  plano := pg_temp.montar_plano_rpc018(p_chave, p_hash);
  etapa_id := (plano #>> '{etapas,0,id}')::uuid;

  select fixture.funcionario_id, fixture.funcionario_2_id,
    fixture.equipamento_unidade_id
  into funcionario_id, funcionario_2_id, unidade_id
  from pg_temp.rpc018_fixture fixture;

  plano := jsonb_set(plano, '{equipamentos}', jsonb_build_array(
    jsonb_build_object(
      'id', reserva_id,
      'atendimento_etapa_id', etapa_id,
      'equipamento_unidade_id', unidade_id,
      'inicio_planejado', '2099-01-05T10:00:00+00:00',
      'fim_planejado', '2099-01-05T10:30:00+00:00'
    )
  ));

  if p_incluir_funcionario then
    plano := jsonb_set(plano, '{funcionarios}', jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid(),
        'atendimento_etapa_id', etapa_id,
        'funcionario_id', funcionario_id,
        'inicio_planejado', '2099-01-05T10:00:00+00:00',
        'fim_planejado', '2099-01-05T10:30:00+00:00'
      )
    ));
  end if;

  if p_cobertura = 'integral' then
    supervisoes := jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(),
      'atendimento_etapa_equipamento_id', reserva_id,
      'funcionario_id', funcionario_id,
      'inicio', '2099-01-05T10:00:00+00:00',
      'fim', '2099-01-05T10:30:00+00:00'
    ));
  elsif p_cobertura = 'dois_segmentos' then
    supervisoes := jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid(),
        'atendimento_etapa_equipamento_id', reserva_id,
        'funcionario_id', funcionario_id,
        'inicio', '2099-01-05T10:00:00+00:00',
        'fim', '2099-01-05T10:15:00+00:00'
      ),
      jsonb_build_object(
        'id', gen_random_uuid(),
        'atendimento_etapa_equipamento_id', reserva_id,
        'funcionario_id', funcionario_2_id,
        'inicio', '2099-01-05T10:15:00+00:00',
        'fim', '2099-01-05T10:30:00+00:00'
      )
    );
  elsif p_cobertura = 'lacuna' then
    supervisoes := jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid(),
        'atendimento_etapa_equipamento_id', reserva_id,
        'funcionario_id', funcionario_id,
        'inicio', '2099-01-05T10:00:00+00:00',
        'fim', '2099-01-05T10:10:00+00:00'
      ),
      jsonb_build_object(
        'id', gen_random_uuid(),
        'atendimento_etapa_equipamento_id', reserva_id,
        'funcionario_id', funcionario_id,
        'inicio', '2099-01-05T10:20:00+00:00',
        'fim', '2099-01-05T10:30:00+00:00'
      )
    );
  end if;

  return jsonb_set(plano, '{supervisoes}', supervisoes);
end;
$$;

create or replace function pg_temp.montar_plano_financeiro_rpc018(
  p_chave uuid,
  p_hash text
)
returns jsonb
language sql
volatile
set search_path = pg_catalog, pg_temp
as $$
  with base as (
    select pg_temp.montar_plano_rpc018(p_chave, p_hash, 60) as plano,
      fixture.regra_preco_id
    from pg_temp.rpc018_fixture fixture
  ), servico as (
    select base.*,
      (plano #>> '{servicos,0,id}')::uuid as atendimento_servico_id
    from base
  ), valores as (
    select jsonb_set(
      jsonb_set(plano, '{servicos,0,valor_calculado}', '60'::jsonb),
      '{servicos,0,valor_final}', '60'::jsonb
    ) as plano, regra_preco_id, atendimento_servico_id
    from servico
  )
  select jsonb_set(plano, '{acrescimos}', jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid(),
      'atendimento_servico_id', atendimento_servico_id,
      'tipo', 'preco', 'criterio', 'porte',
      'regra_preco_id', regra_preco_id, 'modificador_id', null,
      'descricao_snapshot', 'Porte pequeno',
      'valor_referencia_snapshot', 'pequeno',
      'acrescimo_valor', 10, 'acrescimo_minutos', 0
    )
  ))
  from valores;
$$;

create or replace function pg_temp.montar_plano_funcionario_rpc018(
  p_chave uuid,
  p_hash text
)
returns jsonb
language sql
volatile
set search_path = pg_catalog, pg_temp
as $$
  with plano as (
    select pg_temp.montar_plano_rpc018(p_chave, p_hash) as valor
  ), dados as (
    select plano.valor,
      (plano.valor #>> '{etapas,0,id}')::uuid as etapa_id,
      fixture.funcionario_id
    from plano cross join pg_temp.rpc018_fixture fixture
  )
  select jsonb_set(valor, '{funcionarios}', jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid(),
      'atendimento_etapa_id', etapa_id,
      'funcionario_id', funcionario_id,
      'inicio_planejado', '2099-01-05T10:00:00+00:00',
      'fim_planejado', '2099-01-05T10:30:00+00:00'
    )
  ))
  from dados;
$$;

create or replace function pg_temp.montar_plano_taxidog_rpc018(
  p_chave uuid,
  p_hash text
)
returns jsonb
language sql
volatile
set search_path = pg_catalog, pg_temp
as $$
  with plano as (
    select pg_temp.montar_plano_rpc018(p_chave, p_hash) as valor
  ), dados as (
    select plano.valor, fixture.taxidog_ciclo_id,
      fixture.taxidog_ciclo_ordem
    from plano cross join pg_temp.rpc018_fixture fixture
  ), grupo as (
    select valor, (valor -> 'grupo')
      || jsonb_build_object(
        'modalidade', 'taxidog',
        'horarioChegadaComprometido', null,
        'taxidogCicloId', taxidog_ciclo_id,
        'taxidogCicloNomeSnapshot', 'TESTE_RPC_018_CICLO',
        'taxidogCicloOrdemSnapshot', taxidog_ciclo_ordem,
        'taxidogColetaInicioSnapshot', '08:00',
        'taxidogColetaFimSnapshot', '09:00',
        'taxidogConclusaoLimiteSnapshot', '12:00'
      ) as valor_grupo
    from dados
  )
  select jsonb_set(valor, '{grupo}', valor_grupo)
  from grupo;
$$;

create or replace function pg_temp.montar_plano_proveniencia_rpc018(
  p_chave uuid,
  p_hash text
)
returns jsonb
language sql
volatile
set search_path = pg_catalog, pg_temp
as $$
  with ids as (
    select fixture.*, dominio.*,
      gen_random_uuid() as servico_a_materializado_id,
      gen_random_uuid() as servico_b_materializado_id,
      gen_random_uuid() as servico_c_materializado_id,
      gen_random_uuid() as atendimento_etapa_id,
      (select versao from public.agenda_versao_configuracao where id)
        as configuracao_versao
    from pg_temp.rpc018_fixture fixture
    cross join pg_temp.rpc018_dominio dominio
  )
  select jsonb_build_object(
    'grupo', jsonb_build_object(
      'chaveIdempotencia', p_chave, 'hashRequisicao', p_hash,
      'configuracaoVersao', configuracao_versao,
      'clienteId', cliente_id, 'modalidade', 'normal',
      'dataOperacional', '2099-01-06',
      'horarioChegadaComprometido', '2099-01-06T10:00:00+00:00',
      'retiradaPrevista', '2099-01-06T10:30:00+00:00',
      'observacoes', 'TESTE_RPC_018_PROVENIENCIA'
    ),
    'atendimento', jsonb_build_object(
      'petId', pet_id,
      'inicioOperacionalPlanejado', '2099-01-06T10:00:00+00:00',
      'conclusaoOperacionalPrevista', '2099-01-06T10:30:00+00:00',
      'preferenciaFuncionario', 'automatico',
      'funcionarioPreferidoId', null,
      'petNomeSnapshot', 'TESTE_RPC_018_PET',
      'petEspecieSnapshot', 'cao', 'petRacaIdSnapshot', raca_id,
      'petRacaNomeSnapshot', 'TESTE_RPC_018_RACA',
      'petSexoSnapshot', 'macho', 'petPorteSnapshot', 'pequeno',
      'petPelagemSnapshot', 'curta', 'petPesoSnapshot', 8,
      'petTemperamentoSnapshot', 'calmo',
      'valorCalculado', 80, 'valorFinal', 80,
      'observacoes', 'TESTE_RPC_018_PROVENIENCIA'
    ),
    'servicos', jsonb_build_array(
      jsonb_build_object(
        'id', servico_a_materializado_id, 'servico_id', servico_id,
        'ordem', 1, 'origem', 'solicitado', 'pai_canonico_id', null,
        'nome_snapshot', 'TESTE_RPC_018_SERVICO',
        'preco_base_snapshot', 50, 'valor_calculado', 50,
        'valor_final', 50
      ),
      jsonb_build_object(
        'id', servico_b_materializado_id, 'servico_id', servico_b_id,
        'ordem', 2, 'origem', 'solicitado', 'pai_canonico_id', null,
        'nome_snapshot', 'TESTE_RPC_018_SERVICO_B',
        'preco_base_snapshot', 20, 'valor_calculado', 20,
        'valor_final', 20
      ),
      jsonb_build_object(
        'id', servico_c_materializado_id, 'servico_id', servico_c_id,
        'ordem', 3, 'origem', 'dependencia',
        'pai_canonico_id', servico_a_materializado_id,
        'nome_snapshot', 'TESTE_RPC_018_SERVICO_C',
        'preco_base_snapshot', 10, 'valor_calculado', 10,
        'valor_final', 10
      )
    ),
    'origens', jsonb_build_array(
      jsonb_build_object(
        'atendimento_servico_id', servico_c_materializado_id,
        'originado_por_atendimento_servico_id', servico_a_materializado_id
      ),
      jsonb_build_object(
        'atendimento_servico_id', servico_c_materializado_id,
        'originado_por_atendimento_servico_id', servico_b_materializado_id
      )
    ),
    'acrescimos', '[]'::jsonb,
    'etapas', jsonb_build_array(jsonb_build_object(
      'id', atendimento_etapa_id, 'servico_etapa_id', servico_etapa_id,
      'inicio_planejado', '2099-01-06T10:00:00+00:00',
      'fim_planejado', '2099-01-06T10:30:00+00:00',
      'atendimento_servico_id', servico_a_materializado_id,
      'nome_snapshot', 'TESTE_RPC_018_ETAPA', 'ordem_snapshot', 1,
      'duracao_minutos_snapshot', 30, 'recursos_snapshot', '[]'::jsonb
    )),
    'contribuicoes', '[]'::jsonb, 'funcionarios', '[]'::jsonb,
    'equipamentos', '[]'::jsonb, 'supervisoes', '[]'::jsonb,
    'esperas', '[]'::jsonb
  )
  from ids;
$$;

create or replace function pg_temp.montar_plano_acoplado_rpc018(
  p_chave uuid,
  p_hash text
)
returns jsonb
language sql
volatile
set search_path = pg_catalog, pg_temp
as $$
  with ids as (
    select fixture.*, dominio.*,
      gen_random_uuid() as servico_h_materializado_id,
      gen_random_uuid() as servico_base_materializado_id,
      gen_random_uuid() as atendimento_etapa_id,
      (select versao from public.agenda_versao_configuracao where id)
        as configuracao_versao
    from pg_temp.rpc018_fixture fixture
    cross join pg_temp.rpc018_dominio dominio
  )
  select jsonb_build_object(
    'grupo', jsonb_build_object(
      'chaveIdempotencia', p_chave, 'hashRequisicao', p_hash,
      'configuracaoVersao', configuracao_versao,
      'clienteId', cliente_id, 'modalidade', 'normal',
      'dataOperacional', '2099-01-07',
      'horarioChegadaComprometido', '2099-01-07T10:00:00+00:00',
      'retiradaPrevista', '2099-01-07T10:35:00+00:00',
      'observacoes', 'TESTE_RPC_018_ACOPLADO'
    ),
    'atendimento', jsonb_build_object(
      'petId', pet_id,
      'inicioOperacionalPlanejado', '2099-01-07T10:00:00+00:00',
      'conclusaoOperacionalPrevista', '2099-01-07T10:35:00+00:00',
      'preferenciaFuncionario', 'automatico',
      'funcionarioPreferidoId', null,
      'petNomeSnapshot', 'TESTE_RPC_018_PET',
      'petEspecieSnapshot', 'cao', 'petRacaIdSnapshot', raca_id,
      'petRacaNomeSnapshot', 'TESTE_RPC_018_RACA',
      'petSexoSnapshot', 'macho', 'petPorteSnapshot', 'pequeno',
      'petPelagemSnapshot', 'curta', 'petPesoSnapshot', 8,
      'petTemperamentoSnapshot', 'calmo',
      'valorCalculado', 65, 'valorFinal', 65,
      'observacoes', 'TESTE_RPC_018_ACOPLADO'
    ),
    'servicos', jsonb_build_array(
      jsonb_build_object(
        'id', servico_h_materializado_id, 'servico_id', servico_h_id,
        'ordem', 1, 'origem', 'solicitado', 'pai_canonico_id', null,
        'nome_snapshot', 'TESTE_RPC_018_HIDRATACAO',
        'preco_base_snapshot', 15, 'valor_calculado', 15,
        'valor_final', 15
      ),
      jsonb_build_object(
        'id', servico_base_materializado_id, 'servico_id', servico_id,
        'ordem', 2, 'origem', 'dependencia',
        'pai_canonico_id', servico_h_materializado_id,
        'nome_snapshot', 'TESTE_RPC_018_SERVICO',
        'preco_base_snapshot', 50, 'valor_calculado', 50,
        'valor_final', 50
      )
    ),
    'origens', jsonb_build_array(jsonb_build_object(
      'atendimento_servico_id', servico_base_materializado_id,
      'originado_por_atendimento_servico_id', servico_h_materializado_id
    )),
    'acrescimos', '[]'::jsonb,
    'etapas', jsonb_build_array(jsonb_build_object(
      'id', atendimento_etapa_id, 'servico_etapa_id', servico_etapa_id,
      'inicio_planejado', '2099-01-07T10:00:00+00:00',
      'fim_planejado', '2099-01-07T10:35:00+00:00',
      'atendimento_servico_id', servico_base_materializado_id,
      'nome_snapshot', 'TESTE_RPC_018_ETAPA + HIDRATACAO',
      'ordem_snapshot', 1, 'duracao_minutos_snapshot', 35,
      'recursos_snapshot', '[]'::jsonb
    )),
    'contribuicoes', jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(), 'atendimento_etapa_id', atendimento_etapa_id,
      'atendimento_servico_id', servico_h_materializado_id,
      'servico_etapa_origem_id', etapa_h_id, 'ordem', 1,
      'etapa_nome_snapshot', 'TESTE_RPC_018_HIDRATACAO_ETAPA',
      'duracao_base_snapshot', 5, 'duracao_calculada_snapshot', 5,
      'recursos_snapshot', '[]'::jsonb,
      'habilitacoes_snapshot', '[]'::jsonb
    )),
    'funcionarios', '[]'::jsonb, 'equipamentos', '[]'::jsonb,
    'supervisoes', '[]'::jsonb, 'esperas', '[]'::jsonb
  )
  from ids;
$$;

create temporary table rpc018_resultados (
  teste text primary key,
  resposta jsonb not null,
  grupos_depois bigint not null,
  atendimentos_depois bigint not null,
  versao_ocupacao bigint not null
) on commit drop;

-- Configuracao obsoleta: nenhuma escrita operacional.
with plano as (
  select jsonb_set(
    pg_temp.montar_plano_rpc018(
      gen_random_uuid(), repeat('1', 64)
    ),
    '{grupo,configuracaoVersao}',
    to_jsonb((select versao + 1 from public.agenda_versao_configuracao where id))
  ) as valor
), resposta as (
  select public.confirmar_agendamento_transacional(valor) as valor
  from plano
)
insert into rpc018_resultados
select 'configuracao_obsoleta', resposta.valor,
  (select count(*) from public.grupos_agendamento
    where observacoes = 'TESTE_RPC_018'),
  (select count(*) from public.atendimentos atendimento
    join public.grupos_agendamento grupo
      on grupo.id = atendimento.grupo_agendamento_id
    where grupo.observacoes = 'TESTE_RPC_018'),
  (select versao from public.agenda_versao_ocupacao where id)
from resposta;

-- Payloads malformados e referencias externas.
with casos(teste, plano) as (
  values
    ('uuid_invalido', jsonb_set(
      pg_temp.montar_plano_rpc018(gen_random_uuid(), repeat('2', 64)),
      '{grupo,chaveIdempotencia}', '"uuid-invalido"'::jsonb
    )),
    ('timestamp_invalido', jsonb_set(
      pg_temp.montar_plano_rpc018(gen_random_uuid(), repeat('3', 64)),
      '{atendimento,inicioOperacionalPlanejado}', '"nao-e-data"'::jsonb
    )),
    ('array_escalar', jsonb_set(
      pg_temp.montar_plano_rpc018(gen_random_uuid(), repeat('4', 64)),
      '{funcionarios}', '[1]'::jsonb
    )),
    ('servico_catalogo_externo', jsonb_set(
      pg_temp.montar_plano_rpc018(gen_random_uuid(), repeat('4a', 32)),
      '{servicos,0,servico_id}', to_jsonb(gen_random_uuid())
    )),
    ('etapa_catalogo_externa', jsonb_set(
      pg_temp.montar_plano_rpc018(gen_random_uuid(), repeat('4b', 32)),
      '{etapas,0,servico_etapa_id}', to_jsonb(gen_random_uuid())
    )),
    ('etapa_servico_externo', jsonb_set(
      pg_temp.montar_plano_rpc018(gen_random_uuid(), repeat('5', 64)),
      '{etapas,0,atendimento_servico_id}', to_jsonb(gen_random_uuid())
    )),
    ('funcionario_etapa_externa', jsonb_set(
      pg_temp.montar_plano_rpc018(gen_random_uuid(), repeat('6', 64)),
      '{funcionarios}', jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid(), 'atendimento_etapa_id', gen_random_uuid(),
        'funcionario_id', gen_random_uuid(),
        'inicio_planejado', '2099-01-05T10:00:00+00:00',
        'fim_planejado', '2099-01-05T10:30:00+00:00'
      ))
    )),
    ('equipamento_etapa_externa', jsonb_set(
      pg_temp.montar_plano_rpc018(gen_random_uuid(), repeat('7', 64)),
      '{equipamentos}', jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid(), 'atendimento_etapa_id', gen_random_uuid(),
        'equipamento_unidade_id', gen_random_uuid(),
        'inicio_planejado', '2099-01-05T10:00:00+00:00',
        'fim_planejado', '2099-01-05T10:30:00+00:00'
      ))
    )),
    ('equipamento_catalogo_externo', jsonb_set(
      pg_temp.montar_plano_recurso_rpc018(
        gen_random_uuid(), repeat('7a', 32), false, 'integral'
      ),
      '{equipamentos,0,equipamento_unidade_id}', to_jsonb(gen_random_uuid())
    )),
    ('supervisao_reserva_externa', jsonb_set(
      pg_temp.montar_plano_rpc018(gen_random_uuid(), repeat('8', 64)),
      '{supervisoes}', jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid(),
        'atendimento_etapa_equipamento_id', gen_random_uuid(),
        'funcionario_id', gen_random_uuid(),
        'inicio', '2099-01-05T10:00:00+00:00',
        'fim', '2099-01-05T10:30:00+00:00'
      ))
    )),
    ('espera_etapa_externa', jsonb_set(
      pg_temp.montar_plano_rpc018(gen_random_uuid(), repeat('9', 64)),
      '{esperas}', jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid(), 'etapa_anterior_id', gen_random_uuid(),
        'etapa_seguinte_id', null,
        'inicio', '2099-01-05T10:30:00+00:00',
        'fim', '2099-01-05T10:35:00+00:00',
        'motivo', 'operacional'
      ))
    )),
    ('acrescimo_servico_externo', jsonb_set(
      pg_temp.montar_plano_rpc018(gen_random_uuid(), repeat('a', 64)),
      '{acrescimos}', jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid(),
        'atendimento_servico_id', gen_random_uuid(),
        'tipo', 'preco', 'criterio', 'porte',
        'regra_preco_id', gen_random_uuid(), 'modificador_id', null,
        'descricao_snapshot', 'teste',
        'valor_referencia_snapshot', 'pequeno',
        'acrescimo_valor', 1, 'acrescimo_minutos', 0
      ))
    )),
    ('total_divergente', pg_temp.montar_plano_rpc018(
      gen_random_uuid(), repeat('b', 64), 51
    )),
    ('taxidog_invalido', jsonb_set(
      jsonb_set(
        pg_temp.montar_plano_rpc018(gen_random_uuid(), repeat('ba', 32)),
        '{grupo,modalidade}', '"taxidog"'::jsonb
      ),
      '{grupo,horarioChegadaComprometido}', 'null'::jsonb
    ))
), respostas as (
  select casos.teste,
    public.confirmar_agendamento_transacional(casos.plano) as resposta
  from casos
)
insert into rpc018_resultados
select respostas.teste, respostas.resposta,
  (select count(*) from public.grupos_agendamento
    where observacoes = 'TESTE_RPC_018'),
  (select count(*) from public.atendimentos atendimento
    join public.grupos_agendamento grupo
      on grupo.id = atendimento.grupo_agendamento_id
    where grupo.observacoes = 'TESTE_RPC_018'),
  (select versao from public.agenda_versao_ocupacao where id)
from respostas;

-- Falha tardia: a reserva de equipamento e inserida, mas a cobertura possui
-- lacuna. O handler deve reverter grupo, atendimento, etapa e reserva.
with resposta as (
  select public.confirmar_agendamento_transacional(
    pg_temp.montar_plano_recurso_rpc018(
      gen_random_uuid(), repeat('e', 64), false, 'lacuna'
    )
  ) as valor
)
insert into rpc018_resultados
select 'rollback_lacuna_supervisao', resposta.valor,
  (select count(*) from public.grupos_agendamento
    where observacoes = 'TESTE_RPC_018'),
  (select count(*) from public.atendimentos atendimento
    join public.grupos_agendamento grupo
      on grupo.id = atendimento.grupo_agendamento_id
    where grupo.observacoes = 'TESTE_RPC_018'),
  (select versao from public.agenda_versao_ocupacao where id)
from resposta;

-- Confirmacao valida e retry idempotente.
create temporary table rpc018_idempotencia (
  chave uuid not null,
  hash text not null,
  plano jsonb not null,
  versao_antes bigint not null
) on commit drop;

insert into rpc018_idempotencia
select chave, repeat('c', 64),
  pg_temp.montar_plano_rpc018(chave, repeat('c', 64)),
  (select versao from public.agenda_versao_ocupacao where id)
from (select gen_random_uuid() as chave) item;

with resposta as (
  select public.confirmar_agendamento_transacional(plano) as valor
  from rpc018_idempotencia
)
insert into rpc018_resultados
select 'confirmacao_valida', resposta.valor,
  (select count(*) from public.grupos_agendamento
    where chave_idempotencia = (select chave from rpc018_idempotencia)),
  (select count(*) from public.atendimentos atendimento
    join public.grupos_agendamento grupo
      on grupo.id = atendimento.grupo_agendamento_id
    where grupo.chave_idempotencia =
      (select chave from rpc018_idempotencia)),
  (select versao from public.agenda_versao_ocupacao where id)
from resposta;

with resposta as (
  select public.confirmar_agendamento_transacional(plano) as valor
  from rpc018_idempotencia
)
insert into rpc018_resultados
select 'retry_mesmo_hash', resposta.valor,
  (select count(*) from public.grupos_agendamento
    where chave_idempotencia = (select chave from rpc018_idempotencia)),
  (select count(*) from public.atendimentos atendimento
    join public.grupos_agendamento grupo
      on grupo.id = atendimento.grupo_agendamento_id
    where grupo.chave_idempotencia =
      (select chave from rpc018_idempotencia)),
  (select versao from public.agenda_versao_ocupacao where id)
from resposta;

with resposta as (
  select public.confirmar_agendamento_transacional(
    jsonb_set(plano, '{grupo,hashRequisicao}',
      to_jsonb(repeat('d', 64)))
  ) as valor
  from rpc018_idempotencia
)
insert into rpc018_resultados
select 'retry_hash_conflitante', resposta.valor,
  (select count(*) from public.grupos_agendamento
    where chave_idempotencia = (select chave from rpc018_idempotencia)),
  (select count(*) from public.atendimentos atendimento
    join public.grupos_agendamento grupo
      on grupo.id = atendimento.grupo_agendamento_id
    where grupo.chave_idempotencia =
      (select chave from rpc018_idempotencia)),
  (select versao from public.agenda_versao_ocupacao where id)
from resposta;

-- Capacidade compartilhada 2: duas reservas confirmam; a terceira conflita.
with casos(teste, plano) as (
  values
    ('capacidade_1', pg_temp.montar_plano_recurso_rpc018(
      gen_random_uuid(), repeat('f', 64), false, 'integral'
    )),
    ('capacidade_2', pg_temp.montar_plano_recurso_rpc018(
      gen_random_uuid(), repeat('0', 64), false, 'dois_segmentos'
    ))
), respostas as (
  select teste, public.confirmar_agendamento_transacional(plano) as resposta
  from casos order by teste
)
insert into rpc018_resultados
select teste, resposta,
  (select count(*) from public.grupos_agendamento
    where observacoes = 'TESTE_RPC_018'),
  (select count(*) from public.atendimentos atendimento
    join public.grupos_agendamento grupo
      on grupo.id = atendimento.grupo_agendamento_id
    where grupo.observacoes = 'TESTE_RPC_018'),
  (select versao from public.agenda_versao_ocupacao where id)
from respostas;

with resposta as (
  select public.confirmar_agendamento_transacional(
    pg_temp.montar_plano_recurso_rpc018(
      gen_random_uuid(), repeat('1a', 32), false, 'integral'
    )
  ) as valor
)
insert into rpc018_resultados
select 'capacidade_excedida', resposta.valor,
  (select count(*) from public.grupos_agendamento
    where observacoes = 'TESTE_RPC_018'),
  (select count(*) from public.atendimentos atendimento
    join public.grupos_agendamento grupo
      on grupo.id = atendimento.grupo_agendamento_id
    where grupo.observacoes = 'TESTE_RPC_018'),
  (select versao from public.agenda_versao_ocupacao where id)
from resposta;

-- Uma unidade cuja configuracao atual nao exige supervisao nao pode receber
-- segmentos inventados. O snapshot da nova reserva sera preenchido como false.
update public.equipamentos equipamento
set exige_supervisao_humana = false
where equipamento.id = (
  select fixture.equipamento_id from rpc018_fixture fixture
);

with resposta as (
  select public.confirmar_agendamento_transacional(
    pg_temp.montar_plano_recurso_rpc018(
      gen_random_uuid(), repeat('1b', 32), false, 'integral'
    )
  ) as valor
)
insert into rpc018_resultados
select 'supervisao_indevida', resposta.valor,
  (select count(*) from public.grupos_agendamento
    where observacoes = 'TESTE_RPC_018'),
  (select count(*) from public.atendimentos atendimento
    join public.grupos_agendamento grupo
      on grupo.id = atendimento.grupo_agendamento_id
    where grupo.observacoes = 'TESTE_RPC_018'),
  (select versao from public.agenda_versao_ocupacao where id)
from resposta;

-- Conflito sequencial do mesmo funcionario no mesmo intervalo.
with casos(teste, plano) as (
  values
    ('funcionario_1', pg_temp.montar_plano_funcionario_rpc018(
      gen_random_uuid(), repeat('2a', 32)
    )),
    ('funcionario_conflito', pg_temp.montar_plano_funcionario_rpc018(
      gen_random_uuid(), repeat('3a', 32)
    ))
), respostas as (
  select teste, public.confirmar_agendamento_transacional(plano) as resposta
  from casos order by teste
)
insert into rpc018_resultados
select teste, resposta,
  (select count(*) from public.grupos_agendamento
    where observacoes = 'TESTE_RPC_018'),
  (select count(*) from public.atendimentos atendimento
    join public.grupos_agendamento grupo
      on grupo.id = atendimento.grupo_agendamento_id
    where grupo.observacoes = 'TESTE_RPC_018'),
  (select versao from public.agenda_versao_ocupacao where id)
from respostas;

-- TaxiDog moderno: ciclo e snapshots, sem janela legada.
with resposta as (
  select public.confirmar_agendamento_transacional(
    pg_temp.montar_plano_taxidog_rpc018(
      gen_random_uuid(), repeat('4a', 32)
    )
  ) as valor
)
insert into rpc018_resultados
select 'taxidog_moderno', resposta.valor,
  (select count(*) from public.grupos_agendamento
    where observacoes = 'TESTE_RPC_018'),
  (select count(*) from public.atendimentos atendimento
    join public.grupos_agendamento grupo
      on grupo.id = atendimento.grupo_agendamento_id
    where grupo.observacoes = 'TESTE_RPC_018'),
  (select versao from public.agenda_versao_ocupacao where id)
from resposta;

-- Financeiro valido: preco-base 50 + acrescimo por porte 10 = total 60.
with resposta as (
  select public.confirmar_agendamento_transacional(
    pg_temp.montar_plano_financeiro_rpc018(
      gen_random_uuid(), repeat('4c', 32)
    )
  ) as valor
)
insert into rpc018_resultados
select 'financeiro_com_acrescimo', resposta.valor,
  (select count(*) from public.grupos_agendamento
    where observacoes = 'TESTE_RPC_018'),
  (select count(*) from public.atendimentos atendimento
    join public.grupos_agendamento grupo
      on grupo.id = atendimento.grupo_agendamento_id
    where grupo.observacoes = 'TESTE_RPC_018'),
  (select versao from public.agenda_versao_ocupacao where id)
from resposta;

with casos(teste, plano) as (
  values
    ('proveniencia_multipla', pg_temp.montar_plano_proveniencia_rpc018(
      gen_random_uuid(), repeat('5a', 32)
    )),
    ('contribuicao_acoplada', pg_temp.montar_plano_acoplado_rpc018(
      gen_random_uuid(), repeat('6a', 32)
    ))
), respostas as (
  select teste, public.confirmar_agendamento_transacional(plano) as resposta
  from casos
)
insert into rpc018_resultados
select teste, resposta,
  (select count(*) from public.grupos_agendamento
    where observacoes like 'TESTE_RPC_018%'),
  (select count(*) from public.atendimentos atendimento
    join public.grupos_agendamento grupo
      on grupo.id = atendimento.grupo_agendamento_id
    where grupo.observacoes like 'TESTE_RPC_018%'),
  (select versao from public.agenda_versao_ocupacao where id)
from respostas;

-- Resultado detalhado. Esperado: erros estruturais PLANO_INVALIDO,
-- configuracao obsoleta CONFIGURACAO_ALTERADA e somente um grupo no retry.
select * from rpc018_resultados order by teste;

select
  (select versao_antes from rpc018_idempotencia) as ocupacao_antes,
  (select versao_ocupacao from rpc018_resultados
    where teste = 'confirmacao_valida') as apos_confirmacao,
  (select versao_ocupacao from rpc018_resultados
    where teste = 'retry_mesmo_hash') as apos_retry,
  (select count(*) from public.grupos_agendamento
    where chave_idempotencia = (select chave from rpc018_idempotencia))
    as grupos_idempotentes,
  (select count(*) from public.atendimentos atendimento
    join public.grupos_agendamento grupo
      on grupo.id = atendimento.grupo_agendamento_id
    where grupo.chave_idempotencia =
      (select chave from rpc018_idempotencia)) as atendimentos_idempotentes;

select
  resultado.teste,
  grupo.modalidade,
  grupo.janela_transporte_id,
  grupo.taxidog_ciclo_id,
  grupo.taxidog_ciclo_nome_snapshot,
  grupo.taxidog_conclusao_limite_snapshot
from rpc018_resultados resultado
join public.grupos_agendamento grupo
  on grupo.id = (resultado.resposta ->> 'grupoAgendamentoId')::uuid
where resultado.teste = 'taxidog_moderno';

select
  resultado.teste,
  count(distinct reserva.id) as reservas_equipamento,
  count(segmento.id) as segmentos_supervisao
from rpc018_resultados resultado
join public.atendimento_etapas etapa
  on etapa.atendimento_id =
    (resultado.resposta ->> 'atendimentoId')::uuid
join public.atendimento_etapa_equipamentos reserva
  on reserva.atendimento_etapa_id = etapa.id
left join public.atendimento_etapa_equipamento_supervisoes segmento
  on segmento.atendimento_etapa_equipamento_id = reserva.id
where resultado.teste in ('capacidade_1', 'capacidade_2')
group by resultado.teste
order by resultado.teste;

select
  resultado.teste,
  count(distinct servico.id) as servicos_materializados,
  count(origem.atendimento_servico_id) as arestas,
  count(distinct servico.id) filter (
    where servico.nome_snapshot = 'TESTE_RPC_018_SERVICO_C'
  ) as servico_c_materializado,
  max(servico.originado_por_atendimento_servico_id::text) filter (
    where servico.nome_snapshot = 'TESTE_RPC_018_SERVICO_C'
  )::uuid as pai_canonico_c
from rpc018_resultados resultado
join public.atendimento_servicos servico
  on servico.atendimento_id =
    (resultado.resposta ->> 'atendimentoId')::uuid
left join public.atendimento_servico_origens origem
  on origem.atendimento_servico_id = servico.id
where resultado.teste = 'proveniencia_multipla'
group by resultado.teste;

select
  resultado.teste,
  atendimento.valor_calculado as total_calculado,
  atendimento.valor_final as total_final,
  servico.preco_base_snapshot,
  servico.valor_calculado as servico_calculado,
  servico.valor_final as servico_final,
  count(acrescimo.id) as acrescimos,
  sum(acrescimo.acrescimo_valor) as total_acrescimos
from rpc018_resultados resultado
join public.atendimentos atendimento
  on atendimento.id = (resultado.resposta ->> 'atendimentoId')::uuid
join public.atendimento_servicos servico
  on servico.atendimento_id = atendimento.id
left join public.atendimento_servico_acrescimos acrescimo
  on acrescimo.atendimento_servico_id = servico.id
where resultado.teste = 'financeiro_com_acrescimo'
group by resultado.teste, atendimento.valor_calculado,
  atendimento.valor_final, servico.preco_base_snapshot,
  servico.valor_calculado, servico.valor_final;

select
  resultado.teste,
  count(distinct etapa.id) as etapas_consolidadas,
  count(contribuicao.id) as contribuicoes,
  max(contribuicao.etapa_nome_snapshot) as contribuicao_snapshot
from rpc018_resultados resultado
join public.atendimento_etapas etapa
  on etapa.atendimento_id =
    (resultado.resposta ->> 'atendimentoId')::uuid
left join public.atendimento_etapa_contribuicoes contribuicao
  on contribuicao.atendimento_etapa_id = etapa.id
where resultado.teste = 'contribuicao_acoplada'
group by resultado.teste;

rollback;

-- Execute depois do ROLLBACK. Todos devem retornar zero.
select
  (select count(*) from public.clientes
    where nome = 'TESTE_RPC_018_CLIENTE') as clientes_restantes,
  (select count(*) from public.pets
    where nome = 'TESTE_RPC_018_PET') as pets_restantes,
  (select count(*) from public.servicos
    where nome like 'TESTE_RPC_018_SERVICO%') as servicos_restantes,
  (select count(*) from public.funcionarios
    where nome like 'TESTE_RPC_018_FUNCIONARIO%') as funcionarios_restantes,
  (select count(*) from public.equipamentos
    where nome = 'TESTE_RPC_018_EQUIPAMENTO') as equipamentos_restantes,
  (select count(*) from public.taxidog_ciclos
    where nome = 'TESTE_RPC_018_CICLO') as ciclos_restantes,
  (select count(*) from public.grupos_agendamento
    where observacoes like 'TESTE_RPC_018%') as grupos_restantes,
  (select versao from public.agenda_versao_ocupacao where id)
    as ocupacao_depois_do_rollback;
