import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  HomeIcon, RocketLaunchIcon, BugAntIcon,
  ServerStackIcon, ArrowPathIcon, ChartBarIcon,
  ArrowRightOnRectangleIcon, BellIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '../store/authStore';
import { useSocket } from '../hooks/useSocket';
import { useState } from 'react';

const NAV = [
  { to: '/dashboard',   label: 'Dashboard',    Icon: HomeIcon },
  { to: '/deployments', label: 'Deployments',  Icon: RocketLaunchIcon },
  { to: '/incidents',   label: 'Incidents',    Icon: BugAntIcon },
  { to: '/services',    label: 'Services',     Icon: ServerStackIcon },
  { to: '/recovery',    label: 'Recovery',     Icon: ArrowPathIcon },
  { to: '/monitoring',  label: 'Monitoring',   Icon: ChartBarIcon },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);

  useSocket({
    'incident:new': (data) => {
      setNotifications(prev => [
        { id: data.incidentId, msg: `New incident: ${data.rootCause || 'detected'}`, type: 'incident' },
        ...prev.slice(0, 9),
      ]);
    },
    'recovery:update': (data) => {
      setNotifications(prev => [
        { id: data.actionId, msg: `Recovery ${data.status}`, type: 'recovery' },
        ...prev.slice(0, 9),
      ]);
    },
  });

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 bg-gray-900 border-r border-gray-800 flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🤖</span>
            <div>
              <div className="font-bold text-sm text-white leading-tight">DevOps Copilot</div>
              <div className="text-xs text-gray-500">AI-Powered CI/CD</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="px-3 py-4 border-t border-gray-800">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-800 mb-2">
            {user?.avatar
              ? <img src={user.avatar} className="w-7 h-7 rounded-full" alt="avatar" />
              : <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-xs font-bold">
                  {user?.username?.[0]?.toUpperCase() || '?'}
                </div>
            }
            <div className="min-w-0">
              <div className="text-xs font-medium text-white truncate">{user?.username}</div>
              <div className="text-xs text-gray-500 capitalize">{user?.role}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <ArrowRightOnRectangleIcon className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6 flex-shrink-0">
          <div className="text-sm text-gray-400">
            AI DevOps Copilot — Autonomous CI/CD Intelligence
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <button className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">
                <BellIcon className="w-5 h-5" />
                {notifications.length > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </button>
            </div>
            <div className="w-px h-5 bg-gray-800" />
            <div className="text-xs text-gray-500 font-mono">
              {new Date().toLocaleDateString()}
            </div>
          </div>
        </header>

        {/* Page */}
        <main className="flex-1 overflow-y-auto p-6 bg-gray-950">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
