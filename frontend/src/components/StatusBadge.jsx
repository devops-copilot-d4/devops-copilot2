export default function StatusBadge({ status }) {
  const map = {
    success:         'badge-success',
    running:         'badge-running',
    failed:          'badge-failed',
    queued:          'badge-pending',
    building:        'badge-pending',
    pending:         'badge-pending',
    deploying:       'badge-running',
    rolled_back:     'badge-medium',
    open:            'badge-failed',
    resolved:        'badge-success',
    recovering:      'badge-medium',
    diagnosing:      'badge-medium',
    met:             'badge-success',
    violated:        'badge-failed',
    unknown:         'badge-pending',
    healthy:         'badge-success',
    unreachable:     'badge-failed',
    degraded:        'badge-high',
  };
  return (
    <span className={map[status] || 'badge-pending'}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
}
