import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { aiAgents } from '../db/schema';
import * as aiModelService from './ai-model.service';

dotenv.config();

const ROUTER_GEMINI_API_KEY = process.env.ROUTER_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

if (!ROUTER_GEMINI_API_KEY) {
  console.warn("ROUTER_GEMINI_API_KEY environment variable not set");
}

const genAI = new GoogleGenerativeAI(ROUTER_GEMINI_API_KEY || 'dummy_key');
const routerModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// Agent interfaces
export interface AgentInfo {
  id: string;
  name: string;
  type: string;
  description?: string;
  capabilities?: any;
}

export interface AgentResponse {
  content: string;
  type?: string;
  metadata?: Record<string, any>;
  error?: string;
}

export interface AgentConfig {
  modelId: string;
  agentId: string;
  sessionId?: string;
  userId?: string;
}

export interface AgentRoutingResult {
  agentId: string | null;
  confidence: number;
  reasoning: string;
  chainOfAgents?: string[];
  requiredInfo?: string[];
  isSimpleQuery: boolean;
  complexity: 'simple' | 'moderate' | 'complex';
}

// Get available agents from database
export const getAvailableAgents = async (): Promise<AgentInfo[]> => {
  try {
    const agents = await db.query.aiAgents.findMany({
      orderBy: (aiAgents, { asc }) => [asc(aiAgents.name)]
    });
    return agents.map(agent => ({
      ...agent,
      description: agent.description || undefined
    }));
  } catch (error) {
    console.error('Error fetching agents:', error);
    return []; // Return empty array instead of throwing
  }
};

export const getAgentById = async (agentId: string): Promise<AgentInfo | null> => {
  try {
    const agent = await db.query.aiAgents.findFirst({
      where: eq(aiAgents.id, agentId)
    });
    if (!agent) return null;
    return {
      ...agent,
      description: agent.description || undefined
    };
  } catch (error) {
    console.error('Error fetching agent:', error);
    return null;
  }
};

// Validate agent exists in database
export const validateAgentExists = async (agentId: string): Promise<boolean> => {
  try {
    const agent = await db.query.aiAgents.findFirst({
      where: eq(aiAgents.id, agentId)
    });
    return !!agent;
  } catch (error) {
    console.error('Error validating agent:', error);
    return false;
  }
};

