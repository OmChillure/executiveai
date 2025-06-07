// services/ai-model.service.ts - Updated with streaming support
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import axios from 'axios';
import dotenv from 'dotenv';
import { db } from '../db';
import { aiModels, messages } from '../db/schema';
import { eq, desc } from 'drizzle-orm';

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn("GEMINI_API_KEY environment variable not set");
}

if (!PERPLEXITY_API_KEY) {
  console.warn("PERPLEXITY_API_KEY environment variable not set");
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || 'dummy_key');

export const getModelById = async (modelId: string) => {
  try {
    const model = await db.query.aiModels.findFirst({
      where: eq(aiModels.id, modelId)
    });
    
    return model;
  } catch (error) {
    console.error('Error fetching AI model:', error);
    throw new Error(`Failed to fetch AI model: ${(error as Error).message}`);
  }
};

export interface MessageContext {
  role: 'user' | 'ai' | 'system';
  content: string;
}

export interface StreamingResponse {
  content: string;
  model: string;
  provider: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export type StreamCallback = (chunk: string, isComplete?: boolean) => void;

// Streaming configuration
export interface StreamingConfig {
  characterDelay: number; 
  wordPause: number; 
  sentencePause: number; 
}

const DEFAULT_STREAMING_CONFIG: StreamingConfig = {
  characterDelay: 30,
  wordPause: 8,
  sentencePause: 100,
};

// Helper function to add smart delays
const addSmartDelay = async (char: string, config: StreamingConfig = DEFAULT_STREAMING_CONFIG) => {
  let delay = config.characterDelay;
  
  // Add extra delay after words (spaces)
  if (char === ' ') {
    delay += config.wordPause;
  }
  
  // Add extra delay after sentences
  if (['.', '!', '?', '\n'].includes(char)) {
    delay += config.sentencePause;
  }
  
  await new Promise(resolve => setTimeout(resolve, delay));
};

export const getChatHistory = async (
  sessionId: string,
  limit: number = 15
): Promise<MessageContext[]> => {
  try {
    const previousMessages = await db
      .select({
        role: messages.role,
        content: messages.content,
      })
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    return previousMessages.reverse();
  } catch (error) {
    console.error('Error fetching chat history:', error);
    return [];
  }
};

export const generateAIResponse = async (
  modelId: string, 
  prompt: string,
  systemPrompt?: string,
  sessionId?: string
) => {
  try {
    const model = await getModelById(modelId);
    
    if (!model) {
      throw new Error(`AI Model with ID ${modelId} not found`);
    }

    let conversationHistory: MessageContext[] = [];
    if (sessionId) {
      conversationHistory = await getChatHistory(sessionId);
    }

    if (model.provider.toLowerCase() === 'google') {
      return await generateGoogleResponse(model.modelId, prompt, systemPrompt, conversationHistory);
    } else if (model.provider.toLowerCase() === 'perplexity') {
      return await generatePerplexityResponse(model.modelId, prompt, systemPrompt, conversationHistory);
    } else {
      throw new Error(`Unsupported AI provider: ${model.provider}`);
    }
  } catch (error) {
    console.error('Error generating AI response:', error);
    throw new Error(`Failed to generate AI response: ${(error as Error).message}`);
  }
};

export const generateAIResponseStream = async (
  modelId: string,
  prompt: string,
  onChunk: StreamCallback,
  systemPrompt?: string,
  sessionId?: string,
  streamingConfig?: StreamingConfig
): Promise<StreamingResponse> => {
  try {
    const model = await getModelById(modelId);
    
    if (!model) {
      throw new Error(`AI Model with ID ${modelId} not found`);
    }

    let conversationHistory: MessageContext[] = [];
    if (sessionId) {
      conversationHistory = await getChatHistory(sessionId);
    }

    const config = streamingConfig || DEFAULT_STREAMING_CONFIG;

    if (model.provider.toLowerCase() === 'google') {
      return await generateGoogleResponseStream(model.modelId, prompt, onChunk, systemPrompt, conversationHistory, config);
    } else if (model.provider.toLowerCase() === 'perplexity') {
      return await generatePerplexityResponseStream(model.modelId, prompt, onChunk, systemPrompt, conversationHistory, config);
    } else {
      throw new Error(`Unsupported AI provider: ${model.provider}`);
    }
  } catch (error) {
    console.error('Error generating streaming AI response:', error);
    throw new Error(`Failed to generate streaming AI response: ${(error as Error).message}`);
  }
};

const generateGoogleResponse = async (
  modelId: string, 
  prompt: string,
  systemPrompt?: string,
  conversationHistory: MessageContext[] = []
) => {
  try {
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY environment variable not set");
    }
    
    const model = genAI.getGenerativeModel({ model: modelId });
    
    const historyContent = conversationHistory.map(msg => ({
      role: msg.role === 'ai' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));
    
    const contents = [
      ...historyContent,
      { role: 'user', parts: [{ text: prompt }] }
    ];
    
    const response = await model.generateContent({
      contents,
      generationConfig: {
        maxOutputTokens: 4000,
      },
      systemInstruction: systemPrompt || "You are a helpful, harmless, and honest AI assistant."
    });
    
    return {
      content: response.response.text(),
      model: modelId,
      provider: 'Google',
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    };
  } catch (error) {
    console.error('Error generating Google response:', error);
    throw new Error(`Failed to generate Google response: ${(error as Error).message}`);
  }
};

const generateGoogleResponseStream = async (
  modelId: string,
  prompt: string,
  onChunk: StreamCallback,
  systemPrompt?: string,
  conversationHistory: MessageContext[] = [],
  config: StreamingConfig = DEFAULT_STREAMING_CONFIG
): Promise<StreamingResponse> => {
  try {
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY environment variable not set");
    }
    
    const model = genAI.getGenerativeModel({ model: modelId });
    
    const historyContent = conversationHistory.map(msg => ({
      role: msg.role === 'ai' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));
    
    const contents = [
      ...historyContent,
      { role: 'user', parts: [{ text: prompt }] }
    ];
    
    const result = await model.generateContentStream({
      contents,
      generationConfig: {
        maxOutputTokens: 4000,
      },
      systemInstruction: systemPrompt || "You are a helpful, harmless, and honest AI assistant."
    });

    let fullContent = '';
    let wordBuffer = '';
    
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        fullContent += chunkText;
        wordBuffer += chunkText;
        
        // Stream character by character from the buffer
        while (wordBuffer.length > 0) {
          const char = wordBuffer.charAt(0);
          wordBuffer = wordBuffer.slice(1);
          
          onChunk(char, false);
          
          // Add smart delay based on character type
          await addSmartDelay(char, config);
        }
      }
    }
    
