import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProjectSchema, insertChatMessageSchema, insertPromptSchema } from "@shared/schema";
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import Groq from "groq-sdk";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
const upload = multer({ storage: multer.memoryStorage() });

// In-memory cache for Azure TTS audio to keep things fast and avoid duplicate syntheses
const azureTTSCache = new Map<string, { base64: string; visemes: { id: number; offset: number }[]; timestamp: number }>();
const AZURE_TTS_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const AZURE_TTS_CACHE_MAX = 50; // max entries

function getAzureTTSCacheKey(text: string, voice: string) {
  return `${voice}|${text.trim().toLowerCase()}`;
}

// Fallback viseme generation based on basic text analysis
function generateFallbackVisemes(text: string): { id: number; offset: number }[] {
  const visemes: { id: number; offset: number }[] = [];
  const words = text.toLowerCase().split(/\s+/);
  let currentOffset = 0;
  const avgWordDuration = 300; // ms per word estimate

  for (const word of words) {
    // Start with silence
    visemes.push({ id: 0, offset: currentOffset });
    currentOffset += 50;

    // Analyze each character for basic phoneme mapping
    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      let visemeId = 0; // default silence

      // Basic vowel mapping
      if ('aeiou'.includes(char)) {
        if ('a'.includes(char)) visemeId = 1; // ah sound
        else if ('ei'.includes(char)) visemeId = 2; // ee sound
        else if ('o'.includes(char)) visemeId = 4; // oh sound
        else if ('u'.includes(char)) visemeId = 9; // oo sound
      }
      // Basic consonant mapping
      else if ('pb'.includes(char)) visemeId = 12; // p/b sound
      else if ('dt'.includes(char)) visemeId = 13; // d/t sound
      else if ('fv'.includes(char)) visemeId = 14; // f/v sound
      else if ('kg'.includes(char)) visemeId = 15; // k/g sound
      else if ('sz'.includes(char)) visemeId = 20; // s/z sound
      else if ('th'.includes(char)) visemeId = 21; // th sound
      else if ('lr'.includes(char)) visemeId = 19; // r/l sound
      else if ('m'.includes(char)) visemeId = 12; // m sound (like p)
      else if ('n'.includes(char)) visemeId = 13; // n sound (like d)
      else if ('jchsh'.includes(char)) visemeId = 17; // ch/sh sounds

      visemes.push({ id: visemeId, offset: currentOffset });
      currentOffset += 80; // ~80ms per phoneme
    }

    // End with silence
    visemes.push({ id: 0, offset: currentOffset });
    currentOffset += avgWordDuration - (word.length * 80) - 100; // Adjust for word timing
  }

  return visemes;
}

