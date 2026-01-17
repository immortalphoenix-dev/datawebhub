import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { ChatMessage, Prompt } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { track } from "@/lib/telemetry";

/**
 * Lazy-loads and plays audio with viseme synchronization
 * Only called when TTS audio is available to reduce initial bundle impact
 */
async function playAudioWithVisemes(
  audioBase64: string,
  chatMessage: ChatMessage,
  callbacks: {
    onVisemesStart: (visemes: { id: number; offset: number }[], startTime: number) => void;
    onVisemesEnd: () => void;
    onMessageAdded: () => void;
  }
): Promise<void> {
  try {
    // Decode base64 audio
    const byteString = atob(audioBase64);
    const buffer = new ArrayBuffer(byteString.length);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);

    // Lazy-load AudioContext only when audio playback is needed
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Decode audio data
    const decoded = await new Promise<AudioBuffer>((resolve, reject) => {
      audioCtx.decodeAudioData(buffer.slice(0), resolve, reject);
    });

    const source = audioCtx.createBufferSource();
    source.buffer = decoded;
    source.connect(audioCtx.destination);

    // Extract visemes from metadata if present
    let serverVisemes: { id: number; offset: number }[] = [];
    try {
      if (chatMessage.metadata) {
        const meta = JSON.parse(chatMessage.metadata);
        if (Array.isArray(meta.visemes)) serverVisemes = meta.visemes;
      }
    } catch {}

    // Cleanup on audio end
    source.onended = () => {
      callbacks.onVisemesEnd();
    };

    // Start audio & viseme sync
    callbacks.onVisemesStart(serverVisemes, performance.now());
    callbacks.onMessageAdded();
    source.start();
  } catch (err) {
    console.error('Audio playback error:', err);
    callbacks.onMessageAdded();
    callbacks.onVisemesEnd();
  }
}

