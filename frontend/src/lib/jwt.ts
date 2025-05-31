import jwt from 'jsonwebtoken';

interface JwtPayload {
  userId: string;
  email: string;
}

/**
 * Generate a JWT token containing user ID and email
 * @param userId - The user's ID
 * @param email - The user's email address
 * @returns A JWT token string
 */
export function generateToken(userId: string, email: string): string {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not set');
  }

  const payload: JwtPayload = {
    userId,
    email
  };

  // Sign the token with the secret key and set it to expire in 7 days
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Verify and decode a JWT token
 * @param token - The JWT token to verify
 * @returns The decoded payload if valid
 */
export function verifyToken(token: string): JwtPayload {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not set');
  }

  try {
    // Verify the token and return the decoded payload
    return jwt.verify(token, process.env.JWT_SECRET) as JwtPayload;
  } catch {
    console.log('Invalid or expired token');
    throw new Error('Invalid or expired token');
  }
}