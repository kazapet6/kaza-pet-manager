import { useRef, useState } from 'react'
import Button from '../components/ui/Button.tsx'
import type { FormaPagamentoPrevista } from '../confirmacao/contrato.ts'
import { executarDadosConclusao } from './clienteSupabase.ts'

type Props = { atendimentoId: string; forma: FormaPagamentoPrevista | null; versao: number }

export default function EditarFormaPrevista({ atendimentoId, forma, versao }: Props) {
  const [atual, setAtual] = useState({ forma, versao })
  const [escolhida, setEscolhida] = useState<FormaPagamentoPrevista | null>(forma)
  const [ocupado, setOcupado] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const trava = useRef(false)

  async function salvar() {
    if (trava.current || escolhida === atual.forma) return
    trava.current = true
    setOcupado(true)
    setMensagem('')
    try {
      const resposta = await executarDadosConclusao({
        operacao: 'alterar_forma_prevista', atendimentoId,
        versaoEsperada: atual.versao, formaPagamentoPrevista: escolhida,
      })
      if (resposta.status !== 'atualizado' || typeof resposta.versao !== 'number') {
        setMensagem('mensagem' in resposta ? String(resposta.mensagem) : 'Não foi possível salvar a previsão.')
        return
      }
      setAtual({ forma: escolhida, versao: resposta.versao })
      setMensagem('Previsão atualizada.')
    } catch {
      setMensagem('Não foi possível salvar a previsão. Tente novamente.')
    } finally {
      trava.current = false
      setOcupado(false)
    }
  }

  return <section aria-label="Previsão de pagamento">
    <label>Forma de pagamento prevista
      <select value={escolhida ?? ''} disabled={ocupado} onChange={(event) => {
        const valor = event.target.value
        setEscolhida(valor === 'dinheiro' || valor === 'pix' || valor === 'cartao' ? valor : null)
        setMensagem('')
      }}>
        <option value="">Não definida</option>
        <option value="dinheiro">Dinheiro</option>
        <option value="pix">PIX</option>
        <option value="cartao">Cartão</option>
      </select>
    </label>
    <Button variant="secondary" disabled={ocupado || escolhida === atual.forma} onClick={() => void salvar()}>Salvar previsão</Button>
    {mensagem && <p role="status">{mensagem}</p>}
  </section>
}
