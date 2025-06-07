import { Request, Response, NextFunction, RequestHandler } from 'express';
import { AppError } from '../middleware/error.middleware';
import * as gdocsService from '../agents/doc.service';
import * as chatService from '../services/chat.service';

interface DocsCommandRequest {
  command: string;
  aiModelId: string;
  sessionId?: string;
}

export const processDocsCommand: RequestHandler = async (
  req: Request<{}, {}, DocsCommandRequest>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { command, aiModelId, sessionId } = req.body;
    const userId = req.user?.userId;

    if (!command) {
      const error = new Error('Command is required') as AppError;
      error.statusCode = 400;
      throw error;
    }

    if (!aiModelId) {
      const error = new Error('AI model ID is required') as AppError;
      error.statusCode = 400;
      throw error;
    }

    if (!userId) {
      const error = new Error('User authentication required') as AppError;
      error.statusCode = 401;
      throw error;
    }

    // Process the docs command
    const result = await gdocsService.processGoogleDocsRequest(
      command,
      aiModelId,
      userId
    );

    if (sessionId) {
      try {
        // Save user message
        await chatService.createUserMessage(
          sessionId,
          command,
          aiModelId
        );

        // Save agent response
        await chatService.createMessage({
          sessionId,
          role: 'ai',
          content: result.content,
          aiModelId,
          // Add google docs agent ID here if you have one in your database
        });
      } catch (error) {
        console.error('Error saving docs command to chat history:', error);
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
    const userId = req.user?.userId;

    if (!userId) {
      const error = new Error('User authentication required') as AppError;
      error.statusCode = 401;
      throw error;
    }

    console.log(`Initiating Google Docs auth for user: ${userId}`);
    const authUrl = await gdocsService.initializeGDocsAgent(userId);
    console.log(`Auth URL result: ${authUrl ? 'Need auth' : 'Already connected'}`);

    if (authUrl) {
      // Send the auth URL for the frontend to use
      res.json({ 
        success: true, 
        authRequired: true,
        authUrl,
        pluginType: 'gdocs',
        pluginName: 'Google Docs'
      });
      return;
    }

    // Already authorized
    res.json({ 
      success: true, 
      authRequired: false,
      pluginType: 'gdocs',
      pluginName: 'Google Docs',
      message: 'Already connected to Google Docs' 
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
      const error = new Error('Authorization code is required') as AppError;
      error.statusCode = 400;
      throw error;
    }

    // The state parameter contains userId that was passed during auth initialization
    const userId = state as string;

    if (!userId) {
      const error = new Error('Invalid state parameter') as AppError;
      error.statusCode = 400;
      throw error;
    }

    console.log(`Processing Google Docs OAuth callback for user: ${userId}`);
    const success = await gdocsService.handleAuthCallback(userId, code);
    console.log(`OAuth callback result: ${success ? 'success' : 'failed'}`);

    // Get the frontend URL from environment, or default to root
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    
    // Redirect back to the plugins page with a success parameter
    res.redirect(`${frontendUrl}/plugins?connection=gdocs&status=${success ? 'success' : 'error'}`);
  } catch (error) {
    console.error('Google Docs OAuth callback error:', error);
    // Redirect to plugins page with error parameter
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/plugins?connection=gdocs&status=error&message=${encodeURIComponent((error as Error).message)}`);
  }
};

export const checkAuthStatus: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      const error = new Error('User authentication required') as AppError;
      error.statusCode = 401;
      throw error;
    }

    console.log(`Checking Google Docs auth status for user: ${userId}`);
    const authUrl = await gdocsService.initializeGDocsAgent(userId);
    const isAuthorized = !authUrl;
    console.log(`Auth status result: ${isAuthorized ? 'authorized' : 'not authorized'}`);

    res.json({
      authorized: isAuthorized,
      authUrl: authUrl || null
    });
  } catch (error) {
    next(error);
  }
};

export const disconnectGoogleDocs: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      const error = new Error('User authentication required') as AppError;
      error.statusCode = 401;
      throw error;
    }

    console.log(`Disconnecting Google Docs for user: ${userId}`);
    
    const success = await gdocsService.disconnectGoogleDocs(userId);

    if (success) {
      console.log(`Successfully disconnected Google Docs for user: ${userId}`);
      res.json({
        success: true,
        message: 'Successfully disconnected from Google Docs'
      });
    } else {
      throw new Error('Failed to disconnect from Google Docs');
    }
  } catch (error) {
    console.error('Disconnect error:', error);
    next(error);
  }
};