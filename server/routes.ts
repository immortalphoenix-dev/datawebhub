import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProjectSchema, insertChatMessageSchema, insertPromptSchema } from "@shared/schema";
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import Groq from "groq-sdk";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import rateLimit from "express-rate-limit";
import { createCacheService } from "./cache";
import { buildConversationContext, injectConversationContext, getMemoryStats } from "./conversation-memory";
import { buildEnhancedSystemPrompt, extractQuickStarters, stripQuickStarters } from "./persona";
import { buildPortfolioContext, buildSkillsContext, buildContactContext, buildBackgroundContext } from "./portfolio-context";
import { sendDealNotification } from "./email-service";
const upload = multer({ storage: multer.memoryStorage() });

// In-memory cache for Azure TTS audio (kept in-memory for speed on binary data)
// For larger deployments, consider using Redis
const azureTTSCache = new Map<string, { base64: string; visemes: { id: number; offset: number }[]; timestamp: number }>();
const AZURE_TTS_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const AZURE_TTS_CACHE_MAX = 50; // max entries

function getAzureTTSCacheKey(text: string, voice: string) {
  return `tts:${voice}|${text.trim().toLowerCase()}`;
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
      if (process.env.NODE_ENV !== 'production') {
        console.log('Viseme received:', e.visemeId, 'at offset:', e.audioOffset);
      }
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
          if (process.env.NODE_ENV !== 'production') {
            console.log(`Generated ${visemes.length} visemes for text: "${text}"`);
          }

          // Fallback: if no visemes were captured, generate basic ones based on text
          if (visemes.length === 0) {
            if (process.env.NODE_ENV !== 'production') {
              console.log('No visemes captured from Azure, generating fallback visemes');
            }
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

// Initialize cache service (Redis if available, otherwise in-memory)
const cacheService = createCacheService();

// Simple in-memory cache for chat responses (LRU-style with max 100 entries)
// Now backed by either Redis or in-memory depending on REDIS_URL env var
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function getCacheKey(message: string, prompts: any[], model: string = ""): string {
  const promptHash = prompts.map(p => p.promptText).sort().join('|');
  const modelPart = model ? `|model:${model}` : '';
  return `chat:response:${message.trim().toLowerCase()}|${promptHash}${modelPart}`;
}

async function getCachedResponse(key: string): Promise<string | null> {
  try {
    return await cacheService.get(key);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Error getting cached response:', error);
    }
    return null;
  }
}

async function setCachedResponse(key: string, response: string): Promise<void> {
  try {
    await cacheService.set(key, response, CACHE_TTL);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Error setting cached response:', error);
    }
  }
}

// Rate limiting middleware for chat endpoints
// IP-based rate limiting for overall chat API usage
const chatIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max 100 requests per IP per 15 min window
  message: 'Too many chat requests from this IP, please try again later',
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for local/internal requests (optional)
    return process.env.NODE_ENV !== 'production';
  },
});

