import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import App from '../src/App.jsx';

describe('App Component Navigation', () => {
  it('renders auth page when visiting /auth', () => {
    render(
      <MemoryRouter initialEntries={['/auth']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText(/Now live in Dehradun/i)).toBeInTheDocument();
  });
});
