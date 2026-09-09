# Regras de Negócio — KAZA PET Manager

## 1. Estrutura do sistema

O sistema será organizado em:

- Clientes
- Pets
- Pacotes
- Contratos
- Ciclos
- Atendimentos
- Agenda
- Financeiro
- Inadimplentes
- Histórico

## 2. Pacotes disponíveis

Pacote é um modelo comercial reutilizável do catálogo. A aquisição por um cliente e um pet é um Contrato e não faz parte do cadastro do Pacote.

Cada Serviço do Pacote possui uma quantidade fechada e autoritativa por ciclo, uma recorrência própria e um desconto percentual sobre o preço avulso oficial. A recorrência posiciona temporalmente exatamente essa quantidade e nunca cria ocorrências adicionais por causa do calendário. Dia, semana, mês e ano preservam suas semânticas; mês e ano são unidades de calendário, não durações fixas em dias.

O ciclo não possui vencimento mensal fixo: termina quando as quantidades contratadas forem consumidas ou concluídas conforme o futuro Contrato. A próxima ocorrência depois do encerramento pertence ao novo ciclo, mesmo que caia no mesmo mês-calendário.

O Motor é a única autoridade para calcular o preço avulso do Serviço para determinado pet, incluindo porte, raça, peso, pelagem, temperamento e demais regras oficiais. O Pacote não replica essas regras: define somente o desconto percentual aplicado ao resultado oficial. Desconto de 0% mantém o preço avulso e desconto de 100% inclui gratuitamente o Serviço. Totais e economia multiplicam os preços unitários resultantes pela quantidade fechada. Dependências operacionais já explícitas na composição não são novamente contadas comercialmente.

Transporte e valor efetivamente negociado pertencem ao Contrato. A venda preserva em snapshot o preço avulso considerado, o desconto do Pacote, o preço resultante, as quantidades, o total calculado e o valor contratado; quando este divergir, preserva também motivo e usuário interno responsável. Alterações futuras no Serviço ou no Pacote não modificam Contratos vendidos.

### Pacote semanal

- Possui 4 banhos por ciclo.
- Os banhos acontecem semanalmente.
- O pet possui dia e horário fixos na agenda.
- O transporte de ida e volta está incluído.

### Pacote quinzenal

- Possui 2 banhos por ciclo.
- Funciona com uma semana de atendimento e uma semana sem atendimento.
- O pet mantém o mesmo dia da semana e o mesmo horário.
- Não é calculado por 15 dias exatos.
- O transporte de ida e volta está incluído.

## 3. Contrato

Cada contrato pertence a:

- um único cliente;
- um único pet;
- um tipo de pacote;
- um dia fixo;
- um horário fixo;
- um valor personalizado.

O Contrato possui uma unica regra de agendamento fixo: um dia da semana, um
horario, uma data ancora e uma modalidade de transporte. Todos os Servicos do
Contrato sao distribuidos exclusivamente nas ocorrencias dessa mesma serie.
Nao e permitido configurar dias ou horarios diferentes por item contratado.

Cada item preserva sua propria quantidade fechada, periodicidade e offset. A
periodicidade posiciona unidades existentes e nunca cria creditos adicionais.
Antes da venda, o Motor oficial deve comprovar que a distribuicao conjunta e
operacionalmente valida. Se um Servico depender de outro, ele deve ocorrer
junto de uma ocorrencia que ja contenha essa dependencia. Uma combinacao de
quantidades, offsets e periodicidades que nao consiga satisfazer as
dependencias e invalida e exige correcao humana.

A resolucao operacional de dependencias nao altera a composicao comercial:
nao cria creditos, nao aumenta quantidades contratadas e nao possui um segundo
grafo de dependencias fora do Motor atual.

Exemplo: em uma serie fixa de sexta-feira as 09:00, quatro Banhos semanais e
duas Hidratacoes quinzenais materializam Banho + Hidratacao na primeira e na
terceira ocorrencias e somente Banho na segunda e na quarta. Se Hidratacao
exigir Banho, ela obrigatoriamente ocupa essas ocorrencias que ja possuem um
dos quatro creditos comerciais de Banho; nenhum quinto Banho e criado.

O valor pode variar conforme:

- porte;
- raça;
- peso;
- pelagem;
- comportamento;
- localização;
- serviços adicionais.

## 4. Renovação

No momento da venda será definido:

- renovação automática: sim;
- renovação automática: não.

### Renovação automática ativada

Ao concluir o último banho do ciclo:

- semanal: 4/4;
- quinzenal: 2/2;

o sistema cria automaticamente o próximo ciclo.

O novo ciclo mantém:

- cliente;
- pet;
- tipo de pacote;
- dia e horário;
- valor;
- transporte;
- serviços;
- observações.

