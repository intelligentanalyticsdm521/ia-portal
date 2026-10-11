import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/Ui';
import { useProductAccess } from '../../../hooks/useProductAccess';
import { useBillingViewer } from '../../../hooks/useBillingViewer';
import { offNotice, planPagePath } from '../../../lib/productAccess';
import {
  FORMS_TITLE, NOT_IN_PLAN_SENTENCE, SECTION_TITLE, SWITCH_LABEL, UNKNOWN_PLAN_SENTENCE,
  captureSwitchState, configWithSwitch, configsOf, formsSeen, inquiryRows, receivedLabel,
  submissionsOf, unidentifiedCount,
  type FormConfigRow, type SeenForm, type SubmissionRow,
} from '../../../lib/websiteInquiries';

/**
 * Website → Overview → "Website inquiries" and "Forms" (features audit row 41,
 * 2026-10-11). The inquiries the website took, newest first, with delete; and
 * per form, the "Send this form to my SPARK inbox" switch, shown only when
 * platform-api has decided SPARK is in the plan. All the rules live in
 * lib/websiteInquiries.ts; this file only draws them.
 */

const PAGE_SIZE = 50;

type ArionApiLike = {
  getForms: (siteId: string, page?: number, perPage?: number) => Promise<any>;
  getFormConfigs: (siteId: string) => Promise<any>;
  saveFormConfig: (siteId: string, body: Record<string, unknown>) => Promise<any>;
  deleteFormSubmission: (siteId: string, submissionId: string) => Promise<any>;
};

const muted = '#5A7A8A';
const ink = '#0B1C24';
const btn: React.CSSProperties = {
  padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#fff', color: ink,
  border: '1px solid #CBD5E1', borderRadius: 6, cursor: 'pointer',
};

function errorText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'That did not go through. Nothing was changed. Try again in a minute.';
}

