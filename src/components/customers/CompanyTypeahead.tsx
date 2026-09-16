// CompanyTypeahead — "New contact"'s Company field.
//
// Spec: overnight-report/CUSTOMER_MODEL_MULTISITE_2026-09-15.md §7 point 1 —
// '"+ New contact" stays a contact form; its Company field SEARCHES EXISTING
// COMPANIES with "Add as new company" when nothing matches'. The NewContact
// artboard draws it: the matches, then the add row, then one line of help.
//
// WHY IT REPLACES A FREE-TEXT BOX. The old field was a plain input whose value
// went to the contact's `company` string, and the server guessed the company
// from the EMAIL DOMAIN first. So typing "Hope Haven Thrift" for someone on
// @hopeiowa.org filed them under Hope Ministries, silently, with the form
// looking answered — and the only way to notice was to open the Companies page
// and count. Picking from the list sends an `account_id`, which the server now
// prefers over the guess.
//
// Leaving it EMPTY is a real answer and still runs the guess: a person with no
// company is the B2C case §7 handles by degeneracy, and the domain match is how
// an imported list of colleagues lands on one company without anybody typing.
import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, Plus, Search } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";

export interface CompanyChoice {
  /** An existing company. */
  accountId: number | null;
  /** What the user typed, or the chosen company's name. */
  name: string;
  /** The user asked for a company that does not exist yet. */
  createNew: boolean;
}

export const NO_COMPANY: CompanyChoice = { accountId: null, name: "", createNew: false };

interface AccountRow {
  id: number;
  name: string;
  domain: string | null;
  contact_count: number;
}

export interface CompanyTypeaheadProps {
  value: CompanyChoice;
  onChange: (next: CompanyChoice) => void;
  /** Rendered under the field. Defaults to the artboard's sentence. */
  help?: React.ReactNode;
  inputTestId?: string;
}

export function CompanyTypeahead({ value, onChange, help, inputTestId }: CompanyTypeaheadProps) {
  const { get, ready } = useSparkApi();
  const [typed, setTyped] = useState(value.name);
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<AccountRow[]>([]);
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);

  useEffect(() => { setTyped(value.name); }, [value.name]);

  useEffect(() => {
    if (!ready) return;
    const q = typed.trim();
    if (q.length < 2) { setMatches([]); return; }
    const mine = ++seq.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const r = await get<{ data: AccountRow[] }>(`/api/v1/lumen-accounts?search=${encodeURIComponent(q)}`);
        if (mine !== seq.current) return;
        setMatches((r.data || []).slice(0, 6));
      } catch {
        if (mine === seq.current) setMatches([]);
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [typed, get, ready]);

  const exact = matches.some((m) => m.name.trim().toLowerCase() === typed.trim().toLowerCase());

  const choose = useCallback((row: AccountRow) => {
    onChange({ accountId: row.id, name: row.name, createNew: false });
    setOpen(false);
  }, [onChange]);

  const createNew = useCallback(() => {
    onChange({ accountId: null, name: typed.trim(), createNew: true });
    setOpen(false);
  }, [onChange, typed]);

  return (
    <div className="spark-field" style={{ position: "relative" }}>
      <label className="spark-field-label">Company</label>
      <div className="spark-field-input" style={{ display: "flex", alignItems: "center", gap: 8, padding: 0 }}>
        <Search className="h-3.5 w-3.5 text-slate-400" style={{ marginLeft: 10, flexShrink: 0 }} />
        <input
          data-testid={inputTestId}
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
            setOpen(true);
            // Typing past a chosen company un-chooses it: the id and the text
            // must never disagree, or the form saves the company the user
            // stopped looking at.
            if (value.accountId !== null || value.createNew) {
              onChange({ accountId: null, name: e.target.value, createNew: false });
            } else {
              onChange({ accountId: null, name: e.target.value, createNew: false });
            }
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          placeholder="Search your companies, or type a new one"
          style={{ border: "none", outline: "none", flex: 1, padding: "8px 10px 8px 0", fontSize: 13, background: "transparent" }}
        />
        {value.accountId !== null && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[#0C4A60] bg-[#E8F4FB] rounded px-1.5 py-0.5 mr-2">
            linked
          </span>
        )}
        {value.createNew && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[#9A4318] bg-[#FFF3E9] rounded px-1.5 py-0.5 mr-2">
            new
          </span>
        )}
      </div>

      {open && typed.trim().length >= 2 && (
        <div
          className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
          style={{ top: "100%" }}
        >
          {matches.map((m) => (
            <button
              key={m.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(m)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] hover:bg-slate-50"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Building2 className="h-3.5 w-3.5 flex-shrink-0 text-[#0C4A60]" />
                <span className="truncate">
                  <strong>{m.name}</strong>
                  <span className="text-slate-500"> · {m.domain || "no domain"}</span>
                </span>
              </span>
              <span className="whitespace-nowrap text-[11px] text-slate-500">
                {m.contact_count === 1 ? "1 person" : `${m.contact_count} people`}
              </span>
            </button>
          ))}
          {searching && matches.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-500">Searching…</div>
          )}
          {!exact && (
            <button
              type="button"
              data-testid="company-add-new"
              onMouseDown={(e) => e.preventDefault()}
              onClick={createNew}
              className="flex w-full items-center justify-between gap-3 border-t border-slate-200 px-3 py-2 text-left text-[13px] font-semibold text-[#0C4A60] hover:bg-slate-50"
            >
              <span className="flex items-center gap-2"><Plus className="h-3.5 w-3.5" /> Add “{typed.trim()}” as a new company</span>
              <span className="whitespace-nowrap text-[11px] font-medium text-slate-500">creates the company and links this person</span>
            </button>
          )}
          <div className="border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500">
            Leave empty for a person with no company. When you leave the field blank, the email domain picks the company if one matches.
          </div>
        </div>
      )}

      {help !== undefined ? help : (
        <p className="mt-0.5 text-[11px] text-slate-500">
          Search an existing company, or add a new one. Leave it blank and the email domain picks one if it matches.
        </p>
      )}
    </div>
  );
}

/**
 * Turn the field's answer into the company this contact belongs to, creating
 * it first when the user asked for one that does not exist.
 *
 * Here rather than in the component because BOTH the SPARK contact form and
 * the OLIVER "new customer" path need it, and a create-then-link written twice
 * is two places for the link half to be forgotten.
 *
 * @returns the account id to send with the contact, or null for "no company".
 */
export async function resolveCompanyChoice(
  choice: CompanyChoice,
  post: <T>(path: string, body?: unknown) => Promise<T>,
): Promise<number | null> {
  if (choice.accountId !== null) return choice.accountId;
  if (!choice.createNew || !choice.name.trim()) return null;
  const created = await post<{ data?: { id?: number } }>("/api/v1/lumen-accounts", { name: choice.name.trim() });
  const id = created?.data?.id;
  // A create that came back without an id has NOT linked anybody. Saying so
  // beats returning null, which would file the contact with no company and
  // look like it worked.
  if (!id) throw new Error(`Could not create the company “${choice.name.trim()}”.`);
  return id;
}

export default CompanyTypeahead;
