import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProjectSchema, insertChatMessageSchema, insertPromptSchema } from "@shared/schema";
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import Groq from "groq-sdk";
const upload = multer({ storage: multer.memoryStorage() });

// Server-side TTS function
async function generateServerSideTTS(text: string): Promise<{ audioBuffer: ArrayBuffer; visemes: { id: number; offset: number }[]; error?: string }> {
  try {
    // Dynamically import Azure Speech SDK
    const sdk = await import('microsoft-cognitiveservices-speech-sdk');

    const speechConfig = sdk.SpeechConfig.fromSubscription(
      process.env.AZURE_TTS_KEY!,
      process.env.AZURE_REGION!
    );
    speechConfig.speechSynthesisVoiceName = 'en-US-ChristopherNeural';

    // Use memory stream for audio output
    const audioConfig = sdk.AudioConfig.fromDefaultSpeakerOutput();
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

    return new Promise((resolve, reject) => {
      const visemes: { id: number; offset: number }[] = [];

      synthesizer.visemeReceived = (_s: any, e: any) => {
        visemes.push({ id: e.visemeId, offset: e.audioOffset / 10000 });
      };

      synthesizer.speakTextAsync(text, (result: any) => {
        synthesizer.close();

        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          resolve({
            audioBuffer: result.audioData,
            visemes: visemes
          });
        } else {
          reject(new Error(result.errorDetails || 'TTS synthesis failed'));
        }
      });
    });
  } catch (error) {
    console.error('Server-side TTS error:', error);
    return {
      audioBuffer: new ArrayBuffer(0),
      visemes: [],
      error: error instanceof Error ? error.message : 'Unknown TTS error'
    };
  }
}

// Simple in-memory cache for chat responses (LRU-style with max 100 entries)
const responseCache = new Map<string, { response: string; timestamp: number }>();
const MAX_CACHE_SIZE = 100;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function getCacheKey(message: string, prompts: any[]): string {
  const promptHash = prompts.map(p => p.promptText).sort().join('|');
  return `${message.trim().toLowerCase()}|${promptHash}`;
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

      const systemPrompts = (prompts || []).map((p: any) => ({
        role: "system",
        content: p.promptText,
      }));

      // Check cache for existing response
      const cacheKey = getCacheKey(message, prompts || []);
      const cachedResponse = getCachedResponse(cacheKey);
      let response: string;

      if (cachedResponse) {
        console.log('Using cached response for:', message);
        response = cachedResponse;
      } else {
        const groq = new Groq({
          apiKey: process.env.GROQ_API_KEY,
        });

        const chatCompletion = await groq.chat.completions.create({
          messages: [
            ...systemPrompts,
            { role: "user", content: message },
          ],
          model: "llama-3.1-70b-instant",
        });

        response = chatCompletion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
        console.log('Groq response:', response);

        // Cache the response for future use
        setCachedResponse(cacheKey, response);
      }

      console.log('Groq response type:', typeof response);

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

      // Generate server-side TTS
      console.log('Generating server-side TTS...');
      const ttsResult = await generateServerSideTTS(response);
      const audioContent = ttsResult.error ? null : ttsResult.audioBuffer;
      const ttsError = ttsResult.error || null;

      // Include visemes in metadata
      const metadata = {
        animation,
        morphTargets,
        visemes: ttsResult.visemes,
        ttsError
      };
      const metadataString = JSON.stringify(metadata);
      console.log('Metadata string:', metadataString, 'Length:', metadataString.length);
      if (metadataString.length > 500) {
        return res.status(400).json({ message: "Metadata too long" });
      }

      const chatMessage = await storage.createChatMessage({
        sessionId,
        message,
        response,
        metadata: metadataString,
      });

      console.log('Sending response: audioContent present:', !!audioContent, 'ttsError:', ttsError, 'visemes count:', ttsResult.visemes.length);
      res.json({ chatMessage, audioContent, ttsError });
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