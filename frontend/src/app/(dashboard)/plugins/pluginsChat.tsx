"use client"
import { useState, useEffect, useRef } from "react"
import { toast } from "sonner"
import { useRouter, usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useSession } from "next-auth/react"
import Sidebar from "@/components/Sidebar"
import { Navbar } from "@/components/dashboardNav"
import { CheckCircle, ExternalLink, HardDrive, FileText, Database, Calendar, Cloud, Github, Trello } from "lucide-react"

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

export default function PluginChat({
  token,
}: {
  token: string
}) {
  const [chats, setChats] = useState<ChatItem[]>([])
  const [loadingChats, setLoadingChats] = useState(true)
  const [isOpen, setIsOpen] = useState(true)
  const [activeTab, setActiveTab] = useState("plugins")
  const [currentChatId, setCurrentChatId] = useState<string | null>(null)
  const [currentChat, setCurrentChat] = useState<ChatItem | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Google Drive integration state
  const [gdriveLoading, setGdriveLoading] = useState(false)
  const [gdriveConnected, setGdriveConnected] = useState(false)

  const router = useRouter()
  const pathname = usePathname()
  const { data: session } = useSession()

  useEffect(() => {
    fetchChats()

    const wasConnected = localStorage.getItem("gdrive_connected") === "true"
    if (wasConnected) {
      setGdriveConnected(true)
    }

    if (pathname && pathname.startsWith("/chat/")) {
      const id = pathname.replace("/chat/", "")
      if (id && id !== "undefined") {
        setCurrentChatId(id)
        fetchChatSession(id).then((chat) => {
          if (chat) {
            setCurrentChat(chat)
          }
        })
      }
    }

    // Check for Google Drive auth callback
    const params = new URLSearchParams(window.location.search)
    const connection = params.get("connection")
    const status = params.get("status")

    if (connection === "gdrive" && status === "success") {
      // Mark as connected and persist in localStorage
      setGdriveConnected(true)
      localStorage.setItem("gdrive_connected", "true")
      toast.success("Successfully connected to Google Drive! You can now use Google Drive commands in chat.")

      // Clear URL params
      window.history.replaceState({}, document.title, window.location.pathname)
    } else if (connection === "gdrive" && status === "error") {
      toast.error("Failed to connect to Google Drive. Please try again.")

      // Clear URL params
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [pathname])

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [currentChat?.messages])

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

  const handleConnect = async () => {
    try {
      setGdriveLoading(true)
      const userToken = token || localStorage.getItem("token")

      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/gdrive/auth`, {
        headers: {
          Authorization: `Bearer ${userToken}`,
          Accept: "application/json",
        },
      })

      if (response.ok) {
        const data = await response.json()

        if (data.success && data.authRequired && data.authUrl) {
          // Redirect to Google's auth page
          window.location.href = data.authUrl
        } else if (data.success && !data.authRequired) {
          // Already connected
          setGdriveConnected(true)
          localStorage.setItem("gdrive_connected", "true")
          toast.success("Already connected to Google Drive!")
        }
      } else {
        toast.error("Failed to start Google Drive authentication")
      }
    } catch (error) {
      console.error("Error initiating Google Drive auth:", error)
      toast.error("Failed to start Google Drive authentication")
    } finally {
      setGdriveLoading(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      const userToken = token || localStorage.getItem("token")

      // Call backend to disconnect/clear tokens
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/gdrive/disconnect`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          Accept: "application/json",
        },
      })

      // Clear frontend state regardless of backend response
      setGdriveConnected(false)
      localStorage.removeItem("gdrive_connected")

      if (response.ok) {
        toast.success("Successfully disconnected from Google Drive")
      } else {
        toast.success("Disconnected from Google Drive")
      }
    } catch (error) {
      // Clear frontend state even if backend call fails
      setGdriveConnected(false)
      localStorage.removeItem("gdrive_connected")
      toast.success("Disconnected from Google Drive")
    }
  }

  // Plugin UI content
  const renderPluginContent = () => {
    if (activeTab !== "plugins") return null

    // Plugin data
    const plugins = [
      {
        id: "gdrive",
        name: "Google Drive",
        description: "Access and manage your files",
        icon: <HardDrive className="h-6 w-6" />,
        isConnected: gdriveConnected,
        isLoading: gdriveLoading,
        onConnect: handleConnect,
        onDisconnect: handleDisconnect,
        isAvailable: true,
        connectedInfo: "Use commands like 'list my recent Drive files' in chat",
      },
      {
        id: "notion",
        name: "Notion",
        description: "Connect your workspace",
        icon: <FileText className="h-6 w-6" />,
        isConnected: false,
        isLoading: false,
        onConnect: () => {},
        onDisconnect: () => {},
        isAvailable: false,
      },
      {
        id: "github",
        name: "GitHub",
        description: "Access your repositories",
        icon: <Github className="h-6 w-6" />,
        isConnected: false,
        isLoading: false,
        onConnect: () => {},
        onDisconnect: () => {},
        isAvailable: false,
      },
      {
        id: "trello",
        name: "Trello",
        description: "Manage your boards",
        icon: <Trello className="h-6 w-6" />,
        isConnected: false,
        isLoading: false,
        onConnect: () => {},
        onDisconnect: () => {},
        isAvailable: false,
      },
      {
        id: "calendar",
        name: "Google Calendar",
        description: "Manage your events",
        icon: <Calendar className="h-6 w-6" />,
        isConnected: false,
        isLoading: false,
        onConnect: () => {},
        onDisconnect: () => {},
        isAvailable: false,
      },
      {
        id: "cloud",
        name: "Cloud Storage",
        description: "Manage cloud files",
        icon: <Cloud className="h-6 w-6" />,
        isConnected: false,
        isLoading: false,
        onConnect: () => {},
        onDisconnect: () => {},
        isAvailable: false,
      },
    ]

    return (
      <div className="max-w-7xl mx-auto px-12 py-2">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Integrations</h2>
          <p className="text-gray-400">Connect your favorite tools and services</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {plugins.map((plugin) => (
            <div
              key={plugin.id}
              className={`relative ${
                plugin.isConnected ? "bg-[#171717] border-green-600/50" : "bg-[#171717]"
              } border rounded-xl p-6 hover:bg-[#171717] transition-all duration-300 flex flex-col group`}
            >
              {plugin.isConnected && (
                <div className="absolute top-4 right-4">
                  <div className="flex items-center text-green-400 bg-green-900/80 px-2 py-1 rounded-md text-xs">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    <span>Connected</span>
                  </div>
                </div>
              )}

              <div className="flex-1 flex flex-col">
                <div className="mb-4">
                  <div
                    className={`h-12 w-12 rounded-lg ${
                      plugin.isConnected
                        ? "bg-green-900/50 border border-green-700/50"
                        : "bg-black border border-[#171717]"
                    } flex items-center justify-center transition-all duration-300`}
                  >
                    <div className={plugin.isConnected ? "text-green-400" : "text-gray-400"}>{plugin.icon}</div>
                  </div>
                </div>

                <div className="flex-1 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-white">{plugin.name}</h3>
                    {!plugin.isAvailable && (
                      <span className="text-xs bg-black text-gray-400 px-2 py-0.5 rounded">Coming Soon</span>
                    )}
                  </div>
                  <p className="text-gray-400 text-sm">{plugin.description}</p>

                    {plugin.isConnected && plugin.connectedInfo && (
                    <p className="text-green-400/80 text-xs mt-2">💡 {plugin.connectedInfo}</p>
                  )}
                </div>

                <div className="mt-auto">
                  {plugin.isAvailable ? (
                    plugin.isConnected ? (
                      <button
                        onClick={plugin.onDisconnect}
                        className="w-full text-red-400 hover:text-red-300 transition-colors text-sm border border-red-800/50 rounded-lg py-2 hover:bg-red-900/20"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={plugin.onConnect}
                        disabled={plugin.isLoading}
                        className="w-full bg-black text-white py-2 rounded-lg flex items-center justify-center transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                      >
                        {plugin.isLoading ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Connecting...
                          </>
                        ) : (
                          <>
                            Connect
                            <ExternalLink className="ml-2 h-3 w-3" />
                          </>
                        )}
                      </button>
                    )
                  ) : (
                    <button
                      disabled
                      className="w-full bg-black text-gray-500 py-2 rounded-lg flex items-center justify-center cursor-not-allowed text-sm"
                    >
                      Coming Soon
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
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
        createNewChat={(): Promise<void> => {
          throw new Error("Function not implemented.")
        }}
      />

      <main className={cn("flex-1 flex flex-col h-full transition-all duration-300", isOpen ? "ml-64" : "ml-0")}>
        <Navbar isOpen={isOpen} setIsOpen={setIsOpen} className={cn(isOpen ? "left-[17.2rem]" : "left-1")} />

        <div className="flex-1 overflow-auto">{renderPluginContent()}</div>
      </main>
    </div>
  )
}
