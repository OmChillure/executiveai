import { Request, Response, NextFunction, RequestHandler } from 'express';
import { AppError } from '../middleware/error.middleware';
import * as gdriveService from '../agents/gdrive.service';
import * as chatService from '../services/chat.service';

interface DriveCommandRequest {
  command: string;
  aiModelId: string;
  sessionId?: string;
}

interface ConfirmActionRequest {
  parsedCommand: gdriveService.ParsedDriveCommand;
  aiModelId: string;
  sessionId?: string;
}


export const processDriveCommand: RequestHandler = async (
  req: Request<{}, {}, DriveCommandRequest>,
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

    // Process the drive command
    const result = await gdriveService.processGDriveMessage(
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
          // You might need to add a gdrive agent ID here
        });
      } catch (error) {
        console.error('Error saving drive command to chat history:', error);
      }
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
};


export const confirmDriveAction: RequestHandler = async (
  req: Request<{}, {}, ConfirmActionRequest>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { parsedCommand, aiModelId, sessionId } = req.body;
    const userId = req.user?.userId;

    if (!parsedCommand) {
      const error = new Error('Parsed command is required') as AppError;
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

    // Execute the confirmed command
    const result = await gdriveService.processGDriveMessage(
      'Executing confirmed command',
      aiModelId,
      userId,
      true, // confirmed
      parsedCommand
    );

    // If we're within a chat session, save the response
    if (sessionId) {
      try {
        // Save the confirmation as user message
        await chatService.createUserMessage(
          sessionId,
          `Confirmed: ${parsedCommand.action.replace(/_/g, ' ')}`,
          aiModelId
        );

        // Save agent response
        await chatService.createMessage({
          sessionId,
          role: 'ai',
          content: result.content,
          aiModelId,
          // You might need to add a gdrive agent ID here
        });
      } catch (error) {
        console.error('Error saving drive command confirmation to chat history:', error);
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

    console.log(`Initiating auth for user: ${userId}`);
    const authUrl = await gdriveService.initializeGDriveAgent(userId);
    console.log(`Auth URL result: ${authUrl ? 'Need auth' : 'Already connected'}`);

    if (authUrl) {
      // Send the auth URL for the frontend to use
      res.json({ 
        success: true, 
        authRequired: true,
        authUrl,
        pluginType: 'gdrive',
        pluginName: 'Google Drive'
      });
      return;
    }

    // Already authorized
    res.json({ 
      success: true, 
      authRequired: false,
      pluginType: 'gdrive',
      pluginName: 'Google Drive',
      message: 'Already connected to Google Drive' 
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

    console.log(`Processing OAuth callback for user: ${userId}`);
    const success = await gdriveService.handleAuthCallback(userId, code);
    console.log(`OAuth callback result: ${success ? 'success' : 'failed'}`);

    // Get the frontend URL from environment, or default to root
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    
    // Redirect back to the plugins page with a success parameter
    res.redirect(`${frontendUrl}/plugins?connection=gdrive&status=${success ? 'success' : 'error'}`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    // Redirect to plugins page with error parameter
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/plugins?connection=gdrive&status=error&message=${encodeURIComponent((error as Error).message)}`);
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

    console.log(`Checking auth status for user: ${userId}`);
    const authUrl = await gdriveService.initializeGDriveAgent(userId);
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


export const disconnectGoogleDrive: RequestHandler = async (
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

    console.log(`Disconnecting Google Drive for user: ${userId}`);
    
    // Call the service function to disconnect
    const success = await gdriveService.disconnectGoogleDrive(userId);

    if (success) {
      console.log(`Successfully disconnected Google Drive for user: ${userId}`);
      res.json({
        success: true,
        message: 'Successfully disconnected from Google Drive'
      });
    } else {
      throw new Error('Failed to disconnect from Google Drive');
    }
  } catch (error) {
    console.error('Disconnect error:', error);
    next(error);
  }
};