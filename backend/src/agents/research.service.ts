import { tavily } from '@tavily/core';
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();

export interface ResearchResult {
  type: string;
  content: string;
  metadata?: {
    sources: string[]; 
    images?: string[];    
    text?: string;        
    query?: string;      
  };
  error?: string;
}

class ResearchAgent {
  private tavilyClient: any;
  private genAI: GoogleGenerativeAI;
  private model: any;
  
  constructor() {
    const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    
    if (!TAVILY_API_KEY || !GEMINI_API_KEY) {
      throw new Error('Missing required API keys. Please check your environment variables.');
    }
    
    this.tavilyClient = tavily({ apiKey: TAVILY_API_KEY });
    this.genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  }
  
  async initialize() {
    console.log('Research agent initialized');
  }
  
  private async searchForInfo(query: string): Promise<string[]> {
    try {
      console.log(`Searching Tavily for: "${query}"`);
      
      const searchResponse = await this.tavilyClient.search(query);
      const top3Urls = searchResponse.results.slice(0, 3).map((result : any )=> result.url);
      
      console.log(`Found ${top3Urls.length} search results`);
      return top3Urls;
    } catch (error) {
      console.error('Error in Tavily search:', error);
      throw new Error(`Tavily search failed: ${(error as Error).message}`);
    }
  }
  
  private async extractContentFromUrl(url: string): Promise<{content: string, images: string[]}> {
    try {
      console.log(`Extracting content from: ${url}`);

      const options = {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          urls: url, 
          include_images: true,
          extract_depth: "basic"
        })
      };
      
      const response = await fetch('https://api.tavily.com/extract', options);
      const data = await response.json();

      let images: string[] = [];
      if (Array.isArray(data.results) && data.results.length > 0 && Array.isArray(data.results[0].images)) {
        images = [...data.results[0].images];
      }

      return {
        content: JSON.stringify(data, null, 2),
        images: images
      };
    } catch (error) {
      console.error(`Error extracting from ${url}:`, error);
      return { content: "", images: [] };  // Return empty on error
    }
  }
  

  private async generateStructuredReport(data: string, query: string): Promise<string> {
    try {
      console.log('Generating structured report using Gemini');
     
      const prompt = `
Generate a comprehensive, well-structured report about "${query}" using the information I provide below.

YOUR TASK:
- Create a detailed report with proper headings, subheadings, and sections
- Include a brief introduction explaining what ${query.split(' ').pop()} is
- Include sections on ingredients, preparation methods, variations, and nutritional information where applicable
- Add cultural context and historical background if available
- Include tips, tricks, and common mistakes to avoid
- End with a conclusion

The report should be organized, easy to read, and visually appealing when rendered in markdown format.

INFORMATION SOURCES:
${data}

FORMAT YOUR RESPONSE:
# [Title: Make this descriptive and engaging]

## Introduction
[Brief overview]

## Ingredients
[List the main ingredients with quantities]

## Preparation Method
[Step-by-step instructions]

## Regional Variations
[Discuss different variations]

## Nutritional Information
[Include health aspects and nutritional values]

## Tips and Tricks
[Include practical advice]

## Cultural Significance
[Historical and cultural context]

## Conclusion
[Summarize key points]

Remember to structure this as a comprehensive report with all relevant information from the sources provided.
`;
      
      const result = await this.model.generateContent(prompt);
      const reportText = result.response.text();
      
      console.log('Successfully generated structured report');
      return reportText;
    } catch (error) {
      console.error('Error generating report:', error);
      throw new Error(`Report generation failed: ${(error as Error).message}`);
    }
  }
  
  public async conductResearch(query: string): Promise<ResearchResult> {
    try {
      // Clean up the query
      const cleanQuery = this.extractActualQuery(query);
      console.log(`Original query: "${query}"\nCleaned query: "${cleanQuery}"`);
      
      // Step 1: Search for information and get top URLs
      const topUrls = await this.searchForInfo(cleanQuery);
      
      if (topUrls.length === 0) {
        throw new Error('No search results found for the query');
      }
      
      // Step 2: Extract content from each URL one by one
      let allInfo = "";
      const allImages: string[] = [];
      
      for (const url of topUrls) {
        // Extract from each URL individually
        const { content, images } = await this.extractContentFromUrl(url);
        
        // Append content
        if (content) {
          allInfo += "\n" + content;
        }
        
        // Collect images
        if (images.length > 0) {
          allImages.push(...images);
        }
      }
      
      // Step 3: Generate report if we got some content
      if (!allInfo.trim()) {
        throw new Error('Failed to extract any useful content from the search results');
      }
      
      const report = await this.generateStructuredReport(allInfo, cleanQuery);
      
      // Step 4: Return the research result
      return {
        type: 'research',
        content: 'Research completed successfully',
        metadata: {
          sources: topUrls,
          images: allImages.slice(0, 5),
          text: report,
          query: cleanQuery
        }
      };
    } catch (error) {
      console.error('Research process failed:', error);
      return {
        type: 'error',
        content: `Failed to complete research: ${(error as Error).message}`,
        error: (error as Error).message
      };
    }
  }
  
  /**
   * Helper method to extract the actual query from user input
   * Removes phrases like "can you", "please", etc.
   */
  private extractActualQuery(input: string): string {
    // List of common request phrases to remove
    const requestPhrases = [
      'can you', 'could you', 'please', 'i want', 'i need', 
      'get details about', 'tell me about', 'create a report on',
      'create detailed report on', 'find information on', 'research'
    ];
    
    let cleanedQuery = input.toLowerCase();
    
    // Remove request phrases from the beginning
    for (const phrase of requestPhrases) {
      if (cleanedQuery.startsWith(phrase)) {
        cleanedQuery = cleanedQuery.substring(phrase.length).trim();
      }
    }
    
    // Remove any ending question marks or periods
    cleanedQuery = cleanedQuery.replace(/[?.!]$/, '').trim();
    
    // If we've removed too much, just use the original input
    if (cleanedQuery.length < 3) {
      return input;
    }
    
    return cleanedQuery;
  }
}

// Singleton instance
let agent: ResearchAgent | null = null;

/**
 * Process a research request from the user
 */
export const processResearchRequest = async (
  query: string,
  modelId: string // This parameter is not used but kept for API compatibility
): Promise<ResearchResult> => {
  try {
    if (!agent) {
      agent = new ResearchAgent();
      await agent.initialize();
    }
    
    // Process the user's query
    return await agent.conductResearch(query);
  } catch (error) {
    console.error('Error processing research request:', error);
    return {
      type: 'error',
      content: `Failed to process research request: ${(error as Error).message}`,
      error: (error as Error).message
    };
  }
};