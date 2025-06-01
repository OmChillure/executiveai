import { auth } from "@/auth";
import { redirect } from "next/navigation";
import ChatComponent from "@/components/chat-page";

const ChatPage = async () => {
    
    const session = await auth(); 
    if (!session || !session.user.token) {
        redirect("/api/auth/signin")
    }

    return <ChatComponent token={session.user.token} />
}

export default ChatPage