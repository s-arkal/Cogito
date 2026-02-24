"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { User, Cpu, Send } from "lucide-react"; 

export type Message = {
  role: "user" | "assistant";
  content: string;
  status?: string; 
};

export function ChatSidebar() {
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: "assistant", 
      content: "Hello! I am DeepCite. Upload a paper, or ask me to research a topic." 
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"; 
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    const userMessage = input;
    
    setMessages((prev) => [
      ...prev, 
      { role: "user", content: userMessage },
      { role: "assistant", content: "" } 
    ]);
    
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setIsLoading(true);

try {
      const response = await fetch("http://127.0.0.1:8000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      });

      if (!response.ok) throw new Error(`Backend Error (${response.status})`);
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");

      let done = false;
      let buffer = ""; 
      let accumulatedText = ""; 

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          
          const lines = buffer.split("\n");
          
          buffer = lines.pop() || "";
          
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const dataStr = line.replace("data: ", "");
              if (!dataStr.trim()) continue;
              
              try {
                const payload = JSON.parse(dataStr);
                
                if (payload.type === "status") {
                  setMessages((prev) => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1].status = payload.data;
                    return newMessages;
                  });
                } else if (payload.type === "text") {
                  accumulatedText += payload.data;
                  
                  setMessages((prev) => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1].content = accumulatedText;
                    newMessages[newMessages.length - 1].status = ""; 
                    return newMessages;
                  });
                }
              } catch (e) {
                console.error("Parse error on chunk:", dataStr);
              }
            }
          }
        }
      }
    } catch (error: any) {
      setMessages((prev) => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1].content = `**Error:** ${error.message}`;
        return newMessages;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col bg-muted/20 h-full w-full">
      <div className="p-4 border-b bg-background flex items-center gap-2 shadow-sm z-10">
        <Cpu className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold tracking-tight leading-none">DeepCite</h1>
          <p className="text-xs text-muted-foreground mt-1">Orchestrator Agent</p>
        </div>
      </div>
      
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full p-4">
          <div className="space-y-6 pb-4">
            {messages.map((msg, i) => (
              <div key={i} className="flex gap-4">
                <div className="mt-1 flex-shrink-0">
                  {msg.role === "user" ? (
                    <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center border border-primary/20">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-sm">
                      <Cpu className="w-4 h-4" />
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-2 overflow-hidden">
                  <span className="text-sm font-semibold text-foreground">
                    {msg.role === "user" ? "You" : "DeepCite"}
                  </span>
                  
                  {msg.status && (
                    <div className="text-xs text-primary/70 animate-pulse italic mb-2">
                      {msg.status}
                    </div>
                  )}
                  
                  {msg.content === "" && isLoading && !msg.status ? (
                    <div className="flex gap-1 py-2 items-center">
                      <div className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" />
                      <div className="w-2 h-2 rounded-full bg-primary/40 animate-bounce [animation-delay:-.3s]" />
                      <div className="w-2 h-2 rounded-full bg-primary/40 animate-bounce [animation-delay:-.5s]" />
                    </div>
                  ) : (
                    <div className="prose prose-sm dark:prose-invert max-w-none break-words leading-relaxed text-muted-foreground">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>
      </div>

      <div className="p-4 border-t bg-background">
        <form 
          onSubmit={(e) => { e.preventDefault(); handleSend(); }} 
          className="flex gap-2 items-end bg-muted/50 p-1 pl-3 rounded-xl border focus-within:ring-1 focus-within:ring-ring transition-shadow"
        >
          <textarea 
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Type your request... (Shift+Enter for new line)" 
            disabled={isLoading}
            rows={1}
            className="flex-1 max-h-[200px] min-h-[40px] bg-transparent border-0 focus-visible:ring-0 resize-none py-3 text-sm scrollbar-thin outline-none"
          />
          <Button 
            type="submit" 
            disabled={isLoading || !input.trim()} 
            size="icon"
            className="h-10 w-10 shrink-0 rounded-lg mb-1 mr-1"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}