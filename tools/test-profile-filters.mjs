import assert from 'node:assert/strict'
import { matchesFilter, toggleFilterOption } from '../src/lib/profileFilters.ts'

const courses = ['Direito', 'Medicina', 'Psicologia']
assert.equal(matchesFilter(null, 'Medicina'), true)
assert.equal(matchesFilter([], 'Medicina'), false)
assert.equal(matchesFilter(['Direito', 'Psicologia'], 'Medicina'), false)
assert.equal(matchesFilter(['Direito', 'Psicologia'], 'Psicologia'), true)
assert.deepEqual(toggleFilterOption(null, 'Medicina', courses), ['Direito', 'Psicologia'])
assert.equal(toggleFilterOption(['Direito', 'Psicologia'], 'Medicina', courses), null)
assert.deepEqual(toggleFilterOption(['Direito'], 'Direito', courses), [])
assert.deepEqual(toggleFilterOption([], 'Psicologia', courses), ['Psicologia'])
assert.deepEqual(toggleFilterOption(null, '2024.1', ['2024.1']), [])
console.log('Filtros: todos, nenhum, exclusão e múltipla seleção verificados.')
