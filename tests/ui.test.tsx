import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DemoRoleProvider } from '../src/app/DemoRoleProvider';
import { AppRoutes } from '../src/app/App';
import { classSpaceService } from '../src/services';

function renderApp(initialRoute = '/') {
  return render(
    <DemoRoleProvider>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AppRoutes onDemoReset={() => {}} />
      </MemoryRouter>
    </DemoRoleProvider>,
  );
}

describe('ClassSpace UI Integration', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await classSpaceService.resetDemoData();
  });

  it('renders Landing Page with DEMO MODE disclosure and Find a Classroom CTA', () => {
    renderApp('/');
    expect(screen.getByText('DEMO MODE')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: /Discover schedule-vacant classrooms during your free periods/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Find a Classroom/i })).toHaveAttribute(
      'href',
      '/student',
    );
    expect(screen.getByText(/4\. Unknown Physical State/i)).toBeInTheDocument();
  });

  it('filters classrooms on Student Dashboard by capacity, floor, and resets cleanly', async () => {
    const user = userEvent.setup();
    renderApp('/student');

    // Wait for initial results to load
    await waitFor(() => {
      expect(screen.getByText('BLOCK-A / ECE-201')).toBeInTheDocument();
    });

    // Filter minCapacity to 100 -> only SEM-301 should remain
    const capInput = screen.getByLabelText(/Min Capacity/i);
    await user.clear(capInput);
    await user.type(capInput, '100');
    await user.click(screen.getByRole('button', { name: /Search Classrooms/i }));

    await waitFor(() => {
      expect(screen.getByText('BLOCK-A / SEM-301')).toBeInTheDocument();
      expect(screen.queryByText('BLOCK-A / ECE-201')).not.toBeInTheDocument();
    });

    // Reset filters -> ECE-201 returns
    await user.click(screen.getByRole('button', { name: /Reset Filters/i }));
    await waitFor(() => {
      expect(screen.getByText('BLOCK-A / ECE-201')).toBeInTheDocument();
    });
  });

  it('shows validation error when search start time is not earlier than end time', async () => {
    const user = userEvent.setup();
    renderApp('/student');

    await waitFor(() => {
      expect(screen.getByText('BLOCK-A / ECE-201')).toBeInTheDocument();
    });

    const startInput = screen.getByLabelText(/Start Time/i);
    const endInput = screen.getByLabelText(/End Time/i);

    await user.clear(startInput);
    await user.type(startInput, '14:00');
    await user.clear(endInput);
    await user.type(endInput, '13:00');
    await user.click(screen.getByRole('button', { name: /Search Classrooms/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Start time must be strictly earlier than end time/i),
      ).toBeInTheDocument();
    });
  });

  it('creates a demo booking request from Room Details and isolates My Bookings to student-demo-01', async () => {
    const user = userEvent.setup();
    renderApp('/rooms/room-ece-201');

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'BLOCK-A / ECE-201' }),
      ).toBeInTheDocument();
    });

    // Physical occupancy banner must be present
    expect(screen.getByText(/Schedule-Vacant ≠ Physically Verified/i)).toBeInTheDocument();

    // Open booking modal
    await user.click(screen.getByRole('button', { name: /Request Use \(Demo\)/i }));

    const dialog = screen.getByRole('dialog');
    const startInput = within(dialog).getByLabelText(/Start Time/i);
    const endInput = within(dialog).getByLabelText(/End Time/i);
    const purposeInput = within(dialog).getByLabelText(/Activity \/ Study Purpose/i);

    await user.clear(startInput);
    await user.type(startInput, '16:00');
    await user.clear(endInput);
    await user.type(endInput, '17:00');
    await user.type(purposeInput, 'VLSI seminar prep group');

    await user.click(within(dialog).getByRole('button', { name: /Submit Demo Request/i }));

    await waitFor(() => {
      expect(screen.getByText(/Demo booking request submitted/i)).toBeInTheDocument();
    });

    // Navigate to My Bookings
    await user.click(screen.getByRole('link', { name: /View My Bookings/i }));

    await waitFor(() => {
      expect(screen.getByText(/VLSI seminar prep group/i)).toBeInTheDocument();
    });

    // Verify another student's booking (student-demo-02) is NOT visible
    expect(screen.queryByText(/Robotics club CAD review session/i)).not.toBeInTheDocument();
  });

  it('allows switching to Admin Demo, viewing calculated metrics, and validating room creation', async () => {
    const user = userEvent.setup();
    renderApp('/admin');

    // Initially in Student Demo -> role gate is shown
    expect(screen.getByText(/Admin Demo Role Required/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Switch to Admin Demo/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Administrator Dashboard/i }),
      ).toBeInTheDocument();
    });

    expect(screen.getByText(/Total Rooms/i)).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();

    // Navigate to Room Management
    await user.click(screen.getByRole('link', { name: /Manage Rooms/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Room Management/i }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Add Classroom/i }));
    const dialog = screen.getByRole('dialog');

    // Submit empty room number -> validation error
    await user.click(within(dialog).getByRole('button', { name: /Create Room/i }));
    await waitFor(() => {
      expect(within(dialog).getByText(/Room number is required/i)).toBeInTheDocument();
    });

    // Fill valid room
    await user.type(within(dialog).getByLabelText(/Room Number/i), 'CSE-210');
    await user.click(within(dialog).getByRole('button', { name: /Create Room/i }));

    await waitFor(() => {
      expect(screen.getByText('BLOCK-A / CSE-210')).toBeInTheDocument();
    });

    // Verify persistence in localStorage repository across fresh service read
    const persistedRooms = await classSpaceService.listRooms();
    expect(persistedRooms.some((r) => r.roomNumber === 'CSE-210')).toBe(true);
  });

  it('approves a pending booking on Admin Dashboard and detects overlapping timetable entries', async () => {
    const user = userEvent.setup();
    renderApp('/admin');

    await user.click(screen.getByRole('button', { name: /Switch to Admin Demo/i }));

    await waitFor(() => {
      expect(screen.getByText(/Pending Booking Requests \(2\)/i)).toBeInTheDocument();
    });

    const approveButtons = screen.getAllByRole('button', { name: /Approve/i });
    await user.click(approveButtons[0]!);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Approved demo booking bk-demo-05/i);
      expect(screen.getByText(/Pending Booking Requests \(1\)/i)).toBeInTheDocument();
    });

    // Navigate to Timetable & Restrictions Management
    await user.click(screen.getByRole('link', { name: /Manage Timetable & Restrictions/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Timetable & Restrictions Management/i }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Add Timetable Entry/i }));
    const dialog = screen.getByRole('dialog');

    // room-ece-201 has 09:00-10:00 scheduled; test overlapping 09:30-10:30
    await user.selectOptions(within(dialog).getByLabelText(/Classroom/i), 'room-ece-201');
    const startInput = within(dialog).getByLabelText(/Start Time/i);
    const endInput = within(dialog).getByLabelText(/End Time/i);
    await user.clear(startInput);
    await user.type(startInput, '09:30');
    await user.clear(endInput);
    await user.type(endInput, '10:30');
    await user.type(within(dialog).getByLabelText(/Subject Label/i), 'Conflicting Subject (Demo)');

    await waitFor(() => {
      expect(within(dialog).getByText(/Overlap Detected/i)).toBeInTheDocument();
    });

    await user.click(within(dialog).getByRole('button', { name: /Add Entry/i }));
    await waitFor(() => {
      expect(within(dialog).getByText(/Overlapping timetable entry detected/i)).toBeInTheDocument();
    });
  });
});
