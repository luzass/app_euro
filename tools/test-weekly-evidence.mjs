import assert from 'node:assert/strict'
import {weeklyReport,diagnosis} from './weekly-fixture.mjs'
import {weeklyEvidenceCatalog,weeklyDiagnosisSchema,weeklyAIInput,resolveWeeklyDiagnosis,validateWeeklyDiagnosis} from '../supabase/functions/_shared/weeklyIntelligence.ts'
const snapshot=weeklyReport().snapshot
snapshot.facts=Array.from({length:372},(_,index)=>({key:`academico/2027.1/BACHARELADO EM INTELIGÊNCIA ARTIFICIAL|Águas Claras/métrica ${index}/total`,label:`Indicador ${index}`,value:index%25===0 ? null : index,unit:'pessoas',scope:'2027.1 · recorte sintético'}))
const catalog=weeklyEvidenceCatalog(snapshot), schema=weeklyDiagnosisSchema(snapshot)
assert.equal(catalog.length,357)
assert.equal(schema.$defs.factReference.enum.length,357)
assert.equal(schema.$defs.factReference.enum[0],'F0002')
assert.ok(schema.$defs.factReference.enum.join('').length<15000)
assert.equal(schema.properties.findings.items.properties.evidence.items.$ref,'#/$defs/factReference')
assert.equal(schema.properties.suggestions.items.properties.metric_key.$ref,'#/$defs/factReference')
assert.equal(schema.properties.findings.items.properties.detail.maxLength,3000)
const wire=diagnosis()
wire.findings[0].evidence=[catalog[0].id,catalog.at(-1).id]
wire.suggestions[0].evidence=[catalog[0].id]
wire.suggestions[0].metric_key=catalog[0].id
const original=JSON.stringify(wire), report=resolveWeeklyDiagnosis(wire,snapshot)
assert.deepEqual(report.findings[0].evidence,[catalog[0].key,catalog.at(-1).key])
assert.equal(report.suggestions[0].metric_key,catalog[0].key)
assert.equal(JSON.stringify(wire),original,'Decoding cannot mutate model output')
assert.equal(validateWeeklyDiagnosis(report,snapshot),report)
for(const invalid of ['F0001','F9999',catalog[0].key,'Indicador 1']){
 const bad=structuredClone(wire);bad.findings[0].evidence=[invalid]
 assert.throws(()=>resolveWeeklyDiagnosis(bad,snapshot),/achado 1.*referência/)
}
const empty=structuredClone(wire);empty.findings[0].evidence=[]
assert.throws(()=>resolveWeeklyDiagnosis(empty,snapshot),/uma a dez/)
const long=structuredClone(wire);long.findings[0].detail='x'.repeat(3001)
assert.throws(()=>resolveWeeklyDiagnosis(long,snapshot),/texto.*limite/)
const payload=weeklyAIInput(snapshot,[],false)
assert.equal(payload.facts[0].evidence_id,null)
assert.equal(payload.facts[1].evidence_id,'F0002')
assert.equal(payload.facts[1].key,catalog[0].key)
assert.equal(payload.notes.length,0)
console.log('PASS: 372-fact regression, 357 numeric references, compact single enum, bounded fields, exact decoding to preserved keys, missing/unknown/null evidence rejection and no weakening of evidence checks.')