export function WebsiteInquiries({ siteId, arionApi }: { siteId: string; arionApi: ArionApiLike }) {
  const navigate = useNavigate();
  const viewer = useBillingViewer();
  const { payload, ready: planReady } = useProductAccess(siteId);
  const switchState = captureSwitchState(payload);

  const [subs, setSubs] = useState<SubmissionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [configs, setConfigs] = useState<FormConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);

  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);
  const [openMsg, setOpenMsg] = useState<Set<string>>(new Set());

  const [savingForm, setSavingForm] = useState<string | null>(null);
  const [formError, setFormError] = useState<{ id: string; text: string } | null>(null);

  // One load per site (memory convention_data_fetching: no polling).
  useEffect(() => {
    let alive = true;
    setLoading(true); setLoadError(null); setSubs([]); setConfigs([]); setPage(1); setTotal(0);
    (async () => {
      const [s, c] = await Promise.allSettled([
        arionApi.getForms(siteId, 1, PAGE_SIZE),
        arionApi.getFormConfigs(siteId),
      ]);
      if (!alive) return;
      if (s.status === 'fulfilled') {
        setSubs(submissionsOf(s.value));
        setTotal(Number(s.value?.meta?.total ?? submissionsOf(s.value).length) || 0);
      } else {
        setLoadError(errorText(s.reason));
      }
      // No config rows (or an unreadable list) = every form is off, which is
      // also what the inbox rule does with no row.
      setConfigs(c.status === 'fulfilled' ? configsOf(c.value) : []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [siteId, arionApi]);

  const loadMore = useCallback(async () => {
    setMoreBusy(true);
    try {
      const next = page + 1;
      const r = await arionApi.getForms(siteId, next, PAGE_SIZE);
      const more = submissionsOf(r);
      setSubs((prev) => {
        const have = new Set(prev.map((x) => x.submission_id));
        return [...prev, ...more.filter((x) => !have.has(x.submission_id))];
      });
      setPage(next);
    } catch (e) {
      setLoadError(errorText(e));
    } finally {
      setMoreBusy(false);
    }
  }, [arionApi, page, siteId]);

  const rows = useMemo(() => inquiryRows(subs, configs), [subs, configs]);
  const forms = useMemo(() => formsSeen(subs, configs), [subs, configs]);
  const noId = useMemo(() => unidentifiedCount(subs), [subs]);

  async function onDelete(id: string) {
    setDeleting(id); setRowError(null);
    try {
      await arionApi.deleteFormSubmission(siteId, id);
      setSubs((prev) => prev.filter((x) => x.submission_id !== id));
      setTotal((t) => Math.max(0, t - 1));
      setConfirmId(null);
    } catch (e) {
      setRowError({ id, text: errorText(e) });
    } finally {
      setDeleting(null);
    }
  }

  async function onToggle(form: SeenForm) {
    const body = configWithSwitch(form, !form.sendsToSpark);
    setSavingForm(form.formId); setFormError(null);
    try {
      await arionApi.saveFormConfig(siteId, body as unknown as Record<string, unknown>);
      // The saved row is exactly what was sent (the route MERGEs the whole
      // body), so the screen shows it without a second round trip.
      setConfigs((prev) => {
        const saved: FormConfigRow = { ...(form.config || {}), ...body, form_id: form.formId };
        const rest = prev.filter((c) => String(c.form_id) !== form.formId);
        return [saved, ...rest];
      });
    } catch (e) {
      setFormError({ id: form.formId, text: errorText(e) });
    } finally {
      setSavingForm(null);
    }
  }

  const addSpark = offNotice('spark', { kind: 'never' }, viewer);

  return (
    <div data-website-inquiries>
      <Card title={SECTION_TITLE} subtitle={loading ? undefined : `${total} received`}>
        {loading ? (
          <div style={{ padding: 10, color: muted, fontSize: 12 }}>Loading…</div>
        ) : loadError && rows.length === 0 ? (
          <div style={{ padding: 10, color: '#991B1B', fontSize: 12, background: '#FEF2F2', borderRadius: 4 }}>
            We couldn't load your website inquiries. {loadError}
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 10, color: muted, fontSize: 12, background: '#F8FAFC', borderRadius: 4 }}>
            No inquiries yet. When someone fills in a form on your website, it shows up here.
          </div>
        ) : (
          <div>
            <div
              style={{
                display: 'grid', gridTemplateColumns: '1.1fr 1.4fr 1fr 1.1fr 1.1fr 92px', gap: 8,
                fontSize: 10, color: muted, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600,
                padding: '0 0 6px', borderBottom: '1px solid #E5E7EB',
              }}
            >
              <span>Name</span><span>Email</span><span>Phone</span><span>Form</span><span>Received</span><span />
            </div>
            {rows.map((r) => {
              const long = r.message.length > 240;
              const open = openMsg.has(r.id);
              return (
                <div key={r.id} data-inquiry-row={r.id} style={{ padding: '8px 0', borderBottom: '1px solid #f5f5f5', fontSize: 12, color: ink }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.4fr 1fr 1.1fr 1.1fr 92px', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{r.name || '—'}</span>
                    <span style={{ overflowWrap: 'anywhere' }}>{r.email ? <a href={`mailto:${r.email}`} style={{ color: 'var(--arion-sky)' }}>{r.email}</a> : '—'}</span>
                    <span>{r.phone ? <a href={`tel:${r.phone}`} style={{ color: 'var(--arion-sky)' }}>{r.phone}</a> : '—'}</span>
                    <span style={{ color: muted, overflowWrap: 'anywhere' }}>{r.form}</span>
                    <span style={{ color: muted }}>{receivedLabel(r.receivedAt) || '—'}</span>
                    <span style={{ textAlign: 'right' }}>
                      {confirmId === r.id ? null : (
                        <button type="button" style={btn} onClick={() => { setConfirmId(r.id); setRowError(null); }}>
                          Delete
                        </button>
                      )}
                    </span>
                  </div>
                  {r.message && (
                    <div style={{ marginTop: 4, color: muted, fontSize: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                      {long && !open ? `${r.message.slice(0, 240)}…` : r.message}
                      {long && (
                        <button
                          type="button"
                          onClick={() => setOpenMsg((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                          style={{ marginLeft: 6, fontSize: 11, color: 'var(--arion-sky)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        >
                          {open ? 'Show less' : 'Show all'}
                        </button>
                      )}
                    </div>
                  )}
                  {confirmId === r.id && (
                    <div data-inquiry-confirm style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                      <span>Delete this inquiry? It can't be brought back.</span>
                      <button
                        type="button"
                        disabled={deleting === r.id}
                        onClick={() => onDelete(r.id)}
                        style={{ ...btn, background: ink, color: '#fff', border: 'none', opacity: deleting === r.id ? 0.5 : 1 }}
                      >
                        {deleting === r.id ? 'Deleting…' : 'Delete'}
                      </button>
                      <button type="button" style={btn} onClick={() => setConfirmId(null)}>Cancel</button>
                    </div>
                  )}
                  {rowError?.id === r.id && (
                    <div role="alert" style={{ marginTop: 4, fontSize: 11, color: '#991B1B' }}>{rowError.text}</div>
                  )}
                </div>
              );
            })}
            {subs.length < total && (
              <div style={{ marginTop: 10, textAlign: 'center' }}>
                <button type="button" style={btn} disabled={moreBusy} onClick={loadMore}>
                  {moreBusy ? 'Loading…' : `Show more (${total - subs.length} older)`}
                </button>
              </div>
            )}
            {loadError && rows.length > 0 && (
              <div role="alert" style={{ marginTop: 6, fontSize: 11, color: '#991B1B' }}>{loadError}</div>
            )}
          </div>
        )}
      </Card>

      <div style={{ marginTop: 14 }}>
        <Card title={FORMS_TITLE}>
          {loading ? (
            <div style={{ padding: 10, color: muted, fontSize: 12 }}>Loading…</div>
          ) : (
            <div>
              {/* The switch is a send into another product: shown only on a
                  DECIDED "SPARK is in your plan". */}
              {switchState === 'not_in_plan' && (
                <div data-capture-not-in-plan style={{ padding: 10, fontSize: 12, color: ink, background: '#F8FAFC', borderRadius: 4, marginBottom: 10 }}>
                  {NOT_IN_PLAN_SENTENCE}
                  {addSpark.action && (
                    <button
                      type="button"
                      onClick={() => navigate(planPagePath('spark'))}
                      style={{ ...btn, marginLeft: 10 }}
                    >
                      {addSpark.action.label}
                    </button>
                  )}
                  {addSpark.note && <div style={{ marginTop: 4, fontSize: 11, color: muted }}>{addSpark.note}</div>}
                </div>
              )}
              {switchState === 'unknown' && planReady && (
                <div data-capture-unknown style={{ padding: 10, fontSize: 12, color: muted, background: '#F8FAFC', borderRadius: 4, marginBottom: 10 }}>
                  {UNKNOWN_PLAN_SENTENCE}
                </div>
              )}
              {forms.length === 0 ? (
                <div style={{ padding: 10, color: muted, fontSize: 12, background: '#F8FAFC', borderRadius: 4 }}>
                  No forms yet. A form shows up here after its first inquiry.
                </div>
              ) : (
                forms.map((f) => (
                  <div key={f.formId} data-form-row={f.formId} style={{ padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: ink, overflowWrap: 'anywhere' }}>{f.label}</div>
                        <div style={{ fontSize: 11, color: muted }}>
                          {f.count === 1 ? '1 inquiry' : `${f.count} inquiries`}{subs.length < total ? ' in the ones loaded' : ''}
                        </div>
                      </div>
                      {switchState === 'offer' && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: ink, cursor: savingForm === f.formId ? 'wait' : 'pointer', flexShrink: 0 }}>
                          <span>{SWITCH_LABEL}</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={f.sendsToSpark}
                            aria-label={`${SWITCH_LABEL}: ${f.label}`}
                            data-capture-switch={f.formId}
                            disabled={savingForm === f.formId}
                            onClick={() => onToggle(f)}
                            style={{
                              width: 36, height: 20, borderRadius: 10, border: 'none', position: 'relative',
                              background: f.sendsToSpark ? '#1D9E75' : '#CBD5E1', cursor: 'inherit',
                              opacity: savingForm === f.formId ? 0.6 : 1, padding: 0,
                            }}
                          >
                            <span style={{
                              position: 'absolute', top: 2, left: f.sendsToSpark ? 18 : 2, width: 16, height: 16,
                              borderRadius: 8, background: '#fff', transition: 'left 0.15s',
                            }} />
                          </button>
                        </label>
                      )}
                    </div>
                    {formError?.id === f.formId && (
                      <div role="alert" style={{ marginTop: 4, fontSize: 11, color: '#991B1B' }}>{formError.text}</div>
                    )}
                  </div>
                ))
              )}
              {noId > 0 && (
                <div style={{ marginTop: 8, fontSize: 11, color: muted }}>
                  {noId === 1 ? '1 inquiry came' : `${noId} inquiries came`} from a form that doesn't send its name, so it can't be sent to SPARK.
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export default WebsiteInquiries;
