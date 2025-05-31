import { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/error.middleware';
import { db } from '../db';
import { aiModels } from '../db/schema';

export const getAIModels = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const models = await db.select().from(aiModels);
    
    res.json({
      models,
      count: models.length
    });
  } catch (error) {
    next(error);
  }
};

export const getAIModel = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    
    const model = await db.query.aiModels.findFirst({
      where: (aiModels, { eq }) => eq(aiModels.id, id)
    });
    
    if (!model) {
      const error = new Error('AI model not found') as AppError;
      error.statusCode = 404;
      throw error;
    }
    
    res.json(model);
  } catch (error) {
    next(error);
  }
};