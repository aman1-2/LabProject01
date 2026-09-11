// frontend/tests/ReferralLeads.test.jsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import LabConsolePage from '../src/pages/LabConsolePage.jsx';
import AuthContext from '../src/context/AuthContext.jsx';

describe('Referral Leads Admin Pipeline Component Tests', () => {
  let mockApi;
  let mockUser;
  let mockLeads;

  beforeEach(() => {
    mockUser = {
      _id: 'user_admin_1',
      name: 'Super Admin',
      accountHandle: 'super.admin',
      role: 'super_admin',
    };

    mockLeads = [
      {
        _id: 'lead_1',
        rawName: 'Dr. A.K. Sharma, MD',
        normalizedName: 'a k sharma',
        mentionCount: 8,
        status: 'New',
        notes: 'Top prescriber in Dalanwala',
        lastMentionedAt: new Date('2026-09-01').toISOString(),
      },
      {
        _id: 'lead_2',
        rawName: 'Dr. Priya Mehta, MBBS',
        normalizedName: 'priya mehta',
        mentionCount: 3,
        status: 'Contacted',
        notes: 'Called assistant, call back on Monday',
        lastMentionedAt: new Date('2026-09-03').toISOString(),
      },
    ];

    mockApi = {
      get: vi.fn(async (url, config) => {
        if (url === '/api/admin/referral-leads') {
          if (config?.params?.status === 'Contacted') {
            return { data: { success: true, data: [mockLeads[1]] } };
          }
          return { data: { success: true, data: mockLeads } };
        }
        if (url === '/api/lab/queue') {
          return { data: { success: true, data: [] } };
        }
        if (url === '/api/lab/profile') {
          return { data: { success: true, data: { name: 'PathCare Dehradun' } } };
        }
        if (url === '/api/doctors') {
          return { data: { success: true, data: [] } };
        }
        return { data: { success: true, data: [] } };
      }),
      patch: vi.fn(async (url, data) => {
        if (url.startsWith('/api/admin/referral-leads/')) {
          const id = url.split('/').pop();
          const target = mockLeads.find((l) => l._id === id) || mockLeads[0];
          return {
            data: {
              success: true,
              data: { ...target, ...data },
            },
          };
        }
        return { data: { success: true } };
      }),
    };
  });

  function renderComponent(initialTab = 'leads') {
    return render(
      <AuthContext.Provider
        value={{
          user: mockUser,
          api: mockApi,
          logout: vi.fn(),
        }}
      >
        <MemoryRouter>
          <LabConsolePage initialTab={initialTab} />
        </MemoryRouter>
      </AuthContext.Provider>
    );
  }

  it('renders referral leads table with ranked doctors, mentions and statuses', async () => {
    renderComponent('leads');

    await waitFor(() => {
      expect(screen.getByText('Doctor Referral Recruitment Pipeline')).toBeInTheDocument();
    });

    expect(mockApi.get).toHaveBeenCalledWith('/api/admin/referral-leads', expect.any(Object));

    // Verify ranked table rows
    expect(screen.getByText('Dr. A.K. Sharma, MD')).toBeInTheDocument();
    expect(screen.getByText('Dr. Priya Mehta, MBBS')).toBeInTheDocument();
    expect(screen.getByTestId('lead-mentions-lead_1')).toHaveTextContent('8 patients');
    expect(screen.getByTestId('lead-mentions-lead_2')).toHaveTextContent('3 patients');
  });

  it('switches to referral leads tab when clicked from sidebar', async () => {
    renderComponent('queue');

    const tabBtn = screen.getByTestId('tab-referral-leads');
    fireEvent.click(tabBtn);

    await waitFor(() => {
      expect(screen.getByText('Doctor Referral Recruitment Pipeline')).toBeInTheDocument();
    });
    expect(mockApi.get).toHaveBeenCalledWith('/api/admin/referral-leads', expect.any(Object));
  });

  it('updates lead status via PATCH /api/admin/referral-leads/:id on dropdown selection', async () => {
    renderComponent('leads');

    await waitFor(() => {
      expect(screen.getByTestId('lead-status-select-lead_1')).toBeInTheDocument();
    });

    const statusSelect = screen.getByTestId('lead-status-select-lead_1');
    fireEvent.change(statusSelect, { target: { value: 'In discussion' } });

    await waitFor(() => {
      expect(mockApi.patch).toHaveBeenCalledWith(
        '/api/admin/referral-leads/lead_1',
        { status: 'In discussion' }
      );
    });
  });

  it('opens edit notes modal and saves notes via PATCH /api/admin/referral-leads/:id', async () => {
    renderComponent('leads');

    await waitFor(() => {
      expect(screen.getByTestId('lead-edit-notes-btn-lead_1')).toBeInTheDocument();
    });

    // Click Edit button
    fireEvent.click(screen.getByTestId('lead-edit-notes-btn-lead_1'));

    // Modal should be visible
    expect(screen.getByText(/Recruitment Notes — Dr. A.K. Sharma, MD/i)).toBeInTheDocument();
    const textarea = screen.getByTestId('lead-notes-textarea');
    expect(textarea.value).toBe('Top prescriber in Dalanwala');

    // Type new notes
    fireEvent.change(textarea, { target: { value: 'Onboarding call scheduled for 10am' } });

    // Click save
    fireEvent.click(screen.getByTestId('lead-notes-save-btn'));

    await waitFor(() => {
      expect(mockApi.patch).toHaveBeenCalledWith(
        '/api/admin/referral-leads/lead_1',
        { notes: 'Onboarding call scheduled for 10am' }
      );
    });
  });

  it('filters referral leads by status', async () => {
    renderComponent('leads');

    await waitFor(() => {
      expect(screen.getByTestId('lead-filter-status')).toBeInTheDocument();
    });

    const filterSelect = screen.getByTestId('lead-filter-status');
    fireEvent.change(filterSelect, { target: { value: 'Contacted' } });

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith(
        '/api/admin/referral-leads',
        expect.objectContaining({ params: { status: 'Contacted' } })
      );
    });
  });

  it('shows empty state when no referral leads exist', async () => {
    mockApi.get = vi.fn(async (url) => {
      if (url === '/api/admin/referral-leads') {
        return { data: { success: true, data: [] } };
      }
      return { data: { success: true, data: [] } };
    });

    renderComponent('leads');

    await waitFor(() => {
      expect(screen.getByText('No external referral leads')).toBeInTheDocument();
    });
  });
});
