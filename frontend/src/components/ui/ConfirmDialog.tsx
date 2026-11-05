import React from 'react';
import Sheet from './Sheet.js';
import Mel from '../brand/Mel.js';
import { CircleNotch } from './icons.js';

interface ConfirmDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void | Promise<void>;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly confirmVariant?: 'danger' | 'primary';
  readonly loading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  confirmVariant = 'danger',
  loading = false,
}) => {
  const isDanger = confirmVariant === 'danger';

  const footer = (
    <div className="flex items-center gap-3 w-full">
      <button
        type="button"
        onClick={onClose}
        disabled={loading}
        className="flex-1 min-h-[44px] px-4 py-2.5 rounded-2xl border border-ink/10 bg-card text-ink font-bold text-sm hover:bg-field disabled:opacity-50 transition"
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={loading}
        className={`flex-1 min-h-[44px] px-4 py-2.5 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 transition disabled:opacity-50 active:scale-95 ${
          isDanger
            ? 'bg-danger hover:brightness-110 shadow-sm'
            : 'bg-primary text-on-primary hover:bg-primary-deep'
        }`}
      >
        {loading && <CircleNotch size={18} className="animate-spin" />}
        {confirmLabel}
      </button>
    </div>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      maxWidth="md:max-w-md"
      footer={footer}
    >
      <div className="flex flex-col items-center text-center py-4 space-y-4">
        <Mel mood={isDanger ? 'alert' : 'thinking'} size={96} animated={false} />
        <p className="text-sm text-muted leading-relaxed max-w-sm">
          {description}
        </p>
      </div>
    </Sheet>
  );
};

export default ConfirmDialog;
