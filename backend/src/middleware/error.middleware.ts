import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = err.statusCode || 500;
  console.error(`Error: ${err.message}`);
  console.error(err.stack);

  res.status(statusCode).json({
    error: err.message,
    message: 'An error occurred while processing your request.',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
}; 