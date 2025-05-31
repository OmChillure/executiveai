import { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/error.middleware';
import * as chatService from '../services/chat.service';
import { thinkingProcessService, ThinkingStep } from '../services/tools.service';


interface CreateChatSessionRequest {
  title?: string;
  userId: string;
  id?: string;
}

interface SendMessageRequest {
  content: string;
  aiModelId: string;
}

interface FileAnalysisRequest {
  fileId: string;
  analysisPrompt: string;
  aiModelId: string;
}


export const createChatSession = async (
  req: Request<{}, {}, CreateChatSessionRequest>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { title, userId, id } = req.body;

    if (!userId) {
      const error = new Error('userId is required') as AppError;
      error.statusCode = 400;
      throw error;
    }

    const session = await chatService.createSession(userId, id, title);
    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
};

export const getChatSessions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      const error = new Error('User not authenticated') as AppError;
      error.statusCode = 401;
      throw error;
    }

    const sessions = await chatService.getSessions(userId);
    res.json({ data: sessions });
  } catch (error) {
    next(error);
  }
};

export const getChatSession = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const session = await chatService.getMessageHistoryWithAgents(id);

    if (!session) {
      const error = new Error('Chat session not found') as AppError;
      error.statusCode = 404;
      throw error;
    }

    res.json(session);
  } catch (error) {
    next(error);
  }
};

export const deleteChatSession = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    await chatService.deleteSession(id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const sendMessage = async (
  req: Request<{ id: string }, {}, SendMessageRequest>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id: sessionId } = req.params;
    const { content, aiModelId } = req.body;
    const userId = req.user?.userId;

    if (!content) {
      const error = new Error('Message content is required') as AppError;
      error.statusCode = 400;
      throw error;
    }

    if (!aiModelId) {
      const error = new Error('AI model ID is required') as AppError;
      error.statusCode = 400;
      throw error;
    }

    if (!userId) {
      const error = new Error('User ID is required') as AppError;
      error.statusCode = 401;
      throw error;
    }

    let session = await chatService.getSession(sessionId);
    
    if (!session) {
      try {
        console.log('Creating new session for ID:', sessionId);
        session = { ...(await chatService.createSession(userId, sessionId, content.slice(0, 30))), messages: [] };
        console.log('Created new session:', session);
      } catch (error) {
        console.error('Error creating session:', error);
        throw error;
      }
    }

    try {
      const aiResponse = await chatService.createAIResponse(
        sessionId,
        content,
        aiModelId,
        userId
      );

      res.json({
        userMessage: aiResponse.userMessage,
        aiResponse: aiResponse.message,
        modelInfo: aiResponse.metadata
      });
    } catch (error) {
      console.error('Error creating AI response:', error);
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

export const sendMessageWithThinking = async (
  req: Request<{ id: string }, {}, SendMessageRequest>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id: sessionId } = req.params;
    const { content, aiModelId } = req.body;
    const userId = req.user?.userId;

    if (!content || !aiModelId || !userId) {
      const error = new Error('Missing required fields') as AppError;
      error.statusCode = 400;
      throw error;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control, Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });

    res.write('data: {"type": "connected"}\n\n');

    let session = await chatService.getSession(sessionId);
    
    if (!session) {
      session = { ...(await chatService.createSession(userId, sessionId, content.slice(0, 30))), messages: [] };
    }

    const onThinkingUpdate = (step: ThinkingStep) => {
      try {
        res.write(`data: ${JSON.stringify({ type: 'thinking_step', step })}\n\n`);
      } catch (error) {
        console.error('Error writing thinking step:', error);
      }
    };

    try {
      const aiResponse = await chatService.createAIResponseWithThinking(
        sessionId,
        content,
        aiModelId,
        userId,
        onThinkingUpdate
      );

      // Send final response
      res.write(`data: ${JSON.stringify({ 
        type: 'final_response',
        userMessage: aiResponse.userMessage,
        aiResponse: aiResponse.message,
        modelInfo: aiResponse.metadata
      })}\n\n`);

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      console.error('Error in AI response generation:', error);
      res.write(`data: ${JSON.stringify({ 
        type: 'error',
        error: (error as Error).message
      })}\n\n`);
      res.end();
    }
  } catch (error) {
    console.error('Error in sendMessageWithThinking:', error);
    
    if (!res.headersSent) {
      next(error);
    } else {
      try {
        res.write(`data: ${JSON.stringify({ 
          type: 'error',
          error: (error as Error).message
        })}\n\n`);
        res.end();
      } catch (writeError) {
        console.error('Error writing SSE error:', writeError);
        res.end();
      }
    }
  }
};


export const analyzeFile = async (
  req: Request<{ id: string }, {}, FileAnalysisRequest>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id: sessionId } = req.params;
    const { fileId, analysisPrompt, aiModelId } = req.body;
    const userId = req.user?.userId;

    if (!fileId || !analysisPrompt || !aiModelId || !userId) {
      const error = new Error('Missing required fields') as AppError;
      error.statusCode = 400;
      throw error;
    }

    const aiResponse = await chatService.createFileAnalysisMessage(
      sessionId,
      fileId,
      analysisPrompt,
      aiModelId,
      userId
    );

    res.json({
      userMessage: aiResponse.userMessage,
      aiResponse: aiResponse.message,
      modelInfo: aiResponse.metadata
    });
  } catch (error) {
    next(error);
  }
};