export function useChat() {
  const [error, setError] = useState<string | null>(null);
  const [lastMessageText, setLastMessageText] = useState<string | null>(null); // For retry
  const [lastAudioMessageId, setLastAudioMessageId] = useState<string | null>(null); // Track last message for audio retry
  const [isRetryingAudio, setIsRetryingAudio] = useState(false);
  const queryClient = useQueryClient();
  const sessionId = localStorage.getItem('sessionId');
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [visemes, setVisemes] = useState<{ id: number; offset: number }[]>([]);
  const [visemeStartTime, setVisemeStartTime] = useState<number | null>(null);
  const synthesizerRef = useRef<any | null>(null);
  const uiTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [quickStarters, setQuickStarters] = useState<Array<{ text: string; description?: string }>>([]);

  // Granular loading states for better UX
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [isTtsProcessing, setIsTtsProcessing] = useState(false);
  const [isUiTimedOut, setIsUiTimedOut] = useState(false); // Separate state for UI timeout (faster feedback)

  // Config: whether to delay showing text until audio starts (strict sync)
  const SYNC_TEXT_TO_AUDIO = (import.meta as any).env?.VITE_SYNC_TEXT_TO_AUDIO === 'true';

  // Fetch existing chat messages
  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<ChatMessage[]>({
    queryKey: ['/api/chat/messages', sessionId],
    queryFn: async () => {
      if (!sessionId) return [];
      const response = await apiRequest('GET', `/api/chat/messages?sessionId=${sessionId}`);
      return response.json();
    },
    staleTime: 0, // Always fetch fresh for chat
    enabled: !!sessionId, // Only run the query if sessionId exists
  });

  // Track streaming message state
  const [streamingMessage, setStreamingMessage] = useState<Partial<ChatMessage> | null>(null);

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ message, prompts }: { message: string, prompts: Prompt[] }) => {
      if (!sessionId) throw new Error("Session ID not found");
      
      // Reset streaming message
      setStreamingMessage(null);
      
      // Start UI timeout (8 second) for faster user feedback - separate from API timeout (30s)
      const uiTimeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => {
          setIsUiTimedOut(true);
          reject(new Error('Request is taking longer than expected. Please try again.'));
        }, 8000)
      );

      // Make streaming API call
      const streamPromise = (async () => {
        const response = await apiRequest('POST', '/api/chat', { message, prompts, sessionId });
        
        if (!response.body) {
          throw new Error('No response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalData: { chatMessage: ChatMessage, audioContent: string | null, ttsError?: string | null, quickStarters?: Array<{ text: string; description?: string }> } | null = null;
        let accumulatedTokens = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            
            // Process complete lines (NDJSON format)
            const lines = buffer.split('\n');
            buffer = lines[lines.length - 1]; // Keep incomplete line in buffer

            for (let i = 0; i < lines.length - 1; i++) {
              const line = lines[i].trim();
              if (!line) continue;

              try {
                const chunk = JSON.parse(line);

                if (chunk.type === 'token') {
                  // Accumulate and display token
                  accumulatedTokens += chunk.content;
                  setStreamingMessage(prev => ({
                    ...prev,
                    response: accumulatedTokens,
                    $createdAt: prev?.$createdAt || new Date().toISOString(),
                    $updatedAt: new Date().toISOString(),
                    sessionId,
                    message: message,
                  }));
                } else if (chunk.type === 'message_complete') {
                  // Stream complete - got full message with metadata and quick starters
                  finalData = {
                    chatMessage: chunk.chatMessage,
                    audioContent: chunk.audioContent,
                    ttsError: chunk.ttsError,
                    quickStarters: chunk.quickStarters,
                  };
                } else if (chunk.type === 'error') {
                  throw new Error(chunk.error || 'Stream error');
                }
              } catch (parseErr) {
                if (!(parseErr instanceof SyntaxError)) {
                  throw parseErr;
                }
                // Ignore JSON parse errors from incomplete lines
              }
            }
          }

          // Consume remaining buffer
          if (buffer.trim()) {
            try {
              const chunk = JSON.parse(buffer);
              if (chunk.type === 'message_complete') {
                finalData = {
                  chatMessage: chunk.chatMessage,
                  audioContent: chunk.audioContent,
                  ttsError: chunk.ttsError,
                  quickStarters: chunk.quickStarters,
                };
              }
            } catch (parseErr) {
              // Ignore final buffer parse errors
            }
          }

          if (!finalData) {
            throw new Error('No final data received from stream');
          }

          return finalData;
        } finally {
          reader.releaseLock();
        }
      })();

      // Race between stream and UI timeout
      return Promise.race([streamPromise, uiTimeoutPromise]);
    },
    onMutate: () => {
      setIsAiProcessing(true);
      setError(null);
      setIsUiTimedOut(false);
      setStreamingMessage(null);
    },
    onSuccess: (data: { chatMessage: ChatMessage, audioContent: string | null, ttsError?: string | null, quickStarters?: Array<{ text: string; description?: string }> }) => {
      setIsAiProcessing(false);
      setIsTtsProcessing(!!data.audioContent); // Only show TTS processing if we have audio
      setIsUiTimedOut(false);
      setStreamingMessage(null); // Clear streaming message
      const { chatMessage, audioContent, ttsError, quickStarters: newQuickStarters } = data;
      
      // Helper to add message to cache
      const addMessageToCache = () => {
        queryClient.setQueryData<ChatMessage[]>(['/api/chat/messages', sessionId], (oldMessages = []) => {
          return [...oldMessages, chatMessage];
        });
      };
      setError(null);
      setLastMessageText(null); // Clear for retry tracking
      
      // Update quick starters for next user interaction
      if (newQuickStarters && Array.isArray(newQuickStarters)) {
        setQuickStarters(newQuickStarters);
      }

      // Display TTS error as a soft warning toast notification if it exists
      if (ttsError) {
        toast({
          title: "Audio Unavailable",
          description: "The text is displayed. Try clicking replay to regenerate audio.",
          variant: "default",
        });
        setLastAudioMessageId(chatMessage.$id);
      }

      // Lazy-load and play audio only when it's available
      if (audioContent) {
        playAudioWithVisemes(audioContent, chatMessage, {
          onVisemesStart: (visemes, startTime) => {
            setVisemes(visemes);
            setVisemeStartTime(startTime);
          },
          onVisemesEnd: () => {
            setVisemes([]);
            setVisemeStartTime(null);
            setIsTtsProcessing(false);
          },
          onMessageAdded: () => {
            addMessageToCache();
          },
        }).catch((err) => {
          console.error('Failed to play audio:', err);
          setIsTtsProcessing(false);
          addMessageToCache();
        });
      } else {
        // No audio returned, just show text
        setIsTtsProcessing(false);
        addMessageToCache();
      }
    },
    onError: (err: Error) => {
      setIsAiProcessing(false);
      setIsTtsProcessing(false);
      setError(err.message || 'Failed to send message');
      
      // Only show toast if not UI timeout (UI timeout has its own error display in chat interface)
      if (!err.message.includes('taking longer')) {
        toast({
          title: "Error",
          description: err.message || 'Failed to send message',
          variant: "destructive",
        });
      }
    },
  });

  const sendMessage = useCallback(async (message: string, prompts: Prompt[]) => {
    setError(null);
    setIsUiTimedOut(false);
    setLastMessageText(message); // Store for potential retry
    return sendMessageMutation.mutateAsync({ message, prompts });
  }, [sendMessageMutation]);

  // Retry function for UI timeout or errors
  const retryMessage = useCallback(async (prompts: Prompt[]) => {
    if (!lastMessageText) return;
    return sendMessage(lastMessageText, prompts);
  }, [lastMessageText, sendMessage]);

  // Retry audio generation for a message
  const retryAudio = useCallback(async (text: string, messageId: string) => {
    setIsRetryingAudio(true);
    try {
      const response = await apiRequest('POST', '/api/chat/regenerate-audio', {
        text,
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to regenerate audio');
      }

      // Update message with new audio
      const messages = queryClient.getQueryData<ChatMessage[]>(['/api/chat/messages', sessionId]) || [];
      const updatedMessages = messages.map(msg => {
        if (msg.$id === messageId && data.audioContent) {
          const metadata = JSON.parse(msg.metadata || '{}');
          return {
            ...msg,
            metadata: JSON.stringify({
              ...metadata,
              visemes: data.visemes,
              audioAvailable: true,
            }),
          };
        }
        return msg;
      });
      
      queryClient.setQueryData(['/api/chat/messages', sessionId], updatedMessages);
      
      toast({
        title: "Audio regenerated",
        description: "Click the speaker icon to play",
      });

      setLastAudioMessageId(messageId);
      
      // Play the new audio
      if (data.audioContent) {
        const message = updatedMessages.find(m => m.$id === messageId);
        if (message) {
          await playAudioWithVisemes(data.audioContent, message, {
            onVisemesStart: (visemes, startTime) => {
              setVisemes(visemes);
              setVisemeStartTime(startTime);
            },
            onVisemesEnd: () => {
              setVisemes([]);
              setVisemeStartTime(null);
            },
            onMessageAdded: () => {},
          });
        }
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to regenerate audio",
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsRetryingAudio(false);
    }
  }, [queryClient, sessionId, toast]);

  return {
    messages,
    streamingMessage,
    sendMessage,
    retryMessage,
    retryAudio,
    isLoading: sendMessageMutation.isPending,
    isAiProcessing,
    isTtsProcessing,
    isLoadingMessages,
    isUiTimedOut,
    isRetryingAudio,
    error: error || (sendMessageMutation.error?.message),
    visemes,
    visemeStartTime,
    quickStarters,
    setQuickStarters,
  };
}