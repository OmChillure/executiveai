import { auth } from "@/auth";
import { redirect } from "next/navigation";
import ChatComponent from "@/components/chat-page";
import PLuginChat from "./pluginsChat";

const ChatPage = async () => {
    
    const session = await auth(); 
    if (!session || !session.user.token) {
        redirect("/api/auth/signin")
    }

    return <PLuginChat token={session.user.token} />
}

export default ChatPage