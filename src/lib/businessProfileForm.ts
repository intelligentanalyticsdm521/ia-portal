/**
 * businessProfileForm.ts — the pure half of the "Your business" page.
 *
 * The page itself is inputs and layout. Everything that could be WRONG —
 * what counts as an edit, how a comma-separated list becomes an array, how an
 * empty field is distinguished from an untouched one — lives here, where it is
 * testable without a browser.
 *
 * THE RULE THIS FILE ENFORCES: SEND ONLY WHAT CHANGED.
 *
 * Not politeness — correctness. The save is a partial PUT, and every field it
 * carries earns a line in the business's change history. Posting the whole form
 * on every save would write "industry: Roofing -> Roofing" into the history
 * forever and make the History drawer useless the day it shipped. It would also
 * mean a field the page failed to load could be sent back as empty and wipe a
 * good answer — the 2026-06-17 lesson, exactly.
 */

import type { BusinessProfileFields } from './platformApi';

/** The form's own shape: strings, because that is what inputs hold. */
export interface BusinessProfileDraft {
  industry: string;
  description: string;
  tagline: string;
  targetAudience: string;
  brandVoice: string;
  /** One service name per line, plus the catalogue picks tracked separately. */
  servicesText: string;
  selectedOfferingIds: string[];
  servicesSummary: string;
  serviceAreaKind: 'radius' | 'list';
  serviceAreaPostalCode: string;
  serviceAreaMiles: string;
  serviceAreaStates: string;
  serviceAreaCities: string;
  serviceAreaZips: string;
  serviceAreaNote: string;
  capacityJobsPerDay: string;
  capacityCrewCount: string;
  capacityLeadTimeDays: string;
  capacityBookedThrough: string;
  capacityNote: string;
  idealJob: string;
  idealCustomer: string;
  differentiators: string;
  noGoList: string;
  doNotSay: string;
  rulesPlainText: string;
  responsePromiseMinutes: string;
  responsePromiseText: string;
  escalationName: string;
  escalationPhone: string;
  escalationEmail: string;
  escalationWhen: string;
  languages: string;
}

export const EMPTY_DRAFT: BusinessProfileDraft = {
  industry: '', description: '', tagline: '', targetAudience: '', brandVoice: '',
  servicesText: '', selectedOfferingIds: [], servicesSummary: '',
  serviceAreaKind: 'list', serviceAreaPostalCode: '', serviceAreaMiles: '',
  serviceAreaStates: '', serviceAreaCities: '', serviceAreaZips: '', serviceAreaNote: '',
  capacityJobsPerDay: '', capacityCrewCount: '', capacityLeadTimeDays: '',
  capacityBookedThrough: '', capacityNote: '',
  idealJob: '', idealCustomer: '', differentiators: '', noGoList: '', doNotSay: '',
  rulesPlainText: '', responsePromiseMinutes: '', responsePromiseText: '',
  escalationName: '', escalationPhone: '', escalationEmail: '', escalationWhen: '',
  languages: '',
};

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const list = (v: string[] | undefined | null): string => (Array.isArray(v) ? v.join(', ') : '');
const parseList = (v: string): string[] =>
  v.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);

