import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
// import { AnthropicAI } from '@anthropic-ai/sdk';
import axios from 'axios';
import dotenv from 'dotenv';
import { db } from '../db';
import { aiModels, messages } from '../db/schema';
import { eq, desc } from 'drizzle-orm';

dotenv.config();

// const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

// if (!ANTHROPIC_API_KEY) {
//   console.warn("ANTHROPIC_API_KEY environment variable not set");
// }

if (!GEMINI_API_KEY) {
  console.warn("GEMINI_API_KEY environment variable not set");
}

// if (!OPENAI_API_KEY) {
//   console.warn("OPENAI_API_KEY environment variable not set");
// }

if (!PERPLEXITY_API_KEY) {
  console.warn("PERPLEXITY_API_KEY environment variable not set");
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || 'dummy_key');

// // Initialize OpenAI client
// const openai = new OpenAI({
//   apiKey: OPENAI_API_KEY || 'dummy_key'
// });

// Initialize Anthropic client
// const anthropic = new AnthropicAI({
//   apiKey: ANTHROPIC_API_KEY || 'dummy_key'
// });

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

// Interface for message context
export interface MessageContext {
  role: 'user' | 'ai' | 'system';
  content: string;
}

/**
 * Get the last N messages from a chat session for context
 */
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

// const generateOpenAIResponse = async (
//   modelId: string, 
//   prompt: string,
//   systemPrompt?: string,
//   conversationHistory: MessageContext[] = []
// ) => {
//   try {
//     if (!OPENAI_API_KEY) {
//       throw new Error("OPENAI_API_KEY environment variable not set");
//     }
    
//      const messages: OpenAI.ChatCompletionMessageParam[] = [
//       {
//         role: 'system',
//         content: systemPrompt || "You are a helpful, harmless, and honest AI assistant."
//       },
//       ...conversationHistory.map(msg => ({
//         role: msg.role === 'ai' ? 'assistant' as const : 'user' as const,
//         content: msg.content
//       })),
//       {
//         role: 'user',
//         content: prompt
//       }
//     ];
    
    
//     // Create the chat completion
//     const response = await openai.chat.completions.create({
//       model: modelId,
//       messages,
//       max_tokens: 4000
//     });

//     const content = response.choices[0]?.message?.content || '';
    
//     return {
//       content,
//       model: modelId,
//       provider: 'OpenAI',
//       usage: {
//         prompt_tokens: response.usage?.prompt_tokens || 0,
//         completion_tokens: response.usage?.completion_tokens || 0,
//         total_tokens: response.usage?.total_tokens || 0
//       }
//     };
//   } catch (error) {
//     console.error('Error generating OpenAI response:', error);
//     throw new Error(`Failed to generate OpenAI response: ${(error as Error).message}`);
//   }
// };


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
    
    // Check if we should perform a search
    const shouldSearch = 
      prompt.toLowerCase().includes('search') || 
      prompt.toLowerCase().includes('find information') ||
      prompt.toLowerCase().includes('look up') || 
      prompt.toLowerCase().includes('latest') ||
      prompt.toLowerCase().includes('current') ||
      prompt.toLowerCase().includes('recent');
    
    // Format conversation history for Perplexity
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

// const generateAnthropicResponse = async (
//   modelId: string, 
//   prompt: string,
//   systemPrompt?: string,
//   conversationHistory: MessageContext[] = []
// ) => {
//   try {
//     if (!ANTHROPIC_API_KEY) {
//       throw new Error("ANTHROPIC_API_KEY environment variable not set");
//     }
//     
//     // Format conversation history for Anthropic
//     const messages = conversationHistory.map(msg => ({
//       role: msg.role === 'ai' ? 'assistant' : 'user',
//       content: msg.content
//     }));
//     
//     // Add the current prompt
//     messages.push({ role: 'user', content: prompt });
//     
//     const response = await anthropic.messages.create({
//       model: modelId,
//       max_tokens: 4000,
//       messages,
//       system: systemPrompt || "You are Claude, a helpful, harmless, and honest AI assistant."
//     });
//     
//     return {
//       content: response.content[0].text,
//       model: modelId,
//       provider: 'Anthropic',
//       usage: {
//         prompt_tokens: response.usage?.input_tokens,
//         completion_tokens: response.usage?.output_tokens,
//         total_tokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
//       }
//     };
//   } catch (error) {
//     console.error('Error generating Anthropic response:', error);
//     throw new Error(`Failed to generate Anthropic response: ${(error as Error).message}`);
//   }
// };