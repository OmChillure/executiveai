import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { chatSessions, messages } from '../db/schema';
import * as aiModelService from './ai-model.service';
import * as agentService from './agent.service';
import { thinkingProcessService, ThinkingStep } from './tools.service';
import { fileUploadService } from './fileProcessing.service';

interface CreateMessageParams {
  sessionId: string;
  role: 'user' | 'ai';
  content: string;
  aiModelId: string;
  aiAgentId?: string;
}

interface AIResponseResult {
  userMessage: any;
  message: any;
  metadata: Record<string, any>;
}

interface ThinkingProcessResult extends AIResponseResult {
}

// Streaming callback types
export type StreamCallback = (chunk: string, isComplete?: boolean) => void;

export const createMessage = async (params: CreateMessageParams) => {
  try {
    const session = await getSession(params.sessionId);
    if (!session) {
      throw new Error(`Chat session ${params.sessionId} not found`);
    }

    console.log(`Creating ${params.role} message for session:`, params.sessionId);
    
    if (params.aiAgentId) {
      const agentExists = await agentService.validateAgentExists(params.aiAgentId);
      if (!agentExists) {
        console.warn(`Agent ${params.aiAgentId} not found in database, setting to null`);
        params.aiAgentId = undefined; 
      }
    }

    const message = await db.insert(messages).values({
      sessionId: params.sessionId,
      role: params.role,
      content: params.content,
      aiModelId: params.aiModelId,
      aiAgentId: params.aiAgentId || null 
    }).returning();

    if (!message || message.length === 0) {
      throw new Error('Failed to create message');
    }

    console.log('Message created successfully:', {
      id: message[0].id,
      role: params.role,
      agentId: params.aiAgentId || 'none',
      contentLength: params.content.length
    });
    
    return message[0];
  } catch (error) {
    console.error('Error creating message:', error);
    throw error;
  }
};

export const createUserMessage = async (
  sessionId: string,
  content: string,
  aiModelId: string,
  aiAgentId?: string
) => {
  return createMessage({
    sessionId,
    role: 'user',
    content,
    aiModelId,
    aiAgentId
  });
};

export const createSession = async (userId: string, sessionId?: string, title?: string) => {
  try {
    const finalSessionId = sessionId || crypto.randomUUID();
    console.log('Creating chat session:', { sessionId: finalSessionId, userId, title });
    
    const session = await db.insert(chatSessions).values({
      id: finalSessionId,
      userId,
      title: title || 'New Chat'
    }).returning();

    if (!session || session.length === 0) {
      throw new Error('Failed to create chat session');
    }

    console.log('Chat session created successfully:', session[0].id);
    return session[0];
  } catch (error) {
    console.error('Error creating chat session:', error);
    throw new Error(`Failed to create chat session: ${(error as Error).message}`);
  }
};

export const getSession = async (id: string) => {
  try {
    console.log('Fetching session:', id);
    const session = await db.query.chatSessions.findFirst({
      where: eq(chatSessions.id, id),
      with: {
        messages: {
          orderBy: (messages, { asc }) => [asc(messages.createdAt)]
        }
      }
    });

    if (session) {
      console.log(`Session found: ${session.id} with ${session.messages?.length || 0} messages`);
    } else {
      console.log('Session not found:', id);
    }
    
    return session;
  } catch (error) {
    console.error('Error getting chat session:', error);
    return null;
  }
};

export const getSessions = async (userId: string) => {
  try {
    console.log('Fetching sessions for user:', userId);
    const sessions = await db.query.chatSessions.findMany({
      where: eq(chatSessions.userId, userId),
      orderBy: (chatSessions, { desc }) => [desc(chatSessions.updatedAt)],
      with: {
        messages: {
          orderBy: (messages, { asc }) => [asc(messages.createdAt)]
        }
      }
    });
    
    console.log(`Found ${sessions.length} sessions for user ${userId}`);
    return sessions;
  } catch (error) {
    console.error('Error fetching chat sessions:', error);
    throw new Error(`Failed to fetch chat sessions: ${(error as Error).message}`);
  }
};

export const deleteSession = async (id: string) => {
  try {
    console.log('Deleting session:', id);
    await db.delete(chatSessions).where(eq(chatSessions.id, id));
    console.log('Session deleted successfully:', id);
  } catch (error) {
    console.error('Error deleting chat session:', error);
    throw new Error(`Failed to delete chat session: ${(error as Error).message}`);
  }
};

