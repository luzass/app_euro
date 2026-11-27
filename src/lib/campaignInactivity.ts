import { buildCampaignPlanning, planningGroupLabel, type PlanningDimension } from './campaignPlanning.ts'
import type { CampaignData, ForecastConfig } from './campaignData.ts'
import { activeCalouroRows, matriculasForPeriod, registrationsForPeriod } from './campaignData.ts'
import { courseOfferingsForPeriod, matchesCourseOffering, offeringCourseLabel, offeringRow } from './courseOfferings.ts'
import { profileField } from './studentProfile.ts'

export function buildCampaignInactivity(data: CampaignData[], config: ForecastConfig, dimension: PlanningDimension, resolver = planningGroupLabel, offerings = courseOfferingsForPeriod(config.currentPeriod)) {
  if (!offerings) return { model: buildCampaignPlanning(data, config, dimension, 'matriculas', resolver, false), outside: { registrations: 0, enrollments: 0 }, offers: null }
  const current = data.find(source => source.period === config.currentPeriod)
  const registrations = registrationsForPeriod(data, config.currentPeriod), enrollments = matriculasForPeriod(data, config.currentPeriod)
  const validRegistration = (row: typeof registrations[number]) => offerings.some(offer => matchesCourseOffering(row, false, offer))
  const validEnrollment = (row: typeof enrollments[number]) => offerings.some(offer => matchesCourseOffering(row, true, offer))
  const outside = { registrations: registrations.filter(row => !validRegistration(row)).length,
    enrollments: activeCalouroRows(enrollments).filter(row => !validEnrollment(row)).length }
  const scoped = current ? [{ ...current, inscritos: registrations.filter(validRegistration), matriculados: enrollments.filter(validEnrollment) }] : []
  const labelFor: typeof resolver = (row, enrollment, group) => resolver({ ...row, curso: offeringCourseLabel(profileField(row, 'curso')) }, enrollment, group)
  const labels = offerings.map(offer => labelFor(offeringRow(offer), false, dimension))
  return { model: buildCampaignPlanning(scoped, { ...config, references: [] }, dimension, 'matriculas', labelFor, false, { values: labels, restrict: true }), outside, offers: offerings.length }
}
