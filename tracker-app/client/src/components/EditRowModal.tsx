import { ActivityForm } from "./ActivityForm";
import type { ActivityInput, ActivityRow } from "../types/tracker";

interface EditRowModalProps {
  row: ActivityRow | null;
  value: ActivityInput;
  isSaving: boolean;
  error: string | null;
  onChange: (value: ActivityInput) => void;
  onClose: () => void;
  onSave: () => void;
}

export function EditRowModal({ row, value, isSaving, error, onChange, onClose, onSave }: EditRowModalProps) {
  if (!row) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal wide-modal" role="dialog" aria-modal="true" aria-labelledby="edit-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">CSV row {row.row_index + 1}</p>
            <h2 id="edit-title">Edit Activity</h2>
          </div>
          <button className="ghost-button" type="button" onClick={onClose} aria-label="Close edit dialog">
            Close
          </button>
        </div>
        <ActivityForm
          title="Activity details"
          submitLabel="Save changes"
          value={value}
          error={error}
          isSaving={isSaving}
          onChange={onChange}
          onSubmit={onSave}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}
