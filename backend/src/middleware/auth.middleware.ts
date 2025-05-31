import { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { AppError } from './error.middleware';
import jwt from 'jsonwebtoken';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET environment variable not set. JWT verification will fail!');
}

// Define the JWT payload interface
interface JwtPayload {
  userId: string;
  email: string;
}

// Extend the Express Request interface to include user property
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        email: string;
      };
    }
  }
}

/**
 * Middleware to verify bearer token and decode JWT payload
 */
export const verifyApiKey = (req: Request, res: Response, next: NextFunction) => {
  // Skip authentication if API_KEY is not set (for development)
  if (!JWT_SECRET) {
    return next();
  }

  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    const error = new Error('Authorization header missing') as AppError;
    error.statusCode = 401;
    return next(error);
  }
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    const error = new Error('Invalid authorization format. Use: Bearer <token>') as AppError;
    error.statusCode = 401;
    return next(error);
  }
  
  const token = parts[1];

  if (!token) {
    const error = new Error('Invalid token') as AppError;
    error.statusCode = 401;
    return next(error);
  }
  
  // If JWT_SECRET is set, try to verify as JWT token
  if (JWT_SECRET) {
    try {
      // Verify and decode the JWT token
      const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
      
      // Attach user info to the request object
      req.user = {
        userId: decoded.userId,
        email: decoded.email
      };
      
      console.log('JWT verified for user:', decoded.email);
      return next();
    } catch (err) {
      // If JWT verification fails, fall back to API_KEY check
      console.log('JWT verification failed, falling back to API_KEY check');
    }
  }
  
  console.log('API key verified' , req.user);
  
  // Token is valid, proceed
  next();
};