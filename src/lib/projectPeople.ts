/**
 * lib/projectPeople.ts — the people on a consulting project, and who a
 * document goes to. Pure: no React, no API client, so the node test runner can
 * load it and every screen that shows a person shows them the same way.
 *
 * Brandon, 2026-10-01: "default projects to their main contact but also allow
 * me to update it to work with multiple users, or even just deselect their
 * main contact and add another user."
 *
 * Contract (oliver-api routes/consultingPeople.js, build brief 2 Oct 2026):
 *   GET    /consulting/projects/:id/people                 → { people, primary_missing }
 *   POST   /consulting/projects/:id/people                 → { person }
 *   PATCH  /consulting/projects/:id/people/:pid            → { person }
 *   DELETE /consulting/projects/:id/people/:pid            → { ok }
 *   GET    /consulting/projects/:id/people/available?q=    → { contacts, users }
 *   POST   /consulting/projects/:id/people/:pid/invite-as-contact → { person }
 *   GET    /consulting/projects/:id/people/recipients?kind=contractual|deliverable
 *                                                          → { people: [...person, default, can_email] }
 *   POST   /proposals/:id/send                    { recipients } → { …, sent_to }
 *   POST   /consulting/deliverables/:id/send-to-client { recipients }
 *
 * Who a project is WORKED WITH and who a particular document GOES TO are two
 * questions (scope §5): the project's people supply the list and a default,
 * the sender ticks who actually gets it.
 */

export type PersonKind = "contact" | "user";
export type PersonRole = "main" | "approver" | "billing" | "collaborator";
export type RecipientKind = "contractual" | "deliverable";

/** One row of consulting.project_person with the contact / user resolved. */
export interface ProjectPerson {
  project_person_id: string;
  person_kind: PersonKind | string;
  lumen_contact_id?: number | null;
  user_id?: string | null;
  /** lumen.contact.legacy_oliver_uuid when the person is a contact. */
  contact_uuid?: string | null;
  role: PersonRole | string;
  is_primary: boolean | number;
  receives_documents: boolean | number;
  display_name?: string | null;
  email?: string | null;
  company?: string | null;
  created_at?: string | null;
}

export interface PeopleResponse {
  people: ProjectPerson[];
  primary_missing: boolean;
}

export interface AvailableContact {
  lumen_contact_id: number;
  contact_uuid?: string | null;
  display_name?: string | null;
  email?: string | null;
  company?: string | null;
}

export interface AvailableUser {
  user_id: string;
  display_name?: string | null;
  email?: string | null;
}

export interface AvailablePeople {
  contacts: AvailableContact[];
  users: AvailableUser[];
}

/** A person as the send dialog receives them: pre-ticked or not, emailable or not. */
export interface RecipientPerson extends ProjectPerson {
  default: boolean;
  can_email: boolean;
}

/** What a send POSTs, one per ticked person. A person not yet on the project
 *  is sent raw and the API adds them to the project before it emails. */
export type RecipientInput =
  | { project_person_id: string }
  | { person_kind: "contact"; lumen_contact_id: number }
  | { person_kind: "user"; user_id: string };

/** The four roles, in Brandon's words. */
export const ROLE_OPTIONS: ReadonlyArray<{ value: PersonRole; label: string }> = [
  { value: "main", label: "Main contact" },
  { value: "approver", label: "Approver" },
  { value: "billing", label: "Billing" },
  { value: "collaborator", label: "Collaborator" },
];

export function roleLabel(role: string | null | undefined): string {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label ?? "Collaborator";
}

/** SQL BIT arrives as true/false or 1/0 depending on the driver path. */
export function truthy(v: unknown): boolean {
  return v === true || v === 1 || v === "1";
}

function emailLocalPart(email: string | null | undefined): string {
  const e = String(email || "").trim();
  if (!e) return "";
  const at = e.indexOf("@");
  return at > 0 ? e.slice(0, at) : e;
}

/** A person's name: the resolved display name, else the email's local part
 *  (portal users can have no names on file — verified on production). */
export function personLabel(p: { display_name?: string | null; email?: string | null } | null | undefined): string {
  if (!p) return "Unnamed person";
  return String(p.display_name || "").trim() || emailLocalPart(p.email) || "Unnamed person";
}

/** "Karrie Anderson" → { first_name: "Karrie", last_name: "Anderson" }; an
 *  email-only person → the local part as the first name. Prefills the
 *  Invite as contact form. */