// Helper functions for handling different response strategies
async function handleSimpleResponse(
  message: string, 
  modelId: string, 
  sessionId: string, 
  sessionFiles: any[]
): Promise<string> {
  console.log('🚀 Processing simple response (fast path)...');
  
  const systemPrompt = sessionFiles.length > 0 
    ? "You are a helpful AI assistant. The user has uploaded files which are included in the context. Analyze and respond to their query considering the uploaded content."
    : "You are a helpful AI assistant that provides clear, accurate, and thoughtful responses to user questions and requests.";
    
  const startTime = Date.now();
  const aiResponse = await aiModelService.generateAIResponse(
    modelId,
    message,
    systemPrompt,
    sessionId
  );
  
  const duration = Date.now() - startTime;
  console.log(`✅ Simple response completed in ${duration}ms`);

  return aiResponse.content;
}

async function handleSimpleResponseStream(
  message: string,
  modelId: string,
  sessionId: string,
  sessionFiles: any[],
  onChunk: StreamCallback,
  streamingSpeed: 'slow' | 'normal' | 'fast' = 'normal'
): Promise<{ content: string; metadata: Record<string, any> }> {
  console.log('🚀 Processing simple response with streaming...');
  
  const systemPrompt = sessionFiles.length > 0 
    ? "You are a helpful AI assistant. The user has uploaded files which are included in the context. Analyze and respond to their query considering the uploaded content."
    : "You are a helpful AI assistant that provides clear, accurate, and thoughtful responses to user questions and requests.";
    
  const startTime = Date.now();
  
  const streamingConfig = {
    slow: { characterDelay: 60, wordPause: 20, sentencePause: 200 },
    normal: { characterDelay: 30, wordPause: 10, sentencePause: 100 },
    fast: { characterDelay: 15, wordPause: 5, sentencePause: 50 }
  }[streamingSpeed];
  
  const streamingResponse = await aiModelService.generateAIResponseStream(
    modelId,
    message,
    onChunk,
    systemPrompt,
    sessionId,
    streamingConfig
  );
  
  const duration = Date.now() - startTime;
  console.log(`✅ Simple streaming response completed in ${duration}ms`);

  return {
    content: streamingResponse.content,
    metadata: {
      strategy: 'simple_stream',
      provider: streamingResponse.provider,
      model: streamingResponse.model,
      usage: streamingResponse.usage,
      filesProcessed: sessionFiles.length,
      streamingSpeed,
      duration
    }
  };
}