O novo ciclo começa com pagamento pendente.

### Renovação automática desativada

Ao concluir o último banho:

- o ciclo fica concluído;
- o contrato fica concluído;
- nenhum novo ciclo é criado;
- os horários futuros são liberados.

## 5. Ciclos

Cada pacote vendido gera um ciclo.

### Ciclo semanal

- 4 banhos.
- Exibição: 1/4, 2/4, 3/4 e 4/4.

### Ciclo quinzenal

- 2 banhos.
- Exibição: 1/2 e 2/2.

O número do banho representa a quantidade de serviços utilizados, e não a quantidade de datas que passaram.

## 6. Pagamento

- O pagamento é realizado integralmente no primeiro banho do ciclo.
- O ciclo não é considerado regular enquanto o pagamento não for confirmado.
- O pagamento parcial não é permitido.

Se o primeiro banho for realizado e o pagamento não for feito até a data do próximo banho:

- o próximo agendamento deve ser removido;
- o horário deve ser liberado;
- o contrato deve ser bloqueado por inadimplência;
- o cliente deve aparecer na tela de inadimplentes;
- nenhum novo atendimento deve ser criado até a regularização.

## 7. Remarcação

O cliente pode remarcar um banho para outro dia e horário disponível.

A remarcação:

- mantém o crédito;
- mantém o transporte incluído;
- mantém a numeração do banho;
- não altera os próximos horários fixos;
- deve gerar registro no histórico.

## 8. Pular banho

O cliente pode pular um banho e utilizar o crédito futuramente.

Cada ciclo permite:

- até 2 pulos normais.

Ao tentar o terceiro pulo:

- o sistema deve bloquear;
- deve exigir autorização de gerente;
- a autorização deve exigir senha administrativa;
- deve registrar responsável, data e motivo.

Se o cliente precisar ficar várias semanas sem atendimento, o contrato deve ser pausado.

## 9. Pausa

Ao pausar um contrato:

- os agendamentos futuros são removidos;
- os horários são liberados para outros clientes;
- os créditos existentes são preservados;
- não são criados novos ciclos;
- o contrato fica com status pausado.

Ao reativar:

- será necessário escolher novamente dia e horário disponíveis;
- o horário anterior não é garantido.

## 10. Cancelamento

Ao cancelar definitivamente:

- os agendamentos futuros são removidos;
- os horários são liberados;
- nenhuma renovação é criada;
- o histórico é preservado;
- o motivo e o responsável são registrados;
- o contrato fica com status cancelado.

## 11. Falta sem aviso

A perda do crédito não será automática.

Ao registrar uma falta, o sistema perguntará:

- perder crédito;
- preservar crédito.

### Perder crédito

- o crédito passa ao estado comercial perdido;
- perdido não conta como consumido, pois o Serviço não foi realizado;
- deixa de estar disponível;
- o histórico registra a ocorrência.

### Preservar crédito

- o banho continua disponível;
- o ciclo se estende;
- o motivo deve ser registrado.

## 12. Status do contrato

O contrato pode ter os seguintes status:

- Ativo
- Pausado
- Bloqueado por inadimplência
- Concluído
- Cancelado

## 13. Status do ciclo

O ciclo pode ter os seguintes status:

- Aguardando primeiro banho
- Aguardando pagamento
- Ativo
- Concluído

## 14. Status do atendimento

Os status operacionais do atendimento são distintos dos status de contratos,
créditos e pagamentos:

- Agendado: agendamento criado, sem confirmação de comparecimento registrada.
- Confirmado: o cliente confirmou que comparecerá. Não significa check-in nem
  início dos serviços.
- Recebido: o pet foi recebido fisicamente pelo estabelecimento.
- Em atendimento: a execução operacional dos serviços foi iniciada.
- Aguardando retirada: os serviços terminaram e o pet aguarda o responsável.
- Aguardando entrega: os serviços terminaram e o pet aguarda o TaxiDog.
- Concluído: o pet saiu da responsabilidade operacional do estabelecimento.
- Cancelado: encerramento excepcional permitido antes da conclusão; libera a
  ocupação sem apagar as reservas históricas.
- Faltou: não comparecimento registrado somente a partir de Agendado ou
  Confirmado; libera a ocupação sem efeito financeiro neste incremento.

A confirmação do cliente é opcional para o fluxo operacional. O operador
interno pode corrigir manualmente qualquer um dos sete status operacionais,
inclusive retornar a um estado anterior. Cancelado e Faltou não fazem parte
desse seletor e dependem de fluxos próprios. Remarcação, pulo, efeitos em
créditos e inadimplência pertencem aos módulos de contratos.

