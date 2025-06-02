import { YoutubeTranscript } from 'youtube-transcript';
import * as aiModelService from '../services/ai-model.service';

export interface TranscriptSegment {
  text: string;
  duration: number;
  offset: number;
}

export interface AnalysisResult {
  type: string;
  content: string;
  videoId: string;
  summary?: string;
  keyPoints?: string[];
  query?: string;
  answer?: string;
  transcriptLength?: number;
  error?: string;
}

/**
 * Extract YouTube video ID from URL
 */
export const extractVideoId = (url: string): string | null => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/e\/|youtube\.com\/watch\?.*&v=|youtube\.com\/watch\?.*?v=|youtube\.com\/shorts\/)([^#&?]*).*/,
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) return match[1];
  }

  return url.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(url) ? url : null;
};

/**
 * Fetch and process transcript
 */
const getVideoTranscript = async (videoId: string): Promise<string> => {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    return transcript.map(segment => segment.text).join(' ');
  } catch (error) {
    throw new Error(`Failed to fetch video transcript: ${(error as Error).message}`);
  }
};

/**
 * Process a YouTube message using specified AI model
 */
export const processYoutubeMessage = async (
  message: string,
  modelId: string
): Promise<AnalysisResult> => {
  try {
    // Extract YouTube URL
    const urlMatch = message.match(/(https?:\/\/[^\s]+)/);
    if (!urlMatch) {
      return {
        type: 'error',
        content: "No YouTube URL found in message",
        videoId: 'unknown'
      };
    }

    const url = urlMatch[0];
    const videoId = extractVideoId(url);
    
    if (!videoId) {
      return {
        type: 'error',
        content: "Invalid YouTube URL",
        videoId: 'unknown'
      };
    }

    // Get video transcript
    const transcript = await getVideoTranscript(videoId);
    
    // Extract any additional question from the message
    const question = message.replace(url, '').trim();

    // Create appropriate prompt based on presence of question
    let prompt;
    if (question) {
      prompt = `
      Analyze this YouTube video transcript and answer the following question: "${question}"
      
      Transcript:
      ${transcript}
      
      If the question cannot be answered from the transcript content, please say so.
      Provide a clear, concise answer based only on the transcript content.
      `;
    } else {
      prompt = `
      Provide a comprehensive analysis of this YouTube video transcript:
      
      ${transcript}
      
      Please include:
      1. A brief summary of the main content (2-3 paragraphs)
      2. 3-5 key points or main takeaways
      3. Any significant topics or themes discussed
      
      Format your response in this structure:
      
      SUMMARY:
      [Your summary here]
      
      KEY POINTS:
      - [Point 1]
      - [Point 2]
      - [Point 3]
      `;
    }

    // Generate response using selected AI model
    const aiResponse = await aiModelService.generateAIResponse(modelId, prompt);
    
    // Parse response if it's a summary
    if (!question) {
      const summaryMatch = aiResponse.content.match(/SUMMARY:([\s\S]*?)(?=KEY POINTS:|$)/i);
      const keyPointsMatch = aiResponse.content.match(/KEY POINTS:([\s\S]*)/i);
      
      const summary = summaryMatch ? summaryMatch[1].trim() : null;
      const keyPoints = keyPointsMatch 
        ? keyPointsMatch[1]
            .split('-')
            .map((point: string) => point.trim())
            .filter((point: string | any[]) => point.length > 0)
        : [];

      return {
        type: 'youtube_summary',
        content: aiResponse.content,
        videoId,
        summary,
        keyPoints,
        transcriptLength: transcript.length
      };
    }

    return {
      type: 'youtube_qa',
      content: aiResponse.content,
      videoId,
      query: question,
      answer: aiResponse.content,
      transcriptLength: transcript.length
    };

  } catch (error) {
    console.error('Error processing YouTube message:', error);
    return {
      type: 'error',
      content: `Failed to process YouTube video: ${(error as Error).message}`,
      videoId: 'unknown',
      error: (error as Error).message
    };
  }
};