import { StreamCallback } from '../services/ai-model.service';


export async function streamAgentResponse(
  content: string,
  onChunk: StreamCallback,
  speed: 'slow' | 'normal' | 'fast' = 'slow'
): Promise<void> {
  if (!content || content.length === 0) {
    onChunk('', true);
    return;
  }

  const streamingConfig = {
    slow: { characterDelay: 60, wordPause: 20, sentencePause: 200 },
    normal: { characterDelay: 30, wordPause: 10, sentencePause: 100 },
    fast: { characterDelay: 15, wordPause: 5, sentencePause: 50 }
  }[speed];

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const isLast = i === content.length - 1;
    
    onChunk(char, false);
    
    if (!isLast) {
      let delay = streamingConfig.characterDelay;
      
      if (char === ' ') {
        delay += streamingConfig.wordPause;
      }
      
      if (['.', '!', '?', '\n'].includes(char)) {
        delay += streamingConfig.sentencePause;
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  onChunk('', true);
}

export async function makeAgentStreamable<T extends { content: string; [key: string]: any }>(
  agentFunction: () => Promise<T>,
  onChunk: StreamCallback,
  speed: 'slow' | 'normal' | 'fast' = 'slow'
): Promise<T> {
  const result = await agentFunction();
  
  await streamAgentResponse(result.content, onChunk, speed);
  
  return result;
}