export function splitName(p: { display_name?: string | null; email?: string | null }): { first_name: string; last_name: string } {
  const name = String(p.display_name || "").trim();
  if (name && !name.includes("@")) {
    const parts = name.split(/\s+/);
    return { first_name: parts[0] || "", last_name: parts.slice(1).join(" ") };
  }
  return { first_name: emailLocalPart(p.email || name), last_name: "" };
}

/** Keys the send dialog ticks: a project person by id, a not-yet-added contact
 *  or portal user by kind + id. */
export const contactKey = (id: number | string) => `c:${id}`;
export const userKey = (id: string) => `u:${id}`;

/** Pre-ticked: whoever the API marks `default` and can actually be emailed. */
export function defaultTicked(people: RecipientPerson[]): Set<string> {
  return new Set(people.filter((p) => p.default && p.can_email !== false).map((p) => p.project_person_id));
}

/**
 * Someone ticked under "Not on the project yet", kept as their OWN row.
 *
 * Pane test 2 Oct (CPP-T1): the send was built from the search's current
 * result, so ticking Taylor, then searching "sam" and ticking Sam, sent the
 * proposal to Sam alone — Taylor was neither emailed nor added. A tick is a
 * decision about a person, not about what the search box happens to show, so
 * the dialog keeps the ticked person here and builds the send from this list.
 */
export interface PickedPerson {
  key: string;
  person_kind: PersonKind;
  lumen_contact_id?: number | null;
  user_id?: string | null;
  display_name?: string | null;
  email?: string | null;
  company?: string | null;
}

export function pickContact(c: AvailableContact): PickedPerson {
  return {
    key: contactKey(c.lumen_contact_id), person_kind: "contact", lumen_contact_id: Number(c.lumen_contact_id),
    display_name: c.display_name ?? null, email: c.email ?? null, company: c.company ?? null,
  };
}

export function pickUser(u: AvailableUser): PickedPerson {
  return { key: userKey(u.user_id), person_kind: "user", user_id: u.user_id, display_name: u.display_name ?? null, email: u.email ?? null };
}

/** Tick or untick one person; everyone else stays exactly as they were. */
export function togglePicked(picked: PickedPerson[], person: PickedPerson): PickedPerson[] {
  return picked.some((p) => p.key === person.key)
    ? picked.filter((p) => p.key !== person.key)
    : [...picked, person];
}

/** The ticked people the current search does not show. The dialog keeps them
 *  on screen, ticked, so what is sent is always what is seen. */
export function hiddenPicks(picked: PickedPerson[], available: AvailablePeople): PickedPerson[] {
  const shown = new Set([
    ...available.contacts.map((c) => contactKey(c.lumen_contact_id)),
    ...available.users.map((u) => userKey(u.user_id)),
  ]);
  return picked.filter((p) => !shown.has(p.key));
}

/**
 * The `recipients` body for a send, in a stable order: the project's default
 * people first (the first recipient becomes the proposal's contact), then the
 * project's other ticked people, then everyone ticked from "Not on the project
 * yet" (contacts before portal users), whatever the search box now holds.
 */
export function recipientsFrom(
  ticked: Set<string>,
  people: RecipientPerson[],
  picked: PickedPerson[],
): RecipientInput[] {
  const out: RecipientInput[] = [];
  const onProject = people.filter((p) => ticked.has(p.project_person_id));
  for (const p of [...onProject.filter((x) => x.default), ...onProject.filter((x) => !x.default)]) {
    out.push({ project_person_id: p.project_person_id });
  }
  for (const p of picked) {
    if (p.person_kind === "contact" && p.lumen_contact_id != null) out.push({ person_kind: "contact", lumen_contact_id: Number(p.lumen_contact_id) });
  }
  for (const p of picked) {
    if (p.person_kind === "user" && p.user_id) out.push({ person_kind: "user", user_id: p.user_id });
  }
  return out;
}

/**
 * ONE name order for a send, wherever it is shown: by name, ignoring case.
 * That is the order the API reads a recorded send back in
 * (consulting.document_recipient ORDER BY display_name), and so the order of
 * the Proposals row's `last_sent_to`. Pane test 2 Oct (CPP-T5): the message
 * after Send listed the people in tick order and the row listed them by name.
 */
export function byName<T extends { display_name?: string | null; email?: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => personLabel(a).localeCompare(personLabel(b), undefined, { sensitivity: "base" }));
}

/** "A" · "A, B" · "A, B, C" — joined the way the API joins `last_sent_to`,
 *  so the same send reads the same on every screen. */
export function namesList(names: string[]): string {
  return names.filter((x) => String(x || "").trim()).join(", ");
}