// Strict rate limiting for chat message endpoint (POST /api/chat)
const chatMessageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Max 10 messages per minute per IP
  message: 'Too many chat messages sent, please wait before sending another',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use sessionId if available, fallback to IP
    const sessionId = req.body?.sessionId || req.ip;
    return `chat_${sessionId}`;
  },
  skip: (req) => {
    return process.env.NODE_ENV !== 'production';
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Lightweight telemetry endpoint (fire-and-forget)
  app.post('/api/telemetry', (req, res) => {
    try {
      const { event, payload, ts } = req.body ?? {};
      if (process.env.NODE_ENV !== 'production') {
        console.log('[telemetry]', event, ts, payload ? JSON.stringify(payload).slice(0, 500) : '');
      }
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
  app.get("/api/chat/messages", chatIpLimiter, async (req, res) => {
    try {
      const { sessionId } = req.query;
      if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ message: "sessionId is required" });
      }
      // Validate sessionId length to prevent abuse
      if (sessionId.length > 100) {
        return res.status(400).json({ message: "Invalid sessionId" });
      }
      const messages = await storage.getChatMessages(sessionId);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching chat messages:", error);
      res.status(500).json({ message: "Failed to fetch chat messages" });
    }
  });

  app.post("/api/chat", chatIpLimiter, chatMessageLimiter, async (req, res) => {
    const startTime = Date.now();
    if (process.env.NODE_ENV !== 'production') {
      console.log('[chat] request started');
    }

    try {
      const { message, prompts, sessionId } = req.body;

      // Input validation
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ message: "Message is required" });
      }
      if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ message: "sessionId is required" });
      }

      // Validate message length (prevent abuse)
      if (message.length > 5000) {
        return res.status(400).json({ message: "Message too long (max 5000 characters)" });
      }
      if (message.trim().length === 0) {
        return res.status(400).json({ message: "Message cannot be empty" });
      }

      // Validate sessionId length
      if (sessionId.length > 100) {
        return res.status(400).json({ message: "Invalid sessionId" });
      }

      // Validate prompts array if provided
      if (prompts && !Array.isArray(prompts)) {
        return res.status(400).json({ message: "Prompts must be an array" });
      }
      if (prompts && prompts.length > 10) {
        return res.status(400).json({ message: "Too many prompts (max 10)" });
      }

      const groq = new Groq({
        apiKey: process.env.GROQ_API_KEY,
      });

      if (process.env.NODE_ENV !== 'production') {
        console.log('[chat] Groq initialized, calling API...');
      }

      // Build persona-driven system prompt with quick-starter guidance
      const defaultSystemPrompt = buildEnhancedSystemPrompt();

      // Fetch your actual projects for context (with graceful fallback)
      let projects: any[] = [];
      try {
        projects = await storage.getProjects();
      } catch (err) {
        console.warn('[chat] Could not fetch projects from Appwrite, using empty list');
      }

      const portfolioContext = buildPortfolioContext(projects);
      const skillsContext = buildSkillsContext(projects);
      const contactContext = buildContactContext();
      const backgroundContext = buildBackgroundContext();

      // Fetch active seeded prompts from Appwrite (with graceful fallback)
      let seedPromptText = '';
      try {
        const allPrompts = await storage.getPrompts();
        const activePrompts = allPrompts.filter(p => p.isActive);
        seedPromptText = activePrompts
          .map(p => p.promptText)
          .join("\n\n");
      } catch (err) {
        console.warn('[chat] Could not fetch seeded prompts from Appwrite, using default prompts only');
      }

      // Combine all context: persona + portfolio + seeded prompts
      const enrichedPersonaPrompt = defaultSystemPrompt + backgroundContext + portfolioContext + skillsContext + contactContext + (seedPromptText ? "\n\n" + seedPromptText : "");

      // Fetch conversation history for context (with graceful fallback)
      let allMessages: any[] = [];
      try {
        allMessages = await storage.getChatMessages(sessionId);
      } catch (err) {
        console.warn('[chat] Could not fetch conversation history from Appwrite');
      }

      // Build conversation context (last N exchanges with summarization for older messages)
      // Reduced token limit to account for portfolio context
      const conversationContext = buildConversationContext(allMessages, 6, 1200);

      // Inject conversation context into system prompt
      const enrichedSystemPrompt = injectConversationContext(enrichedPersonaPrompt, conversationContext);

      if (process.env.NODE_ENV !== 'production') {
        const memoryStats = getMemoryStats(allMessages, conversationContext);
        console.log('[chat] memory stats:', memoryStats);
      }

      const systemPrompts = [
        {
          role: "system" as const,
          content: enrichedSystemPrompt,
        },
        ...(prompts || []).map((p: any) => ({
          role: "system" as const,
          content: p.promptText,
        })),
      ];

      // Model selection with fallback - prioritize fastest models first
      const primaryModel = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
      const fallbackModels = ["llama-3.1-8b-instant", "llama-3.1-70b-versatile", "mixtral-8x7b-32768"].filter(m => m !== primaryModel);
      const tried: string[] = [];
      let usedModel = primaryModel;

      const cacheKey = getCacheKey(message, prompts || [], primaryModel);
      const cachedResponse = await getCachedResponse(cacheKey);
      let response: string = '';

      // Retry logic with exponential backoff
      const attemptWithRetry = async (model: string, maxRetries: number = 3): Promise<string> => {
        for (let retryCount = 0; retryCount <= maxRetries; retryCount++) {
          try {
            // Add timeout to prevent hanging (30 second limit for overall API call)
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('API_TIMEOUT')), 30000)
            );

            const apiPromise = groq.chat.completions.create({
              messages: [
                ...systemPrompts,
                { role: "user", content: message },
              ],
              model,
            });

            if (process.env.NODE_ENV !== 'production' && retryCount === 0) {
              console.log('[chat] Groq API call started for model:', model);
            }

            const chatCompletion = await Promise.race([apiPromise, timeoutPromise]);
            const responseText = chatCompletion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";

            if (process.env.NODE_ENV !== 'production' && retryCount > 0) {
              console.log('[chat] API succeeded on retry', retryCount, 'for model:', model);
            }

            return responseText;
          } catch (err: any) {
            const code = err?.error?.error?.code || err?.error?.code;

            // Don't retry model_not_found errors
            if (code === 'model_not_found') {
              if (process.env.NODE_ENV !== 'production') {
                console.warn('[chat] model not found:', model);
              }
              throw new Error('MODEL_NOT_FOUND');
            }

            // Check if this is a retryable error
            const isRetryable = err.message === 'API_TIMEOUT' ||
              code === 'rate_limit_exceeded' ||
              (err.status >= 500 && err.status < 600);

            // If this is the last retry or not retryable, throw the error
            if (retryCount === maxRetries || !isRetryable) {
              if (err.message === 'API_TIMEOUT') {
                if (process.env.NODE_ENV !== 'production') {
                  console.warn('[chat] API timeout for model:', model, 'after', retryCount, 'retries');
                }
                throw new Error('API_TIMEOUT');
              }
              console.error('[chat] model error', model, 'after', retryCount, 'retries', err?.message || err);
              throw err;
            }

            // Calculate exponential backoff with jitter: (2^retryCount - 1) * 100ms + random jitter
            const baseDelay = (Math.pow(2, retryCount) - 1) * 100;
            const jitter = Math.random() * 100;
            const delay = baseDelay + jitter;

            if (process.env.NODE_ENV !== 'production') {
              console.warn('[chat] retrying model', model, 'in', Math.round(delay), 'ms (attempt', retryCount + 1, '/', maxRetries + 1, ')', 'error:', err?.message);
            }

            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }

        throw new Error('Failed after all retries');
      };

      // Streaming version with retry
      const attemptWithRetryStream = async (model: string, maxRetries: number = 3): Promise<AsyncIterable<any>> => {
        for (let retryCount = 0; retryCount <= maxRetries; retryCount++) {
          try {
            // Add timeout to prevent hanging (30 second limit for overall API call)
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('API_TIMEOUT')), 30000)
            );

            // Create stream request
            const streamPromise = groq.chat.completions.create({
              messages: [
                ...systemPrompts,
                { role: "user", content: message },
              ],
              model,
              stream: true, // Enable streaming
            });

            const stream = await Promise.race([streamPromise, timeoutPromise]);

            if (process.env.NODE_ENV !== 'production' && retryCount > 0) {
              console.log('[chat] Stream API succeeded on retry', retryCount, 'for model:', model);
            }

            return stream as AsyncIterable<any>;
          } catch (err: any) {
            const code = err?.error?.error?.code || err?.error?.code;

            // Don't retry model_not_found errors
            if (code === 'model_not_found') {
              if (process.env.NODE_ENV !== 'production') {
                console.warn('[chat] model not found:', model);
              }
              throw new Error('MODEL_NOT_FOUND');
            }

            // Check if this is a retryable error
            const isRetryable = err.message === 'API_TIMEOUT' ||
              code === 'rate_limit_exceeded' ||
              (err.status >= 500 && err.status < 600);

            // If this is the last retry or not retryable, throw the error
            if (retryCount === maxRetries || !isRetryable) {
              if (err.message === 'API_TIMEOUT') {
                if (process.env.NODE_ENV !== 'production') {
                  console.warn('[chat] Stream API timeout for model:', model, 'after', retryCount, 'retries');
                }
                throw new Error('API_TIMEOUT');
              }
              console.error('[chat] Stream model error', model, 'after', retryCount, 'retries', err?.message || err);
              throw err;
            }

            // Calculate exponential backoff with jitter
            const baseDelay = (Math.pow(2, retryCount) - 1) * 100;
            const jitter = Math.random() * 100;
            const delay = baseDelay + jitter;

            if (process.env.NODE_ENV !== 'production') {
              console.warn('[chat] retrying stream for model', model, 'in', Math.round(delay), 'ms (attempt', retryCount + 1, '/', maxRetries + 1, ')', 'error:', err?.message);
            }

            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }

        throw new Error('Failed after all retries');
      };

      const attempt = async (model: string): Promise<string> => {
        tried.push(model);
        return attemptWithRetry(model, 3); // 3 retries = 4 total attempts
      };

      const attemptStream = async (model: string): Promise<AsyncIterable<any>> => {
        tried.push(model);
        return attemptWithRetryStream(model, 3); // 3 retries = 4 total attempts
      };

      if (cachedResponse) {
        if (process.env.NODE_ENV !== 'production') {
          console.log('[chat] using cache for model', primaryModel, 'took', Date.now() - startTime, 'ms');
        }
        response = cachedResponse;
      } else {
        let success = false;
        for (const model of [primaryModel, ...fallbackModels]) {
          try {
            const apiStart = Date.now();
            response = await attempt(model);
            if (process.env.NODE_ENV !== 'production') {
              console.log('[chat] API call for', model, 'took', Date.now() - apiStart, 'ms');
            }
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
        await setCachedResponse(cacheKey, response);
      }

      if (process.env.NODE_ENV !== 'production') {
        console.log('[chat] response type:', typeof response, 'model used:', usedModel, 'tried:', tried.join(','));
      }

      // Set response headers for streaming
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');

      // Send message chunk immediately to unblock UI
      res.write(JSON.stringify({ type: 'message_start', sessionId, message }) + '\n');

      // Stream tokens as they arrive (will collect full response too)
      const streamTokens = async () => {
        let fullResponse = '';
        let tokenCount = 0;
        try {
          for (const model of [primaryModel, ...fallbackModels]) {
            fullResponse = '';
            tokenCount = 0;
            try {
              const apiStart = Date.now();
              const stream = await attemptStream(model);

              for await (const chunk of stream) {
                const delta = chunk.choices?.[0]?.delta;
                const token = delta?.content || '';

                if (token) {
                  fullResponse += token;
                  tokenCount++;
                  // Send each token to client for real-time display
                  res.write(JSON.stringify({ type: 'token', content: token }) + '\n');
                }
              }

              if (process.env.NODE_ENV !== 'production') {
                console.log('[chat] Stream API call for', model, 'took', Date.now() - apiStart, 'ms, tokens:', tokenCount);
              }
              usedModel = model;
              break; // Success, exit model loop
            } catch (e: any) {
              if (e.message === 'MODEL_NOT_FOUND') {
                continue; // Try next model
              }
              throw e;
            }
          }

          if (!fullResponse) {
            fullResponse = "I'm sorry, I couldn't generate a response.";
          }

          // Now process the complete response for animations, TTS, and metadata
          const getAnimationFromResponse = (text: string) => {
            const lowerText = text.toLowerCase();
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
            const sortedKeywords = Array.from(animationMap.keys()).sort((a, b) => b.length - a.length);
            for (const keyword of sortedKeywords) {
              if (lowerText.includes(keyword)) {
                return animationMap.get(keyword);
              }
            }
            if (text.length > 0) return "talking";
            return "idle";
          };

          const getMorphTargetsFromResponse = (text: string) => {
            const lowerText = text.toLowerCase();
            let morphTargets: { [key: string]: number } = {};
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
            for (const emotion of emotionMap) {
              if (emotion.keywords.some(keyword => lowerText.includes(keyword))) {
                Object.assign(morphTargets, emotion.morphs);
                break;
              }
            }
            return morphTargets;
          };

          const animation = getAnimationFromResponse(fullResponse);
          const morphTargets = getMorphTargetsFromResponse(fullResponse);

          // Simple viseme fallback so avatar keeps talking even if TTS fails
          const generateFallbackVisemes = (text: string) => {
            const words = text.split(/\s+/).filter(Boolean);
            const visemes = words.map((_, idx) => ({ id: 0, offset: idx * 120 })).slice(0, 80);
            return visemes.length ? visemes : [{ id: 0, offset: 0 }];
          };

          // Generate TTS using Azure TTS with male voice
          if (process.env.NODE_ENV !== 'production') {
            console.log('Generating TTS with Azure TTS (male voice)...');
          }
          const ttsStart = Date.now();
          let ttsResult: { audioBase64: string | null; visemes: { id: number; offset: number }[]; error?: string };
          let hasTTSError = false;
          try {
            ttsResult = await generateAzureTTS(fullResponse);
            if (process.env.NODE_ENV !== 'production') {
              console.log('[chat] TTS generation took', Date.now() - ttsStart, 'ms');
            }
          } catch (ttsError) {
            console.warn('TTS generation failed, continuing with text-only response:', ttsError);
            hasTTSError = true;
            ttsResult = { audioBase64: null, visemes: [], error: 'Audio unavailable - text displayed instead' };
          }

          const audioContent = ttsResult.audioBase64;
          const ttsError = hasTTSError ? '⚠️ Audio temporarily unavailable. Click to retry or refresh.' : (ttsResult.error || null);

          // If TTS failed, keep avatar talking with fallback visemes and talking animation
          if (!audioContent || !ttsResult.visemes?.length) {
            ttsResult.visemes = generateFallbackVisemes(fullResponse);
            if (!hasTTSError && !ttsError) {
              hasTTSError = true;
            }
          }
          const safeVisemes = ttsResult.visemes || generateFallbackVisemes(fullResponse);
          const effectiveAnimation = animation || 'talking';

          // Extract quick starters from response (before stripping)
          const quickStarters = extractQuickStarters(fullResponse);
          const cleanResponse = stripQuickStarters(fullResponse);

          // Detect if this looks like a potential deal/lead
          const dealKeywords = ['hire', 'project', 'work together', 'start', 'begin', 'interested', 'interested in working', 'can you', 'can we', 'let\'s', 'when can you', 'how soon', 'i need', 'build me', 'create', 'develop'];
          const lowerMessage = message.toLowerCase();
          const isDealClose = dealKeywords.some(keyword => lowerMessage.includes(keyword));

          const finalMetadata = {
            animation: effectiveAnimation,
            morphTargets,
            visemes: safeVisemes,
            quickStarters: quickStarters,
            isDealClose: isDealClose,
            audioAvailable: !!audioContent,
            canRetry: hasTTSError, // Flag for client to allow audio retry
          };
          const finalMetadataString = JSON.stringify(finalMetadata);

          // Create database-specific metadata (exclude large visemes array to satisfy 500 char limit)
          const { visemes: _v, ...dbMetaObj } = finalMetadata;
          const dbMetadataString = JSON.stringify(dbMetaObj);

          // Try to save to database
          try {
            const chatMessage = await storage.createChatMessage({
              sessionId,
              message,
              response: cleanResponse,
              metadata: dbMetadataString,
            });
            if (process.env.NODE_ENV !== 'production') {
              console.log('Chat message saved successfully');
              if (isDealClose) {
                console.log('🔔 POTENTIAL DEAL DETECTED - Sending email notification...');
              }
            }

            // Send email notification if deal detected (with error handling)
            if (isDealClose) {
              try {
                await sendDealNotification(message, sessionId);
              } catch (emailError) {
                console.warn('Email notification failed, but chat response sent:', emailError);
              }
            }
          } catch (dbError) {
            console.warn('Database save failed, continuing without persistence:', dbError);
          }

          if (process.env.NODE_ENV !== 'production') {
            console.log('Sending stream complete: total time:', Date.now() - startTime, 'ms');
          }

          // Send completion with metadata and audio
          res.write(JSON.stringify({
            type: 'message_complete',
            chatMessage: {
              $id: `temp-${Date.now()}`,
              sessionId,
              message,
              response: cleanResponse,
              metadata: finalMetadataString,
              $createdAt: new Date().toISOString(),
              $updatedAt: new Date().toISOString()
            },
            audioContent,
            ttsError,
            quickStarters: quickStarters,
          }) + '\n');

          res.end();
        } catch (err: any) {
          console.error('[chat] Stream error:', err?.message || err);
          res.write(JSON.stringify({ type: 'error', error: err?.message || 'Unknown error' }) + '\n');
          res.end();
        }
      };

      // Start streaming asynchronously
      streamTokens().catch(err => {
        console.error('[chat] Stream processing error:', err);
        if (!res.headersSent) {
          res.status(500).json({ message: 'Failed to process chat message' });
        }
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

  // TTS Replay endpoint - regenerate audio for a message
  app.post("/api/chat/regenerate-audio", async (req, res) => {
    try {
      const { text } = req.body;

      if (!text || typeof text !== 'string') {
        return res.status(400).json({ message: "Text is required" });
      }

      if (text.length > 5000) {
        return res.status(400).json({ message: "Text too long" });
      }

      // Generate TTS for the text
      const ttsResult = await generateAzureTTS(text);

      if (!ttsResult.audioBase64) {
        return res.status(500).json({
          message: "Failed to generate audio",
          error: ttsResult.error
        });
      }

      res.json({
        audioContent: ttsResult.audioBase64,
        visemes: ttsResult.visemes,
      });
    } catch (error) {
      console.error("Error regenerating audio:", error);
      res.status(500).json({
        message: "Failed to regenerate audio",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
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