import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { MessageCircle, X, Send, Bot, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const PAGE_LABELS: Record<string, string> = {
  "/": "Dashboard",
  "/visitors": "Visitors",
  "/checkin": "Check-In",
  "/staff": "Staff",
  "/members": "Members",
  "/contractors": "Contractors",
  "/contractor-portal-admin": "Contractor Portal Admin",
  "/muster": "Mustering",
  "/ppm": "PPM",
  "/audits": "Audits & Inspections",
  "/hs-incidents": "H&S Incidents",
  "/fire-risk-assessment": "Fire Risk Assessment",
  "/martyn-law": "Martyn's Law",
  "/permit-to-work": "Permit to Work",
  "/ra-builder": "Risk Assessment Builder",
  "/compliance-certificates": "Compliance Certificates",
  "/compliance-dashboard": "Compliance Dashboard",
  "/meeting-rooms": "Meeting Rooms",
  "/template-library": "Template Library",
  "/reports": "Reports",
  "/analytics": "Analytics",
  "/settings": "Settings",
  "/lone-worker": "Lone Worker",
  "/induction-settings": "Induction Settings",
  "/helpdesk": "Help Desk",
  "/hr": "HR Hub",
};

function getPageLabel(path: string): string {
  if (PAGE_LABELS[path]) return PAGE_LABELS[path];
  for (const [prefix, label] of Object.entries(PAGE_LABELS)) {
    if (prefix.length > 1 && path.startsWith(prefix)) return label;
  }
  return path;
}

export default function ChatbotWidget() {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentPage = getPageLabel(location);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading]);

  async function sendMessage() {
    const text = inputValue.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputValue("");
    setIsLoading(true);
    setHasError(false);

    try {
      const response = await apiRequest("POST", "/api/chatbot/ask", {
        messages: updatedMessages,
        currentPage,
      });
      const data = await response.json();
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.answer || "Sorry, I couldn't generate a response — please try again.",
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I couldn't reach the help assistant just now — please try again in a moment.",
        },
      ]);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function clearChat() {
    setMessages([]);
    setInputValue("");
    setHasError(false);
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {isOpen && (
        <div className="w-[22rem] max-w-[calc(100vw-3rem)] flex flex-col rounded-2xl shadow-2xl border border-gray-200 bg-white overflow-hidden"
          style={{ height: "28rem" }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: "#2460A9" }}>
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-white" />
              <div>
                <p className="text-sm font-semibold text-white leading-tight">Help Assistant</p>
                <p className="text-xs text-blue-200 leading-tight">I can help with how to use TPR</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {messages.length > 0 && (
                <button
                  onClick={clearChat}
                  className="text-blue-200 hover:text-white text-xs transition-colors"
                  title="Clear chat"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="text-blue-200 hover:text-white transition-colors"
                aria-label="Close help assistant"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50">
            {messages.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center h-full text-center px-2 gap-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: "#e8f0fb" }}>
                  <Bot className="h-6 w-6" style={{ color: "#2460A9" }} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">How can I help?</p>
                  <p className="text-xs text-gray-500 mt-1">Ask me how to use any part of TPR. I cannot see your data.</p>
                </div>
                <div className="flex flex-col gap-2 w-full mt-1">
                  {["How do I add a contractor?", "How do I start a muster?", "How do I create an induction?"].map((q) => (
                    <button
                      key={q}
                      onClick={() => { setInputValue(q); inputRef.current?.focus(); }}
                      className="text-xs text-left px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 hover:border-blue-300 hover:text-blue-700 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mr-2 mt-0.5" style={{ backgroundColor: "#2460A9" }}>
                    <Bot className="h-3.5 w-3.5 text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "text-white rounded-br-sm"
                      : "bg-white text-gray-800 border border-gray-200 rounded-bl-sm"
                  }`}
                  style={msg.role === "user" ? { backgroundColor: "#2460A9" } : {}}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start items-center gap-2">
                <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: "#2460A9" }}>
                  <Bot className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-3 py-2 flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                  <span className="text-xs text-gray-400">Thinking…</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="px-3 py-3 border-t border-gray-200 bg-white">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about how to use TPR…"
                disabled={isLoading}
                maxLength={2000}
                className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 disabled:opacity-60 transition-colors"
              />
              <button
                onClick={sendMessage}
                disabled={!inputValue.trim() || isLoading}
                aria-label="Send message"
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white transition-opacity disabled:opacity-40"
                style={{ backgroundColor: "#2460A9" }}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5 text-center">
              I can't see your data — for live information visit the relevant page
            </p>
          </div>
        </div>
      )}

      <button
        onClick={() => setIsOpen((o) => !o)}
        aria-label={isOpen ? "Close help assistant" : "Open help assistant"}
        className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white transition-transform hover:scale-105 active:scale-95 relative"
        style={{ backgroundColor: "#2460A9" }}
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <>
            <MessageCircle className="h-6 w-6" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white" title="Help available" />
          </>
        )}
      </button>
    </div>
  );
}