// Single agent response (non-streaming)
async function handleSingleAgentResponse(
  message: string,
  agentId: string,
  modelId: string,
  sessionId: string,
  userId: string,
  sessionFiles: any[]
): Promise<{ content: string; metadata: Record<string, any>; primaryAgentId: string | null }> {
  console.log(`🤖 Processing single agent response with: ${agentId}`);
  
  const startTime = Date.now();
  
  try {
    const agentResponse = await agentService.processAgentMessage(
      message,
      {
        modelId,
        agentId,
        sessionId,
        userId 
      }
    );
    
    const duration = Date.now() - startTime;
    
    if (agentResponse.error) {
      console.warn(`❌ Agent ${agentId} failed (${duration}ms), falling back to simple response:`, agentResponse.error);
      const fallbackContent = await handleSimpleResponse(message, modelId, sessionId, sessionFiles);
      return {
        content: fallbackContent,
        metadata: {
          strategy: 'simple_fallback',
          originalStrategy: 'single_agent',
          agentError: agentResponse.error,
          filesProcessed: sessionFiles.length,
          duration
        },
        primaryAgentId: null
      };
    }
    
    console.log(`✅ Agent ${agentId} completed successfully in ${duration}ms`);
    return {
      content: agentResponse.content,
      metadata: {
        strategy: 'single_agent',
        agentUsed: agentId,
        agentMetadata: agentResponse.metadata,
        filesProcessed: sessionFiles.length,
        duration
      },
      primaryAgentId: agentId
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Agent ${agentId} error (${duration}ms):`, error);
    
    const fallbackContent = await handleSimpleResponse(message, modelId, sessionId, sessionFiles);
    return {
      content: fallbackContent,
      metadata: {
        strategy: 'simple_fallback',
        originalStrategy: 'single_agent',
        agentError: (error as Error).message,
        filesProcessed: sessionFiles.length,
        duration
      },
      primaryAgentId: null
    };
  }
}

// NEW: Single agent response with streaming
async function handleSingleAgentResponseStream(
  message: string,
  agentId: string,
  modelId: string,
  sessionId: string,
  userId: string,
  sessionFiles: any[],
  onChunk: StreamCallback,
  streamingSpeed: 'slow' | 'normal' | 'fast' = 'normal'
): Promise<{ content: string; metadata: Record<string, any>; primaryAgentId: string | null }> {
  console.log(`🌊🤖 Processing single agent response with streaming: ${agentId}`);
  
  const startTime = Date.now();
  
  try {
    const agentResponse = await agentService.processAgentMessageStream(
      message,
      {
        modelId,
        agentId,
        sessionId,
        userId 
      },
      onChunk,
      streamingSpeed
    );
    
    const duration = Date.now() - startTime;
    
    if (agentResponse.error) {
      console.warn(`❌ Agent ${agentId} streaming failed (${duration}ms):`, agentResponse.error);
      return {
        content: agentResponse.content,
        metadata: {
          strategy: 'agent_stream_error',
          originalStrategy: 'single_agent_stream',
          agentError: agentResponse.error,
          filesProcessed: sessionFiles.length,
          duration,
          streamingSpeed
        },
        primaryAgentId: null
      };
    }
    
    console.log(`✅ Agent ${agentId} streaming completed successfully in ${duration}ms`);
    return {
      content: agentResponse.content,
      metadata: {
        strategy: 'single_agent_stream',
        agentUsed: agentId,
        agentMetadata: agentResponse.metadata,
        filesProcessed: sessionFiles.length,
        duration,
        streamingSpeed
      },
      primaryAgentId: agentId
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Agent ${agentId} streaming error (${duration}ms):`, error);
    
    // Fallback to simple streaming
    console.log('🔄 Falling back to simple streaming response...');
    const fallbackResult = await handleSimpleResponseStream(
      message, 
      modelId, 
      sessionId, 
      sessionFiles, 
      onChunk, 
      streamingSpeed
    );
    
    return {
      content: fallbackResult.content,
      metadata: {
        ...fallbackResult.metadata,
        strategy: 'simple_stream_fallback',
        originalStrategy: 'single_agent_stream',
        agentError: (error as Error).message,
        duration
      },
      primaryAgentId: null
    };
  }
}

// Non-streaming AI response (existing functionality)
export const createAIResponse = async (
  sessionId: string,
  userMessageContent: string,
  aiModelId: string,
  userId: string 
): Promise<AIResponseResult> => {
  const overallStartTime = Date.now();
  
  try {
    console.log('🧠 STARTING AI RESPONSE CREATION');
    console.log('📝 Session:', sessionId);
    console.log('👤 User:', userId);

    const session = await getSession(sessionId);
    if (!session) {
      throw new Error(`Chat session ${sessionId} not found`);
    }

    const fileContext = fileUploadService.prepareFilesForAI(sessionId);
    const fullUserMessage = userMessageContent + fileContext;
    const sessionFiles = fileUploadService.getSessionFiles(sessionId);

    const userMessage = await createUserMessage(
      sessionId,
      userMessageContent,
      aiModelId
    );

    const strategy = await agentService.determineResponseStrategy(
      fullUserMessage, 
      aiModelId, 
      userId
    );
    
    let responseContent: string;
    let metadata: Record<string, any> = {};
    let primaryAgentId: string | null = null;

    switch (strategy.strategy) {
      case 'simple':
        responseContent = await handleSimpleResponse(fullUserMessage, aiModelId, sessionId, sessionFiles);
        metadata = {
          strategy: 'simple',
          reasoning: strategy.reasoning,
          filesProcessed: sessionFiles.length
        };
        break;

      case 'single_agent':
        const agentResult = await handleSingleAgentResponse(
          fullUserMessage,
          strategy.agentId!,
          aiModelId,
          sessionId,
          userId,
          sessionFiles
        );
        responseContent = agentResult.content;
        metadata = { ...agentResult.metadata, reasoning: strategy.reasoning };
        primaryAgentId = agentResult.primaryAgentId;
        break;

      default:
        responseContent = await handleSimpleResponse(fullUserMessage, aiModelId, sessionId, sessionFiles);
        metadata = {
          strategy: 'simple_fallback',
          originalStrategy: strategy.strategy,
          reasoning: strategy.reasoning,
          filesProcessed: sessionFiles.length
        };
    }

    const aiMessage = await createMessage({
      sessionId,
      role: 'ai',
      content: responseContent,
      aiModelId,
      aiAgentId: primaryAgentId || undefined
    });

    await db.update(chatSessions)
      .set({ updatedAt: new Date() })
      .where(eq(chatSessions.id, sessionId));

    const overallDuration = Date.now() - overallStartTime;
  
    return {
      userMessage,
      message: aiMessage,
      metadata: {
        ...metadata,
        overallDuration,
        sessionFiles: sessionFiles.map(f => ({
          id: f.id,
          name: f.originalName,
          type: f.type,
          size: f.size
        }))
      }
    };

  } catch (error) {
    console.error('Error in AI response creation:', error);
    throw error;
  }
};

