"use client";

import { useState, useEffect, FormEvent, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { MessageSquare, Plus, Loader2, Send, PanelLeft, Trash2, Edit2, Check, X, Bot, User } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ChatSession {
  id: number;
  title: string;
  created_at: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatSidebarProps {
  activeSessionId: string;
  setActiveSessionId: (id: string) => void;
}

export function ChatSidebar({ activeSessionId, setActiveSessionId }: ChatSidebarProps) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  

  const [isThinking, setIsThinking] = useState(false); 

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const ignoreNextFetch = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  const fetchSessions = async () => {
    try {
      const response = await fetch("http://127.0.0.1:8000/api/sessions");
      const data = await response.json();
      setSessions(data);
      if (data.length > 0 && !activeSessionId) {
        setActiveSessionId(data[0].id.toString());
      }
    } catch (error) {
      toast.error("Failed to load chat history");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    if (!activeSessionId) return;
    
    if (ignoreNextFetch.current) {
      ignoreNextFetch.current = false;
      return;
    }

    let isMounted = true;
    const fetchMessages = async () => {
      try {
        const response = await fetch(`http://127.0.0.1:8000/api/sessions/${activeSessionId}/messages`);
        const data = await response.json();
        if (isMounted) setMessages(data);
      } catch (error) {
        toast.error("Could not load messages.");
      }
    };
    fetchMessages();
    
    return () => { isMounted = false; };
  }, [activeSessionId]);

  const createNewSession = async (fromChat = false) => {
    try {
      const response = await fetch("http://127.0.0.1:8000/api/sessions", { method: "POST" });
      const newSession = await response.json();
      
      if (fromChat) ignoreNextFetch.current = true;

      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(newSession.id.toString());
      
      if (!fromChat) setMessages([]); 
      return newSession;
    } catch (error) {
      toast.error("Could not create a new chat.");
      return null;
    }
  };

  const deleteSession = async (idToDelete: string) => {
    try {
      await fetch(`http://127.0.0.1:8000/api/sessions/${idToDelete}`, { method: "DELETE" });
      const updatedSessions = sessions.filter(s => s.id.toString() !== idToDelete);
      setSessions(updatedSessions);
      if (activeSessionId === idToDelete) {
        setActiveSessionId(updatedSessions.length > 0 ? updatedSessions[0].id.toString() : "");
        setMessages([]); 
      }
    } catch (error) {
      toast.error("Could not delete chat.");
    }
  };

  const saveRename = async (id: string) => {
    if (!editTitle.trim()) {
      setEditingSessionId(null);
      return;
    }
    try {
      await fetch(`http://127.0.0.1:8000/api/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle })
      });
      setSessions(prev => prev.map(s => s.id.toString() === id ? { ...s, title: editTitle } : s));
      setEditingSessionId(null);
    } catch (error) {
      toast.error("Failed to rename session.");
    }
  };

  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = input;
    setInput("");
    
    let currentSessionId = activeSessionId;
    if (!currentSessionId) {
      const newlyCreatedSession = await createNewSession(true);
      if (!newlyCreatedSession) return;
      currentSessionId = newlyCreatedSession.id.toString();
    }

    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsThinking(true);

    try {
      const response = await fetch("http://127.0.0.1:8000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, session_id: parseInt(currentSessionId) }),
      });

      if (!response.ok) throw new Error("Network response was not ok");
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      let assistantMessage = "";
      let hasAddedBubble = false;
      let buffer = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        
          buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim();
            if (!dataStr || dataStr === "[DONE]") continue;
            
            try {
              const data = JSON.parse(dataStr);
              if (data.type === "text") {
                let token = data.data;
                
                if (assistantMessage.length === 0 && token.trim().startsWith("!")) {
                   token = token.replace("!", "").trimStart();
                }

                assistantMessage += token;
                
                if (!hasAddedBubble) {
                    setIsThinking(false);
                  hasAddedBubble = true;
                  setMessages((prev) => [...prev, { role: "assistant", content: assistantMessage }]);
                } else {
                    setMessages((prev) => {
                    const newMessages = [...prev];
                    const lastIdx = newMessages.length - 1;
                    newMessages[lastIdx] = { ...newMessages[lastIdx], content: assistantMessage };
                    return newMessages;
                  });
                }
              }
            } catch (err) {
              console.warn("Incomplete JSON received, waiting for next packet...", err);
            }
          }
        }
      }
    } catch (error) {
      toast.error("Failed to send message.");
    } finally {
      setIsThinking(false);
    }
  };

  const activeSessionTitle = sessions.find(s => s.id.toString() === activeSessionId)?.title || "New Session";

  return (
    <div className="flex h-full w-full bg-background overflow-hidden">
      
      {isHistoryOpen && (
        <div className="w-64 border-r bg-muted/20 flex flex-col shrink-0 animate-in slide-in-from-left duration-200 h-full">
          <div className="p-3 border-b flex justify-between items-center bg-background shadow-sm h-[60px] shrink-0">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">History</h2>
            <Button onClick={() => createNewSession(false)} variant="ghost" size="icon" className="h-8 w-8">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          
          <ScrollArea className="flex-1 p-2">
            {isLoading ? (
              <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="space-y-1">
                {sessions.map((session) => (
                  <div key={session.id} className="group relative flex items-center">
                    {editingSessionId === session.id.toString() ? (
                      <div className="flex items-center w-full gap-1 px-2 py-1 bg-secondary rounded-md">
                        <Input 
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="h-7 text-sm px-2"
                          autoFocus
                          onKeyDown={(e) => e.key === "Enter" && saveRename(session.id.toString())}
                        />
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => saveRename(session.id.toString())}>
                          <Check className="w-3.5 h-3.5 text-green-500" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setEditingSessionId(null)}>
                          <X className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Button
                          variant={activeSessionId === session.id.toString() ? "secondary" : "ghost"}
                          className={`w-full justify-start gap-2 font-normal text-sm px-2 pr-16 ${
                            activeSessionId === session.id.toString() ? "bg-secondary font-medium" : "opacity-80"
                          }`}
                          onClick={() => setActiveSessionId(session.id.toString())}
                        >
                          <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{session.title}</span>
                        </Button>
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground" onClick={() => { setEditTitle(session.title); setEditingSessionId(session.id.toString()); }}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="w-7 h-7 hover:text-destructive">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Session?</AlertDialogTitle>
                                <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteSession(session.id.toString())} className="bg-destructive hover:bg-destructive/90 text-white">
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}

      <div className="flex-1 flex flex-col h-full min-w-0">
        <div className="p-3 border-b flex items-center gap-3 bg-background shadow-sm z-10 h-[60px] shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground shrink-0" onClick={() => setIsHistoryOpen(!isHistoryOpen)}>
            <PanelLeft className="w-5 h-5" />
          </Button>
          <span className="text-sm font-semibold truncate">{activeSessionTitle}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-muted/10">
          <div className="space-y-6 pb-4">
            
            <div className="flex w-full mb-4 justify-start">
              <div className="flex gap-3 max-w-[85%] flex-row">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-primary/10 text-primary">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="rounded-2xl px-4 py-3 text-sm overflow-hidden bg-background border shadow-sm">
                  Hello! I am DeepCite. How can I assist you with your research today?
                </div>
              </div>
            </div>

            {messages.map((msg, i) => (
              <div key={i} className={`flex w-full mb-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`flex gap-3 max-w-[85%] ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                  }`}>
                    {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>

                  <div className={`rounded-2xl px-4 py-3 text-sm overflow-x-auto ${
                    msg.role === "user" 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-background border shadow-sm"
                  }`}>
                    {msg.role === "user" ? (
                      msg.content
                    ) : (
                      <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                        <ReactMarkdown>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>

                </div>
              </div>
            ))}
            
            {isThinking && (
              <div className="flex justify-start mb-4">
                <div className="flex gap-3 max-w-[85%] flex-row">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-primary/10 text-primary">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="bg-background border shadow-sm rounded-2xl px-4 py-2.5 text-sm flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> DeepCite is thinking...
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="p-4 bg-background border-t shrink-0">
          <form onSubmit={sendMessage} className="flex gap-2">
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your research..." disabled={isThinking} className="flex-1 bg-muted/50 rounded-full px-4" />
            <Button type="submit" disabled={isThinking || !input.trim()} size="icon" className="rounded-full shrink-0">
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </div>
      
    </div>
  );
}