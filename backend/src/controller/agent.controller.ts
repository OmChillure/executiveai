import { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/error.middleware';
import { db } from '../db';
import { aiAgents } from '../db/schema';
import { eq } from 'drizzle-orm';

export const getAgents = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const agents = await db.query.aiAgents.findMany({
      orderBy: (aiAgents, { asc }) => [asc(aiAgents.name)]
    });

    res.json({
      agents: agents.map(agent => ({
        id: agent.id,
        name: agent.name,
        type: agent.type,
        description: agent.description
      }))
    });
  } catch (error) {
    next(error);
  }
};

export const getAgent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const agent = await db.query.aiAgents.findFirst({
      where: eq(aiAgents.id, id)
    });

    if (!agent) {
      const error = new Error('Agent not found') as AppError;
      error.statusCode = 404;
      throw error;
    }

    res.json({
      agent: {
        id: agent.id,
        name: agent.name,
        type: agent.type,
        description: agent.description
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getAgentCapabilities = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const agent = await db.query.aiAgents.findFirst({
      where: eq(aiAgents.id, id)
    });

    if (!agent) {
      const error = new Error('Agent not found') as AppError;
      error.statusCode = 404;
      throw error;
    }

    let capabilities;
    switch (agent.type) {
      case 'research':
        capabilities = {
          type: 'research',
          features: [
            'Research report',
            'Report generation',
            'Fact checking'
          ],
          requirements: [
            'Research query',
          ],
          supported_models: 'all'
        };
        break;
      default:
        capabilities = {
          type: agent.type,
          features: [],
          requirements: [],
          supported_models: []
        };
    }

    res.json({
      agent: {
        id: agent.id,
        name: agent.name,
        type: agent.type,
        description: agent.description,
        capabilities
      }
    });
  } catch (error) {
    next(error);
  }
};