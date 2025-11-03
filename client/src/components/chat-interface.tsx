import { useEffect, useRef } from "react";
import { Bot, User } from "lucide-react";
import type { ChatMessage } from "@shared/schema";

interface ChatInterfaceProps {
  messages: ChatMessage[];
  isLoading: boolean;
  isAiProcessing?: boolean;
  isTtsProcessing?: boolean;
  error: string | null;
}

export default function ChatInterface({ messages, isLoading, isAiProcessing, isTtsProcessing, error }: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastUserMessageRef = useRef<HTMLDivElement>(null);

  // Scroll to latest user message first, then to end for AI response
  useEffect(() => {
    if (lastUserMessageRef.current) {
      lastUserMessageRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [messages]);

  useEffect(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 300); // Small delay to allow user message to scroll first
  }, [messages]);

  if (error) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-2">Failed to load chat</p>
          <p className="text-muted-foreground text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-3 sm:p-6 space-y-3 sm:space-y-4 overflow-y-auto" data-testid="chat-messages">
      {/* Initial AI Message */}
      <div className="flex items-start gap-2 sm:gap-3">
        <div className="w-7 h-7 sm:w-9 sm:h-9 bg-secondary rounded-full flex items-center justify-center flex-shrink-0">
          <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-secondary-foreground" />
        </div>
        <div className="bg-muted rounded-2xl rounded-tl-none px-3 py-2 sm:px-4 sm:py-2.5 max-w-[80%] sm:max-w-md">
          <p className="text-[12px] sm:text-base leading-relaxed text-muted-foreground">
            Hi! I'm an AI assistant. Feel free to ask me about projects, skills, or experience!
          </p>
        </div>
      </div>

      {/* Dynamic Messages - Sequential Flow */}
      {messages.map((msg, index) => (
        <div key={msg.$id} className="space-y-3 sm:space-y-4">
          {/* User Message */}
          <div ref={index === messages.length - 1 ? lastUserMessageRef : null} className="flex items-start gap-2 sm:gap-3 flex-row-reverse">
            <div className="w-7 h-7 sm:w-9 sm:h-9 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
            </div>
            <div className="bg-primary rounded-2xl rounded-tr-none px-3 py-2 sm:px-4 sm:py-2.5 max-w-[80%] sm:max-w-md">
              <p 
                className="text-[12px] sm:text-base leading-relaxed text-primary-foreground"
                data-testid={`user-message-${index}`}
              >
                {msg.message}
              </p>
            </div>
          </div>

          {/* AI Response */}
          <div className="flex items-start gap-2 sm:gap-3">
            <div className="w-7 h-7 sm:w-9 sm:h-9 bg-secondary rounded-full flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-secondary-foreground" />
            </div>
            <div className="bg-muted rounded-2xl rounded-tl-none px-3 py-2 sm:px-4 sm:py-2.5 max-w-[80%] sm:max-w-md">
              <p 
                className="text-[12px] sm:text-base leading-relaxed text-muted-foreground"
                data-testid={`ai-response-${index}`}
              >
                {msg.response}
              </p>
            </div>
          </div>
        </div>
      ))}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-start gap-2 sm:gap-3">
          <div className="w-7 h-7 sm:w-9 sm:h-9 bg-secondary rounded-full flex items-center justify-center flex-shrink-0">
            <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-secondary-foreground" />
          </div>
          <div className="bg-muted rounded-2xl rounded-tl-none px-3 py-2 sm:px-4 sm:py-2.5 max-w-[80%] sm:max-w-sm">
            <div className="flex items-center space-x-2">
              <div className="flex space-x-1.5">
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-muted-foreground/50 rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
              <span className="text-xs sm:text-sm text-muted-foreground">
                {isAiProcessing ? 'AI is thinking...' : isTtsProcessing ? 'Generating speech...' : 'Processing...'}
              </span>
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
