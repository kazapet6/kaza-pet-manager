# KAZA PET Manager

## Missão

Construir um ERP completo para banho e tosa.

O objetivo do sistema é controlar toda a operação do petshop, desde o primeiro contato do cliente até a análise financeira da empresa.

O sistema deve reduzir trabalho manual, evitar erros operacionais e fornecer indicadores para tomada de decisão.

---

# Módulos

## Dashboard

Visão geral da empresa.

## Agenda

Controle completo dos atendimentos.

## Clientes

Cadastro de tutores.

## Pets

Cadastro dos animais.

## Pacotes

Catálogo das modalidades comerciais recorrentes oferecidas pelo petshop.

O catálogo é autoritativo no banco. Leituras são permitidas somente a usuários autenticados com `app_metadata.role = internal`; escritas administrativas passam pela Edge Function `gerenciar-pacotes`, por uma RPC transacional e idempotente com concorrência otimista por versão. O Pacote agrega Serviços com quantidade fechada por ciclo, recorrência calendárica independente, offset e um desconto percentual por item. Ele não possui regras próprias por porte, raça, peso, pelagem ou temperamento. A Edge `simular-preco-pacote` obtém do Motor o preço avulso oficial para o pet e aplica o benefício do Pacote, sem colocar conhecimento de Pacotes dentro do Motor nem persistir totais derivados. Transporte, vínculo com pet, calendário concreto, ciclos e valor contratado pertencem ao Contrato.

## Contratos

Venda e gerenciamento dos contratos recorrentes vinculados a um pacote. Cada
Contrato pertence a um unico pet e possui uma unica serie fixa: dia da semana,
horario, data ancora e modalidade de transporte ficam no proprio Contrato, sem
tabelas de series por Servico. Os itens preservam quantidade, periodicidade,
offset, preços avulsos, desconto do Pacote, preço resultante e regras oficiais do Serviço como snapshots imutáveis.

O materializador reutiliza o Motor de Disponibilidade para distribuir
todos os itens nessa unica serie, agrupar Servicos da mesma ocorrencia e validar
dependencias. Dependencias operacionais nunca criam creditos comerciais. Se as
periodicidades contratadas nao permitirem posicionar um Servico junto de sua
dependencia obrigatoria, a venda sera rejeitada para correcao humana.

A venda autoritativa segue `Cliente/Pet -> Pacote -> Simulacao -> Valor ->
Configuracao -> Revisao`. A Edge `vender-contrato` autentica o usuario interno,
recalcula a simulacao oficial e valida cliente/pet, versao do Pacote, perfil,
dependencias e serie fixa. A RPC `vender_contrato(jsonb)` persiste na mesma
transacao Contrato, itens, regras, evento e idempotencia. O responsavel por
ajustes vem da autenticacao. A RPC de venda cria o primeiro Ciclo e suas
reservas finitas; em seguida a Edge aciona a materializacao idempotente. A RPC
`materializar_ciclo_contrato` chama a confirmação oficial e troca, na mesma
transação, cada reserva virtual pelo atendimento real. Se essa segunda operação
falhar, a interface informa que o Contrato existe e oferece retry seguro, sem
declarar sucesso completo. Crédito e financeiro de Ciclos permanecem separados.

## Financeiro

Receitas, despesas, fluxo de caixa, inadimplência.

## Estoque

Controle de produtos e materiais.

## Compras

Controle de fornecedores e compras.

## Custos

Cálculo automático dos custos dos serviços.

## Funcionários

Usuários, permissões e produtividade.

## Portal do Cliente

Área onde o cliente poderá:

- comprar contratos;
- agendar serviços;
- remarcar;
- pular banho;
- pagar;
- acompanhar histórico.

## Relatórios

Indicadores da empresa.

## Configurações

Parâmetros gerais do sistema.


ARQUITETURA.md

1. Objetivo do projeto

2. Filosofia do sistema

3. Módulos

4. Fluxo entre módulos

5. Tecnologias utilizadas

6. Regras de desenvolvimento

7. Roadmap

8. Backlog
## Ciclos, capacidade recorrente e disponibilidade (Migration 030)

- Contrato é a relação comercial; não reserva capacidade indefinidamente.
- Ciclo é a unidade finita de compromisso. Somente ocorrências `reservada` de Ciclos existentes entram no snapshot de ocupação do Motor.
- A venda revalida no mesmo Motor todas as ocorrências fechadas do primeiro Ciclo e persiste Contrato, Ciclo e planos sob controle de versão da ocupação.
- Uma ocorrência materializada passa a apontar para o atendimento e deixa de ser lida como reserva; a troca deve ocorrer na mesma transação para impedir dupla contagem.
- A Migration 031 implementa essa troca para o Ciclo inteiro: revalida cada ocorrência no Motor ignorando somente a própria reserva, confirma os atendimentos pelo fluxo oficial e vincula todos em uma única transação. O índice parcial em `atendimento_id` impede que um atendimento pertença a mais de uma ocorrência.
- Renovação automática sempre cria o próximo Ciclo. Sem capacidade, ele nasce `requer_revisao`, sem ocorrências/reservas, preservando a rotina pretendida e produzindo pendência administrativa.
- Agenda e venda usam as mesmas funções do Motor. `funcionario_servicos`, sincronizada pelas etapas, continua sendo a fonte autoritativa de habilitação.
- Janela TaxiDog é logística; início efetivo é definido pelo Motor e pode ser posterior, desde que respeite a capacidade e o limite do ciclo TaxiDog.

## Créditos comerciais e auditoria (Migration 032)

- `contrato_ciclo_ocorrencia_itens` é a fonte do estado atual de cada unidade comercial. Seus estados são independentes do status operacional do atendimento.
- `alterar_status_atendimento_com_creditos(jsonb)` substitui a escrita isolada de status na fronteira administrativa. A conclusão e a baixa dos itens da ocorrência acontecem atomicamente por trigger transacional.
- `contrato_credito_eventos` e `atendimento_status_eventos` são históricos append-only. Decisões manuais exigem usuário, motivo, versão esperada e chave idempotente.
- `reverter_conclusao_atendimento(jsonb)` restaura os itens consumidos e valida o destino contra a modalidade. `decidir_credito_contrato(jsonb)` decide uma única unidade em falta ou encerramento e suporta correção auditável.
- Dados concluídos antes da 032 entram em `revisao_legado`; a migration não inventa consumo retroativo.
- A Edge `gerenciar-creditos-contrato` concentra autenticação interna, leituras em lote por nível e chamadas das RPCs. O frontend não escreve tabelas diretamente.
- O modal navega no mesmo painel por Contrato → Ciclo → Serviço → Crédito. Resumo de Contrato carrega Ciclos; o detalhe de Ciclo carrega Serviços e unidades em lote; o histórico completo é lazy apenas no crédito escolhido.
- Agregados de consumo e disponibilidade reutilizam o núcleo puro em `_shared/credito-contrato.ts`; perdido reduz disponibilidade, mas não aumenta consumo.
