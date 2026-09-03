export default function RiskBadge({ level }) {
  const map = {
    low:      'badge-low',
    medium:   'badge-medium',
    high:     'badge-high',
    critical: 'badge-critical',
  };
  return <span className={map[level] || 'badge-pending'}>{level}</span>;
}
