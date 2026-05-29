// SparkFormBuilderModal — F-104.
//
// User spec 2026-05-28:
//   "Forms: library + metrics, Form Builder as popup modal"
//
// Hosts the shared FormBuilderEditor (extracted from SparkFormBuilderPage)
// inside an IadmModal so opening the visual designer never leaves the
// library page. The editor handles its own save flow; this component just
// wires open/close + notifies the parent when something was saved so the
// library can refresh.
import { IadmModal, IadmButton } from "../IadmModal";
import { FormBuilderEditor } from "../../pages/spark/SparkFormBuilderPage";

interface Props {
  open: boolean;
  onClose: () => void;
  formId: string | null;
  /** Called every time the editor saves so the parent library can refresh. */
  onSaved?: () => void;
}

export function SparkFormBuilderModal({ open, onClose, formId, onSaved }: Props) {
  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="spark"
      eyebrow="SPARK · FORM BUILDER"
      title="Design fields"
      subtitle="Pick a field type from the palette, configure validation on the right, and save. The hosted form URL updates instantly."
      size="report"
      footer={
        <IadmButton variant="ghost" onClick={onClose}>Close</IadmButton>
      }
    >
      <div className="p-5">
        {formId
          ? <FormBuilderEditor formId={formId} onSaved={onSaved} />
          : <div className="text-sm text-slate-500">No form selected.</div>}
      </div>
    </IadmModal>
  );
}

export default SparkFormBuilderModal;
