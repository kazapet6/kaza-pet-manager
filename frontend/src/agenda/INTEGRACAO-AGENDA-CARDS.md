# KAZA PET MANAGER — Agenda em Cards

## Escopo

Protótipo de código React/TypeScript para integrar no repositório consolidado. Não publicado e não aplicado na produção.

Arquivos de destino:
- `frontend/src/agenda/AgendaCards.tsx`
- `frontend/src/agenda/AgendaCards.css`

## Integração mínima em GradeAgenda.tsx

1. Importar: `import AgendaCards from './AgendaCards.tsx'`.
2. Adicionar no início da função, sem hooks condicionais:

```tsx
const [visao, setVisao] = useState<'cards' | 'grade'>('cards')
```

3. Exibir controle de alternância junto à toolbar existente, sem perder navegação por data nem botão Novo Agendamento:

```tsx
<div className="agenda-visualizacao-controle" role="group" aria-label="Visualização da Agenda">
  <button type="button" aria-pressed={visao === 'cards'} onClick={() => setVisao('cards')}>Cards</button>
  <button type="button" aria-pressed={visao === 'grade'} onClick={() => setVisao('grade')}>Grade</button>
</div>
```

4. Envolver o trecho atual da timeline em uma condição que mantém o carregamento e o erro inalterados:

```tsx
{estrutura.carregandoAgenda
  ? <p role="status">Carregando funcionários e jornadas…</p>
  : visao === 'cards'
    ? <AgendaCards grade={grade} abrir={abrir} novo={novo} acao={acao} atualizandoId={atualizandoId} />
    : <div className="agenda-timeline-scroll">{/* timeline existente SEM ALTERAÇÕES */}</div>
}
```

5. Atenção: o JSX real em `GradeAgenda.tsx` deve ser alterado cuidadosamente para manter seus fechamentos originais. Não colar o exemplo como substituição literal sem ajustar a árvore.

## Critérios de aprovação

- Funcionários em colunas e horários em linhas verticais, a partir do expediente configurado; nenhum 09:00 hardcoded.
- Um card por atendimento, ordenado pelo horário de início; sobreposição e horário ausente não desaparecem.
- Card abre o detalhe existente; ação rápida conserva a Edge e os bloqueios de status.
- `＋` usa `novo()` com `funcionarioId` e `horario` como sugestão, não como reserva.
- Modal de agendamento, status, pacotes, TaxiDog e conclusão não são modificados.
- Alternância Cards/Grade; visão Grade antiga permanece intacta.
- Verificar build e fluxos de Agenda antes de considerar publicação.

Nota: Os tipos e importações foram baseados na estrutura de arquivos disponível no GitHub. O repositório consolidado do Windows é a fonte de verdade para integração e deve ser conferido antes de aplicar.