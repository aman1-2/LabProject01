import jwt from 'jsonwebtoken';
import {
  generateAccessToken,
  verifyAccessToken,
  generateOpaqueRefreshToken,
  hashToken,
} from '../../src/utils/tokenUtils.js';

describe('Token Utils', () => {
  const mockUser = {
    _id: '507f1f77bcf86cd799439011',
    accountHandle: 'aman_test',
    role: 'patient',
  };

  it('should issue a valid JWT access token with correct claims', () => {
    const token = generateAccessToken(mockUser);
    expect(typeof token).toBe('string');

    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBe(mockUser._id);
    expect(decoded.accountHandle).toBe(mockUser.accountHandle);
    expect(decoded.role).toBe('patient');
    expect(decoded.jti).toBeDefined();
    expect(decoded.exp).toBeGreaterThan(decoded.iat);
  });

  it('should reject a tampered JWT token', () => {
    const token = generateAccessToken(mockUser);
    const parts = token.split('.');
    // Tamper payload signature
    const tampered = `${parts[0]}.${parts[1]}.invalidsignaturexyz`;

    expect(() => verifyAccessToken(tampered)).toThrow();
  });

  it('should reject an expired JWT token', async () => {
    // Generate token with 0s expiry
    const expiredToken = jwt.sign(
      { userId: mockUser._id, accountHandle: mockUser.accountHandle, role: 'patient' },
      process.env.JWT_SECRET || 'pathcare_dev_jwt_secret_min_32_characters_long',
      { expiresIn: '0s' }
    );

    // Wait a split second
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(() => verifyAccessToken(expiredToken)).toThrow();
  });

  it('should generate a 96-char opaque hex refresh token and hash it', () => {
    const refreshToken = generateOpaqueRefreshToken();
    expect(refreshToken).toHaveLength(96);

    const hash = hashToken(refreshToken);
    expect(hash).toHaveLength(64);
  });
});
