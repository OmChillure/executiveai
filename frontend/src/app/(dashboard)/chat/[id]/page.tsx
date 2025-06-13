"use client"
import { useState, useEffect, useRef } from "react"
import { toast } from "sonner"
import { useRouter, usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { cn } from "@/lib/utils"
import { AiInput } from "@/components/aiinput"
import ReactMarkdown from "react-markdown"
import Sidebar from "@/components/Sidebar"
import { Navbar } from "@/components/dashboardNav"
import { useThinkingProcess } from "@/hooks/useToolRenderer"
import { v4 as uuidv4 } from "uuid"
import { use } from "react"
import { flushSync } from 'react-dom';

// File icon component
const FileIcon = ({ type, mimeType }: { type: string; mimeType: string }) => {
  switch (type) {
    case "image":
      return <div className="w-5 h-5 bg-blue-400 rounded flex items-center justify-center text-xs text-white">IMG</div>
    case "pdf":
      return <div className="w-5 h-5 bg-red-400 rounded flex items-center justify-center text-xs text-white">PDF</div>
    case "spreadsheet":
      return <div className="w-5 h-5 bg-green-400 rounded flex items-center justify-center text-xs text-white">XLS</div>
    case "document":
      return <div className="w-5 h-5 bg-blue-400 rounded flex items-center justify-center text-xs text-white">DOC</div>
    case "text":
      return <div className="w-5 h-5 bg-gray-400 rounded flex items-center justify-center text-xs text-white">TXT</div>
    default:
      return <div className="w-5 h-5 bg-gray-400 rounded flex items-center justify-center text-xs text-white">FILE</div>
  }
}

// Streaming message component with typing effect
const StreamingMessage = ({ content, isComplete }: { content: string; isComplete: boolean }) => {
  return (
    <div className="flex items-start message-fade-in">
      <div className="flex-shrink-0 mr-3">
        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black border border-gray-700">
          <span className="text-xs text-white">AI</span>
        </div>
      </div>
      <div className="flex-1 p-0.5 text-white streaming-content">
        <div className="prose prose-invert max-w-none">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
        {!isComplete && (
          <span className="inline-block w-2 h-5 bg-white ml-1 typing-cursor"></span>
        )}
      </div>
    </div>
  )
}

const ThinkingProcess = ({ steps, isVisible }: { steps: any[]; isVisible: boolean }) => {
  if (!isVisible || !steps.length) return null

  return (
    <div className="flex items-start message-fade-in">
      <div className="flex-shrink-0 mr-3">
        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black border border-gray-700">
          <span className="text-xs text-white">AI</span>
        </div>
      </div>
      <div className="flex-1 p-0.5 text-white">
        <div className="space-y-3">
          <div className="text-sm font-medium text-gray-300 mb-2 flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent mr-2"></div>
            Thinking Process
          </div>
          {steps.map((step: any) => (
            <div key={step.id} className="border border-gray-700 rounded-lg p-3 bg-gray-800/30">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-white">{step.title}</span>
                <div className="flex items-center space-x-2">
                  {step.status === 'in_progress' && (
                    <div className="animate-spin rounded-full h-3 w-3 border border-blue-500 border-t-transparent"></div>
                  )}
                  {step.status === 'completed' && (
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  )}
                  {step.status === 'error' && (
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-400">{step.description}</p>
              {step.metadata && (
                <div className="mt-2 text-xs text-gray-500">
                  {step.metadata.confidence && (
                    <span>Confidence: {step.metadata.confidence}%</span>
                  )}
                  {step.metadata.agentName && (
                    <span className="ml-2">Agent: {step.metadata.agentName}</span>
                  )}
                  {step.metadata.duration && (
                    <span className="ml-2">Duration: {step.metadata.duration}ms</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Interfaces
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
  files?: ProcessedFile[]
}

interface ProcessedFile {
  id: string
  originalName: string
  mimeType: string
  size: number
  type: "text" | "document" | "spreadsheet" | "image" | "pdf" | "unknown"
  content?: string
  hasFullContent: boolean
  processingError?: string
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
  stream?: boolean
}

export default function ChatIdPage({ params }: { params: { id: string } }) {
  const unwrappedParams = params instanceof Promise ? use(params) : params
  const chatId = unwrappedParams.id

  // Core state
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

  // UI state
  const [isOpen, setIsOpen] = useState(true)
  const [activeTab, setActiveTab] = useState("chat")
  const [isInitialized, setIsInitialized] = useState(false)

  // AI models and agents
  const [aiModels, setAiModels] = useState<AIModel[]>([])
  const [aiAgents, setAiAgents] = useState<AIAgent[]>([])
  const [loadingModels, setLoadingModels] = useState(true)
  const [loadingAgents, setLoadingAgents] = useState(true)

  // Streaming state
  const [streamingContent, setStreamingContent] = useState<string>("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)
  const [useStreaming, setUseStreaming] = useState(true)
  const [streamingSpeed, setStreamingSpeed] = useState<'slow' | 'normal' | 'fast'>('slow')

  // Thinking process
  const {
    steps: thinkingSteps,
    isVisible: showThinkingProcess,
    startThinking,
    addStep,
    updateStep,
    completeThinking,
    hideThinking,
  } = useThinkingProcess()

  // Router and session
  const router = useRouter()
  const pathname = usePathname()
  const { data: session, status: sessionStatus } = useSession()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll effect
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [currentChat?.messages, waitingForAiResponse, showThinkingProcess, isStreaming, streamingContent])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef) {
        clearTimeout(pollingRef)
      }
    }
  }, [pollingRef])

  // Initialize chat when component mounts
  useEffect(() => {
    if (!isInitialized && sessionStatus !== "loading") {
      setIsInitialized(true)
      initializeChat()
    }
  }, [sessionStatus, isInitialized])

  // Save streaming preference to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('useStreaming', useStreaming.toString())
    }
  }, [useStreaming])

  // Load streaming preference from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('useStreaming')
      if (saved !== null) {
        setUseStreaming(saved === 'true')
      }
    }
  }, [])

  const initializeChat = async () => {
    try {
      const [chatResult] = await Promise.allSettled([
        fetchChatDetails(chatId),
        fetchChats(),
        loadAIModels(),
        loadAIAgents(),
      ])

      if (chatResult.status === "rejected") {
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

  const addNewChatToList = (newChat: ChatItem) => {
    setChats((prevChats) => [newChat, ...prevChats])
  }

  const updateChatInList = (chatId: string, updates: Partial<ChatItem>) => {
    setChats((prevChats) => prevChats.map((chat) => (chat.id === chatId ? { ...chat, ...updates } : chat)))
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
        await new Promise((resolve) => setTimeout(resolve, retryDelay))
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

  // COMPLETE STREAMING IMPLEMENTATION
  const sendMessageWithStreaming = async (
    chatId: string,
    messageContent: string,
    modelId: string,
    token: string,
    userMessage: Message,
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      try {
        const streamingMessageId = `streaming-${Date.now()}`
        setStreamingMessageId(streamingMessageId)
        setStreamingContent("")
        setIsStreaming(true)

        const sendStreamRequest = async () => {
          const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/chat/${chatId}/stream`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              Accept: "text/event-stream",
              "Cache-Control": "no-cache",
            },
            body: JSON.stringify({
              content: messageContent,
              aiModelId: modelId,
              streamingSpeed: streamingSpeed,
            }),
          })

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
          }

          const contentType = response.headers.get("content-type")
          if (!contentType?.includes("text/event-stream")) {
            throw new Error("Response is not an event stream")
          }

          const reader = response.body?.getReader()
          if (!reader) {
            throw new Error("Response body is not readable")
          }

          const decoder = new TextDecoder()
          let buffer = ""

          const processStream = async () => {
            try {
              while (true) {
                const { done, value } = await reader.read()

                if (done) {
                  setIsStreaming(false)
                  resolve()
                  break
                }

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split("\n")
                buffer = lines.pop() || ""

                for (const line of lines) {
                  if (line.startsWith("data: ")) {
                    const data = line.slice(6).trim()

                    if (data === "[DONE]") {
                      setIsStreaming(false)
                      setStreamingContent("")
                      setStreamingMessageId(null)
                      resolve()
                      return
                    }

                    if (data) {
                      try {
                        const parsedData = JSON.parse(data)
                        console.log("Received streaming data:", parsedData)

                        if (parsedData.type === "connected") {
                          console.log("Stream connected")
                        } else if (parsedData.type === "status") {
                          console.log("Status:", parsedData.message)
                        } else if (parsedData.type === "response_chunk") {
                          if (parsedData.type === "response_chunk") {
                            flushSync(() => {
                              setStreamingContent(prev => prev + parsedData.chunk);
                            });
                          }
                        } else if (parsedData.type === "response_complete") {
                          console.log("Streaming complete")
                        } else if (parsedData.type === "final_response") {
                          if (currentChat && parsedData.aiResponse) {
                            setCurrentChat((prev) => {
                              if (!prev) return null

                              const messagesWithUser = prev.messages.some((m) => m.id === userMessage.id)
                                ? prev.messages
                                : [...prev.messages, userMessage]

                              return {
                                ...prev,
                                messages: [...messagesWithUser, parsedData.aiResponse],
                              }
                            })
                            setLastMessageId(userMessage.id)
                          }

                          // Clean up streaming state
                          setIsStreaming(false)
                          setStreamingContent("")
                          setStreamingMessageId(null)
                          setWaitingForAiResponse(false)
                          setMessageBeforeAI(null)
                        } else if (parsedData.type === "error") {
                          throw new Error(parsedData.error)
                        }
                      } catch (parseError) {
                        console.error("Error parsing streaming data:", parseError)
                      }
                    }
                  }
                }
              }
            } catch (streamError) {
              console.error("Stream processing error:", streamError)
              setIsStreaming(false)
              setStreamingContent("")
              setStreamingMessageId(null)
              reject(streamError)
            }
          }

          await processStream()
        }

        sendStreamRequest().catch(reject)
      } catch (error) {
        console.error("Streaming setup error:", error)
        setIsStreaming(false)
        setStreamingContent("")
        setStreamingMessageId(null)
        reject(error)
      }
    })
  }

  // COMPLETE THINKING PROCESS SSE
  const sendMessageWithThinkingSSE = async (
    chatId: string,
    messageContent: string,
    modelId: string,
    token: string,
    userMessage: Message,
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      try {
        const sendMessageRequest = async () => {
          const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/chat/${chatId}/tools`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              Accept: "text/event-stream",
              "Cache-Control": "no-cache",
            },
            body: JSON.stringify({
              content: messageContent,
              aiModelId: modelId,
            }),
          })

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
          }

          const contentType = response.headers.get("content-type")
          if (!contentType?.includes("text/event-stream")) {
            throw new Error("Response is not an event stream")
          }

          const reader = response.body?.getReader()
          if (!reader) {
            throw new Error("Response body is not readable")
          }

          const decoder = new TextDecoder()
          let buffer = ""

          const processStream = async () => {
            try {
              while (true) {
                const { done, value } = await reader.read()

                if (done) {
                  resolve()
                  break
                }

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split("\n")
                buffer = lines.pop() || ""

                for (const line of lines) {
                  if (line.startsWith("data: ")) {
                    const data = line.slice(6).trim()

                    if (data === "[DONE]") {
                      resolve()
                      return
                    }

                    if (data) {
                      try {
                        const parsedData = JSON.parse(data)
                        console.log("Received thinking SSE data:", parsedData)

                        if (parsedData.type === "thinking_step") {
                          const step = parsedData.step
                          if (step.id && thinkingSteps.find((s: { id: any }) => s.id === step.id)) {
                            updateStep(step.id, step)
                          } else {
                            addStep(step)
                          }
                        } else if (parsedData.type === "final_response") {
                          if (currentChat && parsedData.aiResponse) {
                            setCurrentChat((prev) => {
                              if (!prev) return null

                              const messagesWithUser = prev.messages.some((m) => m.id === userMessage.id)
                                ? prev.messages
                                : [...prev.messages, userMessage]

                              return {
                                ...prev,
                                messages: [...messagesWithUser, parsedData.aiResponse],
                              }
                            })
                            setLastMessageId(userMessage.id)
                          }

                          completeThinking()
                          setTimeout(() => {
                            hideThinking()
                            setWaitingForAiResponse(false)
                            setMessageBeforeAI(null)
                          }, 1000)
                        } else if (parsedData.type === "error") {
                          throw new Error(parsedData.error)
                        }
                      } catch (parseError) {
                        console.error("Error parsing thinking SSE data:", parseError)
                      }
                    }
                  }
                }
              }
            } catch (streamError) {
              console.error("Thinking stream processing error:", streamError)
              reject(streamError)
            }
          }

          await processStream()
        }

        sendMessageRequest().catch(reject)
      } catch (error) {
        console.error("Thinking SSE setup error:", error)
        reject(error)
      }
    })
  }

  // COMPLETE MAIN SUBMIT HANDLER
  const handleSubmit = async (messageContent: string, modelId: string, sessionId: string, files?: ProcessedFile[]) => {
    if (!messageContent.trim() || !modelId) return

    // Clear any existing polling
    if (pollingRef) {
      clearTimeout(pollingRef)
      setPollingRef(null)
    }

    try {
      setSendingMessage(true)
      const token = session?.user?.token || localStorage.getItem("token")

      let actualChatId = chatId

      // Create new chat if needed
      if (!currentChat || chatNotFound) {
        actualChatId = uuidv4()
        router.push(`/chat/${actualChatId}`)
        await new Promise((resolve) => setTimeout(resolve, 100))

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
          addNewChatToList(newChat)
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

      // Create temporary user message
      const tempUserMessage: Message = {
        id: `temp-user-${Date.now()}`,
        role: "user",
        content: messageContent,
        aiModelId: modelId,
        createdAt: new Date().toISOString(),
        files: files || [],
      }

      // Add user message to UI immediately
      setMessageBeforeAI(tempUserMessage)
      setCurrentChat((prev) => {
        if (!prev) {
          return {
            id: actualChatId,
            userId: session?.user?.id ?? "",
            title: messageContent.slice(0, 30),
            createdAt: new Date().toISOString(),
            messages: [tempUserMessage],
          }
        }
        return {
          ...prev,
          messages: [...(prev.messages || []), tempUserMessage],
        }
      })

      setSendingMessage(false)
      setWaitingForAiResponse(true)

      try {
        if (useStreaming) {
          // Use streaming mode
          console.log("🌊 Using streaming for response...")
          await sendMessageWithStreaming(actualChatId, messageContent, modelId, token || "", tempUserMessage)
        } else {
          // Use thinking process mode
          console.log("💭 Using thinking process for response...")
          startThinking()
          await sendMessageWithThinkingSSE(actualChatId, messageContent, modelId, token || "", tempUserMessage)
        }

        // Update chat list
        if (currentChat) {
          updateChatInList(actualChatId, {
            title: currentChat.title || messageContent.substring(0, 50) + "...",
            messages: currentChat.messages,
          })
        }
      } catch (error) {
        console.error("Primary method failed, falling back to regular API:", error)

        // Fallback to regular message sending
        try {
          const result = await sendMessage(actualChatId, messageContent, modelId)

          if (result && result.userMessage && result.aiResponse) {
            result.userMessage.files = files || []

            setCurrentChat((prev) => {
              if (!prev) return null
              const filteredMessages = prev.messages.filter((m) => m.id !== tempUserMessage.id)

              return {
                ...prev,
                messages: [...filteredMessages, result.userMessage, result.aiResponse],
              }
            })

            updateChatInList(actualChatId, {
              title: currentChat?.title || messageContent.substring(0, 50) + "...",
              messages: [...(currentChat?.messages || []), result.userMessage, result.aiResponse],
            })

            setLastMessageId(result.userMessage.id)
          }
        } catch (fallbackError) {
          console.error("Fallback also failed:", fallbackError)
          toast.error("Failed to send message. Please try again.")
        }

        // Clean up states
        if (showThinkingProcess) {
          completeThinking()
          setTimeout(() => {
            hideThinking()
          }, 1000)
        }

        setWaitingForAiResponse(false)
        setMessageBeforeAI(null)
        setIsStreaming(false)
        setStreamingContent("")
        setStreamingMessageId(null)
      }
    } catch (error) {
      console.error("Error in handleSubmit:", error)
      toast.error("Failed to send message: " + (error instanceof Error ? error.message : "Unknown error"))

      // Clean up all states
      setWaitingForAiResponse(false)
      setSendingMessage(false)
      setMessageBeforeAI(null)
      setIsStreaming(false)
      setStreamingContent("")
      setStreamingMessageId(null)
      hideThinking()

      // Refresh chat if it exists
      if (currentChat && !chatNotFound) {
        fetchChatDetails(chatId, 0)
      }
    }
  }

  // Helper functions
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
          messages: [],
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

  // Early returns for special states
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
                        <div className="h-4 bg-[#222222] rounded mb-2"></div>
                        <div className="h-4 bg-[#222222] rounded mb-2 w-[90%]"></div>
                        <div className="h-4 bg-[#222222] rounded w-[75%]"></div>
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
                    const isUserMessage = msg.role === "user"

                    return (
                      <div key={msg.id} className="rounded-lg message-fade-in">
                        {isUserMessage ? (
                          <div className="flex justify-end">
                            <div className="max-w-[30rem]">
                              {msg.files && msg.files.length > 0 && (
                                <div className="mb-3 flex justify-end">
                                  <div className="max-w-[20rem]">
                                    <div className="mb-1 p-2 rounded-xl border border-neutral-700/30 bg-neutral-800/20">
                                      <div
                                        className="flex items-center gap-3 overflow-x-auto"
                                        style={{ scrollbarWidth: "thin", scrollbarColor: "#6b7280 transparent" }}
                                      >
                                        {msg.files.map((file) => (
                                          <div key={file.id} className="relative flex-shrink-0">
                                            <div className="w-12 h-12 rounded-lg border border-neutral-700/50 bg-neutral-800/30 flex items-center justify-center overflow-hidden">
                                              <FileIcon type={file.type} mimeType={file.mimeType} />
                                            </div>
                                            <div className="mt-1 text-xs text-gray-400 truncate w-12 text-center">
                                              {file.originalName}
                                            </div>
                                            {file.processingError && (
                                              <div className="mt-1 text-xs text-red-400 truncate w-12 text-center">
                                                Error
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
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
                              <div className="prose prose-invert max-w-none">
                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {isStreaming && streamingContent && (
                    <div className="rounded-lg">
                      <StreamingMessage
                        content={streamingContent}
                        isComplete={false}
                      />
                    </div>
                  )}

                  {waitingForAiResponse && showThinkingProcess && !isStreaming && (
                    <div className="rounded-lg">
                      <ThinkingProcess
                        steps={thinkingSteps}
                        isVisible={showThinkingProcess}
                      />
                    </div>
                  )}

                  {waitingForAiResponse && !isStreaming && !showThinkingProcess && (
                    <div className="flex items-start">
                      <div className="flex-shrink-0 mr-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-black border border-gray-700">
                          <span className="text-xs text-white">AI</span>
                        </div>
                      </div>
                      <div className="flex-1 p-0.5 text-white">
                        <div className="flex items-center space-x-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-white"></div>
                          <span className="text-gray-400">Processing your request...</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <h3 className="text-lg font-medium mb-2">Start a conversation</h3>
                    <p className="text-sm text-gray-500 mb-1">
                      {useStreaming ? "🌊 Streaming responses enabled" : "💭 Standard responses enabled"}
                    </p>
                    <p className="text-xs text-gray-600">
                      {aiModels.length} models • {aiAgents.length} agents available
                    </p>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500">
              <div className="text-center">
                <h3 className="text-lg font-medium mb-2">Chat not found</h3>
                <p className="text-sm">The requested chat could not be loaded.</p>
              </div>
            </div>
          )}
        </div>

        <div className="mx-auto w-full max-w-4xl px-4">
          <AiInput
            onSubmit={handleSubmit}
            models={aiModels}
            loading={sendingMessage || isStreaming}
            loadingModels={loadingModels}
            loadingAgents={loadingAgents}
            sessionId={chatId}
          />
        </div>
      </main>

      <style jsx>{`
        .chat-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .chat-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .chat-scrollbar::-webkit-scrollbar-thumb {
          background: #374151;
          border-radius: 3px;
        }
        .chat-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #4b5563;
        }

        /* Custom scrollbar for file carousel */
        div[style*="scrollbar-width"]::-webkit-scrollbar {
          height: 6px;
        }
        div[style*="scrollbar-width"]::-webkit-scrollbar-track {
          background: transparent;
        }
        div[style*="scrollbar-width"]::-webkit-scrollbar-thumb {
          background: #6b7280;
          border-radius: 3px;
        }
        div[style*="scrollbar-width"]::-webkit-scrollbar-thumb:hover {
          background: #9ca3af;
        }

        /* Typing cursor animation */
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        
        .typing-cursor {
          animation: blink 1s infinite;
        }

        /* Smooth transitions for streaming content */
        .streaming-content {
          transition: all 0.2s ease-in-out;
        }

        /* Smooth fade-in for new messages */
        .message-fade-in {
          animation: fadeIn 0.3s ease-in-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Streaming text effect */
        .streaming-text {
          animation: streamIn 0.1s ease-out;
        }

        @keyframes streamIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        /* Status pulse animation */
        .status-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  )
}