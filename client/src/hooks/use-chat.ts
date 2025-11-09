import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { ChatMessage, Prompt } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { track } from "@/lib/telemetry";
// Azure Speech SDK is dynamically imported when needed to keep initial bundle fast

export function useChat() {
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const sessionId = localStorage.getItem('sessionId');
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [visemes, setVisemes] = useState<{ id: number; offset: number }[]>([]);
  const [visemeStartTime, setVisemeStartTime] = useState<number | null>(null);
  const synthesizerRef = useRef<any | null>(null);

  // Granular loading states for better UX
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [isTtsProcessing, setIsTtsProcessing] = useState(false);

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

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ message, prompts }: { message: string, prompts: Prompt[] }) => {
      if (!sessionId) throw new Error("Session ID not found");
      const response = await apiRequest('POST', '/api/chat', { message, prompts, sessionId });
      return response.json();
    },
    onMutate: () => {
      setIsAiProcessing(true);
      setError(null);
    },
    onSuccess: (data: { chatMessage: ChatMessage, audioContent: string | null, ttsError?: string | null }) => {
      setIsAiProcessing(false);
      setIsTtsProcessing(!!data.audioContent); // Only show TTS processing if we have audio
      const { chatMessage, audioContent, ttsError } = data;
      // Helper to add message to cache (either immediately or aligned with audio start)
      const addMessageToCache = () => {
        queryClient.setQueryData<ChatMessage[]>(['/api/chat/messages', sessionId], (oldMessages = []) => {
          return [...oldMessages, chatMessage];
        });
      };
      setError(null);

      // Display TTS error as a toast notification if it exists
      if (ttsError) {
        toast({
          title: "TTS Error",
          description: ttsError,
          variant: "destructive",
        });
      }

      // Client now only plays server-provided audio for sync
      if (audioContent) {
        try {
          // Decode server-provided base64 audio and play
          const byteString = atob(audioContent);
          const buffer = new ArrayBuffer(byteString.length);
          const bytes = new Uint8Array(buffer);
          for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);

          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          audioCtx.decodeAudioData(buffer.slice(0)).then(decoded => {
            const source = audioCtx.createBufferSource();
            source.buffer = decoded;
            source.connect(audioCtx.destination);

            // Extract visemes from metadata if present for precise sync
            let serverVisemes: { id: number; offset: number }[] = [];
            try {
              if (chatMessage.metadata) {
                const meta = JSON.parse(chatMessage.metadata);
                if (Array.isArray(meta.visemes)) serverVisemes = meta.visemes;
                console.log('Extracted visemes from metadata:', serverVisemes);
              }
            } catch {}

            source.onended = () => {
              setVisemes([]);
              setVisemeStartTime(null);
              setIsTtsProcessing(false);
            };

            // Start audio & viseme clock exactly together
            setVisemes(serverVisemes);
            setVisemeStartTime(performance.now());
            if (!SYNC_TEXT_TO_AUDIO) {
              addMessageToCache();
            } else {
              addMessageToCache(); // server-side already synchronized
            }
            source.start();
          }).catch(err => {
            console.error('Audio decode failed', err);
            setIsTtsProcessing(false);
            addMessageToCache();
          });
        } catch (err) {
          console.error('Audio playback failed', err);
          setIsTtsProcessing(false);
          addMessageToCache();
        }
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
      toast({
        title: "Error",
        description: err.message || 'Failed to send message',
        variant: "destructive",
      });
    },
  });

  const sendMessage = useCallback(async (message: string, prompts: Prompt[]) => {
    setError(null);
    return sendMessageMutation.mutateAsync({ message, prompts });
  }, [sendMessageMutation]);

  return {
    messages,
    sendMessage,
    isLoading: sendMessageMutation.isPending,
    isAiProcessing,
    isTtsProcessing,
    isLoadingMessages,
    error: error || (sendMessageMutation.error?.message),
    visemes,
    visemeStartTime,
  };
}