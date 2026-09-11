export * from './colors.js';
export * from './typography.js';
export * from './spacing.js';
export * from './radius.js';
export * from './shadow.js';
export * from './avatar.js';

import { colors } from './colors.js';
import { type, fontFamily } from './typography.js';
import { space } from './spacing.js';
import { radius } from './radius.js';
import { shadow } from './shadow.js';
import { avatarColors } from './avatar.js';

export const tokens = {
  colors,
  type,
  fontFamily,
  space,
  radius,
  shadow,
  avatarColors,
};

export default tokens;