    // Send completion signal
    onChunk('', true);
    
    return {
      content: fullContent,
      model: modelId,
      provider: 'Google',
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    };
  } catch (error) {
    console.error('Error generating Google streaming response:', error);
    throw new Error(`Failed to generate Google streaming response: ${(error as Error).message}`);
  }
};

const generatePerplexityResponse = async (
  modelId: string, 
  prompt: string,
  systemPrompt?: string,
  conversationHistory: MessageContext[] = []
) => {
  try {
    if (!PERPLEXITY_API_KEY) {
      throw new Error("PERPLEXITY_API_KEY environment variable not set");
    }
    
    const shouldSearch = 
      prompt.toLowerCase().includes('search') || 
      prompt.toLowerCase().includes('find information') ||
      prompt.toLowerCase().includes('look up') || 
      prompt.toLowerCase().includes('latest') ||
      prompt.toLowerCase().includes('current') ||
      prompt.toLowerCase().includes('recent');
    
    const messages = [
      {
        role: 'system',
        content: systemPrompt || "You are a helpful assistant that provides accurate, factual information. For factual queries, search the web for the latest information."
      },
      ...conversationHistory.map(msg => ({
        role: msg.role === 'ai' ? 'assistant' : 'user',
        content: msg.content
      })),
      {
        role: 'user',
        content: prompt
      }
    ];
    
    const requestBody = {
      model: modelId, 
      messages,
      stream: false,
      options: {
        search: shouldSearch
      }
    };
    
    const response = await axios.post(
      'https://api.perplexity.ai/chat/completions',
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${PERPLEXITY_API_KEY}`
        }
      }
    );
    
    const content = response.data.choices[0]?.message?.content || '';
    const searchResults = response.data.choices[0]?.message?.search_results || [];

    let formattedContent = content;
    
    if (searchResults && searchResults.length > 0) {
      formattedContent += '\n\n**Sources:**\n';
      searchResults.forEach((result: any, index: number) => {
        formattedContent += `${index + 1}. [${result.title}](${result.url})\n`;
      });
    }
    
    return {
      content: formattedContent,
      model: modelId,
      provider: 'Perplexity',
      usage: {
        prompt_tokens: response.data.usage?.prompt_tokens || 0,
        completion_tokens: response.data.usage?.completion_tokens || 0,
        total_tokens: response.data.usage?.total_tokens || 0
      },
      searchResults: searchResults
    };
  } catch (error) {
    console.error('Error generating Perplexity response:', error);
    throw new Error(`Failed to generate Perplexity response: ${(error as Error).message}`);
  }
};

const generatePerplexityResponseStream = async (
  modelId: string,
  prompt: string,
  onChunk: StreamCallback,
  systemPrompt?: string,
  conversationHistory: MessageContext[] = [],
  config: StreamingConfig = DEFAULT_STREAMING_CONFIG
): Promise<StreamingResponse> => {
  try {
    if (!PERPLEXITY_API_KEY) {
      throw new Error("PERPLEXITY_API_KEY environment variable not set");
    }
    
    const shouldSearch = 
      prompt.toLowerCase().includes('search') || 
      prompt.toLowerCase().includes('find information') ||
      prompt.toLowerCase().includes('look up') || 
      prompt.toLowerCase().includes('latest') ||
      prompt.toLowerCase().includes('current') ||
      prompt.toLowerCase().includes('recent');
    
    const messages = [
      {
        role: 'system',
        content: systemPrompt || "You are a helpful assistant that provides accurate, factual information. For factual queries, search the web for the latest information."
      },
      ...conversationHistory.map(msg => ({
        role: msg.role === 'ai' ? 'assistant' : 'user',
        content: msg.content
      })),
      {
        role: 'user',
        content: prompt
      }
    ];
    
    const requestBody = {
      model: modelId,
      messages,
      stream: true,
      options: {
        search: shouldSearch
      }
    };
    
    const response = await axios.post(
      'https://api.perplexity.ai/chat/completions',
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
          'Accept': 'text/event-stream'
        },
        responseType: 'stream'
      }
    );

    let fullContent = '';
    let totalTokens = 0;
    let charBuffer = '';
    
    return new Promise((resolve, reject) => {
      response.data.on('data', async (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            
            if (data === '[DONE]') {
              // Stream any remaining characters
              while (charBuffer.length > 0) {
                const char = charBuffer.charAt(0);
                charBuffer = charBuffer.slice(1);
                onChunk(char, false);
                await addSmartDelay(char, config);
              }
              
              onChunk('', true);
              resolve({
                content: fullContent,
                model: modelId,
                provider: 'Perplexity',
                usage: {
                  prompt_tokens: 0,
                  completion_tokens: 0,
                  total_tokens: totalTokens
                }
              });
              return;
            }
            
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              
              if (delta) {
                fullContent += delta;
                charBuffer += delta;
                
                // Stream character by character from buffer
                while (charBuffer.length > 0) {
                  const char = charBuffer.charAt(0);
                  charBuffer = charBuffer.slice(1);
                  
                  onChunk(char, false);
                  
                  // Add smart delay based on character type
                  await addSmartDelay(char, config);
                }
              }
            } catch (parseError) {
              // Ignore parse errors for malformed chunks
            }
          }
        }
      });
      
      response.data.on('error', (error: Error) => {
        reject(new Error(`Perplexity streaming error: ${error.message}`));
      });
      
      response.data.on('end', () => {
        if (fullContent) {
          onChunk('', true);
          resolve({
            content: fullContent,
            model: modelId,
            provider: 'Perplexity',
            usage: {
              prompt_tokens: 0,
              completion_tokens: 0,
              total_tokens: totalTokens
            }
          });
        }
      });
    });
  } catch (error) {
    console.error('Error generating Perplexity streaming response:', error);
    throw new Error(`Failed to generate Perplexity streaming response: ${(error as Error).message}`);
  }
};