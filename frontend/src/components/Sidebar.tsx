"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Plus, ChevronUp, ChevronDown, LogOut, Trash2, Network } from "lucide-react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useSession, signOut } from "next-auth/react"
import React from "react"

interface ChatItem {
  id: string
  userId: string
  title: string
  createdAt: string
  messages: {
    id: string
    role: "user" | "ai"
    content: string
    aiModelId: string
    aiAgentId?: string
    createdAt: string
  }[]
}

interface SidebarProps {
  chats: ChatItem[]
  loadingChats: boolean
  deleteChat: (chatId: string) => Promise<void>
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  activeTab?: string
  setActiveTab?: (tab: string) => void
  createNewChat: () => Promise<void>
}

export default function Sidebar({
  chats,
  loadingChats,
  deleteChat,
  isOpen,
  createNewChat,
}: SidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: session } = useSession()
  const [theme, setTheme] = useState<"dark" | "light">("dark")
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isDeletingChat, setIsDeletingChat] = useState<string | null>(null)
  const [activeMenu, setActiveMenu] = useState<string | null>(null)

  const todayChats = chats.filter((chat) => {
    const chatDate = new Date(chat.createdAt)
    const today = new Date()
    return chatDate.toDateString() === today.toDateString()
  })

  const olderChats = chats.filter((chat) => {
    const chatDate = new Date(chat.createdAt)
    const today = new Date()
    return chatDate.toDateString() !== today.toDateString()
  })

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark")
  }

  const handleDeleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.preventDefault()
    e.stopPropagation()

    if (isDeletingChat === chatId) return

    try {
      setIsDeletingChat(chatId)
      await deleteChat(chatId)

      if (pathname === `/chat/${chatId}`) {
        router.push("/chat")
      }
    } catch (error) {
      console.error("Error deleting chat:", error)
    } finally {
      setIsDeletingChat(null)
    }
  }

  const renderChatItem = (chat: ChatItem) => (
    <div
      key={chat.id}
      className={cn(
        "flex items-center py-1 px-3 rounded-md hover:bg-[#030303] transition-colors mx-1",
        pathname === `/chat/${chat.id}` ? "bg-[#030303]" : "",
      )}
    >
      <Link href={`/chat/${chat.id}`} className="flex-1 overflow-hidden">
        <span className="text-sm truncate max-w-[200px] inline-block ">{chat.title || "New chat"}</span>
      </Link>
      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-6 w-6 opacity-0 group-hover:opacity-100 hover:opacity-100",
            pathname === `/chat/${chat.id}` ? "opacity-100" : "",
          )}
          onClick={(e : any) => {
            e.preventDefault()
            e.stopPropagation()
            setActiveMenu(activeMenu === chat.id ? null : chat.id)
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lucide lucide-more-horizontal"
          >
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
            <circle cx="5" cy="12" r="1" />
          </svg>
          <span className="sr-only">Options</span>
        </Button>

        {activeMenu === chat.id && (
          <div className="absolute right-0 mt-1 w-36 bg-[#1a1a1a] border border-[#333] rounded-md shadow-lg z-50">
            <div className="py-2">
              <button
                className="flex w-full items-center px-3 py-2 text-sm text-white hover:bg-[#333]"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  navigator.clipboard.writeText(`${window.location.origin}/chat/${chat.id}`)
                  setActiveMenu(null)
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mr-2"
                >
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" x2="12" y1="2" y2="15" />
                </svg>
                Share
              </button>
              <button
                className="flex w-full items-center px-3 py-2 text-sm text-red-500 hover:bg-[#333]"
                onClick={(e) => handleDeleteChat(e, chat.id)}
                disabled={isDeletingChat === chat.id}
              >
                {isDeletingChat === chat.id ? (
                  <div className="h-3 w-3 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Trash2 className="h-3 w-3 mr-2" />
                )}
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  React.useEffect(() => {
    const handleClickOutside = () => {
      if (activeMenu) {
        setActiveMenu(null)
      }
    }

    document.addEventListener("click", handleClickOutside)
    return () => {
      document.removeEventListener("click", handleClickOutside)
    }
  }, [activeMenu])

  return (
    <div
      className={cn(
        "fixed top-0 left-0 h-screen z-40 transition-transform duration-300 ease-in-out",
        "w-68 flex flex-col bg-[#171717] text-white overflow-hidden border-r border-[#333333]",
        isOpen ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="p-3 px-4 flex justify-between items-center">
        <h1 className="text-xl font-semibold">Executive AI</h1>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white bg-[#030303] hover:bg-[#030303] rounded-md"
            onClick={() => router.push("/chat")}
          >
            <Plus className="h-5 w-5" />
            <span className="sr-only">New Chat</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white bg-[#030303] hover:bg-[#030303] rounded-md"
            onClick={() => router.push("/plugins")}
          >
            <Network className="h-5 w-5" />
            <span className="sr-only">Plugins</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-[calc(100vh-120px)]">
          {todayChats.length > 0 && (
            <div className="px-2 py-1">
              <p className="text-sm text-gray-500 pl-3.5">Today</p>
              <div className="space-y-0.5 mt-1">
                {todayChats.map((chat) => (
                  <div key={chat.id} className="group">
                    {renderChatItem(chat)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {olderChats.length > 0 && (
            <div className="px-2 py-1">
              <p className="text-sm text-gray-500 pl-3.5">Previous</p>
              <div className="space-y-0.5 mt-1">
                {olderChats.map((chat) => (
                  <div key={chat.id} className="group">
                    {renderChatItem(chat)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {chats.length === 0 && !loadingChats && (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-gray-500">No chat history</p>
            </div>
          )}

          {loadingChats && (
            <div className="px-4 py-2">
              <div className="space-y-2 animate-pulse">
                {[...Array(3)].map((_, index) => (
                  <div key={index} className="h-8 bg-[#111111] rounded-md"></div>
                ))}
              </div>
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="mt-auto">
        <div className="p-3">
          <div className="relative">
            <Button
              variant="ghost"
              className=" flex items-center justify-between p-2 bg-[#030303] rounded-md text-white hover:bg-[#030303] w-62"
              onClick={() => setIsProfileOpen(!isProfileOpen)}
            >
              <div className="flex items-center gap-2">
                {session?.user?.image ? (
                  <img src={session.user.image || "/placeholder.svg"} alt="Profile" className="w-6 h-6 rounded-full" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center">a</div>
                )}
                <span>{session?.user?.name || session?.user?.email || "Guest"}</span>
              </div>
              {isProfileOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>

            {isProfileOpen && (
              <div className="absolute bottom-full mb-2 right-0 p-2 bg-[#030303] rounded-md text-sm w-full">
                {session?.user?.email && <div className="text-gray-400 mb-2">{session.user.email}</div>}
                <Button
                  variant="ghost"
                  className="w-full justify-start text-white hover:bg-gray-700"
                  onClick={toggleTheme}
                >
                  Toggle light mode
                </Button>

                {!session && (
                  <Button
                    variant="outline"
                    className="w-full justify-start text-white bg-gray-800 hover:bg-gray-700 border-gray-700"
                    onClick={() => router.push("/login")}
                  >
                    Login to your account
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="w-full justify-start text-white hover:bg-gray-700"
                  onClick={() => {
                    signOut({
                      redirect: true,
                      callbackUrl: "/api/auth/signin",
                    })
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span className="truncate">Logout</span>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
