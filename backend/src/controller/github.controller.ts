// src/controller/github.controller.ts

import { Request, Response, NextFunction, RequestHandler } from 'express';
// Assuming AppError is defined as an interface/type in error.middleware.ts,
// we'll use the pattern of casting a new Error() to AppError.
import { AppError } from '../middleware/error.middleware'; // Import the type for casting
import * as githubService from '../agents/github.service';
import * as chatService from '../services/chat.service';

interface GithubCommandRequest {
  command: string;
  aiModelId: string;
  sessionId?: string;
}

interface ConfirmActionRequest {
  parsedCommand: githubService.ParsedGithubCommand;
  aiModelId: string;
  sessionId?: string;
}

export const processGithubCommand: RequestHandler = async (
  req: Request<{}, {}, GithubCommandRequest>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { command, aiModelId, sessionId } = req.body;
    const userId = (req as any).user?.userId;

    if (!command) {
      const error = new Error('Command is required') as AppError; // FIX: Pattern for AppError
      error.statusCode = 400;
      throw error;
    }
    if (!aiModelId) {
      const error = new Error('AI model ID is required') as AppError; // FIX: Pattern for AppError
      error.statusCode = 400;
      throw error;
    }
    if (!userId) {
      const error = new Error('User authentication required') as AppError; // FIX: Pattern for AppError
      error.statusCode = 401;
      throw error;
    }

    const result = await githubService.processGithubMessage(
      command,
      aiModelId,
      userId
    );

    if (sessionId) {
      try {
        await chatService.createUserMessage(
          sessionId,
          command,
          aiModelId
        );
        await chatService.createMessage({
          sessionId,
          role: 'ai',
          content: result.content,
          aiModelId,
        });
      } catch (chatError) {
        console.error('Error saving GitHub command to chat history:', chatError);
      }
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const confirmGithubAction: RequestHandler = async (
  req: Request<{}, {}, ConfirmActionRequest>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { parsedCommand, aiModelId, sessionId } = req.body;
    const userId = (req as any).user?.userId;

    if (!parsedCommand) {
      const error = new Error('Parsed command is required') as AppError; // FIX: Pattern for AppError
      error.statusCode = 400;
      throw error;
    }
    if (!aiModelId) {
      const error = new Error('AI model ID is required') as AppError; // FIX: Pattern for AppError
      error.statusCode = 400;
      throw error;
    }
    if (!userId) {
      const error = new Error('User authentication required') as AppError; // FIX: Pattern for AppError
      error.statusCode = 401;
      throw error;
    }

    const result = await githubService.processGithubMessage(
      'Executing confirmed command',
      aiModelId,
      userId,
      true,
      parsedCommand
    );

    if (sessionId) {
      try {
        await chatService.createUserMessage(
          sessionId,
          `Confirmed: ${parsedCommand.action.replace(/_/g, ' ')}`,
          aiModelId
        );
        await chatService.createMessage({
          sessionId,
          role: 'ai',
          content: result.content,
          aiModelId,
        });
      } catch (chatError) {
        console.error('Error saving GitHub command confirmation to chat history:', chatError);
      }
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const initiateAuth: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      const error = new Error('User authentication required') as AppError; // FIX: Pattern for AppError
      error.statusCode = 401;
      throw error;
    }

    console.log(`Initiating GitHub auth for user: ${userId}`);
    const authUrl = await githubService.initializeGithubAgent(userId);
    console.log(`GitHub Auth URL result: ${authUrl ? 'Need auth' : 'Already connected'}`);

    if (authUrl) {
      res.json({ 
        success: true, 
        authRequired: true,
        authUrl,
        pluginType: 'github',
        pluginName: 'GitHub'
      });
      return;
    }

    res.json({ 
      success: true, 
      authRequired: false,
      pluginType: 'github',
      pluginName: 'GitHub',
      message: 'Already connected to GitHub' 
    });
  } catch (error) {
    next(error);
  }
};

export const handleOAuthCallback: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { code, state } = req.query as { code?: string, state?: string };
    
    if (!code || typeof code !== 'string') {
      const error = new Error('Authorization code is required') as AppError; // FIX: Pattern for AppError
      error.statusCode = 400;
      throw error;
    }

    const userId = state as string;

    if (!userId) {
      const error = new Error('Invalid state parameter in OAuth callback') as AppError; // FIX: Pattern for AppError
      error.statusCode = 400;
      throw error;
    }

    console.log(`Processing GitHub OAuth callback for user: ${userId}`);
    const success = await githubService.handleAuthCallback(userId, code);
    console.log(`GitHub OAuth callback result: ${success ? 'success' : 'failed'}`);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    
    res.redirect(`${frontendUrl}/plugins?connection=github&status=${success ? 'success' : 'error'}`);
  } catch (error) {
    console.error('GitHub OAuth callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/plugins?connection=github&status=error&message=${encodeURIComponent((error as Error).message)}`);
  }
};

export const checkAuthStatus: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      const error = new Error('User authentication required') as AppError; // FIX: Pattern for AppError
      error.statusCode = 401;
      throw error;
    }

    console.log(`Checking GitHub auth status for user: ${userId}`);
    const authUrl = await githubService.initializeGithubAgent(userId);
    const isAuthorized = !authUrl;
    console.log(`GitHub Auth status result: ${isAuthorized ? 'authorized' : 'not authorized'}`);

    res.json({
      authorized: isAuthorized,
      authUrl: authUrl || null,
      pluginType: 'github',
      pluginName: 'GitHub'
    });
  } catch (error) {
    next(error);
  }
};

export const disconnectGithub: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      const error = new Error('User authentication required') as AppError; // FIX: Pattern for AppError
      error.statusCode = 401;
      throw error;
    }

    console.log(`Disconnecting GitHub for user: ${userId}`);
    
    const success = await githubService.disconnectGithub(userId);

    if (success) {
      console.log(`Successfully disconnected GitHub for user: ${userId}`);
      res.json({
        success: true,
        message: 'Successfully disconnected from GitHub'
      });
    } else {
      const error = new Error('Failed to disconnect from GitHub') as AppError; // FIX: Pattern for AppError
      error.statusCode = 500;
      throw error;
    }
  } catch (error) {
    console.error('GitHub Disconnect error:', error);
    next(error);
  }
};