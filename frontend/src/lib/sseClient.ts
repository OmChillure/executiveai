export interface SSEMessage {
  type: 'thinking_step' | 'final_response' | 'error';
  step?: any;
  userMessage?: any;
  aiResponse?: any;
  modelInfo?: any;
  error?: string;
}

export const sendMessageWithSSE = async (
  chatId: string,
  messageContent: string,
  modelId: string,
  token: string,
  onThinkingStep: (step: any) => void,
  onFinalResponse: (response: any) => void,
  onError: (error: string) => void
) => {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/chat/${chatId}/messages-with-thinking`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        content: messageContent,
        aiModelId: modelId,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error('No response body reader available');
    }

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          
          if (data === '[DONE]') {
            return;
          }
          
          try {
            const parsed = JSON.parse(data);
            
            if (parsed.type === 'thinking_step') {
              onThinkingStep(parsed.step);
            } else if (parsed.type === 'final_response') {
              onFinalResponse(parsed);
            } else if (parsed.type === 'error') {
              onError(parsed.error);
            }
          } catch (parseError) {
            console.error('Error parsing SSE data:', parseError);
          }
        }
      }
    }
  } catch (error) {
    console.error('SSE Error:', error);
    onError((error as Error).message);
  }
};