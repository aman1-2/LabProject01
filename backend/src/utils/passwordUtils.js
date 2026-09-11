import bcrypt from 'bcrypt';

const BCRYPT_SALT_ROUNDS = 12; // Strictly cost 12 per specifications

export async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, BCRYPT_SALT_ROUNDS);
}

export async function comparePassword(plainPassword, hashedPassword) {
  return bcrypt.compare(plainPassword, hashedPassword);
}

export default { hashPassword, comparePassword, BCRYPT_SALT_ROUNDS };
