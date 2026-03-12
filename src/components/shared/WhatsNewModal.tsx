import { Modal } from './Modal';
import { Button } from './Button';

interface WhatsNewModalProps {
  version: string;
  notes: string[];
  onDismiss: () => void;
}

export function WhatsNewModal({ version, notes, onDismiss }: WhatsNewModalProps) {
  return (
    <Modal
      isOpen={true}
      onClose={onDismiss}
      title={`What's New in v${version}`}
      size="sm"
      footer={
        <Button onClick={onDismiss} fullWidth>
          Got it
        </Button>
      }
    >
      <ul className="space-y-2">
        {notes.map((note, i) => (
          <li key={i} className="flex gap-2 text-sm text-scripture-text">
            <span className="text-scripture-accent mt-0.5">•</span>
            <span>{note}</span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
