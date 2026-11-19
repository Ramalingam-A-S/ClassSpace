import { useState } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { AppModeProvider } from './AppModeProvider';
import { DemoRoleProvider } from './DemoRoleProvider';
import { AppShell } from '../components/layout/AppShell';
import { LandingPage } from '../pages/LandingPage';
import { StudentDashboardPage } from '../pages/StudentDashboardPage';
import { RoomDetailsPage } from '../pages/RoomDetailsPage';
import { MyBookingsPage } from '../pages/MyBookingsPage';
import { AdminDashboardPage } from '../pages/AdminDashboardPage';
import { AdminRoomsPage } from '../pages/AdminRoomsPage';
import { AdminTimetablePage } from '../pages/AdminTimetablePage';
import { AuthCallbackPage } from '../pages/AuthCallbackPage';

function NotFoundPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-600">
        The requested ClassSpace view does not exist.
      </p>
      <div className="mt-6">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center rounded-lg bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800"
        >
          Return to Home
        </Link>
      </div>
    </div>
  );
}

export function AppRoutes({ onDemoReset }: { onDemoReset: () => void }) {
  return (
    <AppShell onDemoReset={onDemoReset}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/student" element={<StudentDashboardPage />} />
        <Route path="/rooms/:roomId" element={<RoomDetailsPage />} />
        <Route path="/bookings" element={<MyBookingsPage />} />
        <Route path="/admin" element={<AdminDashboardPage />} />
        <Route path="/admin/rooms" element={<AdminRoomsPage />} />
        <Route path="/admin/timetable" element={<AdminTimetablePage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}

export function App() {
  const [resetEpoch, setResetEpoch] = useState(0);

  return (
    <AppModeProvider>
      <DemoRoleProvider>
        <BrowserRouter>
          <AppRoutes key={resetEpoch} onDemoReset={() => setResetEpoch((n) => n + 1)} />
        </BrowserRouter>
      </DemoRoleProvider>
    </AppModeProvider>
  );
}

export default App;
