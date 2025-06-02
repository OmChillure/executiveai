"use client"
import { useState, useEffect, useRef } from "react"
import { AiInput } from "@/components/aiinput"
import { toast } from "sonner"
import { useRouter, usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useSession } from "next-auth/react"
import { v4 as uuidv4 } from "uuid"
import Sidebar from "@/components/Sidebar"
import { Navbar } from "./dashboardNav"
import { motion } from "framer-motion"

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

const suggestionCards = [
  {
    title: "What are the advantages",
    subtitle: "of using Next.js?",
  },
  {
    title: "Write code to",
    subtitle: "demonstrate dijkstra's algorithm",
  },
  {
    title: "Help me write an essay",
    subtitle: "about silicon valley",
  },
  {
    title: "What is the weather",
    subtitle: "in San Francisco?",
  },
]

export default function ChatPage({
  token,
}: {
  token: string
}) {
  const [chats, setChats] = useState<ChatItem[]>([])
  const [loadingChats, setLoadingChats] = useState(true)
  const [sendingMessage, setSendingMessage] = useState(false)
  const [isOpen, setIsOpen] = useState(true)
  const [aiModels, setAiModels] = useState<AIModel[]>([])
  const [aiAgents, setAiAgents] = useState<AIAgent[]>([])
  const [loadingModels, setLoadingModels] = useState(true)
  const [loadingAgents, setLoadingAgents] = useState(true)
  const [activeTab, setActiveTab] = useState("chat")
  const [processingResponse, setProcessingResponse] = useState(false)
  const [currentChatId, setCurrentChatId] = useState<string | null>(null)
  const [currentChat, setCurrentChat] = useState<ChatItem | null>(null)
  const [pendingMessage, setPendingMessage] = useState<{content: string, modelId: string} | null>(null)
  const [hasInitiallyLoadedChats, setHasInitiallyLoadedChats] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const router = useRouter()
  const pathname = usePathname()
  const { data: session } = useSession()

  // Initial load - fetch chats only once
  useEffect(() => {
    if (!hasInitiallyLoadedChats) {
      fetchChats()
      setHasInitiallyLoadedChats(true)
    }
    loadAIModels()
    loadAIAgents()
  }, [])

  // Handle pathname changes - only fetch specific chat if needed
  useEffect(() => {
    if (pathname && pathname.startsWith("/chat/")) {
      const id = pathname.replace("/chat/", "")
      if (id && id !== "undefined") {
        setCurrentChatId(id)
        
        // Check if we already have this chat in our local state
        const existingChat = chats.find(chat => chat.id === id)
        if (existingChat) {
          setCurrentChat(existingChat)
        } else {
          // Only fetch if we don't have it locally
          fetchChatSession(id).then((chat) => {
            if (chat) {
              setCurrentChat(chat)
              // Add to chats list if it's not there (edge case)
              setChats(prevChats => {
                if (!prevChats.find(c => c.id === chat.id)) {
                  return [chat, ...prevChats]
                }
                return prevChats
              })
            }
          })
        }
      }
    } else {
      setCurrentChatId(null)
      setCurrentChat(null)
    }
  }, [pathname, chats])

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [currentChat?.messages])

  const loadAIModels = async () => {
    try {
      setLoadingModels(true)
      const userToken = token || localStorage.getItem("token")

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/models`, {
        headers: {
          Authorization: `Bearer ${userToken}`,
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
            name: "Claude 3.5 Sonnet",
            provider: "Anthropic",
            modelId: "claude-3.5-sonnet",
          },
        ]
        setAiModels(fallbackModels)
        console.error("Error loading AI models from API, using fallback")
      }
    } catch (error) {
      console.error("Error loading AI models:", error)
      toast.error("Failed to load AI models")

      const fallbackModels = [
        {
          id: "1",
          name: "Claude 3.5 Sonnet",
          provider: "Anthropic",
          modelId: "claude-3.5-sonnet",
        },
        {
          id: "2",
          name: "Claude 3 Opus",
          provider: "Anthropic",
          modelId: "claude-3-opus",
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
      const userToken = token || localStorage.getItem("token")

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/agents`, {
        headers: {
          Authorization: `Bearer ${userToken}`,
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
            name: "Financial Analyst",
            type: "financial",
            description: "Analyzes stocks and financial data",
          },
        ]
        setAiAgents(fallbackAgents)
        console.error("Error loading AI agents from API, using fallback")
      }
    } catch (error) {
      console.error("Error loading AI agents:", error)
      toast.error("Failed to load AI agents")

      const fallbackAgents = [
        {
          id: "1",
          name: "YouTube Analyzer",
          type: "youtube",
          description: "Analyzes YouTube video content and answers questions",
        },
        {
          id: "2",
          name: "Financial Analyst",
          type: "financial",
          description: "Analyzes stocks and financial data",
        },
      ]
      setAiAgents(fallbackAgents)
    } finally {
      setLoadingAgents(false)
    }
  }

  const fetchChats = async () => {
    try {
      const userToken = token || localStorage.getItem("token")

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/chat`, {
        headers: {
          Authorization: `Bearer ${userToken}`,
          Accept: "application/json",
        },
      })

      if (response.ok) {
        const data = await response.json()
        setChats(data.data)
      } else {
        toast.error("Failed to fetch chats")
      }
    } catch (error) {
      console.error("Error fetching chats:", error)
      toast.error("Error fetching chats")
    } finally {
      setLoadingChats(false)
    }
  }

  const createNewChat = async () => {
    try {
      const userToken = token || localStorage.getItem("token")
      const newChatId = uuidv4()

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/chat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: newChatId,
          userId: session?.user?.id ?? null,
          title: "New Chat",
        }),
      })

      if (response.ok) {
        const newChat = await response.json()

        // Update local state instead of fetching all chats
        setChats((prevChats) => [newChat, ...prevChats])
        router.push(`/chat/${newChatId}`)
        setCurrentChatId(newChatId)
        setCurrentChat({
          id: newChatId,
          userId: session?.user?.id ?? "",
          title: "New Chat",
          createdAt: new Date().toISOString(),
          messages: [],
        })
      } else {
        toast.error("Failed to create new chat")
      }
    } catch (error) {
      console.error("Error creating new chat:", error)
      toast.error("Error creating new chat")
    }
  }

  const updateChatInList = (chatId: string, updates: Partial<ChatItem>) => {
    setChats((prevChats) => prevChats.map((chat) => (chat.id === chatId ? { ...chat, ...updates } : chat)))
  }

  const handleSuggestionClick = (suggestion: (typeof suggestionCards)[0]) => {
    const fullMessage = `${suggestion.title} ${suggestion.subtitle}`
    if (aiModels.length > 0) {
      handleSubmit(fullMessage, aiModels[0].id, "temp-session")
    }
  }

 const handleSubmit = async (messageContent: string, modelId: string, sessionId: string) => {
    if (!messageContent.trim() || !modelId) return

    try {
      setSendingMessage(true)
      const userToken = token || localStorage.getItem("token")
      
      let chatId = currentChatId

      if (!chatId) {
        chatId = uuidv4()

        const createResponse = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/chat`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${userToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: chatId,
            userId: session?.user?.id ?? null,
            title: messageContent.slice(0, 30),
          }),
        })

        if (createResponse.ok) {
          const newChat = await createResponse.json()

          // Update local state instead of fetching all chats
          setChats((prevChats) => [newChat, ...prevChats])
          setCurrentChatId(chatId)
          setCurrentChat({
            id: chatId,
            userId: session?.user?.id ?? "",
            title: messageContent.slice(0, 30),
            createdAt: new Date().toISOString(),
            messages: [],
          })
        } else {
          throw new Error("Failed to create chat session")
        }
        
        router.push(`/chat/${chatId}`)

        await new Promise(resolve => setTimeout(resolve, 100))
      }

      const newUserMessage: Message = {
        id: uuidv4(),
        role: "user",
        content: messageContent,
        aiModelId: modelId,
        createdAt: new Date().toISOString(),
      }

      // Update local state immediately
      if (currentChat) {
        setCurrentChat({
          ...currentChat,
          messages: [...currentChat.messages, newUserMessage],
        })
      } else {
        setCurrentChat({
          id: chatId!,
          userId: session?.user?.id ?? "",
          title: messageContent.slice(0, 30),
          createdAt: new Date().toISOString(),
          messages: [newUserMessage],
        })
      }

      setProcessingResponse(true)

      // Send the message
      const messageResponse = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/chat/${chatId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: messageContent,
          aiModelId: modelId,
        }),
      })

      if (!messageResponse.ok) {
        throw new Error("Failed to send message")
      }

      updateChatInList(chatId!, {
        title: messageContent.slice(0, 30),
        messages: currentChat ? [...currentChat.messages, newUserMessage] : [newUserMessage],
      })

      // Start polling for response
      let attempts = 0
      const maxAttempts = 30
      const pollInterval = 2000

      const tempAiMessage: Message = {
        id: "temp-typing",
        role: "ai",
        content: "...",
        aiModelId: modelId,
        createdAt: new Date().toISOString(),
      }

      setCurrentChat((prev) => {
        if (!prev) return null
        return {
          ...prev,
          messages: [...prev.messages, tempAiMessage],
        }
      })

      const pollForResponse = async () => {
        if (attempts >= maxAttempts) {
          setProcessingResponse(false)
          toast.error("AI response is taking longer than expected")

          setCurrentChat((prev) => {
            if (!prev) return null
            return {
              ...prev,
              messages: prev.messages.filter((m) => m.id !== "temp-typing"),
            }
          })
          return
        }

        try {
          const chatSession = await fetchChatSession(chatId!)
          if (chatSession && chatSession.messages && chatSession.messages.length > 0) {
            const aiResponse = chatSession.messages.find(
              (m: Message) => m.role === "ai" && m.createdAt > newUserMessage.createdAt,
            )

            if (aiResponse) {
              setCurrentChat(chatSession)
              updateChatInList(chatId!, {
                messages: chatSession.messages,
              })
              setProcessingResponse(false)
              return
            }
          }

          attempts++
          setTimeout(pollForResponse, pollInterval)
        } catch (error) {
          console.error("Error polling for response:", error)
          setProcessingResponse(false)

          setCurrentChat((prev) => {
            if (!prev) return null
            return {
              ...prev,
              messages: prev.messages.filter((m) => m.id !== "temp-typing"),
            }
          })
        }
      }

      setTimeout(pollForResponse, pollInterval)
    } catch (error) {
      console.error("Error:", error)
      toast.error("Failed to send message: " + (error instanceof Error ? error.message : "Unknown error"))
      setProcessingResponse(false)
    } finally {
      setSendingMessage(false)
    }
  }

  const fetchChatSession = async (chatId: string) => {
    try {
      const userToken = token || localStorage.getItem("token")
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/chat/${chatId}`, {
        headers: {
          Authorization: `Bearer ${userToken}`,
          Accept: "application/json",
        },
      })

      if (!response.ok) {
        throw new Error("Failed to fetch chat session")
      }

      return await response.json()
    } catch (error) {
      console.error(`Error fetching chat ${chatId}:`, error)
      return null
    }
  }

  const deleteChat = async (chatId: string) => {
    try {
      const userToken = token || localStorage.getItem("token")

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/chat/${chatId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${userToken}`,
          Accept: "application/json",
        },
      })

      if (response.ok) {
        // Update local state instead of fetching all chats
        setChats(chats.filter((chat) => chat.id !== chatId))
        toast.success("Chat deleted successfully")

        if (pathname === `/chat/${chatId}`) {
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

  const renderMessage = (message: Message) => {
    if (message.role === "user") {
      return (
        <div key={message.id} className="flex justify-end mb-4">
          <div className="bg-white text-black rounded-xl py-2 px-4 max-w-[70%]">{message.content}</div>
        </div>
      )
    } else {
      return (
        <div key={message.id} className="flex mb-4">
          <div className="flex items-start">
            <div className="flex-shrink-0 mr-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-neutral-800 border border-neutral-700">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M12 2L2 7L12 12L22 7L12 2Z"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M2 17L12 22L22 17"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M2 12L12 17L22 12"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
            <div className="bg-neutral-800 text-white rounded-xl py-2 px-4 max-w-[70%]">
              {message.id === "temp-typing" ? (
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  ></div>
                  <div
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "0.4s" }}
                  ></div>
                </div>
              ) : (
                message.content
              )}
            </div>
          </div>
        </div>
      )
    }
  }

  // Pass pending message to the input if we have one
  useEffect(() => {
    if (pendingMessage && pathname?.includes('/chat/')) {
      // Clear pending message once we've navigated
      setPendingMessage(null)
    }
  }, [pathname, pendingMessage])

  return (
    <div className="flex h-screen bg-[#030303] overflow-hidden">
      <div className={cn(
        "fixed left-0 top-0 h-full bg-neutral-900 border-r border-neutral-800 transition-all duration-300 z-10",
        isOpen ? "w-64" : "w-0"
      )}>
        <div className="h-full overflow-hidden">
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
        </div>
      </div>

      <main className={cn("flex-1 flex flex-col h-full transition-all duration-300", isOpen ? "ml-64" : "ml-0")}>
        <Navbar isOpen={isOpen} setIsOpen={setIsOpen} className={cn(isOpen ? "left-[17.2rem]" : "left-1")} />

        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            <style jsx>{`
              .scrollbar-hide {
                -ms-overflow-style: none;
                scrollbar-width: none;
              }
              .scrollbar-hide::-webkit-scrollbar {
                display: none;
              }
            `}</style>
            <div className="h-full flex flex-col">
              {!currentChat || currentChat.messages.length === 0 ? (
                <motion.div
                  className="flex-1 flex flex-col justify-center items-center px-4"
                  initial={{ opacity: 0, y: 50 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                >
                  <div className="max-w-[47.4rem] w-full">
                    <motion.div
                      className="mb-16"
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
                    >
                      <h1 className="text-4xl font-semibold text-white mb-2">Hello there!</h1>
                      <p className="text-xl text-gray-500">Enjoy our executive service!</p>
                    </motion.div>

                    <motion.div
                      className="grid grid-cols-1 md:grid-cols-2 gap-4"
                      initial={{ opacity: 0, y: 40 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, delay: 0.4, ease: "easeOut" }}
                    >
                      {suggestionCards.map((suggestion, index) => (
                        <motion.button
                          key={index}
                          onClick={() => handleSuggestionClick(suggestion)}
                          className="p-4 rounded-xl border border-neutral-700 bg-neutral-800/30 hover:bg-neutral-700/50 transition-all duration-200 text-left group"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: 0.4,
                            delay: 0.6 + index * 0.1,
                            ease: "easeOut",
                          }}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <div className="text-white font-medium transition-colors">
                            {suggestion.title}
                          </div>
                          <div className="text-gray-500 text-sm mt-1">{suggestion.subtitle}</div>
                        </motion.button>
                      ))}
                    </motion.div>
                  </div>
                </motion.div>
              ) : (
                <div className="flex-1 p-4 text-white">
                  <div className="max-w-4xl mx-auto">
                    {currentChat.messages.map((message) => renderMessage(message))}
                    <div ref={messagesEndRef} />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex-shrink-0">
            <div className="mx-auto w-full max-w-4xl">
              <AiInput
                onSubmit={handleSubmit}
                models={aiModels}
                loading={sendingMessage || processingResponse}
                loadingModels={loadingModels}
                loadingAgents={loadingAgents}
                sessionId={currentChatId || "temp-session"}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}