Cancelado e Faltou são terminais e não podem ser reabertos neste incremento.
O cancelamento é permitido a partir dos seis estados que ainda bloqueiam a
Agenda. Um atendimento Concluído não pode ser cancelado. A falta não pode ser
registrada depois que o pet foi recebido.

### Planejamento e execução real

O planejamento operacional e a execução real são registros distintos. Os
horários do atendimento, das etapas e das reservas de funcionários e
equipamentos representam o que foi previsto e não são sobrescritos por uma
mudança de status.

A execução real é registrada pelo banco, com horário autoritativo, na primeira
entrada efetiva em cada estado correspondente:

- `recebido_em`: primeira entrada em Recebido;
- `iniciado_em`: primeira entrada em Em atendimento;
- `finalizado_em`: primeira entrada em Aguardando retirada ou Aguardando entrega;
- `concluido_em`: primeira entrada em Concluído.

Cada timestamp é imutável depois de preenchido. Regressões manuais e novas
passagens pelo mesmo status preservam a primeira ocorrência. Saltos de status
registram somente o evento realmente escolhido: Agendado → Concluído, por
exemplo, preenche apenas `concluido_em`. Cancelamento e falta não fabricam
eventos operacionais intermediários e também não apagam eventos anteriores.

### Alertas operacionais derivados

Atraso é uma informação visual derivada, não um status e não é persistido no
banco. A tolerância operacional inicial é de 10 minutos, centralizada na
aplicação. Depois dela:

- Agendado ou Confirmado, sem recebimento e sem transporte, alerta atraso para
  chegada quando o início previsto já passou;
- Recebido, sem início real, alerta que aguarda o início quando o início
  previsto já passou;
- Em atendimento alerta atraso de execução quando ultrapassa a conclusão
  prevista e pode sinalizar um início real ocorrido depois da tolerância.

Aguardando retirada, Aguardando entrega, Concluído, Cancelado e Faltou não
recebem alerta operacional ativo. TaxiDog não recebe atraso de chegada baseado
no início interno, pois ainda não existem eventos reais de coleta; somente uma
execução já iniciada pode alertar por ultrapassar sua conclusão prevista.

Esses alertas não mudam status, horários, reservas ou o Motor. O relógio local
da interface serve apenas para recalcular a classificação visual; timestamps e
planejamento continuam sendo dados autoritativos do banco.

### Ações rápidas da Agenda

Os cards oferecem um único atalho contextual para o próximo passo operacional
mais comum. Esses atalhos não restringem a seleção manual livre dos sete status
no modal, não fazem atualização otimista e usam a mesma Edge Function oficial,
com `statusEsperado`, concorrência e recarga da Agenda.

Agendado e Confirmado oferecem Receber; Recebido oferece Iniciar atendimento;
Em atendimento oferece Finalizar; e os estados de espera oferecem Concluir. Ao
finalizar, um atendimento sem transporte segue para Aguardando retirada e um
TaxiDog segue para Aguardando entrega. Cancelamento e falta permanecem em seus
fluxos excepcionais com confirmação própria.

## 15. Agenda

A agenda deve mostrar:

- pet;
- tutor;
- tipo de pacote;
- número do banho no ciclo;
- exemplo: 2/4 ou 1/2;
- status do atendimento;
- status do pagamento;
- transporte;
- observações importantes.

## 16. Histórico

Nenhuma movimentação importante deve ser apagada.

Devem ser registrados:

- criação do contrato;
- criação do ciclo;
- renovação;
- pagamento;
- remarcação;
- pulo;
- pausa;
- reativação;
- falta;
- perda ou preservação do crédito;
- inadimplência;
- cancelamento;
- conclusão.

## 17. Tela de inadimplentes

A tela deve mostrar:

- cliente;
- pet;
- contrato;
- valor pendente;
- data do primeiro banho;
- vencimento;
- próximo atendimento removido;
- telefone;
- atalho para WhatsApp;
- registrar pagamento;
- manter bloqueado;
- cancelar contrato.
## Observacoes e ocorrencias do atendimento

As ocorrencias operacionais usam um catalogo fechado (comportamento, pele e pelagem, parasitas e cuidados) e uma observacao livre opcional de ate 1000 caracteres. O registro e editavel de `agendado` ate `aguardando_retirada`/`aguardando_entrega`; atendimentos `concluido`, `cancelado` ou `faltou` sao somente leitura.

A Agenda carrega esses dados somente ao abrir o modal dedicado. O salvamento ocorre por Edge Function autenticada e RPC atomica, com versao especifica e deteccao de edicao concorrente. Observacoes nao alteram status, preco, reservas, horarios nem a versao de ocupacao.

### Conclusao guiada do atendimento

