import { useRef, useCallback } from 'react';

/**
 * Hook for lazy-loading and managing audio playback and viseme synchronization
 * Only loaded when TTS audio response is received to reduce initial bundle size
 */
export function useAudioPlayback() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  const decodeAudioData = useCallback(
    async (audioData: ArrayBuffer): Promise<AudioBuffer> => {
      const audioCtx = initAudioContext();
      return new Promise((resolve, reject) => {
        audioCtx.decodeAudioData(
          audioData.slice(0),
          (decodedData) => resolve(decodedData),
          (error) => reject(error)
        );
      });
    },
    [initAudioContext]
  );

  const playAudio = useCallback(
    async (audioData: ArrayBuffer): Promise<{ 
      onEnded: (callback: () => void) => void; 
      stop: () => void;
    }> => {
      try {
        const audioCtx = initAudioContext();
        const decodedData = await decodeAudioData(audioData);
        
        sourceNodeRef.current = audioCtx.createBufferSource();
        sourceNodeRef.current.buffer = decodedData;
        sourceNodeRef.current.connect(audioCtx.destination);
        
        sourceNodeRef.current.start();

        return {
          onEnded: (callback: () => void) => {
            if (sourceNodeRef.current) {
              sourceNodeRef.current.onended = callback;
            }
          },
          stop: () => {
            if (sourceNodeRef.current) {
              try {
                sourceNodeRef.current.stop();
              } catch (e) {
                console.error('Error stopping audio:', e);
              }
            }
          },
        };
      } catch (err) {
        console.error('Audio playback error:', err);
        throw err;
      }
    },
    [initAudioContext, decodeAudioData]
  );

  return {
    playAudio,
    stop: () => {
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.stop();
        } catch (e) {
          console.error('Error stopping audio:', e);
        }
      }
    },
  };
}
