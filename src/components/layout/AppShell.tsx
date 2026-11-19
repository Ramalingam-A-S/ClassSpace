import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  CalendarRange,
  DoorOpen,
  FlaskConical,
  LayoutDashboard,
  Menu,
  Search,
  TicketCheck,
  UserCog,
  UserRound,
  X,
} from 'lucide-react';
import { useDemoRole } from '../../hooks/useDemoRole';
import type { DemoRole } from '../../types/domain';
import { Footer } from './Footer';
import { Logo } from './Logo';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Search;
  end?: boolean;
}

const STUDENT_NAV: NavItem[] = [
  { to: '/student', label: 'Find Classrooms', icon: Search },
  { to: '/bookings', label: 'My Bookings', icon: TicketCheck },
];

const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Admin Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/rooms', label: 'Room Management', icon: DoorOpen },
  { to: '/admin/timetable', label: 'Timetable & Restrictions', icon: CalendarRange },
];

export function AppShell({
  children,
  onDemoReset,
}: {
  children: ReactNode;
  onDemoReset?: () => void;
}) {
  const { role, identity, setRole } = useDemoRole();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const activeNav = role === 'ADMIN_DEMO' ? ADMIN_NAV : STUDENT_NAV;

  const handleRoleChange = (nextRole: DemoRole) => {
    setRole(nextRole);
    setMobileMenuOpen(false);
    if (nextRole === 'ADMIN_DEMO') {
      navigate('/admin');
    } else {
      navigate('/student');
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Explicit Phase 1 Demo Mode Bar */}
      <div className="border-b border-violet-200 bg-violet-950 px-4 py-1.5 text-xs text-violet-100">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded bg-violet-800 px-2 py-0.5 font-bold tracking-wider text-white uppercase">
              <FlaskConical className="h-3 w-3" aria-hidden="true" />
              DEMO MODE
            </span>
            <span>
              Phase 1 simulation using fictional campus records (Asia/Kolkata). No institutional
              feed or physical occupancy sensors connected.
            </span>
          </div>
          <span className="font-medium text-violet-200">
            Active Persona: {identity.displayName}
          </span>
        </div>
      </div>

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link to="/" className="rounded-lg p-1" aria-label="ClassSpace home">
              <Logo />
            </Link>

            <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-800'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                Home
              </NavLink>
              {activeNav.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-indigo-50 text-indigo-800'
                          : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {/* Explicit Demo Role Switcher (Not real authentication) */}
            <div className="hidden items-center gap-2 sm:flex">
              <label htmlFor="demo-role-select" className="text-xs font-medium text-slate-600">
                Demo Role:
              </label>
              <div className="relative flex items-center">
                <select
                  id="demo-role-select"
                  value={role}
                  onChange={(e) => handleRoleChange(e.target.value as DemoRole)}
                  className="min-h-9 cursor-pointer rounded-lg border border-slate-300 bg-white pr-8 pl-3 text-xs font-semibold text-slate-800 hover:border-slate-400"
                >
                  <option value="STUDENT_DEMO">Student Demo</option>
                  <option value="ADMIN_DEMO">Admin Demo</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 md:hidden"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Menu className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Panel */}
        {mobileMenuOpen && (
          <div
            id="mobile-navigation"
            className="border-t border-slate-200 bg-white px-4 py-4 md:hidden"
          >
            <nav aria-label="Mobile" className="flex flex-col gap-1">
              <NavLink
                to="/"
                end
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2.5 text-sm font-medium ${
                    isActive ? 'bg-indigo-50 text-indigo-800' : 'text-slate-700 hover:bg-slate-100'
                  }`
                }
              >
                Home
              </NavLink>
              {activeNav.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${
                        isActive
                          ? 'bg-indigo-50 text-indigo-800'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>

            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold text-slate-600 uppercase">
                Switch Demo Role
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleRoleChange('STUDENT_DEMO')}
                  className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${
                    role === 'STUDENT_DEMO'
                      ? 'border-indigo-700 bg-indigo-50 text-indigo-800'
                      : 'border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                  Student Demo
                </button>
                <button
                  type="button"
                  onClick={() => handleRoleChange('ADMIN_DEMO')}
                  className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${
                    role === 'ADMIN_DEMO'
                      ? 'border-indigo-700 bg-indigo-50 text-indigo-800'
                      : 'border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
                  Admin Demo
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>

      <Footer onDemoReset={onDemoReset} />
    </div>
  );
}