// Azure TTS function with male voice and caching
async function generateAzureTTS(text: string): Promise<{ audioBase64: string | null; visemes: { id: number; offset: number }[]; error?: string }> {
  // Use male voice
  const voice = 'en-US-ChristopherNeural'; // Male voice
  const key = getAzureTTSCacheKey(text, voice);

  // Check cache
  const cached = azureTTSCache.get(key);
  if (cached && Date.now() - cached.timestamp < AZURE_TTS_CACHE_TTL) {
    return { audioBase64: cached.base64, visemes: cached.visemes };
  }

  try {
    const speechConfig = sdk.SpeechConfig.fromSubscription(
      process.env.VITE_AZURE_TTS_KEY!,
      process.env.VITE_AZURE_REGION!
    );

    // Configure voice and output format
    speechConfig.speechSynthesisVoiceName = voice;
    speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;

    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

    // Collect visemes during synthesis
    const visemes: { id: number; offset: number }[] = [];

    synthesizer.visemeReceived = (s, e) => {
      console.log('Viseme received:', e.visemeId, 'at offset:', e.audioOffset);
      visemes.push({
        id: e.visemeId,
        offset: e.audioOffset / 10000 // Convert from ticks (100ns) to milliseconds
      });
    };

    const audioBuffer = await new Promise<Buffer>((resolve, reject) => {
      synthesizer.speakTextAsync(
        text,
        (result) => {
          synthesizer.close();
          console.log(`Generated ${visemes.length} visemes for text: "${text}"`);

          // Fallback: if no visemes were captured, generate basic ones based on text
          if (visemes.length === 0) {
            console.log('No visemes captured from Azure, generating fallback visemes');
            visemes.push(...generateFallbackVisemes(text));
          }

          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            const audioData = result.audioData;
            const audioBase64 = Buffer.from(audioData).toString('base64');
            resolve(Buffer.from(audioData));
          } else {
            const error = `Speech synthesis failed: ${result.errorDetails}`;
            console.error('Azure TTS error:', error);
            reject(new Error(error));
          }
        },
        (error: any) => {
          synthesizer.close();
          console.error('Azure TTS error:', error);
          reject(error instanceof Error ? error : new Error('Unknown Azure TTS error'));
        }
      );
    });

    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('No audio data received from Azure TTS');
    }

    const audioBase64 = audioBuffer.toString('base64');

    // Maintain cache size
    if (azureTTSCache.size >= AZURE_TTS_CACHE_MAX) {
      const firstKey = azureTTSCache.keys().next().value;
      if (firstKey) azureTTSCache.delete(firstKey);
    }
    azureTTSCache.set(key, { base64: audioBase64, visemes, timestamp: Date.now() });

    return { audioBase64, visemes };
  } catch (error) {
    console.error('Azure TTS error:', error);
    return {
      audioBase64: null,
      visemes: [],
      error: error instanceof Error ? error.message : 'Unknown Azure TTS error'
    };
  }
}

// Simple in-memory cache for chat responses (LRU-style with max 100 entries)
const responseCache = new Map<string, { response: string; timestamp: number }>();
const MAX_CACHE_SIZE = 100;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function getCacheKey(message: string, prompts: any[], model: string = ""): string {
  const promptHash = prompts.map(p => p.promptText).sort().join('|');
  const modelPart = model ? `|model:${model}` : '';
  return `${message.trim().toLowerCase()}|${promptHash}${modelPart}`;
}

function getCachedResponse(key: string): string | null {
  const cached = responseCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.response;
  }
  if (cached) {
    responseCache.delete(key); // Remove expired entry
  }
  return null;
}

