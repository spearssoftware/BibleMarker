interface EntityBadgeProps {
  type: string;
}

const TYPE_CLASSES: Record<string, string> = {
  person: 'bg-scripture-accent/20 text-scripture-accent',
  place: 'bg-scripture-success/20 text-scripture-success',
  event: 'bg-scripture-warning/20 text-scripture-warning',
  topic: 'bg-scripture-info/20 text-scripture-info',
};

export function EntityBadge({ type }: EntityBadgeProps) {
  const classes = TYPE_CLASSES[type] ?? 'bg-scripture-muted/20 text-scripture-muted';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium capitalize ${classes}`}>
      {type}
    </span>
  );
}
