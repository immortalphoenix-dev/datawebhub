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
    onSuccess: (data: { chatMessage: ChatMessage, audioContent: string | null, ttsError?: string | null }) => {
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

      // Use Azure Speech SDK for TTS with viseme support
      if (chatMessage.response && import.meta.env.VITE_AZURE_TTS_KEY && import.meta.env.VITE_AZURE_REGION) {
  try {
          // Show text early for responsiveness unless strict sync is requested
          if (!SYNC_TEXT_TO_AUDIO) {
            addMessageToCache();
          }

          // Cancel any in-flight synthesis
          if (synthesizerRef.current && typeof synthesizerRef.current.close === 'function') {
            try { synthesizerRef.current.close(); } catch {}
          }

          // Dynamically import the SDK
          const loadSdk = () => import('microsoft-cognitiveservices-speech-sdk');
          loadSdk().then((sdk) => {
            try {
              const speechConfig = sdk.SpeechConfig.fromSubscription(import.meta.env.VITE_AZURE_TTS_KEY, import.meta.env.VITE_AZURE_REGION);
              speechConfig.speechSynthesisVoiceName = 'en-US-ChristopherNeural';

              // Create a controllable speaker destination so we know EXACTLY when audio playback starts
              const player = new sdk.SpeakerAudioDestination();
              const audioConfig = sdk.AudioConfig.fromSpeakerOutput(player);
              const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);
              synthesizerRef.current = synthesizer;

              const visemeList: { id: number; offset: number }[] = [];
              let messageAdded = false;

              synthesizer.visemeReceived = (_s: any, e: any) => {
                // e.audioOffset is in 100-nanosecond units; convert to milliseconds
                visemeList.push({ id: e.visemeId, offset: e.audioOffset / 10000 });
              };

              // Align UI text, visemes, and audio start together
              player.onAudioStart = () => {
                setVisemes(visemeList);
                setVisemeStartTime(Date.now());
                if (SYNC_TEXT_TO_AUDIO && !messageAdded) {
                  addMessageToCache();
                  messageAdded = true;
                }
              };
              player.onAudioEnd = () => {
                // Clear after speech finishes
                setVisemes([]);
                setVisemeStartTime(null);
                if (synthesizerRef.current === synthesizer) {
                  synthesizerRef.current = null;
                }
              };

              console.log('Starting Azure TTS synthesis');
              synthesizer.speakTextAsync(chatMessage.response!, (result: any) => {
                console.log('Azure TTS synthesis completed');
                if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted) {
                  console.error("Speech synthesis failed:", result.errorDetails);
                  track('tts_error', { reason: result.errorDetails || 'unknown' });
                  toast({
                    title: "TTS Error",
                    description: "Failed to synthesize speech.",
                    variant: "destructive",
                  });
                  if (SYNC_TEXT_TO_AUDIO && !messageAdded) {
                    addMessageToCache();
                    messageAdded = true;
                  }
                } else {
                  // If, for any reason, audio start didn't fire, ensure text appears
                  setTimeout(() => {
                    if (SYNC_TEXT_TO_AUDIO && !messageAdded) {
                      addMessageToCache();
                      messageAdded = true;
                    }
                  }, 200);
                }
                synthesizer.close();
              });
            } catch (sdkErr) {
              console.error("Speech SDK use error:", sdkErr);
              addMessageToCache();
            }
          }).catch((importErr) => {
            console.error("Failed to import speech SDK:", importErr);
            track('tts_error', { reason: 'sdk_import_failed', error: String(importErr) });
            addMessageToCache();
          });
        } catch (e) {
          console.error("Error initializing speech synthesizer:", e);
          track('tts_error', { reason: 'init_error', error: String(e) });
          toast({
            title: "TTS Error",
            description: "Could not initialize text-to-speech.",
            variant: "destructive",
          });
          // Fall back to showing text immediately
          addMessageToCache();
        }
      } else if (audioContent) {
        // No Azure TTS available - show text immediately
        addMessageToCache();
      }
    },
    onError: (err: Error) => {
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
    isLoadingMessages,
    error: error || (sendMessageMutation.error?.message),
    visemes,
    visemeStartTime,
  };
}