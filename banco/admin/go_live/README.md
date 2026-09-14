# Preparação de go-live — 12/09/2026

> Atualização 14/09: usuário confirmou aplicação da 035, novo login funcional e
> aplicação da 036. A validação pós-036 retornou 191 verificações OK e zero falhas,
> com as quatro tabelas de staging vazias.
> A implementação local seguinte e seus testes estão em [IMPORTACAO_036.md](IMPORTACAO_036.md).
> As descrições abaixo registram a auditoria anterior; o inventário de limpeza deve ser
> refeito após 036, antes de qualquer uso dos scripts destrutivos.

Preparação exclusivamente local. Nenhuma migration, limpeza, importação ou deploy executado.

## Evidências e segurança

Schema real: Supabase Snippet Untitled query (18).csv, em Downloads: 64 tabelas públicas, 105 FKs. CSVs reais: 329 clientes, 383 pets, 383 vínculos resolvidos por clienteId externo, zero órfãos. Originais não copiados ao Git.

RLS está habilitado em clientes/pets, mas seis policies permitem SELECT/INSERT/UPDATE para anon/authenticated com expressão verdadeira. A migration 035 preparada remove as policies dessas duas tabelas e os privilégios públicos/anon, mantendo SELECT/INSERT/UPDATE autenticados somente com auth.jwt()->'app_metadata'->>'role' = 'internal'. Uma policy restritiva impede abertura por OR. DELETE não é concedido ao frontend; operações administrativas service_role são preservadas.

É o contrato de frontend/src/auth/interna.ts e da migration 026. Os adaptadores frontend/src/data/clientes.ts e pets.ts usam o cliente Supabase autenticado diretamente. Apenas authenticated não basta; user_metadata não autoriza. Nenhum JWT real foi extraído ou registrado. Não foi identificado papel separado de administrador: a futura importação requer decisão explícita de autorização, sem inventar claim admin.

**A exposição remota permanece até aplicação e validação autorizadas da 035.**

## Clientes

035 adiciona email, cpf, cep, numero, complemento e estado como TEXT nullable; data_nascimento como DATE nullable. Texto preserva zeros, pontuação e números de endereço com letras/s/n. Sem UNIQUE, default artificial ou alteração de IDs. Datas inválidas/ambíguas ficam pendentes com o original seguro. IDs externos ficam na importação; banco continua gerando CLI-000001 etc.

Há 1 cliente sem WhatsApp. Opção A exige alterar NOT NULL/CHECK, tipos, formulários e consumidores. Recomendo B: manter a linha pendente até revisão, junto dos pets dependentes. Nenhum telefone fictício ou associação por nome/telefone.

## Pets: 0 prontos e 383 com pendências

Contagem considera os campos obrigatórios sem substituir informação desconhecida pelos defaults do banco. Já há pendência antes da resolução de raças; não significa que todos os campos estejam vazios.

| Campo | Ausente ou sem equivalência aprovada |
|---|---:|
| espécie | 41 |
| sexo | 131 |
| porte | 48, incluindo 7 Micro |
| pelagem | 41 |
| temperamento | 382, incluindo 275 vazios |
| castrado | 319 |

Os grupos se sobrepõem. Micro não vira mini automaticamente, nem manso/bravo/reativo viram calmo/moderado/dificil. Castrado false, temperamento calmo e pelagem curta não podem ser usados para inventar histórico. pets.data_nascimento é TEXT no schema atual, diferentemente da nova coluna DATE de clientes.

| Área | A: Pet operacional incompleto | B: staging |
|---|---|---|
| Motor | Novas guardas em todas as entradas e tipos nullable | Contrato obrigatório preservado |
| Preço | Bloqueio explícito antes das regras por perfil | Consulta somente após promoção válida |
| Agenda | Definir exibição e impedir novos agendamentos incompletos | Não recebe pendentes |
| Contratos | Guardas em venda, materialização e remarcação | Perfis operacionais continuam completos |
| Cadastro manual | Novo estado e fluxo de conclusão | Exigências atuais preservadas |
| Frontend | Revisão de todos os consumidores | Área de revisão isolada |
| Testes | Regressões amplas de consumidores e bloqueios | Staging, promoção e idempotência |

**Recomendação B implementada.** A semântica operacional de Pets foi preservada. Tabelas de staging e RPCs foram aplicadas pela migration 036; a UI está pronta para publicação. Nenhum CSV real foi importado.

## Raças e duplicidades

revisao_racas.csv cobre as 53 combinações originais de espécie/raça com sugestão, confiança, ação, quantidade e observação. Normalização é apenas comparativa. Shih Tzu e grafias próximas, Bulldog/Buldogue Francês são propostas, não fusões aprovadas. Espécie não é inferida pela raça.

Catálogo real: SRD cão, SRD gato e raça canina “2”; zero sinônimos cadastrados. Há proposta de usar SRD para 97 pets de espécie conhecida e 27 pets com raça vazia. Outras propostas de criação exigem revisão; nenhuma raça desconhecida será criada automaticamente.

Raça “2” não aparece no CSV real. Nome suspeito não comprova dado de teste. O export não fornece suas associações individuais: 05_diagnostico_raca_2.sql consulta todas as FKs para racas.id. Mesmo sem referências, confirmar intenção comercial antes de remover. A limpeza preserva racas integralmente.

Avisos: 2 linhas por categoria de duplicidade CPF, telefone, email, nome+telefone e tutor+nome/raça; categorias podem se sobrepor. Dois nomes numéricos. Zero IDs externos duplicados; nenhuma fusão automática.

## Arquitetura conceitual

