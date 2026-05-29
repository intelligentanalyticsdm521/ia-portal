// StellaExpensesComingPage — F-116.
//
// Placeholder for the next-gen Expenses rebuild that lands in STELLA.
// Replaces OLIVER's deprecated Expenses page (deep-link safe — the old
// route /app/services/oliver_expenses also renders this).
import { TrendingUp, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

export function StellaExpensesComingPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
          <TrendingUp className="h-7 w-7 text-slate-500" />
        </div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          STELLA · Coming Soon
        </div>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Expenses</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-slate-600 leading-relaxed">
          We're moving Expenses out of OLIVER and into STELLA where it'll get the
          full treatment: per-job + per-worker tracking, reimbursement workflows,
          budget vs actual reporting, mileage logs, receipt OCR, and category
          breakdowns. The OLIVER version is deprecated and won't get further
          updates.
        </p>
        <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 px-4 py-1.5 text-xs font-semibold text-emerald-800">
          <Sparkles className="h-3.5 w-3.5" />
          Rebuilds during STELLA build sessions
        </div>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            to="/app/services/stella_coming"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            STELLA overview →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default StellaExpensesComingPage;
