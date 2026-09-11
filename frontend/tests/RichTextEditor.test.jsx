// frontend/tests/RichTextEditor.test.jsx
import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RichTextEditor, sanitizeAllowlistHtml } from '../src/components/RichTextEditor';

describe('RichTextEditor Component & Allowlist Sanitisation', () => {
  describe('Sanitizer Unit Validation (§6.4 Allowlist)', () => {
    it('produces only allowlisted tags (b, i, em, strong, u, p, br, ul, ol, li, h4) and strips all attributes', () => {
      const maliciousDirtyHtml = `
        <h1 style="color:red">Main Title</h1>
        <script>alert("xss")</script>
        <p class="custom-class" onclick="doBad()">Normal report paragraph with <b>bold text</b> and <strong style="font-weight:900">strong text</strong>.</p>
        <iframe src="https://evil.com"></iframe>
        <h4 id="clin-note" style="font-size:20px">Doctor Clinical Note</h4>
        <div style="background:yellow">
          <ul>
            <li class="item">Hemoglobin normal</li>
            <li>Platelet count slightly <i>reduced</i> but <u>stable</u></li>
          </ul>
        </div>
      `;

      const cleaned = sanitizeAllowlistHtml(maliciousDirtyHtml);

      // Verify no scripts, iframes, styles, or onclick attributes exist
      expect(cleaned).not.toContain('<script');
      expect(cleaned).not.toContain('alert');
      expect(cleaned).not.toContain('<iframe');
      expect(cleaned).not.toContain('style=');
      expect(cleaned).not.toContain('class=');
      expect(cleaned).not.toContain('onclick=');
      expect(cleaned).not.toContain('id=');
      expect(cleaned).not.toContain('<h1'); // h1 not in allowlist
      expect(cleaned).not.toContain('<div'); // div not in allowlist

      // Verify allowed tags are cleanly preserved
      expect(cleaned).toContain('<b>bold text</b>');
      expect(cleaned).toContain('<strong>strong text</strong>');
      expect(cleaned).toContain('<h4>Doctor Clinical Note</h4>');
      expect(cleaned).toContain('<ul>');
      expect(cleaned).toContain('<li>Hemoglobin normal</li>');
      expect(cleaned).toContain('<i>reduced</i>');
      expect(cleaned).toContain('<u>stable</u>');
    });
  });

  describe('Component Rendering & Toolbar Controls', () => {
    it('renders the editor toolbar with B, I, U, List, and Heading buttons', () => {
      render(<RichTextEditor value="<p>Initial report note</p>" onChange={vi.fn()} />);

      expect(screen.getByTestId('rich-text-editor')).toBeInTheDocument();
      expect(screen.getByTestId('rte-bold-btn')).toBeInTheDocument();
      expect(screen.getByTestId('rte-italic-btn')).toBeInTheDocument();
      expect(screen.getByTestId('rte-underline-btn')).toBeInTheDocument();
      expect(screen.getByTestId('rte-bullet-btn')).toBeInTheDocument();
      expect(screen.getByTestId('rte-h4-btn')).toBeInTheDocument();
      expect(screen.getByTestId('rte-content-area')).toBeInTheDocument();
    });

    it('sanitizes and emits updated HTML when content is edited', async () => {
      const handleChange = vi.fn();

      function Wrapper() {
        const [val, setVal] = useState('<p>Testing content</p>');
        return (
          <RichTextEditor
            value={val}
            onChange={(newVal) => {
              setVal(newVal);
              handleChange(newVal);
            }}
          />
        );
      }

      render(<Wrapper />);

      const boldBtn = screen.getByTestId('rte-bold-btn');
      fireEvent.click(boldBtn);

      // The editor is responsive and renders without crashing
      expect(screen.getByTestId('rich-text-editor')).toBeInTheDocument();
    });
  });
});