- importacao_lotes: origem estável, lote, autor, estado, totais e hash do conteúdo permitido; não guardar upload bruto.
- importacao_clientes_staging: lote, external_id, número da linha, JSON original permitido, normalizado, validação, erros, avisos e decisão auditada do operador.
- importacao_pets_staging: mesmos campos e cliente_external_id, referência ao cliente staging do lote; validar órfãos e ambiguidade.
- importacao_mapeamentos: origem, entidade, external_id, lote e ID interno; UNIQUE(origem,entidade,external_id) entre lotes. FKs tipadas cliente_id/pet_id e CHECK de destino coerente, sem FK polimórfica sem integridade.

Preview local não grava. Salvar lote será ação explícita separada de promover cadastros. “Linha original” significa somente campos permitidos e número da linha: senha, tokenSenha, tokenSenhaExpira e tokenVerificacao não entram em staging, logs, erros, relatórios ou hash persistido. Backend repete a filtragem. Staging requer RLS interna e controle administrativo no backend.

Promoção valida campos/raças/operador, bloqueia origem e cria cliente sem fornecer ID. O CLI retornado integra o mapa. Pet usa exclusivamente clienteId externo -> mapa CLI -> cliente_id. Cadastros selecionados e mapeamentos são uma transação; erro causa rollback da unidade selecionada. Não selecionados continuam pendentes. Reenvio encontra o mapa existente; conflito concorrente é explícito, sem duplicata nem atualização silenciosa. Telefone/nome nunca são chaves.

## Administração e arquivos

- 01_diagnostico_schema_clientes_pets_exportavel.sql: um result set somente leitura; refazer antes de operar. 01_diagnostico_pre_limpeza.sql oferece seções separadas.
- manifesto_tabelas.json e 00_manifesto.psql: 29 transacionais e 35 preservadas, contagens observadas.
- 02_backup_pre_go_live.ps1: backups públicos completo e transacional, hashes SHA-256 fora do Git.
- 03_limpar_dados_teste.psql: transação, lista fechada, bloqueios e TRUNCATE RESTRICT, sem CASCADE.
- 04_diagnostico_pos_limpeza.psql: contagens e sequências, sem consumir IDs.
- 05_diagnostico_raca_2.sql: referências, somente leitura.
- 06_validar_seguranca_035.sql: ensaio somente leitura após 035 em ambiente isolado.
- scripts/admin/analisar-csv-go-live.mjs: relatório agregado local; parser/testes em frontend/src/importacao.

Triggers de histórico imutável e validação diferida tornam DELETE indiscriminado inadequado. Limpeza usa TRUNCATE RESTRICT explícito; não desabilita triggers nem amplia alcance com CASCADE. Aborta em inventário/contagens divergentes, FKs externas, herança ou triggers TRUNCATE. Compara conteúdo das configurações preservadas. agenda_versao_ocupacao permanece e avança uma vez, pois TRUNCATE não dispara triggers DELETE; nenhuma regra do Motor muda.

Clientes/pets precisam estar vazios e associados às sequências esperadas antes do RESTART WITH 1 transacional. Não chama nextval nem usa setval. Estruturas e auth/users não são removidos. Todos os escritores devem ficar suspensos do diagnóstico/backup até a validação. Novas tabelas de staging exigem atualizar auditoria e manifesto.

Veja OPERACAO_MANUAL.md. A 035 e a 036 foram aplicadas pelo usuário e a validação pós-036 passou em 191 de 191 verificações. A limpeza, o backup, a restauração ensaiada e a importação real continuam sem execução; testes locais não substituem o ensaio de restauração.

## Tabelas exatas a esvaziar (29)

- public.atendimento_esperas
- public.atendimento_etapa_contribuicoes
- public.atendimento_etapa_equipamento_supervisoes
- public.atendimento_etapa_equipamentos
- public.atendimento_etapa_funcionarios
- public.atendimento_etapas
- public.atendimento_financeiro
- public.atendimento_ocorrencias
- public.atendimento_recebimentos
- public.atendimento_recomendacoes_retorno
- public.atendimento_remarcacoes
- public.atendimento_servico_acrescimos
- public.atendimento_servico_origens
- public.atendimento_servicos
- public.atendimento_status_eventos
- public.atendimentos
- public.clientes
- public.contrato_ciclo_ocorrencia_itens
- public.contrato_ciclo_ocorrencias
- public.contrato_ciclos
- public.contrato_credito_eventos
- public.contrato_credito_operacoes_idempotentes
- public.contrato_eventos
- public.contrato_item_regras_aplicadas
- public.contrato_itens
- public.contrato_operacoes_idempotentes
- public.contratos
- public.grupos_agendamento
- public.pets

## Tabelas exatas preservadas (35)

- public.agenda_versao_configuracao
- public.agenda_versao_ocupacao
- public.configuracao_agenda
- public.equipamento_perfil_itens
- public.equipamento_perfis_capacidade
- public.equipamento_unidades
- public.equipamentos
- public.estabelecimento_blocos
- public.estabelecimento_excecao_blocos
- public.estabelecimento_excecoes
- public.funcionario_etapas
- public.funcionario_intervalos
- public.funcionario_jornadas
- public.funcionario_servicos
- public.funcionarios
- public.janelas_transporte
- public.pacote_operacoes_idempotentes
- public.pacote_servico_regras_preco
- public.pacote_servicos
- public.pacotes
- public.raca_sinonimos
- public.racas
- public.servico_acoplamentos
- public.servico_dependencias
- public.servico_especies
- public.servico_etapa_recursos
- public.servico_etapas
- public.servico_modificadores
- public.servico_portes
- public.servico_racas_bloqueadas
- public.servico_regras_preco
- public.servicos
- public.taxidog_ciclo_dias
- public.taxidog_ciclos
- public.unidades_periodo

Todo o schema auth, inclusive auth.users, fica fora do alcance da limpeza.
