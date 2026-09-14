// Execução exclusivamente local. Saída agregada, sem dados de contato ou credenciais.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CAMPOS_CLIENTES, CAMPOS_PETS, lerCSV, mapearEnum, normalizar,
  analisarVinculosDuplicidades } from '../../frontend/src/importacao/csv.ts'

const [clientesPath, petsPath, relatorioPath] = process.argv.slice(2)
if (!clientesPath || !petsPath || !relatorioPath) throw new Error('Informe clientes.csv, pets.csv e destino do relatório de raças.')
if ([resolve(clientesPath), resolve(petsPath)].includes(resolve(relatorioPath))) throw new Error('Destino não pode sobrescrever os arquivos de origem.')
const clientes = lerCSV(readFileSync(clientesPath, 'utf8'), CAMPOS_CLIENTES)
const pets = lerCSV(readFileSync(petsPath, 'utf8'), CAMPOS_PETS)
const resumo = analisarVinculosDuplicidades(clientes, pets)
const grupos = new Map()
for (const { valores: p } of pets) {
  const chave = JSON.stringify([p.especie || '', p.raca || ''])
  grupos.set(chave, (grupos.get(chave) || 0) + 1)
}
const linhas = [['valor_original','especie_original','canonico_sugerido','confianca','acao','quantidade','observacao']]
for (const [chave, quantidade] of grupos) {
  const [especie, raca] = JSON.parse(chave), normal = normalizar(raca)
  let sugestao = raca, confianca = 'revisão obrigatória', acao = 'criar nova raça canônica'
  let observacao = 'Proposta de catálogo, não aprovação nem associação automática.'
  if (!mapearEnum('especie', especie) || !raca) {
    acao = 'requer revisão'; observacao = 'Espécie ou raça ausente; não inferir espécie pela raça.'
  } else if (['srd', 'srd sem raca definida','sem raca definida (srd)'].includes(normal)) {
    sugestao = 'Sem raça definida (SRD)'; confianca = 'alta, confirmar alias'; acao = 'usar SRD existente'
  }
  if (['shih tzu','shihtzu','shitzu'].includes(normal)) {
    sugestao = 'Shih Tzu'; confianca = normal==='shitzu' ? 'média, revisar grafia' : 'alta, confirmar alias'
  }
  if (['bulldog frances','buldogue frances'].includes(normal)) {
    sugestao = 'Buldogue Francês'; confianca = 'alta, confirmar alias'
  }
  if (normal.includes(' com ') || ['pastor de mallinoais','gato','vira lata'].includes(normal)) acao = 'requer revisão'
  linhas.push([raca,especie,sugestao,confianca,acao,quantidade,observacao])
}
const escapar = v => '"'+String(v).replaceAll('"','""')+'"'
writeFileSync(relatorioPath, '\uFEFF'+linhas.map(l=>l.map(escapar).join(';')).join('\r\n')+'\r\n',{flag:'wx'})
const campos = ['especie','genero','tamanho','pelo','comportamento','castrado']
console.log(JSON.stringify({clientes:clientes.length,pets:pets.length,vinculados:resumo.vinculados,
  clientesSemWhatsapp:clientes.filter(c=>!c.valores.telefone).length,
  perfisCompletosMesmoAntesDaRaca:pets.filter(p=>campos.every(f=>mapearEnum(f,p.valores[f]||'')!==null)).length,
  pendenciasPorCampo:Object.fromEntries(campos.map(f=>[f,pets.filter(p=>mapearEnum(f,p.valores[f]||'')===null).length])),
  combinacoesRaca:grupos.size,avisos:resumo.avisos.reduce((a,x)=>(a[x.campo]=(a[x.campo]||0)+1,a),{})},null,2))