Finalizar encerra a execucao operacional e move o atendimento para Aguardando retirada ou Aguardando entrega. Concluir e o fechamento administrativo posterior, realizado em um fluxo de Observacoes, Pagamento, Retorno e Revisao. Observacoes podem ser registradas durante a execucao no modal independente e revisadas na conclusao.

O valor final permanece historico. Recebimentos positivos e imutaveis podem ser parciais e possuem forma e idempotencia proprias. A situacao e derivada como Pendente, Parcial ou Pago; Isento e um estado explicito, sem recebimento ficticio e incompatível com recebimentos existentes. Saldo nao bloqueia conclusao.

Recomendacoes de retorno sao opcionais e correntes por servico materializado, expressas em dias e calculadas sobre a data operacional. Elas nao criam agendamento, reserva, pacote, lembrete ou mensagem.

## Venda e configuracao de Contratos

- somente Pacotes ativos e com composicao completa podem ser vendidos;
- cliente e pet textual sao revalidados pelo backend;
- versao do Pacote e perfil da simulacao devem permanecer iguais ate o commit;
- precos, regras, perfil, composicao e recorrencias ficam em snapshots;
- valor contratado aceita zero, desconto ou acrescimo; divergencia exige motivo e responsavel autenticado;
- transporte e escolhido no Contrato, sem usar o legado do Pacote;
- existe somente um dia, horario e data ancora por Contrato;
- dependencias coincidem com creditos existentes nas mesmas posicoes e nunca geram quantidades extras;
- configuracao impossivel bloqueia a venda para correcao humana;
- retry e clique duplo reutilizam a chave idempotente;
- vender cria o primeiro Ciclo e suas reservas finitas; a materialização imediatamente subsequente cria os atendimentos oficiais. Se ela falhar, o Contrato permanece identificável e a UI exige retry, sem informar sucesso total;
- materializar não consome crédito e não cria recebimento. Cada ocorrência agrupa seus itens contratados em um único atendimento e dependências operacionais continuam deduplicadas pelo Motor;
- uma ocorrência materializada deixa de ocupar capacidade virtualmente no mesmo commit em que seu atendimento passa a ocupar a Agenda.
## Contrato, Ciclo e renovação

- Quantidades por Ciclo são fechadas; uma quinta ocorrência do mesmo dia em um mês civil não acrescenta Serviço ao Ciclo.
- O mês civil não inicia nem encerra Ciclos.
- Ciclo renovado pode nascer financeiramente pendente e ainda reservar capacidade.
- Inadimplência não cancela Contrato, Ciclo ou reserva automaticamente.
- Sem renovação automática, o encerramento não cria outro Ciclo; renovação manual recalcula preço e disponibilidade atuais sem alterar snapshots anteriores.
- Na renovação automática sem capacidade, criar Ciclo `requer_revisao`, sem escolher alternativa ou reservar. O administrador resolverá o horário pelo Motor.
- Dependências devem coincidir com créditos já contratados e nunca criam quantidade comercial adicional.

## Ciclo de vida autoritativo dos créditos de Contrato

- Cada `contrato_ciclo_ocorrencia_item` representa uma unidade comercial contratada. Atendimento e crédito são conceitos diferentes.
- A materialização reserva o crédito. Estados operacionais intermediários não o consomem; somente a conclusão do atendimento consome os itens comerciais realmente vinculados à ocorrência.
- Dependências operacionais adicionadas pelo Motor não criam nem consomem crédito comercial extra.
- Uma conclusão repetida é idempotente. A atualização do atendimento, dos créditos e da auditoria ocorre na mesma transação autoritativa.
- Reverter conclusão exige usuário interno, motivo e um status operacional semanticamente válido. O status anterior real é sugerido quando estiver registrado; a reversão restaura todos os créditos consumidos pela ocorrência e acrescenta histórico, sem apagar a conclusão anterior.
- Cancelamento correto, cancelamento pelo pet shop e remarcação não consomem nem perdem crédito.
- Em uma falta com múltiplos Serviços, a decisão é individual por crédito. Cada item pode ser perdido ou preservado; uma decisão global nunca é implícita.
- Crédito perdido não é consumido. Crédito preservado permanece disponível no mesmo Ciclo e nenhuma das decisões cria uma nova unidade.
- Uma decisão administrativa pode ser corrigida somente quando seu evento anterior existe; a correção exige motivo e adiciona novo evento.
- Quando todas as ocorrências terminam e ainda há crédito sem destino definitivo, o Ciclo fica com encerramento pendente. Cada saldo é decidido individualmente como perdido ou preservado no mesmo Ciclo.
- Não há transferência automática entre Ciclos. O novo Ciclo possui créditos integralmente independentes.
- Consumo percentual é `consumidos / contratados`; perdidos nunca entram no numerador. Disponibilidade considera créditos reservados e livres, excluindo perdidos e pendências administrativas.
