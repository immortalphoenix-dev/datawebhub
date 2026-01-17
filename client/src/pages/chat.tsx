import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, RefreshCw } from "lucide-react";
import ChatInterface from "@/components/chat-interface";
import { useChat } from "@/hooks/use-chat";
import { usePrompts } from "@/hooks/use-prompts";
import { lazy, Suspense } from "react";
const Avatar3D = lazy(() => import("@/components/avatar-3d"));

export default function Chat() {
  const [message, setMessage] = useState("");
  const [currentAnimation, setCurrentAnimation] = useState<string | undefined>(undefined);
  const [currentMorphTargets, setCurrentMorphTargets] = useState<{ [key: string]: number } | undefined>(undefined);
  
  const { 
    messages, 
    streamingMessage,
    sendMessage, 
    retryMessage,
    isLoading, 
    isAiProcessing,
    isTtsProcessing,
    isLoadingMessages,
    isUiTimedOut,
    error,
    visemes,
    visemeStartTime,
    quickStarters,
    setQuickStarters,
  } = useChat();

  // Helper: Calculate mouth open intensity based on current viseme
  const getMouthIntensityFromViseme = (visemes: { id: number; offset: number }[], startTime: number | null): number => {
    if (!visemes || visemes.length === 0 || !startTime) return 0;
    
    const now = performance.now();
    const elapsed = now - startTime;
    
    // Find the current viseme based on elapsed time
    let currentViseme = visemes[0];
    for (const viseme of visemes) {
      if (viseme.offset <= elapsed) {
        currentViseme = viseme;
      } else {
        break;
      }
    }
    
    // Map viseme ID to mouth open intensity (0-1)
    // Viseme 0 = silence, 1-10 = vowels/open sounds, 12-21 = consonants/closed
    const mouthIntensity: { [key: number]: number } = {
      0: 0.0,    // silence
      1: 0.8,    // ah
      2: 0.7,    // eye
      3: 0.6,    // ow
      4: 0.8,    // aw
      5: 0.6,    // eh
      6: 0.5,    // er
      7: 0.7,    // ee
      8: 0.8,    // oh
      9: 0.8,    // oo
      10: 0.9,   // aa
      11: 0.6,   // ay
      12: 0.3,   // p/b/m
      13: 0.2,   // d/t/n
      14: 0.4,   // f/v
      15: 0.2,   // k/g
      16: 0.1,   // h
      17: 0.3,   // ch/sh
      18: 0.4,   // l
      19: 0.3,   // r
      20: 0.2,   // s/z
      21: 0.3,   // th
    };
    
    return mouthIntensity[currentViseme.id] ?? 0;
  };

  // Determine current animation: thinking → speaking → talking (visemes) → message metadata
  let effectiveAnimation = currentAnimation;
  
  if (isAiProcessing) {
    // While AI is processing (before response starts streaming), show "thinking"
    effectiveAnimation = 'thinking';
  } else if (isTtsProcessing && visemes && visemes.length > 0 && visemeStartTime) {
    // If TTS is playing with visemes, use "talking" for synchronization
    effectiveAnimation = 'talking';
  } else if (visemes && visemes.length > 0 && visemeStartTime) {
    // If visemes are active (audio playing), use "talking"
    effectiveAnimation = 'talking';
  }

  const { data: prompts, isLoading: isLoadingPrompts } = usePrompts();

  // Always wave when the chat page is opened
  useEffect(() => {
    setCurrentAnimation('waving');
  }, []);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.response) {
      try {
        const metadata = lastMessage.metadata;
        if (metadata) {
          if (metadata.animation) {
            const anim = typeof metadata.animation === 'string' ? metadata.animation.trim() : undefined;
            if (anim) {
              // Force re-trigger even if the same animation name arrives consecutively
              setCurrentAnimation((prev) => {
                if (prev === anim) {
                  // Clear first so Avatar3D effect runs again, then set on next tick
                  setTimeout(() => setCurrentAnimation(anim), 0);
                  return undefined;
                }
                return anim;
              });
            }
          }
          if (metadata.morphTargets) {
            setCurrentMorphTargets(metadata.morphTargets);
          }
        }
      } catch (e) {
        console.error("Failed to use message metadata:", e);
      }
    }
  }, [messages]);

  // Update morphTargets with mouth intensity driven by visemes
  useEffect(() => {
    if (visemes && visemes.length > 0 && visemeStartTime) {
      // Calculate mouth intensity based on current viseme
      const mouthIntensity = getMouthIntensityFromViseme(visemes, visemeStartTime);
      
      // Update morphTargets with mouth open intensity
      setCurrentMorphTargets(prev => ({
        ...prev,
        mouthOpen: Math.max(mouthIntensity * 0.9, 0.1), // Scale down slightly, min 0.1 for visibility
      }));
    }
  }, [visemes, visemeStartTime]);

  // Continuously update mouth intensity as audio plays (drive animation during speech)
  useEffect(() => {
    if (!visemes || visemes.length === 0 || !visemeStartTime || !isTtsProcessing) {
      return;
    }

    // Update mouth intensity every 50ms for smooth animation
    const animationInterval = setInterval(() => {
      const mouthIntensity = getMouthIntensityFromViseme(visemes, visemeStartTime);
      setCurrentMorphTargets(prev => ({
        ...prev,
        mouthOpen: Math.max(mouthIntensity * 0.9, 0.1),
      }));
    }, 50);

    return () => clearInterval(animationInterval);
  }, [visemes, visemeStartTime, isTtsProcessing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isLoading || isLoadingPrompts) return;

    const userMessage = message.trim();
    setMessage("");
    
    try {
      await sendMessage(userMessage, prompts || []);
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  const handleNewChat = () => {
    localStorage.removeItem('sessionId');
    window.location.reload();
  };

  return (
    <section id="chat" className="py-12 sm:py-24 lg:py-32 bg-background min-h-screen">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        <div className="text-center mb-6 sm:mb-12 relative">
          <h2 className="font-heading text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-foreground mb-3 sm:mb-4">
            AI <span className="text-primary">Chat</span>
          </h2>
          <Button onClick={handleNewChat} variant="outline" size="icon" className="absolute top-0 right-0 m-2 sm:m-4">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <p className="text-sm sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Chat with my AI assistant powered by advanced language models. Ask about my work, skills, or anything else!
          </p>
        </div>
        
        <div className="max-w-6xl mx-auto">
          <div className="bg-card border rounded-2xl shadow-lg overflow-hidden flex flex-col md:flex-row h-[85vh]">
            {/* Avatar Section */}
            <div className="md:w-2/5 bg-secondary border-b md:border-b-0 md:border-r h-[35vh] md:h-auto">
              <Suspense fallback={<div className="w-full h-full flex justify-center items-center"><Loader2 className="w-16 h-16 animate-spin" /></div>}>
                <Avatar3D currentAnimation={effectiveAnimation} currentMorphTargets={currentMorphTargets} visemes={visemes} visemeStartTime={visemeStartTime} />
              </Suspense>
            </div>

            {/* Chat Section */}
            <div className="md:w-3/5 flex flex-col flex-1 bg-background overflow-hidden">
              <ChatInterface
                messages={messages}
                streamingMessage={streamingMessage}
                isLoading={isLoading}
                isLoadingMessages={isLoadingMessages}
                isAiProcessing={isAiProcessing}
                isTtsProcessing={isTtsProcessing}
                isUiTimedOut={isUiTimedOut}
                error={error || null}
                onRetry={() => retryMessage(prompts || [])}
                quickStarters={quickStarters}
                onQuickStart={(text) => {
                  setMessage(text);
                  setQuickStarters([]); // Clear quick starters after selection
                }}
              />
              
              {/* Chat Input */}
              <div className="p-3 sm:p-4 md:p-6 border-t bg-card">
                <form onSubmit={handleSubmit} className="flex gap-2 sm:gap-3 items-center">
                  <Input
                    type="text"
                    placeholder="Ask me anything..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="flex-1 h-10 sm:h-12 px-3 sm:px-4 rounded-lg text-sm sm:text-base"
                    disabled={isLoading || isLoadingPrompts}
                    data-testid="input-chat-message"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!message.trim() || isLoading || isLoadingPrompts}
                    className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg flex-shrink-0"
                    data-testid="button-send-message"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 sm:w-6 sm:h-6 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 sm:w-6 sm:h-6" />
                    )}
                  </Button>
                </form>
                
                {/* Quick Actions */}
                <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-3 sm:mt-4">
                  {[
                    { key: "skills", label: "Skills" },
                    { key: "projects", label: "Projects" },
                    { key: "contact", label: "Contact" }
                  ].map((action) => (
                    <Button
                      key={action.key}
                      onClick={() => setMessage(`Tell me about your ${action.key}`)}
                      variant="secondary"
                      size="sm"
                      className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm"
                      data-testid={`quick-action-${action.key}`}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}