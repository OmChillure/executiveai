"use client"
import { useState, useEffect, useRef } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { useRouter, usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { cn } from "@/lib/utils"
import { AiInput } from "@/components/aiinput"
import ReactMarkdown from "react-markdown"
import Sidebar from "@/components/Sidebar"
import { Navbar } from "@/components/dashboardNav"
// import { ThinkingProcess } from "@/components/ToolCallRenderer"
import { useThinkingProcess } from "@/hooks/useToolRenderer"
import { v4 as uuidv4 } from "uuid"
import { use } from "react"

interface AIModel {
  id: string
  name: string
  provider: string
  modelId: string
  description?: string
}

interface AIAgent {
  id: string
  name: string
  type: string
  description?: string
}

interface Message {
  id: string
  role: "user" | "ai"
  content: string
  aiModelId: string
  aiAgentId?: string
  createdAt: string
}

interface ChatItem {
  id: string
  userId: string
  title: string
  createdAt: string
  messages: Message[]
}

interface SendMessageRequest {
  content: string
  aiModelId: string
  aiAgentId?: string
}

export default function ChatIdPage({ params }: { params: { id: string } }) {
  const unwrappedParams = params instanceof Promise ? use(params) : params
  const chatId = unwrappedParams.id

  const [chats, setChats] = useState<ChatItem[]>([])
  const [currentChat, setCurrentChat] = useState<ChatItem | null>(null)
  const [loadingChats, setLoadingChats] = useState(true)
  const [loadingChat, setLoadingChat] = useState(true)
  const [chatNotFound, setChatNotFound] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)
  const [waitingForAiResponse, setWaitingForAiResponse] = useState(false)
  const [lastMessageId, setLastMessageId] = useState<string | null>(null)
  const [pollingRef, setPollingRef] = useState<NodeJS.Timeout | null>(null)
  const [messageBeforeAI, setMessageBeforeAI] = useState<Message | null>(null)
  const [isOpen, setIsOpen] = useState(true)
  const [activeTab, setActiveTab] = useState("chat")
  const [isInitialized, setIsInitialized] = useState(false)
  const [aiModels, setAiModels] = useState<AIModel[]>([])
  const [aiAgents, setAiAgents] = useState<AIAgent[]>([])
  const [loadingModels, setLoadingModels] = useState(true)
  const [loadingAgents, setLoadingAgents] = useState(true)

  const {
    steps: thinkingSteps,
    isVisible: showThinkingProcess,
    startThinking,
    addStep,
    updateStep,
    completeThinking,
    hideThinking
  } = useThinkingProcess();

  const router = useRouter()
  const pathname = usePathname()
  const { data: session, status: sessionStatus } = useSession()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [currentChat?.messages, waitingForAiResponse, showThinkingProcess])

  useEffect(() => {
    return () => {
      if (pollingRef) {
        clearTimeout(pollingRef)
      }
    }
  }, [pollingRef])

  useEffect(() => {
    if (!isInitialized && sessionStatus !== "loading") {
      setIsInitialized(true)
      initializeChat()
    }
  }, [sessionStatus, isInitialized])

  const initializeChat = async () => {
    try {
      const [chatResult] = await Promise.allSettled([
        fetchChatDetails(chatId),
        fetchChats(),
        loadAIModels(),
        loadAIAgents()
      ])

      if (chatResult.status === 'rejected') {
        console.error("Failed to load chat:", chatResult.reason)
      }
    } catch (error) {
      console.error("Error initializing chat:", error)
    }
  }

  const loadAIModels = async () => {
    try {
      setLoadingModels(true)
      const token = session?.user?.token || localStorage.getItem("token")

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/models`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      })

      if (response.ok) {
        const data = await response.json()
        setAiModels(data.models)
      } else {
        const fallbackModels = [
          {
            id: "1",
            name: "Gemini 2.0 Flash",
            provider: "Google",
            modelId: "gemini-2.0-flash",
          },
          {
            id: "2",
            name: "Gemini 1.5 Pro",
            provider: "Google",
            modelId: "gemini-1.5-pro",
          },
        ]
        setAiModels(fallbackModels)
      }
    } catch (error) {
      console.error("Error loading AI models:", error)
      const fallbackModels = [
        {
          id: "1",
          name: "Gemini 2.0 Flash",
          provider: "Google",
          modelId: "gemini-2.0-flash",
        },
      ]
      setAiModels(fallbackModels)
    } finally {
      setLoadingModels(false)
    }
  }

  const addNewChatToList = (newChat: ChatItem) => {
    setChats(prevChats => [newChat, ...prevChats])
  }

  const updateChatInList = (chatId: string, updates: Partial<ChatItem>) => {
    setChats(prevChats =>
      prevChats.map(chat =>
        chat.id === chatId ? { ...chat, ...updates } : chat
      )
    )
  }

  const loadAIAgents = async () => {
    try {
      setLoadingAgents(true)
      const token = session?.user?.token || localStorage.getItem("token")

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/agents`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      })

      if (response.ok) {
        const data = await response.json()
        setAiAgents(data.agents)
      } else {
        const fallbackAgents = [
          {
            id: "1",
            name: "YouTube Analyzer",
            type: "youtube",
            description: "Analyzes YouTube video content and answers questions",
          },
          {
            id: "2",
            name: "Research Agent",
            type: "research",
            description: "Conducts research and generates reports",
          },
          {
            id: "3",
            name: "Handwriting Agent",
            type: "handwriting",
            description: "Converts text to handwritten format",
          },
        ]
        setAiAgents(fallbackAgents)
      }
    } catch (error) {
      console.error("Error loading AI agents:", error)
    } finally {
      setLoadingAgents(false)
    }
  }

  const fetchChats = async () => {
    try {
      setLoadingChats(true)
      const token = session?.user?.token || localStorage.getItem("token")

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/chat`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      })

      if (response.ok) {
        const data = await response.json()
        setChats(data.data)
      } else {
        console.error("Failed to fetch chats:", response.status, response.statusText)
        toast.error("Failed to fetch chats")
      }
    } catch (error) {
      console.error("Error fetching chats:", error)
      toast.error("Error fetching chats")
    } finally {
      setLoadingChats(false)
    }
  }

  const fetchChatDetails = async (chatId: string, retryDelay = 500) => {
    try {
      setLoadingChat(true)
      setChatNotFound(false)
      const token = session?.user?.token || localStorage.getItem("token")

      if (retryDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, retryDelay))
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/chat/${chatId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      })

      if (response.ok) {
        const data = await response.json()
        setCurrentChat(data)

        if (data.messages && data.messages.length > 0) {
          const lastMessage = data.messages[data.messages.length - 1]

          if (lastMessage.role === "user" && !waitingForAiResponse) {
            setWaitingForAiResponse(true)
            setLastMessageId(lastMessage.id)
            setMessageBeforeAI(lastMessage)
            startPollingForResponse()
          }
        }

        return data
      } else if (response.status === 404) {
        setChatNotFound(true)
        toast.error("Chat not found")
        setTimeout(() => router.push("/chat"), 2000)
      } else {
        toast.error("Failed to fetch chat details")
        setTimeout(() => router.push("/chat"), 2000)
      }
    } catch (error) {
      console.error("Error fetching chat details:", error)
      toast.error("Error fetching chat details")
      setTimeout(() => router.push("/chat"), 2000)
    } finally {
      setLoadingChat(false)
    }
  }

  const startPollingForResponse = async () => {
    if (pollingRef) {
      clearTimeout(pollingRef)
    }

    let attempts = 0
    const maxAttempts = 60
    const pollInterval = 2000

    const pollFunction = async () => {
      if (attempts >= maxAttempts) {
        toast.error("AI response is taking longer than expected. The response will appear when ready.")
        setWaitingForAiResponse(false)
        setMessageBeforeAI(null)
        return
      }

      try {
        const token = session?.user?.token || localStorage.getItem("token")

        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/chat/${chatId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        })

        if (response.ok) {
          const data = await response.json()

          if (data.messages && data.messages.length > (currentChat?.messages?.length || 0)) {
            setCurrentChat(data)

            const lastMessage = data.messages[data.messages.length - 1]
            if (lastMessage.role === "ai") {
              setWaitingForAiResponse(false)
              setMessageBeforeAI(null)
              hideThinking()
              return
            }
          }

          attempts++
          const timeoutId = setTimeout(pollFunction, pollInterval)
          setPollingRef(timeoutId)
        } else {
          setWaitingForAiResponse(false)
          setMessageBeforeAI(null)
          hideThinking()
          toast.error("Failed to check for AI response")
        }
      } catch (error) {
        console.error("Error during polling:", error)
        setWaitingForAiResponse(false)
        setMessageBeforeAI(null)
        hideThinking()
      }
    }

    const initialTimeoutId = setTimeout(pollFunction, pollInterval)
    setPollingRef(initialTimeoutId)
  }

  const sendMessageWithSSE = async (
    chatId: string,
    messageContent: string,
    modelId: string,
    token: string,
    userMessage: Message
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      try {
        const sendMessageRequest = async () => {
          const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/chat/${chatId}/tools`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Accept': 'text/event-stream',
              'Cache-Control': 'no-cache',
            },
            body: JSON.stringify({
              content: messageContent,
              aiModelId: modelId,
            }),
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          // Check if response is actually SSE
          const contentType = response.headers.get('content-type');
          if (!contentType?.includes('text/event-stream')) {
            throw new Error('Response is not an event stream');
          }

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error('Response body is not readable');
          }

          const decoder = new TextDecoder();
          let buffer = '';

          const processStream = async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();

                if (done) {
                  resolve();
                  break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    const data = line.slice(6).trim();

                    if (data === '[DONE]') {
                      resolve();
                      return;
                    }

                    if (data) {
                      try {
                        const parsedData = JSON.parse(data);
                        console.log('Received SSE data:', parsedData);

                        if (parsedData.type === 'thinking_step') {
                          const step = parsedData.step;
                          if (step.id && thinkingSteps.find((s: { id: any }) => s.id === step.id)) {
                            updateStep(step.id, step);
                          } else {
                            addStep(step);
                          }
                        } else if (parsedData.type === 'final_response') {
                          if (currentChat && parsedData.aiResponse) {
                            setCurrentChat(prev => {
                              if (!prev) return null;

                              const messagesWithUser = prev.messages.some(m => m.id === userMessage.id)
                                ? prev.messages
                                : [...prev.messages, userMessage];

                              return {
                                ...prev,
                                messages: [...messagesWithUser, parsedData.aiResponse]
                              };
                            });
                            setLastMessageId(userMessage.id);
                          }

                          completeThinking();
                          setTimeout(() => {
                            hideThinking();
                            setWaitingForAiResponse(false);
                            setMessageBeforeAI(null);
                          }, 1000);
                        } else if (parsedData.type === 'error') {
                          throw new Error(parsedData.error);
                        }
                      } catch (parseError) {
                        console.error('Error parsing SSE data:', parseError);
                      }
                    }
                  }
                }
              }
            } catch (streamError) {
              console.error('Stream processing error:', streamError);
              reject(streamError);
            }
          };

          await processStream();
        };

        sendMessageRequest().catch(reject);

      } catch (error) {
        console.error('SSE setup error:', error);
        reject(error);
      }
    });
  };

  const simulateThinkingProcess = async (messageContent: string) => {
    addStep({
      id: 'intent_analysis',
      type: 'intent_analysis',
      title: 'Analyzing Intent',
      description: 'Understanding what you want to accomplish...',
      status: 'in_progress',
      timestamp: new Date()
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    let detectedIntent = 'general_conversation'
    let confidence = 60
    let agentType = null
    let agentName = null

    if (messageContent.includes('youtube.com') || messageContent.includes('youtu.be')) {
      detectedIntent = 'youtube_analysis'
      confidence = 95
      agentType = 'youtube'
      agentName = 'YouTube Analyzer'
    } else if (messageContent.toLowerCase().includes('handwriting') || messageContent.toLowerCase().includes('handwritten')) {
      detectedIntent = 'handwriting_conversion'
      confidence = 90
      agentType = 'handwriting'
      agentName = 'Handwriting Agent'
    } else if (messageContent.toLowerCase().includes('research') || messageContent.toLowerCase().includes('fact check')) {
      detectedIntent = 'research_request'
      confidence = 85
      agentType = 'research'
      agentName = 'Research Agent'
    } else if (messageContent.toLowerCase().includes('google drive') || messageContent.toLowerCase().includes('drive')) {
      detectedIntent = 'gdrive_operation'
      confidence = 88
      agentType = 'gdrive'
      agentName = 'Google Drive Agent'
    } else if (messageContent.toLowerCase().includes('form') && messageContent.includes('google')) {
      detectedIntent = 'forms_processing'
      confidence = 87
      agentType = 'forms'
      agentName = 'Forms Agent'
    }

    updateStep('intent_analysis', {
      status: 'completed',
      description: `Detected: ${detectedIntent.replace('_', ' ')}`,
      metadata: {
        confidence: confidence,
        reasoning: `Analyzed message content and detected ${detectedIntent.replace('_', ' ')} with ${confidence}% confidence`,
        detectedIntent
      }
    });

    if (agentType && confidence >= 80) {
      addStep({
        id: 'agent_selection',
        type: 'agent_selection',
        title: 'Agent Selected',
        description: `Selected ${agentName}`,
        status: 'completed',
        metadata: {
          agentType: agentType,
          agentName: agentName,
          confidence: confidence
        },
        timestamp: new Date()
      });

      await new Promise(resolve => setTimeout(resolve, 800));

      addStep({
        id: 'agent_execution',
        type: 'agent_execution',
        title: `${agentName} Processing`,
        description: 'Executing specialized agent...',
        status: 'in_progress',
        metadata: {
          agentType: agentType,
          agentName: agentName
        },
        timestamp: new Date()
      });

      await new Promise(resolve => setTimeout(resolve, 3000));

      updateStep('agent_execution', {
        status: 'completed',
        description: `${agentName} completed successfully`,
        metadata: {
          agentType: agentType,
          agentName: agentName,
          outputLength: Math.floor(Math.random() * 2000) + 500
        }
      });
    } else {
      addStep({
        id: 'general_ai',
        type: 'response_generation',
        title: 'General AI Response',
        description: 'No specialized agent needed - using general AI',
        status: 'completed',
        timestamp: new Date()
      });

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    addStep({
      id: 'response_finalization',
      type: 'response_generation',
      title: 'Finalizing Response',
      description: 'Preparing final response...',
      status: 'in_progress',
      timestamp: new Date()
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    updateStep('response_finalization', {
      status: 'completed',
      description: 'Response ready for delivery',
      metadata: {
        responseLength: Math.floor(Math.random() * 1000) + 200,
        wordsCount: Math.floor(Math.random() * 200) + 50
      }
    });
  }

  // FIXED: Updated handleSubmit function with redirect logic for new chats
  const handleSubmit = async (messageContent: string, modelId: string, sessionId: string) => {
    if (!messageContent.trim() || !modelId) return

    if (pollingRef) {
      clearTimeout(pollingRef)
      setPollingRef(null)
    }

    try {
      setSendingMessage(true)
      const token = session?.user?.token || localStorage.getItem("token")

      let actualChatId = chatId

      // RESTORED: Check if we need to create a new chat (when chat doesn't exist or is not found)
      if (!currentChat || chatNotFound) {
        actualChatId = uuidv4()

        // RESTORED: First redirect to the new chat page
        router.push(`/chat/${actualChatId}`)

        // RESTORED: Wait for navigation to start
        await new Promise((resolve) => setTimeout(resolve, 100))

        // RESTORED: Create new chat session
        const createResponse = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/chat`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: actualChatId,
            userId: session?.user?.id ?? null,
            title: messageContent.slice(0, 30),
          }),
        })

        if (createResponse.ok) {
          const newChat = await createResponse.json()

          // RESTORED: Add new chat to the list locally
          addNewChatToList(newChat)

          // Set current chat
          setCurrentChat({
            id: actualChatId,
            userId: session?.user?.id ?? "",
            title: messageContent.slice(0, 30),
            createdAt: new Date().toISOString(),
            messages: [],
          })

          setChatNotFound(false)
        }
      }

      const finalContent = messageContent

      const tempUserMessage: Message = {
        id: `temp-user-${Date.now()}`,
        role: "user",
        content: finalContent,
        aiModelId: modelId,
        createdAt: new Date().toISOString(),
      }

      setMessageBeforeAI(tempUserMessage)

      // Update current chat with user message
      setCurrentChat(prev => {
        if (!prev) {
          return {
            id: actualChatId,
            userId: session?.user?.id ?? "",
            title: finalContent.slice(0, 30),
            createdAt: new Date().toISOString(),
            messages: [tempUserMessage]
          }
        }
        return {
          ...prev,
          messages: [...(prev.messages || []), tempUserMessage]
        }
      })

      setSendingMessage(false)
      setWaitingForAiResponse(true)
      startThinking()

      try {
        await sendMessageWithSSE(actualChatId, finalContent, modelId, token || '', tempUserMessage);

        if (currentChat) {
          updateChatInList(actualChatId, {
            title: currentChat.title || finalContent.substring(0, 50) + '...',
            messages: currentChat.messages
          })
        }
      } catch (sseError) {
        console.log('SSE failed, falling back to simulation:', sseError);

        await simulateThinkingProcess(finalContent);

        const result = await sendMessage(actualChatId, finalContent, modelId);

        if (result && result.userMessage && result.aiResponse) {
          setCurrentChat(prev => {
            if (!prev) return null;
            const filteredMessages = prev.messages.filter(m => m.id !== tempUserMessage.id);

            return {
              ...prev,
              messages: [...filteredMessages, result.userMessage, result.aiResponse]
            };
          });

          updateChatInList(actualChatId, {
            title: currentChat?.title || finalContent.substring(0, 50) + '...',
            messages: [...(currentChat?.messages || []), result.userMessage, result.aiResponse]
          })

          setLastMessageId(result.userMessage.id);
        }

        completeThinking();
        setTimeout(() => {
          hideThinking();
          setWaitingForAiResponse(false);
          setMessageBeforeAI(null);
        }, 1000);
      }

    } catch (error) {
      console.error("Error:", error)
      toast.error("Failed to send message: " + (error instanceof Error ? error.message : "Unknown error"))
      setWaitingForAiResponse(false)
      setSendingMessage(false)
      setMessageBeforeAI(null)
      hideThinking()

      // Only fetch chat details if we're working with an existing chat
      if (currentChat && !chatNotFound) {
        fetchChatDetails(chatId, 0)
      }
    }
  }

  const createNewChat = async () => {
    try {
      const token = session?.user?.token || localStorage.getItem("token")

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/chat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "New Chat",
          messages: []
        }),
      })

      if (response.ok) {
        const newChat = await response.json()

        addNewChatToList(newChat)
        router.push(`/chat/${newChat.id}`)
      } else {
        toast.error("Failed to create new chat")
      }
    } catch (error) {
      console.error("Error creating new chat:", error)
      toast.error("Error creating new chat")
    }
  }

  const sendMessage = async (chatId: string, messageContent: string, modelId: string, agentId?: string) => {
    const token = session?.user?.token || localStorage.getItem("token")

    const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/chat/${chatId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: messageContent,
        aiModelId: modelId,
        aiAgentId: agentId,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error("API error:", errorData)
      throw new Error(errorData.error || "Failed to send message")
    }

    return await response.json()
  }

  const deleteChat = async (deleteId: string) => {
    try {
      const token = session?.user?.token || localStorage.getItem("token")

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/chat/${deleteId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      })

      if (response.ok) {
        setChats(chats.filter((chat) => chat.id !== deleteId))
        toast.success("Chat deleted successfully")

        if (chatId === deleteId) {
          router.push("/chat")
        }
      } else {
        toast.error("Failed to delete chat")
      }
    } catch (error) {
      console.error("Error deleting chat:", error)
      toast.error("Error deleting chat")
    }
  }

  if (chatNotFound) {
    return (
      <div className="flex h-screen bg-black items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl text-white mb-4">Chat Not Found</h2>
          <p className="text-gray-400">Redirecting to chat list...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-black">
      <Sidebar
        chats={chats}
        loadingChats={loadingChats}
        deleteChat={deleteChat}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        createNewChat={createNewChat}
      />

      <main className={cn("flex-1 flex flex-col h-full transition-all duration-300", isOpen ? "ml-64" : "ml-0")}>
        <Navbar isOpen={isOpen} setIsOpen={setIsOpen} className={cn(isOpen ? "left-[17.2rem]" : "left-1")} />
        <div className="flex-1 overflow-y-auto p-4 chat-scrollbar">
          {loadingChat ? (
            <div className="max-w-3xl mx-auto space-y-6">
              {[...Array(3)].map((_, i) => (
                <div key={`skeleton-${i}`} className="space-y-1">
                  <div className="flex justify-end mb-1">
                    <div className="max-w-[70%] w-[70%]">
                      <div className="bg-[#111111] rounded p-3 animate-pulse h-12"></div>
                    </div>
                  </div>

                  <div className="flex items-start">
                    <div className="flex-shrink-0 mr-3">
                      <div className="w-8 h-8 rounded-full bg-[#111111] animate-pulse"></div>
                    </div>
                    <div className="flex-1 max-w-[80%]">
                      <div className="bg-[#111111] rounded p-3 animate-pulse">
                        <div className="h-4 bg-[#111111] rounded mb-2"></div>
                        <div className="h-4 bg-[#111111] rounded mb-2 w-[90%]"></div>
                        <div className="h-4 bg-[#111111] rounded w-[75%]"></div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : currentChat ? (
            <div className="max-w-3xl mx-auto space-y-4">
              {currentChat.messages && currentChat.messages.length > 0 ? (
                <div className="space-y-6">
                  {currentChat.messages.map((msg, index) => {
                    const isUserMessage = msg.role === "user";

                    return (
                      <div key={msg.id} className="rounded-lg">
                        {isUserMessage ? (
                          <div className="flex justify-end">
                            <div className="max-w-[80%]">
                              <div className="bg-white text-black prose max-w-none rounded-xl p-2 px-3">
                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start">
                            <div className="flex-shrink-0 mr-3">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black border border-gray-700">
                                <span className="text-xs text-white">AI</span>
                              </div>
                            </div>
                            <div className="flex-1 p-0.5 text-white">
                              <ReactMarkdown>{msg.content}</ReactMarkdown>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
{/* 
                  {waitingForAiResponse && (
                    // <ThinkingProcess
                    //   steps={thinkingSteps}
                    //   isVisible={showThinkingProcess}
                    // />
                  )} */}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400">

                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500">
              <p>Chat not found or error loading chat.</p>
            </div>
          )}
        </div>
        <div className="mx-auto w-full max-w-4xl px-4">
          <AiInput
            onSubmit={handleSubmit}
            models={aiModels}
            loading={sendingMessage}
            loadingModels={loadingModels}
            loadingAgents={loadingAgents}
            sessionId={chatId}
          />
        </div>
      </main>
    </div>
  )
}