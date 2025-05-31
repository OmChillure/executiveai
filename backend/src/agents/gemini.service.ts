import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Gemini API
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY environment variable not set");
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

// Prompt templates
const FINANCIAL_ANALYSIS_PROMPT = `
You are a financial advisor with expertise in stock analysis and market trends. 
Analyze the following user query and provide investment advice based on the latest financial data provided.

User Query: {query}

Latest Financial Data:
{financial_data}

{indicator_prompt}

Provide a concise analysis with the following:
1. Summary of the current stock situation
2. Analysis of market trends
3. Key financial metrics to consider
4. Recommendation (Buy, Sell, Hold)
5. Suggested price points for buying or selling
6. Timeframe for the recommendation (short-term, medium-term, long-term)

IMPORTANT: Include specific calendar dates for any recommended actions. For example:
- "Consider buying on [DATE: 2023-12-15] if the price reaches $X"
- "Set a reminder to reevaluate on [DATE: 2023-12-01]"
- "Plan to sell on [DATE: 2024-01-05] if the stock reaches the target price"

For each action, clearly state:
- The specific action (BUY, SELL, or REVIEW)
- The target price if applicable
- The reasoning behind that date or price target

Use the [DATE: YYYY-MM-DD] format for any dates so they can be automatically extracted for calendar reminders.
`;

const INDICATOR_ANALYSIS_PROMPTS: Record<string, string> = {
  "RSI": `
  Also provide a detailed analysis of the Relative Strength Index (RSI) for this stock:
  - Current RSI value and what it indicates
  - Historical RSI patterns
  - RSI-based buy/sell signals
  `,
  "MACD": `
  Also provide a detailed analysis of the Moving Average Convergence Divergence (MACD) for this stock:
  - Current MACD line and signal line positions
  - MACD histogram trends
  - MACD crossover signals
  `,
  "Moving_Averages": `
  Also provide a detailed analysis of Moving Averages for this stock:
  - Current 50-day and 200-day moving average positions
  - Golden cross or death cross signals
  - Price position relative to key moving averages
  `,
  "Bollinger_Bands": `
  Also provide a detailed analysis of Bollinger Bands for this stock:
  - Current position within the bands
  - Band width and volatility analysis
  - Recent band touches or breakouts
  `
};

/**
 * Analyze a user query using the Gemini model with financial data and optional indicator
 */
export const analyzeQuery = async (
  query: string,
  financialData: Record<string, any>,
  selectedIndicator?: string
): Promise<Record<string, any>> => {
  let indicatorPrompt = "";
  if (selectedIndicator && selectedIndicator in INDICATOR_ANALYSIS_PROMPTS) {
    indicatorPrompt = INDICATOR_ANALYSIS_PROMPTS[selectedIndicator];
  }
  
  // Format financial data for the prompt
  const formattedData = Object.entries(financialData)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  
  const prompt = FINANCIAL_ANALYSIS_PROMPT
    .replace("{query}", query)
    .replace("{financial_data}", formattedData)
    .replace("{indicator_prompt}", indicatorPrompt);
  
  try {
    // Generate response from Gemini
    const result = await model.generateContent(prompt);
    const response = result.response;
    const analysisText = response.text();
    
    // Extract ticker symbols from financial data
    const tickerSymbols = financialData.potential_tickers || [];
    
    // Extract dates and create calendar reminders
    
    // Parse and format the response
    return {
      query: query,
      analysis: analysisText,
      selected_indicator: selectedIndicator,
      data_sources: {
        real_time: "Perplexity API",
        analysis: "Gemini 1.5 Pro"
      }
    };
  } catch (error) {
    console.error("Error generating content from Gemini:", error);
    return {
      query: query,
      error: "Failed to generate analysis",
      message: (error as Error).message
    };
  }
}; 