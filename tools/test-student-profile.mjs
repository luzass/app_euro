import assert from 'node:assert/strict'
import { ageBand, buildCepCache, enrollmentAge, medianAge, normalizeCep, profileAddress, schoolType, uniqueProfileRows } from '../src/lib/studentProfile.ts'

assert.equal(enrollmentAge({ data_de_nascimento: '10/11/2000', data_de_matricula: '09/11/2024' }), 23)
assert.equal(enrollmentAge({ data_de_nascimento: '2000-11-10', data_de_matricula: '2024-11-10T03:00:00Z' }), 24)
assert.equal(enrollmentAge({ data_de_nascimento: '31/02/2000', data_de_matricula: '2024-11-10' }), null)
assert.equal(enrollmentAge({ data_de_nascimento: '10/11/2000' }), null)
assert.equal(enrollmentAge({ idade: 0 }), null)
assert.equal(enrollmentAge({ idade: '30' }), null)
assert.equal(enrollmentAge({ idade: '30', idade_matricula: '18' }), 18)
assert.equal(enrollmentAge({ 'IDADE MATRICULA': 24 }), 24)
assert.equal(ageBand(17), 'Até 17 anos')
assert.equal(ageBand(18), '18 a 24 anos')
assert.equal(ageBand(null), '')
assert.equal(medianAge([]), null)
assert.equal(medianAge([36, 18, 26]), 26)
assert.equal(medianAge([25, 18, 26, 44]), 25.5)
assert.equal(normalizeCep('1234-567'), '01234567')
assert.equal(normalizeCep('00000-000'), '')
assert.equal(normalizeCep('123'), '')
assert.equal(schoolType('PÚBLICA'), 'Pública')
assert.equal(schoolType('Particular'), 'Privada')
assert.equal(schoolType('Não informado'), '')

const unique = uniqueProfileRows([
  { period: '2024.1', rows: [{ cpf: '1234567890', curso: 'Anterior', contrato: 'ATIVO' }] },
  { period: '2027.1', rows: [
    { cpf: '01234567890', curso: 'Cancelado', contrato: 'CANCELADO' },
    { cpf: '012.345.678-90', curso: 'Atual', contrato: 'ATIVO' },
    { cpf: '', curso: 'Sem CPF' },
  ] },
])
assert.equal(unique.length, 1)
assert.equal(unique[0].curso, 'Atual')
const cache = buildCepCache([
  { cep: '01234567', bairro: 'Centro', cidade: 'Brasília', estado: 'DF', erro: false },
  { cep: '12345678', bairro: 'Incorreto', erro: true },
])
assert.equal(cache.has('12345678'), false)
assert.deepEqual(profileAddress({ CEP: '1234567' }, cache), { bairro: 'Centro', cidade: 'Brasília', estado: 'DF' })
assert.deepEqual(profileAddress({ CEP: '', cep: '1234567' }, cache), { bairro: 'Centro', cidade: 'Brasília', estado: 'DF' })
assert.equal(profileAddress({ cep: '01234567', bairro_cep: 'Bairro atualizado' }, cache).bairro, 'Bairro atualizado')
assert.deepEqual(profileAddress({ cep: '11111111' }, cache), { bairro: '', cidade: '', estado: '' })
console.log('Perfil: idade histórica, datas inválidas, CPF único, CEP e escola verificados.')
