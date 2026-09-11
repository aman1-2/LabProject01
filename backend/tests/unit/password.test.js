import { hashPassword, comparePassword } from '../../src/utils/passwordUtils.js';

describe('Password Hashing', () => {
  it('should hash password with bcrypt cost 12', async () => {
    const plain = 'superSecretPass123';
    const hash = await hashPassword(plain);

    expect(hash).toBeDefined();
    // Verify bcrypt format and cost 12: starts with $2a$12$ or $2b$12$
    expect(/^\$2[ab]\$12\$/.test(hash)).toBe(true);
  });

  it('should correctly compare valid and invalid passwords', async () => {
    const plain = 'pathcarePass2026';
    const hash = await hashPassword(plain);

    const matchValid = await comparePassword(plain, hash);
    const matchInvalid = await comparePassword('wrongPassword', hash);

    expect(matchValid).toBe(true);
    expect(matchInvalid).toBe(false);
  });
});
