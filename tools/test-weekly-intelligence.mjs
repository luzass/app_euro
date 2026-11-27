import assert from 'node:assert/strict'
import { buildWeeklySnapshot, redactWeeklyText, validateWeeklyDiagnosis, weeklyAIInput, weeklyMonday } from '../supabase/functions/_shared/weeklyIntelligence.ts'
import { canAccessWeekly } from '../supabase/functions/_shared/weeklyAccess.ts'
import { weeklySource,weeklyReport,diagnosis } from './weekly-fixture.mjs'
import { canAccessPath } from '../src/lib/navigation.ts'
const source=weeklySource(), original=JSON.stringify(source), snapshot=buildWeeklySnapshot(source,'2026-11-25')
assert.equal(canAccessWeekly('LucasCTDEBritto@gmail.com'),true)
assert.equal(canAccessWeekly('diego.eger@unieuro.edu.br'),false)
assert.equal(canAccessPath('/app/inteligencia-semanal','admin','lucasctdebritto@gmail.com'),true)
assert.equal(canAccessPath('/app/inteligencia-semanal','admin','outro@example.test'),false)
assert.equal(canAccessPath('/app/inteligencia-semanal','captacao_gerente','diego.eger@unieuro.edu.br'),false)
const value=key=>snapshot.facts.find(fact=>fact.key===key)?.value
assert.equal(value('academico/2027.1/geral/inscritos/total'),2)
assert.equal(value('academico/2027.1/geral/calouros/total'),1)
assert.equal(value('academico/2024.1/geral/calouros/total'),1)
assert.equal(value('academico/2027.1/geral/inscritos/7d'),1)
assert.equal(value('academico/2027.1/geral/inscritos/medicina'),1)
assert.equal(value('academico/2027.1/CIENCIAS CONTABEIS|Asa Sul/calouros/total'),0)
assert.equal(value('crm/contatos'),2)
assert.equal(value('crm/atendimentos_7d'),2)
assert.equal(value('crm/sem_responsavel'),1)
assert.equal(value('documentos/media_horas'),24)
assert.equal(new Set(snapshot.facts.map(fact=>fact.key)).size,snapshot.facts.length)
const input=weeklyAIInput(snapshot,[],true), text=JSON.stringify(input)
for(const pii of ['Ana Teste','Lucas Britto','ana@example.test','123.456.789','99999-8888',source.members[0].id])assert.equal(text.includes(pii),false,pii)
assert.equal('members' in input,false)
assert.equal(weeklyAIInput(snapshot,[],false).notes.length,0)
assert.equal(redactWeeklyText('Ana confirmou, mas banana nao e nome.',['Ana']),'[pessoa] confirmou, mas banana nao e nome.')
assert.ok(redactWeeklyText('CPF 123.456.789-01; email x@y.test; https://a.test',''.split(',')).includes('[email]'))
assert.equal(weeklyMonday('2026-11-26'),'2026-11-23')
assert.equal(validateWeeklyDiagnosis(diagnosis(),snapshot).suggestions.length,1)
const invalid=diagnosis();invalid.findings[0].evidence=['inventado']
assert.throws(()=>validateWeeklyDiagnosis(invalid,snapshot),/evidência/)
const tooMany=diagnosis();tooMany.suggestions=Array.from({length:6},()=>tooMany.suggestions[0])
assert.throws(()=>validateWeeklyDiagnosis(tooMany,snapshot))
const missing=weeklySource();missing.campaigns[0].matriculadosError='missing'
assert.equal(buildWeeklySnapshot(missing,'2026-11-25').facts.find(fact=>fact.key==='academico/2024.1/geral/calouros/total').value,null)
const future=weeklySource();future.campaigns.at(-1).inscritos.push({...future.campaigns.at(-1).inscritos[0],cpf:'55555555555',data_inscricao:'26/11/2026'})
assert.equal(buildWeeklySnapshot(future,'2026-11-25').facts.find(fact=>fact.key==='academico/2027.1/geral/inscritos/total').value,2)
assert.equal(JSON.stringify(source),original)
assert.equal(weeklyReport().snapshot.cutoff,'2026-11-25')
console.log('PASS: exclusive access, preserved snapshots, historical same-date comparisons, active calouros, zero offers, CRM scope, manual-log caveats, privacy redaction, opt-in notes and grounded AI outputs.')
