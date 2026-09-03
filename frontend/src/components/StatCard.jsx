export default function StatCard({ label, value, sub, color = 'blue', icon: Icon }) {
  const colors = {
    blue:   'text-blue-400   bg-blue-900/20   border-blue-800',
    green:  'text-green-400  bg-green-900/20  border-green-800',
    red:    'text-red-400    bg-red-900/20    border-red-800',
    yellow: 'text-yellow-400 bg-yellow-900/20 border-yellow-800',
    purple: 'text-purple-400 bg-purple-900/20 border-purple-800',
  };

  return (
    <div className={`card flex items-start gap-4 border ${colors[color]}`}>
      {Icon && (
        <div className={`p-2 rounded-lg ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      )}
      <div>
        <div className="text-2xl font-bold text-white">{value ?? '—'}</div>
        <div className="text-sm font-medium text-gray-300">{label}</div>
        {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}
