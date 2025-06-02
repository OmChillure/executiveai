"use client"

import { Button } from "@/components/ui/button"
import { Menu, ChevronDown, Plus, LogOut, GalleryHorizontal, Network } from 'lucide-react'
import { cn } from "@/lib/utils"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/drop-down"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession, signOut } from "next-auth/react"

interface NavbarProps {
    isOpen: boolean
    setIsOpen: (isOpen: boolean) => void
    className?: string
}

export function Navbar({ isOpen, setIsOpen, className }: NavbarProps) {
    const router = useRouter()
    const { data: session } = useSession()

    return (
        <div className={cn("w-full flex items-center justify-between px-6 py-2 h-14", className)}>
            <div className="flex items-center gap-2">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-white hover:bg-gray-800 border border-[#171717]"
                    onClick={() => setIsOpen(!isOpen)}
                >
                    <GalleryHorizontal className="h-5 w-5" />
                    <span className="sr-only">Toggle Sidebar</span>
                </Button>
                {!isOpen && (
                    <>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-white hover:bg-gray-800  border border-[#171717] rounded-md"
                        onClick={() => router.push("/chat")}
                    >
                        <Plus className="h-5 w-5" />
                        <span className="sr-only">New Chat</span>
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-white hover:bg-gray-800  border border-[#171717] rounded-md"
                        onClick={() => router.push("/plugins")}
                    >
                        <Network className="h-5 w-5" />
                        <span className="sr-only">Plugins</span>
                    </Button>
                    </>
                )}

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 px-2 text-white hover:bg-[#171717] border border-[#171717] flex items-center gap-1">
                            <h1 className="text-sm font-medium">Agents</h1>
                            <ChevronDown className="h-4 w-4 mt-[4px]" />
                        </Button>
                    </DropdownMenuTrigger>
                    {/* <DropdownMenuContent align="start" className="w-56 bg-[#171717] border-[#171717] text-white">
                        <Link href={"/agents"}>
                            <DropdownMenuItem className="hover:bg-[#171717] focus:bg-[#030303] cursor-pointer">All Agents</DropdownMenuItem>
                        </Link>
                        <DropdownMenuItem className="hover:bg-[#171717] focus:bg-[#030303] cursor-pointer">
                            Clear All Chats
                        </DropdownMenuItem>
                    </DropdownMenuContent> */}
                </DropdownMenu>
            </div>
        </div>
    )
}