function setCachedResponse(key: string, response: string): void {
  if (responseCache.size >= MAX_CACHE_SIZE) {
    // Remove oldest entry (simple FIFO)
    const firstKey = responseCache.keys().next().value;
    if (firstKey) {
      responseCache.delete(firstKey);
    }
  }
  responseCache.set(key, { response, timestamp: Date.now() });
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Lightweight telemetry endpoint (fire-and-forget)
  app.post('/api/telemetry', (req, res) => {
    try {
      const { event, payload, ts } = req.body ?? {};
      console.log('[telemetry]', event, ts, payload ? JSON.stringify(payload).slice(0, 500) : '');
      res.status(204).end();
    } catch {
      res.status(204).end();
    }
  });

  // Project routes
  app.get("/api/projects", async (_req, res) => {
    try {
      const projects = await storage.getProjects();
      res.json(projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  // Removed as 'isFeatured' attribute is no longer in schema
  // app.get("/api/projects/featured", async (_req, res) => {
  //   try {
  //     const projects = await storage.getFeaturedProjects();
  //     res.json(projects);
  //   } catch (error) {
  //     res.status(500).json({ message: "Failed to fetch featured projects" });
  //   }
  // });

  app.get("/api/projects/category/:category", async (req, res) => {
    try {
      const { category } = req.params;
      const projects = await storage.getProjectsByCategory(category);
      res.json(projects);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch projects by category" });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const project = await storage.getProject(id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  app.post("/api/projects", upload.single("image"), async (req, res) => {
    try {
      let imageUrl = req.body.imageUrl || ""; // Use provided URL or empty string

      const normalizeUrl = (value?: string | null) => {
        if (!value) return undefined;
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
        try {
          return new URL(withProtocol).toString();
        } catch (err) {
          return undefined;
        }
      };

      // Only upload file if one was provided
      if (req.file) {
        try {
          const fileId = await storage.uploadFile(req.file);
          imageUrl = await storage.getFileUrl(fileId);
        } catch (storageError) {
          console.warn("Storage upload failed:", storageError);
        }
      }

      const validatedData = insertProjectSchema.parse({
        ...req.body,
        technologies: req.body.technologies
          ? req.body.technologies
              .split(",")
              .map((tech: string) => tech.trim())
              .filter((tech: string) => tech.length > 0)
          : [],
        imageUrl: imageUrl || undefined,
        demoUrl: normalizeUrl(req.body.demoUrl) ?? "",
      });
      const sanitizedData = {
        ...validatedData,
        imageUrl: validatedData.imageUrl || undefined,
        demoUrl: normalizeUrl(validatedData.demoUrl) || undefined,
      };

      const project = await storage.createProject(sanitizedData);
      res.status(201).json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid project data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  app.put("/api/projects/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = insertProjectSchema.partial().parse(req.body);
      const project = await storage.updateProject(id, validatedData);
      res.json(project);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid project data", errors: error.errors });
      }
      if (error instanceof Error && error.message.includes("not found")) {
        return res.status(404).json({ message: "Project not found" });
      }
      res.status(500).json({ message: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteProject(id);
      if (!deleted) {
        return res.status(404).json({ message: "Project not found" });
      }
      res.json({ message: "Project deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete project" });
    }
  });

  // Chat routes
  app.get("/api/chat/messages", async (req, res) => {
    try {
      const { sessionId } = req.query;
      if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ message: "sessionId is required" });
      }
      const messages = await storage.getChatMessages(sessionId);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching chat messages:", error);
      res.status(500).json({ message: "Failed to fetch chat messages" });
    }
  });

  app.post("/api/chat", async (req, res) => {
    const startTime = Date.now();
    console.log('[chat] request started');

    try {
      const { message, prompts, sessionId } = req.body;
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ message: "Message is required" });
      }
      if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ message: "sessionId is required" });
      }

      const groq = new Groq({
        apiKey: process.env.GROQ_API_KEY,
      });

      // Default system prompt for formatting instructions
      const defaultSystemPrompt = {
        role: "system" as const,
        content: `You are a helpful AI assistant for a portfolio website. Format your responses using markdown:

**Bold text**: Use **double asterisks** for important terms, skills, or emphasis
*Italic text*: Use *single asterisks* for subtle emphasis

Structure your responses with:
- Clear paragraphs (separate with blank lines)
- Proper line breaks for readability
- **Bold** important information like technologies, skills, or key achievements
- Use bullet points or numbered lists when appropriate

Keep responses professional, informative, and engaging. Focus on the user's questions about projects, skills, and experience.`,
      };

      const systemPrompts = [
        defaultSystemPrompt,
        ...(prompts || []).map((p: any) => ({
          role: "system",
          content: p.promptText,
        })),
      ];

      // Model selection with fallback - prioritize fastest models first
      const primaryModel = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
      const fallbackModels = ["llama-3.1-8b-instant", "llama-3.1-70b-versatile", "mixtral-8x7b-32768"].filter(m => m !== primaryModel);
      const tried: string[] = [];
      let usedModel = primaryModel;

      const cacheKey = getCacheKey(message, prompts || [], primaryModel);
      const cachedResponse = getCachedResponse(cacheKey);
      let response: string = '';

      const attempt = async (model: string): Promise<string> => {
        tried.push(model);
        try {
          // Add timeout to prevent hanging
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('API_TIMEOUT')), 30000) // 30 second timeout
          );

          const apiPromise = groq.chat.completions.create({
            messages: [
              ...systemPrompts,
              { role: "user", content: message },
            ],
            model,
          });

          const chatCompletion = await Promise.race([apiPromise, timeoutPromise]);
          return chatCompletion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
        } catch (err: any) {
          const code = err?.error?.error?.code || err?.error?.code;
          if (code === 'model_not_found') {
            console.warn('[chat] model not found:', model);
            throw new Error('MODEL_NOT_FOUND');
          }
          if (err.message === 'API_TIMEOUT') {
            console.warn('[chat] API timeout for model:', model);
            throw new Error('API_TIMEOUT');
          }
          console.error('[chat] model error', model, err?.message || err);
          throw err;
        }
      };

      if (cachedResponse) {
        console.log('[chat] using cache for model', primaryModel, 'took', Date.now() - startTime, 'ms');
        response = cachedResponse;
      } else {
        let success = false;
        for (const model of [primaryModel, ...fallbackModels]) {
          try {
            const apiStart = Date.now();
            response = await attempt(model);
            console.log('[chat] API call for', model, 'took', Date.now() - apiStart, 'ms');
            usedModel = model;
            success = true;
            break;
          } catch (e: any) {
            if (e.message !== 'MODEL_NOT_FOUND') {
              return res.status(500).json({ message: 'Failed to process chat message', error: e.message });
            }
          }
        }
        if (!success) {
          return res.status(500).json({ message: 'No usable model available (all fallbacks failed).' });
        }
        setCachedResponse(cacheKey, response);
      }

      console.log('[chat] response type:', typeof response, 'model used:', usedModel, 'tried:', tried.join(','));

      // Function to determine animation based on response content
      const getAnimationFromResponse = (text: string) => {
        const lowerText = text.toLowerCase();
        
        // Define a map of keywords to animations, ordered by specificity (longer phrases first)
        const animationMap = new Map<string, string>([
          ["playing golf", "playing golf"],
          ["salsa dance", "salsa dance"],
          ["looking behind", "looking behind"],
          ["nods head", "nods head"],
          ["shakes head", "shakes head"],
          ["cheering", "cheering"],
          ["punching", "punching"],
          ["stretching", "stretching"],
          ["waving", "waving"],
          ["hello", "waving"],
          ["hi", "waving"],
          ["golf", "playing golf"],
          ["cheer", "cheering"],
          ["great", "cheering"],
          ["yes", "nods head"],
          ["affirmative", "nods head"],
          ["no", "shakes head"],
          ["negative", "shakes head"],
          ["dance", "salsa dance"],
          ["punch", "punching"],
          ["stretch", "stretching"],
        ]);

        // Sort keywords by length in descending order to prioritize more specific phrases
        const sortedKeywords = Array.from(animationMap.keys()).sort((a, b) => b.length - a.length);

        for (const keyword of sortedKeywords) {
          if (lowerText.includes(keyword)) {
            return animationMap.get(keyword);
          }
        }

        if (text.length > 0) return "talking"; // Default to talking if there's a response
        return "idle"; // Default to idle if no response
      };

      // Function to determine morph targets based on response content
      const getMorphTargetsFromResponse = (text: string) => {
        const lowerText = text.toLowerCase();
        let morphTargets: { [key: string]: number } = {};

  // Do not set jawOpen or mouthPucker at all

        // Emotion detection - can layer on top of talking morphs
        const emotionMap = [
            {
                keywords: ['happy', 'great', 'awesome', 'fantastic', 'joy', 'funny', 'amused', 'haha', 'lol'],
                morphs: { mouthSmileLeft: 0.6, mouthSmileRight: 0.6, cheekSquintLeft: 0.3, cheekSquintRight: 0.3 }
            },
            {
                keywords: ['sad', 'sorry', 'unfortunate', 'unfortunately', 'apologize'],
                morphs: { mouthFrownLeft: 0.5, mouthFrownRight: 0.5, browInnerUp: 0.3 }
            },
            {
                keywords: ['angry', 'frustrated', 'annoyed'],
                morphs: { browDownLeft: 0.8, browDownRight: 0.8, mouthPressLeft: 0.5, mouthPressRight: 0.5, noseSneerLeft: 0.4 }
            },
            {
                keywords: ['wow', 'whoa', 'really', 'surprise', 'incredible'],
                morphs: { eyeWideLeft: 0.5, eyeWideRight: 0.5, browInnerUp: 0.6 }
            },
            {
                keywords: ['curious', 'wonder', 'question', 'what', 'how', 'why', '?'],
                morphs: { browInnerUp: 0.5, eyeWideLeft: 0.15, eyeWideRight: 0.15 }
            },
            {
                keywords: ['think', 'hmm', 'let me see', 'consider'],
                morphs: { eyeLookUpLeft: 0.6, eyeLookUpRight: 0.6, browDownLeft: 0.2, browDownRight: 0.2 }
            }
        ];

        // Find the first matching emotion and apply its morphs
        for (const emotion of emotionMap) {
            if (emotion.keywords.some(keyword => lowerText.includes(keyword))) {
                Object.assign(morphTargets, emotion.morphs);
                break; // Stop after the first match to avoid conflicting expressions
            }
        }

        return morphTargets;
      };

      const animation = getAnimationFromResponse(response);
      const morphTargets = getMorphTargetsFromResponse(response);

      // Generate TTS using Azure TTS with male voice (reliable and fast)
      console.log('Generating TTS with Azure TTS (male voice)...');
      const ttsStart = Date.now();
      let ttsResult: { audioBase64: string | null; visemes: { id: number; offset: number }[]; error?: string };
      try {
        ttsResult = await generateAzureTTS(response);

        console.log('[chat] TTS generation took', Date.now() - ttsStart, 'ms');
      } catch (ttsError) {
        console.warn('TTS generation failed, continuing without audio:', ttsError);
        ttsResult = { audioBase64: null, visemes: [], error: 'TTS generation failed' };
      }

      const audioContent = ttsResult.audioBase64;
      const ttsError = ttsResult.error || null;

      // Simplified metadata (ElevenLabs doesn't provide visemes, so we use empty array)
      const finalMetadata = {
        animation,
        morphTargets,
        visemes: ttsResult.visemes
      };
      const finalMetadataString = JSON.stringify(finalMetadata);
      console.log('Metadata string length:', finalMetadataString.length);

      // Try to save to database, but don't fail if it doesn't work
      try {
        const chatMessage = await storage.createChatMessage({
          sessionId,
          message,
          response,
          metadata: finalMetadataString,
        });
        console.log('Chat message saved successfully');
      } catch (dbError) {
        console.warn('Database save failed, continuing without persistence:', dbError);
        // Continue without failing the request
      }

      console.log('Sending response: text-only, total time:', Date.now() - startTime, 'ms');
      res.json({
        chatMessage: {
          $id: `temp-${Date.now()}`,
          sessionId,
          message,
          response,
          metadata: finalMetadataString,
          $createdAt: new Date().toISOString(),
          $updatedAt: new Date().toISOString()
        },
        audioContent,
        ttsError
      });
    } catch (error) {
      console.error("Error processing chat message:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid message data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to process chat message" });
    }
  });

  // Prompt routes
  app.post("/api/prompts", async (req, res) => {
    try {
      const validatedData = insertPromptSchema.parse(req.body);
      const prompt = await storage.createPrompt(validatedData);
      res.status(201).json(prompt);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid prompt data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create prompt" });
    }
  });

  app.get("/api/prompts", async (_req, res) => {
    try {
      const prompts = await storage.getPrompts();
      res.json(prompts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch prompts" });
    }
  });

  app.put("/api/prompts/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = insertPromptSchema.partial().parse(req.body);
      const prompt = await storage.updatePrompt(id, validatedData);
      res.json(prompt);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid prompt data", errors: error.errors });
      }
      if (error instanceof Error && error.message.includes("not found")) {
        return res.status(404).json({ message: "Prompt not found" });
      }
      res.status(500).json({ message: "Failed to update prompt" });
    }
  });

  app.delete("/api/prompts/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deletePrompt(id);
      if (!deleted) {
        return res.status(404).json({ message: "Prompt not found" });
      }
      res.json({ message: "Project deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete prompt" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}