// UPDATED: Streaming AI response with agent support
export const createAIResponseStream = async (
  sessionId: string,
  userMessageContent: string,
  aiModelId: string,
  userId: string,
  onChunk: StreamCallback,
  streamingSpeed: 'slow' | 'normal' | 'fast' = 'normal'
): Promise<AIResponseResult> => {
  const overallStartTime = Date.now();
  
  try {
    console.log('🌊 STARTING STREAMING AI RESPONSE CREATION');
    console.log('📝 Session:', sessionId);
    console.log('👤 User:', userId);
    console.log('🎛️  Streaming Speed:', streamingSpeed);

    const session = await getSession(sessionId);
    if (!session) {
      throw new Error(`Chat session ${sessionId} not found`);
    }

    const fileContext = fileUploadService.prepareFilesForAI(sessionId);
    const fullUserMessage = userMessageContent + fileContext;
    const sessionFiles = fileUploadService.getSessionFiles(sessionId);

    const userMessage = await createUserMessage(
      sessionId,
      userMessageContent,
      aiModelId
    );

    const strategy = await agentService.determineResponseStrategy(
      fullUserMessage, 
      aiModelId, 
      userId
    );
    
    console.log(`Strategy: ${strategy.strategy}`);
    
    let responseContent: string;
    let metadata: Record<string, any> = {};
    let primaryAgentId: string | null = null;

    // ALL strategies now support streaming!
    switch (strategy.strategy) {
      case 'simple':
        console.log('🌊 EXECUTING SIMPLE STREAMING');
        const streamResult = await handleSimpleResponseStream(
          fullUserMessage, 
          aiModelId, 
          sessionId, 
          sessionFiles,
          onChunk,
          streamingSpeed
        );
        responseContent = streamResult.content;
        metadata = { 
          ...streamResult.metadata, 
          reasoning: strategy.reasoning
        };
        break;

      case 'single_agent':
        console.log('🌊🤖 EXECUTING AGENT STREAMING');
        const agentResult = await handleSingleAgentResponseStream(
          fullUserMessage,
          strategy.agentId!,
          aiModelId,
          sessionId,
          userId,
          sessionFiles,
          onChunk,
          streamingSpeed
        );
        responseContent = agentResult.content;
        metadata = { ...agentResult.metadata, reasoning: strategy.reasoning };
        primaryAgentId = agentResult.primaryAgentId;
        break;

      default:
        console.log('🚨 FALLBACK TO SIMPLE STREAMING');
        const fallbackResult = await handleSimpleResponseStream(
          fullUserMessage, 
          aiModelId, 
          sessionId, 
          sessionFiles,
          onChunk,
          streamingSpeed
        );
        responseContent = fallbackResult.content;
        metadata = {
          ...fallbackResult.metadata,
          strategy: 'simple_stream_fallback',
          originalStrategy: strategy.strategy,
          reasoning: strategy.reasoning
        };
    }

    const aiMessage = await createMessage({
      sessionId,
      role: 'ai',
      content: responseContent,
      aiModelId,
      aiAgentId: primaryAgentId || undefined
    });

    await db.update(chatSessions)
      .set({ updatedAt: new Date() })
      .where(eq(chatSessions.id, sessionId));

    const overallDuration = Date.now() - overallStartTime;
  
    return {
      userMessage,
      message: aiMessage,
      metadata: {
        ...metadata,
        overallDuration,
        streaming: true,
        sessionFiles: sessionFiles.map(f => ({
          id: f.id,
          name: f.originalName,
          type: f.type,
          size: f.size
        }))
      }
    };

  } catch (error) {
    console.error('❌🌊 ERROR IN STREAMING AI RESPONSE CREATION:', error);
    throw error;
  }
};

