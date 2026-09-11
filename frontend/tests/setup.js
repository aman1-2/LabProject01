import '@testing-library/jest-dom';
import { beforeEach } from 'vitest';

// The cart persists to localStorage, so without this a basket built in one
// test would still be there in the next one.
beforeEach(() => {
  window.localStorage.clear();
});