// LLM-powered intent analysis - the core intelligence
export const analyzeUserIntent = async (message: string): Promise<AgentRoutingResult> => {
  try {
    console.log('Analyzing user intent with LLM for:', message.substring(0, 100) + '...');
    
    // Get available agents dynamically
    const availableAgents = await getAvailableAgents();
    
    if (!availableAgents || availableAgents.length === 0) {
      console.log('No agents available, routing to general AI');
      return {
        agentId: null,
        confidence: 100,
        reasoning: 'No specialized agents available',
        isSimpleQuery: true,
        complexity: 'simple'
      };
    }

    // Create agent descriptions for LLM context
    const agentDescriptions = availableAgents.map(agent => {
      return `- ${agent.id}: ${agent.name} (${agent.type})\n  Description: ${agent.description || 'No description'}\n  Use for: ${getAgentUseCase(agent.type)}`;
    }).join('\n\n');

    const prompt = `
You are an intelligent message router for an AI assistant. Analyze the user's message and determine:

1. Whether this is a SIMPLE query (general conversation, basic questions) or COMPLEX query (requires specialized tools)
2. If complex, which agent(s) would be most appropriate
3. The complexity level and confidence

AVAILABLE AGENTS:
${agentDescriptions}

USER MESSAGE: "${message}"

ROUTING RULES:
- SIMPLE QUERIES: Greetings, basic questions, general conversation, simple math, explanations
  → Route to: null (general AI)
  → Examples: "hello", "what is 2+2", "explain photosynthesis", "tell me a joke"

- COMPLEX QUERIES: Require specialized processing or external data
  → Route to appropriate agent(s)
  → Examples: YouTube links, research requests, handwriting conversion, Google Drive operations

ANALYSIS CRITERIA:
1. Does the message contain URLs, specific service references, or specialized requests?
2. Does it require external data fetching, file processing, or specialized algorithms?
3. Can a general AI answer this adequately without special tools?

CONFIDENCE LEVELS:
- 90-100: Very clear specialized need (YouTube URL, explicit "research report")
- 70-89: Likely needs agent (research questions, handwriting requests)
- 50-69: Uncertain, lean toward general AI
- 0-49: Definitely general conversation

RESPOND WITH VALID JSON ONLY:
{
  "agentId": "actual_agent_id_or_null",
  "confidence": 85,
  "reasoning": "Clear explanation of decision",
  "chainOfAgents": ["agent1", "agent2"] or null,
  "isSimpleQuery": true/false,
  "complexity": "simple/moderate/complex"
}
`;

    const result = await routerModel.generateContent(prompt);
    const responseText = result.response.text();

    try {
      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('No JSON found in LLM response, defaulting to simple query');
        return createFallbackResult('No valid JSON found in LLM response');
      }
      
      const jsonText = jsonMatch[0];
      const parsedResponse = JSON.parse(jsonText) as AgentRoutingResult;
      
      // Validate agent IDs exist in database
      if (parsedResponse.agentId) {
        const agentExists = await validateAgentExists(parsedResponse.agentId);
        if (!agentExists) {
          console.warn(`Agent ${parsedResponse.agentId} not found in database, falling back to general AI`);
          return createFallbackResult(`Agent ${parsedResponse.agentId} not found in database`);
        }
      }

      // Validate chain agents if specified
      if (parsedResponse.chainOfAgents && parsedResponse.chainOfAgents.length > 0) {
        const validChain: string[] = [];
        for (const agentId of parsedResponse.chainOfAgents) {
          const exists = await validateAgentExists(agentId);
          if (exists) {
            validChain.push(agentId);
          } else {
            console.warn(`Chain agent ${agentId} not found, removing from chain`);
          }
        }
        parsedResponse.chainOfAgents = validChain.length > 0 ? validChain : undefined;
        
        // If no valid agents in chain, fall back to single agent or general AI
        if (validChain.length === 0) {
          parsedResponse.agentId = null;
          parsedResponse.confidence = 0;
        }
      }
      
      console.log('LLM Intent analysis result:', {
        agentId: parsedResponse.agentId,
        confidence: parsedResponse.confidence,
        complexity: parsedResponse.complexity,
        isSimple: parsedResponse.isSimpleQuery
      });
      
      return parsedResponse;
    } catch (parseError) {
      console.error('Error parsing LLM response:', parseError);
      console.log('Raw LLM response:', responseText);
      return createFallbackResult('Failed to parse LLM response');
    }
  } catch (error) {
    console.error('Error in LLM intent analysis:', error);
    return createFallbackResult(`LLM analysis failed: ${(error as Error).message}`);
  }
};

// Helper function to create fallback result
function createFallbackResult(reason: string): AgentRoutingResult {
  return {
    agentId: null,
    confidence: 100,
    reasoning: reason,
    isSimpleQuery: true,
    complexity: 'simple'
  };
}

// Helper function to get agent use cases
function getAgentUseCase(agentType: string): string {
  switch (agentType) {
    default:
      return 'Specialized processing';
  }
}

export const processAgentMessage = async (
  message: string,
  config: AgentConfig
): Promise<AgentResponse> => {
  try {
    const agentExists = await validateAgentExists(config.agentId);
    if (!agentExists) {
      console.error(`Agent ${config.agentId} not found in database`);
      return {
        content: `The requested agent "${config.agentId}" is not available. I'll help you with a general response instead.`,
        error: `Agent not found: ${config.agentId}`
      };
    }

    const agent = await getAgentById(config.agentId);
    if (!agent) {
      throw new Error(`Agent with ID ${config.agentId} not found`);
    }

    console.log(`Processing message with ${agent.type} agent:`, agent.name);

    switch (agent.type) {

      default:
        throw new Error(`Unsupported agent type: ${agent.type}`);
    }
  } catch (error) {
    console.error('Error processing agent message:', error);
    return {
      content: `I encountered an error while processing your request: ${(error as Error).message}. Let me help you with a general response instead.`,
      error: (error as Error).message
    };
  }
};