// Enhanced thinking process with streaming support
export const createAIResponseWithThinking = async (
  sessionId: string,
  userMessageContent: string,
  aiModelId: string,
  userId: string,
  onThinkingUpdate?: (step: ThinkingStep) => void
): Promise<ThinkingProcessResult> => {
  const overallStartTime = Date.now();
  
  try {
    thinkingProcessService.createSession(sessionId);
    if (onThinkingUpdate) {
      thinkingProcessService.on(`update:${sessionId}`, onThinkingUpdate);
    }

    const session = await getSession(sessionId);
    if (!session) {
      throw new Error(`Chat session ${sessionId} not found`);
    }

    const fileContext = fileUploadService.prepareFilesForAI(sessionId);
    const fullUserMessage = userMessageContent + fileContext;
    const sessionFiles = fileUploadService.getSessionFiles(sessionId);

    if (sessionFiles.length > 0) {
      thinkingProcessService.addStep(sessionId, {
        id: 'file_analysis',
        type: 'intent_analysis',
        title: 'Analyzing Uploaded Files',
        description: `Processing ${sessionFiles.length} uploaded file(s)...`,
        status: 'in_progress'
      });

      const fileTypes = sessionFiles.map(f => f.type).join(', ');
      const totalSize = sessionFiles.reduce((sum, f) => sum + f.size, 0);

      thinkingProcessService.updateStep(sessionId, 'file_analysis', {
        status: 'completed',
        description: `Analyzed ${sessionFiles.length} files (${fileTypes}) - ${(totalSize / 1024).toFixed(1)} KB total`,
        metadata: {
          fileCount: sessionFiles.length,
          fileTypes: sessionFiles.map(f => ({ name: f.originalName, type: f.type })),
          totalSize
        }
      });
    }

    const userMessage = await createUserMessage(
      sessionId,
      userMessageContent,
      aiModelId
    );
    
    thinkingProcessService.addStep(sessionId, {
      id: 'intent_analysis',
      type: 'intent_analysis',
      title: 'Analyzing Intent',
      description: 'Understanding what you want to accomplish...',
      status: 'in_progress'
    });

    const strategy = await agentService.determineResponseStrategy(
      fullUserMessage,
      aiModelId,
      userId
    );

    thinkingProcessService.updateStep(sessionId, 'intent_analysis', {
      status: 'completed',
      description: `Strategy: ${strategy.strategy}`,
      metadata: {
        strategy: strategy.strategy,
        reasoning: strategy.reasoning,
        agentId: strategy.agentId,
        hasFiles: sessionFiles.length > 0
      }
    });

    let executionTitle = 'Processing Request';
    let executionDescription = 'Generating response...';
    
    if (strategy.strategy === 'single_agent') {
      const agent = await agentService.getAgentById(strategy.agentId!);
      executionTitle = `${agent?.name || 'Agent'} Processing`;
      executionDescription = `Using ${agent?.name || 'specialized agent'} to process your request...`;
    }

    thinkingProcessService.addStep(sessionId, {
      id: 'execution',
      type: 'agent_execution',
      title: executionTitle,
      description: executionDescription,
      status: 'in_progress'
    });

    let responseContent: string;
    let metadata: Record<string, any> = {};
    let primaryAgentId: string | null = null;

    switch (strategy.strategy) {
      case 'simple':
        responseContent = await handleSimpleResponse(fullUserMessage, aiModelId, sessionId, sessionFiles);
        metadata = { 
          strategy: 'simple', 
          filesProcessed: sessionFiles.length
        };
        break;

      case 'single_agent':
        const agentResult = await handleSingleAgentResponse(
          fullUserMessage,
          strategy.agentId!,
          aiModelId,
          sessionId,
          userId,
          sessionFiles
        );
        responseContent = agentResult.content;
        metadata = agentResult.metadata;
        primaryAgentId = agentResult.primaryAgentId;
        break;

      default:
        responseContent = await handleSimpleResponse(fullUserMessage, aiModelId, sessionId, sessionFiles);
        metadata = { 
          strategy: 'simple_fallback'
        };
    }

    thinkingProcessService.updateStep(sessionId, 'execution', {
      status: 'completed',
      description: `${executionTitle} completed successfully`,
      metadata: {
        responseLength: responseContent.length,
        strategy: strategy.strategy,
        agentUsed: primaryAgentId
      }
    });
    
    thinkingProcessService.addStep(sessionId, {
      id: 'response_finalization',
      type: 'response_generation',
      title: 'Finalizing Response',
      description: 'Preparing final response...',
      status: 'in_progress'
    });

    const aiMessage = await createMessage({
      sessionId,
      role: 'ai',
      content: responseContent,
      aiModelId,
      aiAgentId: primaryAgentId || undefined
    });

    await db.update(chatSessions)
      .set({ updatedAt: new Date() })
      .where(eq(chatSessions.id, sessionId));

    const overallDuration = Date.now() - overallStartTime;

    thinkingProcessService.updateStep(sessionId, 'response_finalization', {
      status: 'completed',
      description: 'Response ready for delivery',
      metadata: {
        responseLength: responseContent.length,
        wordsCount: responseContent.split(' ').length,
        filesIncluded: sessionFiles.length,
        totalDuration: overallDuration
      }
    });

    setTimeout(() => {
      thinkingProcessService.clearSession(sessionId);
    }, 2000);

    return {
      userMessage,
      message: aiMessage,
      metadata: {
        ...metadata,
        overallDuration,
        withThinking: true,
        sessionFiles: sessionFiles.map(f => ({
          id: f.id,
          name: f.originalName,
          type: f.type,
          size: f.size
        }))
      }
    };

  } catch (error) {
    console.error('❌💭 ERROR IN AI RESPONSE WITH THINKING:', error);

    const steps = thinkingProcessService.getSteps(sessionId);
    steps.forEach(step => {
      if (step.status === 'in_progress') {
        thinkingProcessService.updateStep(sessionId, step.id, {
          status: 'error',
          description: `Error: ${(error as Error).message}`
        });
      }
    });
    
    throw error;
  }
};

