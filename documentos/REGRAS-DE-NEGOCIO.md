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

- o banho conta como utilizado;
- o ciclo avança;
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

O atendimento pode ter os seguintes status:

- Agendado
- Confirmado
- Realizado
- Remarcado
- Pulado
- Falta com crédito perdido
- Falta com crédito preservado
- Cancelado por inadimplência

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