"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import "katex/dist/katex.min.css";

interface Message {
  id: number;
  role: string;
  content: string;
}

interface ChatSidebarProps {
  activeProjectId: string;
}

export function ChatSidebar({ activeProjectId }: ChatSidebarProps) {
  const { token } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [agentStatus, setAgentStatus] = useState<string>(""); 
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeProjectId || !token) return;
    const fetchMessages = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/projects/${activeProjectId}/messages`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) setMessages(await res.json());
      } catch (e) {
        toast.error("Failed to load history");
      }
    };
    fetchMessages();
  }, [activeProjectId, token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, agentStatus]);

  const sendMessage = async () => {
    if (!input.trim() || !activeProjectId || !token) return;

    const userMsg = input;
    setInput("");
    
    setMessages(prev => [...prev, { id: Date.now(), role: "user", content: userMsg }]);
    setIsLoading(true);
    setAgentStatus("Initializing swarm..."); 

    try {
      const response = await fetch("http://127.0.0.1:8000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ message: userMsg, project_id: parseInt(activeProjectId) })
      });

      if (!response.body) throw new Error("No response body");

      setMessages(prev => [...prev, { id: Date.now() + 1, role: "assistant", content: "" }]);
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          // Bulletproof SSE string extraction to prevent swallowed first words
          if (trimmedLine.startsWith("data:")) {
            const dataStr = trimmedLine.slice(5).trim();
            if (dataStr) {
              try {
                const parsed = JSON.parse(dataStr);
                
                if (parsed.type === "text") {
                  setAgentStatus(""); 
                  
                  setMessages(prev => {
                    const newMsgs = [...prev];
                    const lastIndex = newMsgs.length - 1;
                    newMsgs[lastIndex] = { 
                      ...newMsgs[lastIndex], 
                      content: newMsgs[lastIndex].content + parsed.data 
                    };
                    return newMsgs;
                  });

                } else if (parsed.type === "status") {
                  setAgentStatus(parsed.data); 
                }
              } catch (err) {
                // Ignore partial JSON parse errors
              }
            }
          }
        }
      }
      window.dispatchEvent(new Event("notesUpdated"));
    } catch (error) {
      toast.error("Message failed to send");
    } finally {
      setIsLoading(false);
      setAgentStatus("");
    }
  };

  return (
    <div className="w-full h-full bg-black/40 backdrop-blur-xl flex flex-col border-r border-white/10 text-gray-200">
      
      <div className="p-4 border-b border-white/10 flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => router.push("/")} className="hover:bg-white/10 shrink-0">
          <ArrowLeft className="w-4 h-4 text-gray-400" />
        </Button>
        <div className="flex-1 overflow-hidden">
          <h2 className="font-serif font-semibold text-sm truncate">Research Swarm</h2>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Active Connection</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => {
          const isAssistant = msg.role === "assistant" || msg.role === "synthesizer";
          const isLastMessage = i === messages.length - 1;
          const isThinking = isAssistant && isLastMessage && isLoading && msg.content === "";

          return (
            <div key={msg.id} className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[90%] p-4 rounded-2xl text-sm leading-relaxed ${
                isAssistant 
                  ? "bg-white/5 text-gray-200 border border-white/10 shadow-inner" 
                  : "bg-blue-600 text-white shadow-lg"
              }`}>
                {isThinking ? (
                  <div className="flex items-center gap-2 text-blue-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="italic font-medium">{agentStatus || "Thinking..."}</span>
                  </div>
                ) : (
                  <div className={isAssistant ? "prose prose-sm prose-invert max-w-none prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10" : "whitespace-pre-wrap"}>
                    {isAssistant ? (
                      <ReactMarkdown 
                        remarkPlugins={[remarkMath, remarkGfm]} 
                        rehypePlugins={[rehypeKatex]}
                        components={{
                          table: ({node, ...props}) => (
                            <div className="overflow-x-auto w-full my-4 rounded-lg border border-white/10 bg-black/20">
                              <table className="w-full text-sm text-left border-collapse" {...props} />
                            </div>
                          ),
                          th: ({node, ...props}) => <th className="px-4 py-2 font-semibold border-b border-white/10 whitespace-nowrap" {...props} />,
                          td: ({node, ...props}) => <td className="px-4 py-2 border-b border-white/5 whitespace-nowrap" {...props} />
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    ) : (
                      msg.content
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-white/10 bg-[#0a0a0c] flex flex-col gap-2 shrink-0">
        <div className="relative flex items-end gap-2 bg-white/5 border border-white/10 rounded-xl p-2 focus-within:border-blue-500/50 transition-all">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask your research swarm..."
            disabled={isLoading}
            className="flex-1 bg-transparent text-sm text-white focus:outline-none resize-none min-h-[24px] max-h-[150px] py-1 px-2"
            rows={1}
          />
          <Button
            size="sm"
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="shrink-0 bg-blue-600 hover:bg-blue-500 h-8 w-8 p-0 rounded-lg shadow-lg"
          >
            ↑
          </Button>
        </div>
      </div>
    </div>
  );
}