import { useEffect, useRef } from "react";
import { Bot, User, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import MarkdownContent from "@/components/markdown-content";
import QuickStarters from "@/components/quick-starters";
import type { ChatMessage } from "@shared/schema";

interface ChatInterfaceProps {
  messages: ChatMessage[];
  streamingMessage?: Partial<ChatMessage> | null;
  isLoading: boolean;
  isLoadingMessages?: boolean;
  isAiProcessing?: boolean;
  isTtsProcessing?: boolean;
  isUiTimedOut?: boolean;
  error: string | null;
  onRetry?: () => void;
  quickStarters?: Array<{ text: string; description?: string }>;
  onQuickStart?: (text: string) => void;
}

export default function ChatInterface({ messages, streamingMessage, isLoading, isLoadingMessages, isAiProcessing, isTtsProcessing, isUiTimedOut, error, onRetry, quickStarters = [], onQuickStart }: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastUserMessageRef = useRef<HTMLDivElement>(null);

  // Scroll to latest user message first, then to end for AI response
  useEffect(() => {
    if (lastUserMessageRef.current) {
      lastUserMessageRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [messages, streamingMessage]);

  useEffect(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 300); // Small delay to allow user message to scroll first
  }, [messages, streamingMessage]);

  // Show error with retry button if timeout or error
  if ((error || isUiTimedOut) && !isLoading) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="mb-4 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
            <p className="text-destructive font-semibold mb-2">
              {isUiTimedOut ? "Request Taking Too Long" : "Failed to get response"}
            </p>
            <p className="text-muted-foreground text-sm mb-4">
              {isUiTimedOut 
                ? "The AI is taking longer than expected. You can try again, or the API might still be processing your request."
                : error || "Something went wrong. Please try again."}
            </p>
          </div>
          {onRetry && (
            <Button 
              onClick={onRetry}
              variant="default"
              size="sm"
              className="gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Try Again
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Show skeleton while loading initial message history
  if (isLoadingMessages && messages.length === 0) {
    return (
      <div className="flex-1 p-3 sm:p-6 space-y-3 sm:space-y-4 overflow-y-auto" data-testid="chat-messages-loading">
        {/* Initial AI Message Skeleton */}
        <div className="flex items-start gap-2 sm:gap-3">
          <Skeleton className="w-7 h-7 sm:w-9 sm:h-9 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>

        {/* Message Skeleton Rows */}
        {[...Array(3)].map((_, i) => (
          <div key={i} className="space-y-3 sm:space-y-4">
            {/* User Message Skeleton */}
            <div className="flex items-start gap-2 sm:gap-3 flex-row-reverse">
              <Skeleton className="w-7 h-7 sm:w-9 sm:h-9 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>

            {/* AI Response Skeleton */}
            <div className="flex items-start gap-2 sm:gap-3">
              <Skeleton className="w-7 h-7 sm:w-9 sm:h-9 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            </div>
          </div>
        ))}
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
          <div className="text-[12px] sm:text-base">
            <MarkdownContent content="Hi! I'm an AI assistant. Feel free to ask me about projects, skills, or experience!" />
          </div>
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
              <div className="text-[12px] sm:text-base" data-testid={`ai-response-${index}`}>
                <MarkdownContent content={msg.response} />
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Streaming Message */}
      {streamingMessage && streamingMessage.response && (
        <div className="space-y-3 sm:space-y-4">
          {/* User Message from streaming */}
          <div className="flex items-start gap-2 sm:gap-3 flex-row-reverse">
            <div className="w-7 h-7 sm:w-9 sm:h-9 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
            </div>
            <div className="bg-primary rounded-2xl rounded-tr-none px-3 py-2 sm:px-4 sm:py-2.5 max-w-[80%] sm:max-w-md">
              <p className="text-[12px] sm:text-base leading-relaxed text-primary-foreground">
                {streamingMessage.message}
              </p>
            </div>
          </div>

          {/* Streaming AI Response */}
          <div className="flex items-start gap-2 sm:gap-3">
            <div className="w-7 h-7 sm:w-9 sm:h-9 bg-secondary rounded-full flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-secondary-foreground" />
            </div>
            <div className="bg-muted rounded-2xl rounded-tl-none px-3 py-2 sm:px-4 sm:py-2.5 max-w-[80%] sm:max-w-md">
              <div className="text-[12px] sm:text-base">
                <MarkdownContent content={streamingMessage.response || ''} />
              </div>
              {/* Typing indicator for active stream */}
              <div className="flex items-center space-x-2 mt-2">
                <div className="flex space-x-1">
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-muted-foreground/50 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading State - Only show if no streaming message */}
      {isLoading && !streamingMessage && (
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

      {/* Quick Starters - Show after last message when not loading */}
      {!isLoading && !isAiProcessing && quickStarters.length > 0 && (
        <div className="mt-6 px-3 sm:px-4">
          <QuickStarters
            starters={quickStarters}
            onSelect={(text) => {
              onQuickStart?.(text);
            }}
            isLoading={isLoading}
          />
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