/** Server shape -> form shape. */
export function toDraft(profile: BusinessProfileFields | null): BusinessProfileDraft {
  if (!profile) return { ...EMPTY_DRAFT };
  const area = profile.serviceArea || {};
  const cap = profile.capacity || {};
  const esc = profile.escalation || {};
  const services = profile.services || [];
  return {
    industry: str(profile.industry),
    description: str(profile.description),
    tagline: str(profile.tagline),
    targetAudience: str(profile.targetAudience),
    brandVoice: str(profile.brandVoice),
    // Catalogue-linked services are the picker's business; anything without an
    // offering_id is something they typed, and stays typed.
    servicesText: services.filter((s) => !s.offering_id).map((s) => s.name).join('\n'),
    selectedOfferingIds: services.filter((s) => !!s.offering_id).map((s) => String(s.offering_id)),
    servicesSummary: str(profile.servicesSummary),
    serviceAreaKind: area.kind === 'radius' ? 'radius' : 'list',
    serviceAreaPostalCode: str(area.center_postal_code),
    serviceAreaMiles: area.miles === undefined || area.miles === null ? '' : String(area.miles),
    serviceAreaStates: list(area.states),
    serviceAreaCities: list(area.cities),
    serviceAreaZips: list(area.zip_prefixes),
    serviceAreaNote: str(area.note),
    capacityJobsPerDay: str(cap.jobs_per_day),
    capacityCrewCount: str(cap.crew_count),
    capacityLeadTimeDays: str(cap.lead_time_days),
    capacityBookedThrough: str(cap.booked_through).slice(0, 10),
    capacityNote: str(profile.capacityNote),
    idealJob: str(profile.idealJob),
    idealCustomer: str(profile.idealCustomer),
    differentiators: str(profile.differentiators),
    noGoList: str(profile.noGoList),
    doNotSay: str(profile.doNotSay),
    rulesPlainText: str(profile.rulesPlainText),
    responsePromiseMinutes: str(profile.responsePromiseMinutes),
    responsePromiseText: str(profile.responsePromiseText),
    escalationName: str(esc.name),
    escalationPhone: str(esc.phone),
    escalationEmail: str(esc.email),
    escalationWhen: str(esc.when),
    languages: list(profile.languages),
  };
}

/** Catalogue rows the picker offers, so a pick can carry its offering_id. */
export interface CatalogueOption { offeringId: string; name: string }

/**
 * Form shape -> the values the server would store. Structured fields collapse
 * to null when the whole group is blank, so "I cleared it" and "I never filled
 * it in" are the same thing to the server — which is what an owner means.
 */
export function toFields(draft: BusinessProfileDraft, catalogue: CatalogueOption[] = []): BusinessProfileFields {
  const picked = draft.selectedOfferingIds
    .map((id) => catalogue.find((c) => c.offeringId === id))
    .filter((c): c is CatalogueOption => !!c)
    .map((c) => ({ name: c.name, offering_id: c.offeringId }));
  const typed = parseList(draft.servicesText).map((name) => ({ name }));
  const services = [...picked, ...typed];

  const area: NonNullable<BusinessProfileFields['serviceArea']> = { kind: draft.serviceAreaKind };
  if (draft.serviceAreaKind === 'radius') {
    if (draft.serviceAreaPostalCode.trim()) area.center_postal_code = draft.serviceAreaPostalCode.trim();
    if (draft.serviceAreaMiles.trim()) area.miles = Number(draft.serviceAreaMiles);
  } else {
    if (parseList(draft.serviceAreaStates).length) area.states = parseList(draft.serviceAreaStates);
    if (parseList(draft.serviceAreaCities).length) area.cities = parseList(draft.serviceAreaCities);
    if (parseList(draft.serviceAreaZips).length) area.zip_prefixes = parseList(draft.serviceAreaZips);
  }
  if (draft.serviceAreaNote.trim()) area.note = draft.serviceAreaNote.trim();
  const areaIsEmpty = Object.keys(area).length <= 1; // only `kind`

  const capacity: NonNullable<BusinessProfileFields['capacity']> = {};
  if (draft.capacityJobsPerDay.trim()) capacity.jobs_per_day = Number(draft.capacityJobsPerDay);
  if (draft.capacityCrewCount.trim()) capacity.crew_count = Number(draft.capacityCrewCount);
  if (draft.capacityLeadTimeDays.trim()) capacity.lead_time_days = Number(draft.capacityLeadTimeDays);
  if (draft.capacityBookedThrough.trim()) capacity.booked_through = draft.capacityBookedThrough.trim();

  const escalation: NonNullable<BusinessProfileFields['escalation']> = {};
  if (draft.escalationName.trim()) escalation.name = draft.escalationName.trim();
  if (draft.escalationPhone.trim()) escalation.phone = draft.escalationPhone.trim();
  if (draft.escalationEmail.trim()) escalation.email = draft.escalationEmail.trim();
  if (draft.escalationWhen.trim()) escalation.when = draft.escalationWhen.trim();

  const text = (v: string): string | null => (v.trim() ? v.trim() : null);

  return {
    industry: text(draft.industry),
    description: text(draft.description),
    tagline: text(draft.tagline),
    targetAudience: text(draft.targetAudience),
    brandVoice: text(draft.brandVoice),
    services: services.length ? services : null,
    servicesSummary: text(draft.servicesSummary),
    serviceArea: areaIsEmpty ? null : area,
    capacity: Object.keys(capacity).length ? capacity : null,
    capacityNote: text(draft.capacityNote),
    idealJob: text(draft.idealJob),
    idealCustomer: text(draft.idealCustomer),
    differentiators: text(draft.differentiators),
    noGoList: text(draft.noGoList),
    doNotSay: text(draft.doNotSay),
    rulesPlainText: text(draft.rulesPlainText),
    responsePromiseMinutes: draft.responsePromiseMinutes.trim() ? Number(draft.responsePromiseMinutes) : null,
    responsePromiseText: text(draft.responsePromiseText),
    escalation: Object.keys(escalation).length ? escalation : null,
    languages: parseList(draft.languages).length ? parseList(draft.languages) : null,
  };
}

