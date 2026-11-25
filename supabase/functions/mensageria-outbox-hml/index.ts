import {criarConsumidorSimulado} from './handler.ts'
Deno.serve(criarConsumidorSimulado(Deno.env))
