// HML only: diagnósticos administrativos e processamento por botão. Nunca envia WhatsApp.
import { criarHandler } from './handler.ts'
Deno.serve(criarHandler(Deno.env))
