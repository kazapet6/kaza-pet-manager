import assert from 'node:assert/strict'
import { numeroWhatsAppBrasil, validarTextoManual } from './validacao.ts'

// Testes puros: não chamam a Meta, o banco ou um número real.
assert.equal(numeroWhatsAppBrasil('(31) 99999-9999'), '5531999999999')
assert.equal(numeroWhatsAppBrasil('+55 (31) 99999-9999'), '5531999999999')
assert.equal(numeroWhatsAppBrasil('00123'), null)
assert.equal(numeroWhatsAppBrasil('553100'), null)
assert.equal(validarTextoManual(' Olá! '), 'Olá!')
assert.equal(validarTextoManual(' '), null)
assert.equal(validarTextoManual('x'.repeat(513)), null)
console.log('WhatsApp HML: validadores PASS')
