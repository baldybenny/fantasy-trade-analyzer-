import { NavLink, Outlet } from 'react-router';
import { useNewsStats } from '../hooks/use-news.js';

const navItems = [
  { to: '/', label: 'Dashboard', icon: '◈' },
  { to: '/trade', label: 'Trade Analyzer', icon: '⇄' },
  { to: '/rosters', label: 'Rosters', icon: '☰' },
  { to: '/standings', label: 'Standings', icon: '▤' },
  { to: '/keepers', label: 'Keepers', icon: '★' },
  { to: '/news', label: 'News', icon: '◉' },
  { to: '/import', label: 'Data Import', icon: '↑' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

export default function Layout() {
  const { data: newsStats } = useNewsStats();
  const unreadCount = newsStats?.unreadCount ?? 0;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-lg font-bold text-white tracking-tight">
            Fantasy Trade
            <span className="text-blue-400"> Analyzer</span>
          </h1>
        </div>
        <nav className="flex-1 py-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 border-r-2 border-blue-400'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.to === '/news' && unreadCount > 0 && (
                <span className="px-1.5 py-0.5 text-xs bg-blue-600 text-white rounded-full min-w-[20px] text-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-800 text-xs text-gray-600">
          v1.0.0 — 6x6 Deep Roto
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
