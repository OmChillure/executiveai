import { Request, Response, NextFunction, RequestHandler } from 'express';
import { AppError } from '../middleware/error.middleware';
import * as gsheetsService from '../agents/gsheets.service';
import * as chatService from '../services/chat.service';

interface SheetsCommandRequest {
  command: string;
  aiModelId: string;
  sessionId?: string;
}

export const processSheetsCommand: RequestHandler = async (
  req: Request<{}, {}, SheetsCommandRequest>,
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

    // Process the sheets command
    const result = await gsheetsService.processGoogleSheetsRequest(
      command,
      aiModelId,
      userId
    );

    // If we're within a chat session, save the exchange
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
          // Add google sheets agent ID here if you have one in your database
        });
      } catch (error) {
        console.error('Error saving sheets command to chat history:', error);
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

    console.log(`Initiating Google Sheets auth for user: ${userId}`);
    const authUrl = await gsheetsService.initializeGSheetsAgent(userId);
    console.log(`Auth URL result: ${authUrl ? 'Need auth' : 'Already connected'}`);

    if (authUrl) {
      // Send the auth URL for the frontend to use
      res.json({ 
        success: true, 
        authRequired: true,
        authUrl,
        pluginType: 'gsheets',
        pluginName: 'Google Sheets'
      });
      return;
    }

    // Already authorized
    res.json({ 
      success: true, 
      authRequired: false,
      pluginType: 'gsheets',
      pluginName: 'Google Sheets',
      message: 'Already connected to Google Sheets' 
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

    console.log(`Processing Google Sheets OAuth callback for user: ${userId}`);
    const success = await gsheetsService.handleAuthCallback(userId, code);
    console.log(`OAuth callback result: ${success ? 'success' : 'failed'}`);

    // Get the frontend URL from environment, or default to root
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    
    // Redirect back to the plugins page with a success parameter
    res.redirect(`${frontendUrl}/plugins?connection=gsheets&status=${success ? 'success' : 'error'}`);
  } catch (error) {
    console.error('Google Sheets OAuth callback error:', error);
    // Redirect to plugins page with error parameter
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/plugins?connection=gsheets&status=error&message=${encodeURIComponent((error as Error).message)}`);
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

    console.log(`Checking Google Sheets auth status for user: ${userId}`);
    const authUrl = await gsheetsService.initializeGSheetsAgent(userId);
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

export const disconnectGoogleSheets: RequestHandler = async (
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

    console.log(`Disconnecting Google Sheets for user: ${userId}`);
    
    // Call the service function to disconnect
    const success = await gsheetsService.disconnectGoogleSheets(userId);

    if (success) {
      console.log(`Successfully disconnected Google Sheets for user: ${userId}`);
      res.json({
        success: true,
        message: 'Successfully disconnected from Google Sheets'
      });
    } else {
      throw new Error('Failed to disconnect from Google Sheets');
    }
  } catch (error) {
    console.error('Disconnect error:', error);
    next(error);
  }
};