/**
 * The date of a send in the Portal's one date format ("Oct 1, 2026"), the
 * format the deliverable's status strip and the rest of the consulting screens
 * print. Pane test 2 Oct (CPP-T5): a Deliverables row said "sent 1 Oct" above
 * a strip that said "sent Oct 1, 2026".
 */
export function documentDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** One recipient row of a recorded send (consulting.document_recipient). */
export interface SentToRow {
  send_id?: string | null;
  display_name?: string | null;
  email?: string | null;
  sent_at?: string | null;
  sent_by_user_id?: string | null;
  email_status?: string | null;
}

/** The most recent press of Send: the rows sharing the newest row's send_id
 *  (the API returns them newest first). */
export function latestSend(rows: SentToRow[] | null | undefined): SentToRow[] {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (!list.length) return [];
  const first = list[0];
  if (first.send_id) return list.filter((r) => r.send_id === first.send_id);
  return list.filter((r) => r.sent_at === first.sent_at);
}

/** "Sent to Karrie Anderson (karrie@…) on Oct 2, 2026" — the builder's header line. */
export function sentToLine(rows: SentToRow[] | null | undefined): string {
  const last = latestSend(rows);
  if (!last.length) return "";
  const who = namesList(byName(last).map((r) => {
    const name = personLabel(r);
    return r.email ? `${name} (${r.email})` : name;
  }));
  const when = documentDate(last[0].sent_at);
  return `Sent to ${who}${when ? ` on ${when}` : ""}`;
}

/** What the builder says after a send with recipients: who it went to, and
 *  anyone whose email did not go (suppressed / failed / not queued). */
export function sentMessage(sentTo: Array<{ display_name?: string | null; email?: string | null; email_status?: string | null }> | null | undefined): string {
  const list = byName(Array.isArray(sentTo) ? sentTo : []);
  if (!list.length) return "";
  const names = namesList(list.map((r) => personLabel(r)));
  const notEmailed = list.filter((r) => r.email_status && !["queued", "duplicate"].includes(String(r.email_status)));
  const tail = notEmailed.length
    ? ` Not emailed: ${notEmailed.map((r) => `${personLabel(r)} (${String(r.email_status).replace(/_/g, " ")})`).join(", ")}.`
    : "";
  return `Sent to ${names}.${tail}`;
}

/** A deliverable as the project's Deliverables tab reads it. `sent_to` is the
 *  latest send's people — rows, or names + date, whichever the API carries. */
export interface DeliverableVisibilityInput {
  status?: string | null;
  sent_at?: string | null;
  client_visible?: boolean | number | null;
  sent_to?:
    | SentToRow[]
    | {
        names?: string | string[] | null;
        display_names?: string | string[] | null;
        sent_at?: string | null;
        /** The latest send's people (oliver-api GET /consulting/projects/:id). */
        recipients?: SentToRow[] | null;
      }
    | string
    | null;
}

/** Mirrors oliver-api lib/consultingDocuments.js isSentDocument for a row that
 *  predates `client_visible`. */
function sentLike(d: DeliverableVisibilityInput): boolean {
  if (d.status === "archived") return false;
  return (d.status || "pending") !== "pending" || d.sent_at != null;
}

/** "Visible to the client · sent Oct 1, 2026 to Karrie Anderson" or
 *  "Not visible to the client yet". The client sees a document once it is SENT. */
export function deliverableVisibility(d: DeliverableVisibilityInput): string {
  const visible = d.client_visible == null ? sentLike(d) : truthy(d.client_visible);
  if (!visible) return "Not visible to the client yet";
  let names = "";
  let when = d.sent_at || null;
  const st = d.sent_to;
  if (Array.isArray(st)) {
    const last = latestSend(st);
    names = namesList(byName(last).map((r) => personLabel(r)));
    when = last[0]?.sent_at || when;
  } else if (typeof st === "string") {
    names = st.trim();
  } else if (st && typeof st === "object") {
    if (Array.isArray(st.recipients) && st.recipients.length) {
      names = namesList(byName(st.recipients).map((r) => personLabel(r)));
    } else {
      const raw = st.names ?? st.display_names ?? "";
      names = Array.isArray(raw) ? namesList(raw) : String(raw || "").trim();
    }
    when = st.sent_at || when;
  }
  const date = documentDate(when);
  if (!date && !names) return "Visible to the client";
  return `Visible to the client · sent${date ? ` ${date}` : ""}${names ? ` to ${names}` : ""}`;
}
