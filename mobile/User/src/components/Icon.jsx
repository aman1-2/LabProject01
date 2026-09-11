import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../theme.js';

/**
 * Line icons, transcribed path-for-path from pathcare_mobile_prototype.html.
 *
 * The prototype's tab bar uses real SVGs (`.tab-icon`, 24x24, stroke-width 2).
 * Those were briefly replaced with text glyphs (⌂ ⚗ ◷ ☺), which is worse than
 * a liberty — it is a regression FROM the approved design, since a font glyph
 * renders differently on every Android OEM and cannot take a stroke weight.
 *
 * Every `d` below is copied from the prototype, not redrawn.
 */

const PATHS = {
  // Prototype tab bar
  home: { paths: ['M3 12l9-9 9 9M5 10v10h14V10'] },
  flask: { paths: ['M9 2v6l-5.5 9.5A2 2 0 005.2 21h13.6a2 2 0 001.7-3.5L15 8V2', 'M9 2h6M9 14h6'] },
  clock: { circles: [{ cx: 12, cy: 12, r: 9 }], paths: ['M12 7v5l3 3'] },
  user: { circles: [{ cx: 12, cy: 8, r: 4 }], paths: ['M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1'] },

  // Prototype home search bar
  search: { circles: [{ cx: 11, cy: 11, r: 7 }], paths: ['M21 21l-4.3-4.3'] },

  // Prototype splash mark and confirm sheet
  check: { paths: ['M20 6L9 17l-5-5'] },
  checkCircle: { circles: [{ cx: 12, cy: 12, r: 10 }], paths: ['M9 12l2 2 4-4'] },

  // Used by screens the prototype does not cover, drawn in the same 24x24
  // stroke-2 language so they sit consistently beside the transcribed ones.
  chevronRight: { paths: ['M9 6l6 6-6 6'] },
  chevronLeft: { paths: ['M15 6l-6 6 6 6'] },
  arrowLeft: { paths: ['M19 12H5', 'M12 19l-7-7 7-7'] },
  repeat: { paths: ['M17 2l4 4-4 4', 'M3 11v-1a4 4 0 014-4h14', 'M7 22l-4-4 4-4', 'M21 13v1a4 4 0 01-4 4H3'] },
  calendar: { paths: ['M3 8h18M7 3v4M17 3v4', 'M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z'] },
  mapPin: { circles: [{ cx: 12, cy: 10, r: 3 }], paths: ['M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z'] },
  phone: { paths: ['M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.3-1.2a2 2 0 012.1-.5c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z'] },
  alert: { circles: [{ cx: 12, cy: 12, r: 10 }], paths: ['M12 8v5', 'M12 16h.01'] },
  plus: { paths: ['M12 5v14M5 12h14'] },
  pause: { paths: ['M10 4v16M14 4v16'] },
  play: { paths: ['M6 4l14 8-14 8V4z'] },
  x: { paths: ['M18 6L6 18M6 6l12 12'] },
  camera: { circles: [{ cx: 12, cy: 13, r: 4 }], paths: ['M3 7h3l2-2h8l2 2h3v13H3V7z'] },
  wallet: { paths: ['M3 7h16a2 2 0 012 2v9a2 2 0 01-2 2H3V7z', 'M3 7V5h13', 'M17 13h.01'] },
  file: { paths: ['M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z', 'M14 2v6h6'] },
  users: { circles: [{ cx: 9, cy: 8, r: 3 }], paths: ['M2 21v-1a5 5 0 015-5h4a5 5 0 015 5v1', 'M17 5a3 3 0 010 6', 'M19 21v-1a5 5 0 00-3-4.6'] },

  // Medical / category icons. Drawn in the prototype's own 24x24 stroke-2
  // language so they sit consistently beside the transcribed ones. These
  // replace the emoji that were previously used as category and empty-state
  // art: an emoji renders as a different picture on every OS and font, cannot
  // take the brand colour, and reads as informal on a medical product.
  heart: { paths: ['M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 000-7.8z'] },
  droplet: { paths: ['M12 2.7l5.7 5.7a8 8 0 11-11.4 0z'] },
  activity: { paths: ['M22 12h-4l-3 9L9 3l-3 9H2'] },
  stethoscope: {
    circles: [{ cx: 18, cy: 15, r: 2.5 }],
    paths: ['M5 2v6a5 5 0 0010 0V2', 'M4 2h2M13 2h2', 'M10 13v2a5 5 0 005 5h.5', 'M18 12.5V11'],
  },
  message: { paths: ['M21 11.5a8.4 8.4 0 01-9 8.4 8.6 8.6 0 01-3.8-.9L3 21l1.9-5.1A8.4 8.4 0 0112 3.1a8.4 8.4 0 019 8.4z'] },
  compass: { circles: [{ cx: 12, cy: 12, r: 9 }], paths: ['M15.9 8.1l-2.1 5.8-5.8 2.1 2.1-5.8 5.8-2.1z'] },
  inbox: { paths: ['M21 12h-6l-2 3h-2l-2-3H3', 'M5 5h14l2 7v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5l2-7z'] },
  testTube: { paths: ['M14 2v14a4 4 0 01-8 0V2', 'M4 2h12', 'M6 10h8'] },
  clipboard: { paths: ['M9 4h6v3H9z', 'M9 5H6a1 1 0 00-1 1v14a1 1 0 001 1h12a1 1 0 001-1V6a1 1 0 00-1-1h-3'] },
  shield: { paths: ['M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z', 'M9 12l2 2 4-4'] },
  eye: {
    circles: [{ cx: 12, cy: 12, r: 3 }],
    paths: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z'],
  },
  eyeOff: {
    paths: [
      'M10.6 6.2A9.7 9.7 0 0112 6c6.4 0 10 7 10 7a17 17 0 01-3 3.8',
      'M6.6 6.7A17 17 0 002 13s3.6 7 10 7a9.6 9.6 0 005.4-1.6',
      'M9.9 9.9a3 3 0 004.2 4.2',
      'M2 2l20 20',
    ],
  },
  lock: { paths: ['M5 11h14v10H5z', 'M8 11V8a4 4 0 018 0v3'] },
  logOut: { paths: ['M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4', 'M10 17l5-5-5-5', 'M15 12H3'] },
  edit: { paths: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z'] },
  rupee: { paths: ['M7 4h10', 'M7 9h10', 'M15 4c0 4-3.5 5-8 5l8 11'] },
  microscope: { paths: ['M6 20h12', 'M9 20V9a3 3 0 016 0', 'M12 4v2', 'M5 16a7 7 0 0011 0'] },
};

/**
 * @param {string} name  key in PATHS
 * @param {number} size  square, matching the prototype's 24px tab icons
 * @param {string} color stroke colour; defaults to body ink
 */
export default function Icon({ name, size = 24, color = colors.ink, strokeWidth = 2, style }) {
  const glyph = PATHS[name];

  if (!glyph) {
    // A missing icon must not crash a screen, and must be obvious in review
    // rather than silently rendering nothing.
    return null;
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      {(glyph.circles ?? []).map((circle, index) => (
        <Circle
          key={`c${index}`}
          cx={circle.cx}
          cy={circle.cy}
          r={circle.r}
          stroke={color}
          strokeWidth={strokeWidth}
        />
      ))}
      {(glyph.paths ?? []).map((d, index) => (
        <Path
          key={`p${index}`}
          d={d}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}

export const ICON_NAMES = Object.keys(PATHS);