const stable = (v: unknown): string => {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
  }
  return String(v);
};

/**
 * Only the fields whose value actually differs. An empty object means there is
 * nothing to save, and the page must not offer a Save that would do nothing.
 *
 * `loaded` is what the server LAST TOLD US, prefill included — so confirming a
 * prefilled value by leaving it alone and pressing Save sends nothing, while
 * changing one word sends that one field. That is deliberate: prefill is a
 * suggestion until the owner edits something, and a page that silently wrote
 * every suggestion the first time it loaded would be putting words in their
 * mouth.
 */
export function changedFields(
  loaded: BusinessProfileFields,
  draft: BusinessProfileDraft,
  catalogue: CatalogueOption[] = [],
): Partial<BusinessProfileFields> {
  const next = toFields(draft, catalogue);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(next) as Array<keyof BusinessProfileFields>) {
    if (stable(next[key]) !== stable(loaded[key])) out[key] = next[key];
  }
  return out as Partial<BusinessProfileFields>;
}

/**
 * "Confirm everything we filled in" — the payload for the button that accepts
 * the whole prefilled draft at once. Distinct from changedFields on purpose:
 * this one sends the prefilled values even though they match what was loaded,
 * because the owner has just said "yes, that is right" and an unconfirmed
 * suggestion and a confirmed answer are not the same thing.
 */
export function confirmPrefillPayload(
  loaded: BusinessProfileFields,
  prefilledFields: string[],
): Partial<BusinessProfileFields> {
  const out: Record<string, unknown> = {};
  for (const f of prefilledFields) {
    const key = f as keyof BusinessProfileFields;
    if (key in loaded && loaded[key] !== null && loaded[key] !== undefined) out[f] = loaded[key];
  }
  return out as Partial<BusinessProfileFields>;
}

/** Field name -> the plain words the History drawer shows. */
export const FIELD_LABELS: Record<string, string> = {
  industry: 'What you do',
  description: 'About the business',
  tagline: 'Tagline',
  targetAudience: 'Who you serve',
  brandVoice: 'How you talk to customers',
  services: 'What you sell',
  servicesSummary: 'What you sell, in a sentence',
  serviceArea: 'Where you work',
  capacity: 'How much you can take on',
  capacityNote: 'Capacity, in your own words',
  idealJob: 'Your ideal job',
  idealCustomer: 'Your ideal customer',
  differentiators: 'Why customers pick you',
  noGoList: "Work you won't take",
  doNotSay: 'Things never to say',
  rulesPlainText: 'Your rules',
  responsePromiseMinutes: 'How fast you answer',
  responsePromiseText: 'Your response promise',
  escalation: 'Who to call when something is wrong',
  languages: 'Languages you serve',
};

/** A change's value, rendered for a human rather than as JSON soup. */
export function describeValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'nothing';
  if (Array.isArray(v)) {
    if (!v.length) return 'nothing';
    return v
      .map((x) => (x && typeof x === 'object' ? String((x as { name?: string }).name ?? JSON.stringify(x)) : String(x)))
      .join(', ');
  }
  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>).filter(([, val]) =>
      val !== null && val !== undefined && val !== '' && !(Array.isArray(val) && !val.length));
    if (!entries.length) return 'nothing';
    return entries.map(([k, val]) => `${k.replace(/_/g, ' ')}: ${Array.isArray(val) ? val.join('/') : String(val)}`).join('; ');
  }
  return String(v);
}