export const createFileAnalysisMessage = async (
  sessionId: string,
  fileId: string,
  analysisPrompt: string,
  aiModelId: string,
  userId: string
): Promise<AIResponseResult> => {
  try {
    console.log('📄 Creating file-specific analysis...');
    
    const file = fileUploadService.getFile(sessionId, fileId);
    if (!file) {
      throw new Error(`File ${fileId} not found in session ${sessionId}`);
    }

    let fileContext = `\n\n--- SPECIFIC FILE ANALYSIS ---\n`;
    fileContext += `File: ${file.originalName}\n`;
    fileContext += `Type: ${file.type}\n`;
    fileContext += `Size: ${(file.size / 1024).toFixed(1)} KB\n`;
    
    if (file.processingError) {
      fileContext += `Processing Error: ${file.processingError}\n`;
    } else if (file.content) {
      fileContext += `Content:\n${file.content}\n`;
    }
    
    fileContext += '--- END FILE ANALYSIS ---\n';

    const fullPrompt = analysisPrompt + fileContext;

    return await createAIResponse(sessionId, fullPrompt, aiModelId, userId);
  } catch (error) {
    console.error('Error creating file analysis:', error);
    throw error;
  }
};

export const getMessageHistoryWithAgents = async (sessionId: string) => {
  try {
    const session = await getSession(sessionId);
    if (!session) return null;

    const messagesWithAgents = await Promise.all(
      session.messages.map(async (message) => {
        if (message.aiAgentId) {
          const agent = await agentService.getAgentById(message.aiAgentId);
          return {
            ...message,
            agent: agent ? {
              id: agent.id,
              name: agent.name,
              type: agent.type
            } : null
          };
        }
        return message;
      })
    );

    return {
      ...session,
      messages: messagesWithAgents
    };
  } catch (error) {
    console.error('Error fetching message history with agents:', error);
    throw error;
  }
};

export const getSessionMetrics = async (sessionId: string) => {
  try {
    const session = await getSession(sessionId);
    if (!session) return null;

    const messages = session.messages || [];
    const aiMessages = messages.filter(m => m.role === 'ai');
    const userMessages = messages.filter(m => m.role === 'user');
    
    const agentUsage: Record<string, number> = {};
    aiMessages.forEach(msg => {
      if (msg.aiAgentId) {
        agentUsage[msg.aiAgentId] = (agentUsage[msg.aiAgentId] || 0) + 1;
      } else {
        agentUsage['general_ai'] = (agentUsage['general_ai'] || 0) + 1;
      }
    });

    return {
      sessionId,
      totalMessages: messages.length,
      userMessages: userMessages.length,
      aiMessages: aiMessages.length,
      agentUsage,
      firstMessage: messages[0]?.createdAt,
      lastMessage: messages[messages.length - 1]?.createdAt,
      sessionFiles: fileUploadService.getSessionFiles(sessionId).length
    };
  } catch (error) {
    console.error('Error getting session metrics:', error);
    return null;
  }
};