export const executeAgentChain = async (
  message: string,
  agentIds: string[],
  modelId: string,
  userId?: string
): Promise<{
  content: string;
  intermediateResults: Record<string, any>;
}> => {
  try {
    if (!agentIds.length) {
      throw new Error('No agents specified for chain execution');
    }
    
    console.log(`Executing agent chain with ${agentIds.length} agents`);
    
    const intermediateResults: Record<string, any> = {};
    let currentInput = message;
    
    for (const agentId of agentIds) {
      console.log(`Executing agent ${agentId}`);
      
      const result = await processAgentMessage(
        currentInput,
        {
          modelId,
          agentId,
          userId,
        }
      );
      
      intermediateResults[agentId] = result;

      if (result.error) {
        console.warn(`Agent ${agentId} failed, continuing chain:`, result.error);
        // Continue with original input if agent fails
        currentInput = message;
      } else if (result.content) {
        // Use result as input for next agent
        currentInput = `Previous result: ${result.content}\n\nOriginal request: ${message}`;
      }
    }
  
    // Generate summary of all results
    const summaryPrompt = `
Combine these agent results into a comprehensive response for: "${message}"

Results:
${Object.entries(intermediateResults).map(([agentId, result]) => 
  `${agentId}: ${result.content}`
).join('\n\n')}

Provide a well-structured, comprehensive response that addresses the user's request.
`;

    const summaryResponse = await aiModelService.generateAIResponse(modelId, summaryPrompt);
    
    return {
      content: summaryResponse.content,
      intermediateResults
    };
  } catch (error) {
    console.error('Error executing agent chain:', error);
    return {
      content: `I encountered an error while executing the agent chain: ${(error as Error).message}`,
      intermediateResults: {}
    };
  }
};

export const determineResponseStrategy = async (
  message: string,
  modelId: string,
  userId?: string
): Promise<{
  strategy: 'simple' | 'single_agent' | 'agent_chain';
  agentId?: string;
  agentChain?: string[];
  reasoning: string;
}> => {
  try {
    const intentAnalysis = await analyzeUserIntent(message);
    
    if (intentAnalysis.isSimpleQuery || intentAnalysis.confidence < 70) {
      return {
        strategy: 'simple',
        reasoning: `Simple query detected: ${intentAnalysis.reasoning}`
      };
    }
    
    if (intentAnalysis.chainOfAgents && intentAnalysis.chainOfAgents.length > 1) {
      return {
        strategy: 'agent_chain',
        agentChain: intentAnalysis.chainOfAgents,
        reasoning: `Multi-agent chain needed: ${intentAnalysis.reasoning}`
      };
    }
    
    if (intentAnalysis.agentId && intentAnalysis.confidence >= 70) {
      return {
        strategy: 'single_agent',
        agentId: intentAnalysis.agentId,
        reasoning: `Single agent selected: ${intentAnalysis.reasoning}`
      };
    }
    
    return {
      strategy: 'simple',
      reasoning: 'Falling back to general AI due to low confidence or no suitable agent'
    };
    
  } catch (error) {
    console.error('Error determining response strategy:', error);
    return {
      strategy: 'simple',
      reasoning: `Error in strategy determination: ${(error as Error).message}`
    };
  }
};

export const detectCompatibleAgent = async (message: string, modelId?: string): Promise<string | null> => {
  try {
    const strategy = await determineResponseStrategy(message, modelId || 'gemini-pro');
    return strategy.agentId || null;
  } catch (error) {
    console.error('Error detecting compatible agent:', error);
    return null;
  }
};

export const isMessageCompatibleWithAgent = async (message: string, agentType: string, modelId?: string): Promise<boolean> => {
  try {
    const strategy = await determineResponseStrategy(message, modelId || 'gemini-pro');
    if (strategy.agentId) {
      const agent = await getAgentById(strategy.agentId);
      return agent?.type === agentType;
    }
    return false;
  } catch (error) {
    console.error('Error checking message compatibility:', error);
    return false;
  }
};