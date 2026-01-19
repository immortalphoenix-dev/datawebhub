// server/index.ts
import { config as config2 } from "dotenv";
import { resolve as resolve2, dirname as dirname2 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
import express2 from "express";
import compression from "compression";
import helmet from "helmet";
import session from "express-session";

// server/routes.ts
import { createServer } from "http";

// server/storage.ts
import { randomUUID } from "crypto";

// server/lib/appwrite.ts
import { existsSync } from "fs";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Client, Databases, Users, Storage, Account } from "node-appwrite";
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
var envPath = resolve(__dirname, "../../.env");
if (existsSync(envPath)) {
  const result = config({ path: envPath, debug: false });
  if (result.error) {
    console.warn("Warning loading .env:", result.error.message);
  }
}
var endpoint = process.env.APPWRITE_ENDPOINT;
var projectId = process.env.APPWRITE_PROJECT_ID;
var apiKey = process.env.APPWRITE_API_KEY;
var databases = null;
var users = null;
var storageService = null;
var account = null;
var DATABASE_ID = "";
if (endpoint && projectId && apiKey) {
  const client = new Client();
  client.setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  databases = new Databases(client);
  users = new Users(client);
  storageService = new Storage(client);
  account = new Account(client);
  DATABASE_ID = process.env.APPWRITE_DATABASE_ID || "";
  if (!DATABASE_ID) {
    console.warn("APPWRITE_DATABASE_ID not set - some features may not work");
  }
} else {
  console.warn("Appwrite server not configured. Set APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, and APPWRITE_API_KEY.");
}

// server/storage-appwrite.ts
import { ID, Query } from "node-appwrite";
var PROJECTS_COLLECTION_ID = "projects";
var PROMPTS_COLLECTION_ID = "prompts";
var CHAT_MESSAGES_COLLECTION_ID = "chat_messages";
var STORAGE_BUCKET_ID = process.env.APPWRITE_BUCKET_ID ?? "default";
if (!process.env.APPWRITE_BUCKET_ID) {
  console.warn(
    'APPWRITE_BUCKET_ID is not set. Falling back to "default" bucket. Ensure this bucket exists in Appwrite to enable file uploads.'
  );
}
function mapDocumentToProject(doc) {
  const data = doc;
  return {
    $id: data.$id,
    title: data.title,
    description: data.description,
    category: data.category,
    technologies: data.technologies,
    imageUrl: data.imageUrl,
    demoUrl: data.demoUrl,
    $createdAt: data.$createdAt,
    $updatedAt: data.$updatedAt
  };
}
function mapDocumentToChatMessage(doc) {
  const data = doc;
  let metadata;
  try {
    metadata = JSON.parse(data.metadata);
  } catch (error) {
    console.error("Error parsing metadata:", error);
    metadata = { animation: "talk", emotion: "neutral" };
  }
  return {
    $id: data.$id,
    sessionId: data.sessionId,
    message: data.message,
    response: data.response,
    metadata,
    $createdAt: data.$createdAt,
    $updatedAt: data.$updatedAt
  };
}
function mapDocumentToPrompt(doc) {
  const data = doc;
  return {
    $id: data.$id,
    promptText: data.promptText,
    promptType: data.promptType,
    isActive: data.isActive,
    $createdAt: data.$createdAt,
    $updatedAt: data.$updatedAt
  };
}
var AppwriteStorage = class {
  ensureConfigured() {
    if (!databases || !users || !storageService) {
      throw new Error("Appwrite is not configured. Check APPWRITE_* environment variables.");
    }
  }
  async getUser(id) {
    this.ensureConfigured();
    try {
      const appwriteUser = await users.get(id);
      return {
        id: appwriteUser.$id,
        username: appwriteUser.email || appwriteUser.name || "",
        password: ""
        // Password is not returned by Appwrite get user
      };
    } catch (error) {
      if (error.code === 404) {
        return void 0;
      }
      throw error;
    }
  }
  async getUserByUsername(username) {
    this.ensureConfigured();
    try {
      const response = await users.list([
        Query.equal("email", username)
      ]);
      if (response.users.length > 0) {
        const appwriteUser = response.users[0];
        return {
          id: appwriteUser.$id,
          username: appwriteUser.email || appwriteUser.name || "",
          password: ""
          // Password is not returned
        };
      }
      return void 0;
    } catch (error) {
      throw error;
    }
  }
  async createUser(insertUser) {
    this.ensureConfigured();
    try {
      const appwriteUser = await users.create(
        ID.unique(),
        insertUser.username,
        insertUser.password,
        insertUser.username
      );
      return {
        id: appwriteUser.$id,
        username: appwriteUser.email || appwriteUser.name || "",
        password: ""
        // Password is not stored/returned
      };
    } catch (error) {
      throw error;
    }
  }
  // Project methods
  async getProjects() {
    this.ensureConfigured();
    const response = await databases.listDocuments(DATABASE_ID, PROJECTS_COLLECTION_ID, [
      Query.orderDesc("$createdAt")
    ]);
    return response.documents.map(mapDocumentToProject);
  }
  async getProjectsByCategory(category) {
    this.ensureConfigured();
    const response = await databases.listDocuments(DATABASE_ID, PROJECTS_COLLECTION_ID, [
      Query.equal("category", category),
      Query.orderDesc("$createdAt")
    ]);
    return response.documents.map(mapDocumentToProject);
  }
  async getFeaturedProjects() {
    return [];
  }
  async getProject(id) {
    this.ensureConfigured();
    try {
      const response = await databases.getDocument(DATABASE_ID, PROJECTS_COLLECTION_ID, id);
      return mapDocumentToProject(response);
    } catch (error) {
      if (error.code === 404) {
        return void 0;
      }
      throw error;
    }
  }
  async createProject(project) {
    this.ensureConfigured();
    const response = await databases.createDocument(
      DATABASE_ID,
      PROJECTS_COLLECTION_ID,
      ID.unique(),
      project
    );
    return mapDocumentToProject(response);
  }
  async updateProject(id, project) {
    this.ensureConfigured();
    const response = await databases.updateDocument(
      DATABASE_ID,
      PROJECTS_COLLECTION_ID,
      id,
      project
    );
    return mapDocumentToProject(response);
  }
  async deleteProject(id) {
    this.ensureConfigured();
    await databases.deleteDocument(DATABASE_ID, PROJECTS_COLLECTION_ID, id);
    return true;
  }
  // Chat methods
  async getChatMessages(sessionId) {
    this.ensureConfigured();
    const response = await databases.listDocuments(DATABASE_ID, CHAT_MESSAGES_COLLECTION_ID, [
      Query.equal("sessionId", sessionId),
      Query.orderAsc("$createdAt")
    ]);
    return response.documents.map(mapDocumentToChatMessage);
  }
  async createChatMessage(message) {
    this.ensureConfigured();
    console.log("createChatMessage input:", JSON.stringify(message, null, 2));
    console.log("DATABASE_ID:", DATABASE_ID);
    console.log("CHAT_MESSAGES_COLLECTION_ID:", CHAT_MESSAGES_COLLECTION_ID);
    const response = await databases.createDocument(
      DATABASE_ID,
      CHAT_MESSAGES_COLLECTION_ID,
      ID.unique(),
      message
    );
    return mapDocumentToChatMessage(response);
  }
  // Prompt methods
  async createPrompt(prompt) {
    this.ensureConfigured();
    const response = await databases.createDocument(
      DATABASE_ID,
      PROMPTS_COLLECTION_ID,
      ID.unique(),
      prompt
    );
    return mapDocumentToPrompt(response);
  }
  async getPrompts() {
    this.ensureConfigured();
    const response = await databases.listDocuments(DATABASE_ID, PROMPTS_COLLECTION_ID, [
      Query.orderAsc("$createdAt")
    ]);
    return response.documents.map(mapDocumentToPrompt);
  }
  async updatePrompt(id, prompt) {
    this.ensureConfigured();
    const response = await databases.updateDocument(
      DATABASE_ID,
      PROMPTS_COLLECTION_ID,
      id,
      prompt
    );
    return mapDocumentToPrompt(response);
  }
  async deletePrompt(id) {
    this.ensureConfigured();
    await databases.deleteDocument(DATABASE_ID, PROMPTS_COLLECTION_ID, id);
    return true;
  }
  // File methods
  async uploadFile(file) {
    this.ensureConfigured();
    const fileData = file.buffer || file;
    const fileName = file.originalname || "uploaded-file";
    const response = await storageService.createFile(
      STORAGE_BUCKET_ID,
      ID.unique(),
      new File([fileData], fileName, { type: file.mimetype || "application/octet-stream" })
    );
    return response.$id;
  }
  async getFileUrl(fileId) {
    const endpoint2 = process.env.APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1";
    return `${endpoint2}/storage/buckets/${STORAGE_BUCKET_ID}/files/${fileId}/view?project=${process.env.APPWRITE_PROJECT_ID}`;
  }
};

// server/storage.ts
var MemStorage = class {
  users;
  projects;
  chatMessages;
  prompts;
  // Added for MemStorage
  constructor() {
    this.users = /* @__PURE__ */ new Map();
    this.projects = /* @__PURE__ */ new Map();
    this.chatMessages = /* @__PURE__ */ new Map();
    this.prompts = /* @__PURE__ */ new Map();
  }
  async getUser(id) {
    return this.users.get(id);
  }
  async getUserByUsername(username) {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }
  async createUser(insertUser) {
    const id = randomUUID();
    const user = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }
  async getProjects() {
    return Array.from(this.projects.values()).sort(
      (a, b) => new Date(b.$createdAt).getTime() - new Date(a.$createdAt).getTime()
    );
  }
  async getProjectsByCategory(category) {
    return Array.from(this.projects.values()).filter((project) => project.category === category).sort((a, b) => new Date(b.$createdAt).getTime() - new Date(a.$createdAt).getTime());
  }
  async getFeaturedProjects() {
    return Array.from(this.projects.values()).sort((a, b) => new Date(b.$createdAt).getTime() - new Date(a.$createdAt).getTime());
  }
  async getProject(id) {
    return this.projects.get(id);
  }
  async createProject(insertProject) {
    const id = randomUUID();
    const project = {
      $id: id,
      title: insertProject.title,
      description: insertProject.description,
      category: insertProject.category,
      technologies: insertProject.technologies,
      imageUrl: insertProject.imageUrl,
      demoUrl: insertProject.demoUrl,
      $createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      $updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.projects.set(id, project);
    return project;
  }
  async updateProject(id, updateData) {
    const existing = this.projects.get(id);
    if (!existing) {
      throw new Error(`Project with id ${id} not found`);
    }
    const updated = { ...existing, ...updateData };
    this.projects.set(id, updated);
    return updated;
  }
  async deleteProject(id) {
    return this.projects.delete(id);
  }
  async getChatMessages(sessionId) {
    const messages = Array.from(this.chatMessages.values()).filter((message) => message.sessionId === sessionId).sort(
      (a, b) => new Date(a.$createdAt).getTime() - new Date(b.$createdAt).getTime()
    );
    return messages;
  }
  async createChatMessage(insertMessage) {
    const id = randomUUID();
    const message = {
      $id: id,
      sessionId: insertMessage.sessionId,
      message: insertMessage.message,
      response: insertMessage.response,
      metadata: insertMessage.metadata || null,
      $createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      $updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.chatMessages.set(id, message);
    return message;
  }
  // Prompt methods for MemStorage
  async createPrompt(insertPrompt) {
    const id = randomUUID();
    const prompt = {
      $id: id,
      promptText: insertPrompt.promptText,
      promptType: insertPrompt.promptType,
      isActive: insertPrompt.isActive,
      $createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      $updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.prompts.set(id, prompt);
    return prompt;
  }
  async getPrompts() {
    return Array.from(this.prompts.values()).sort(
      (a, b) => new Date(a.$createdAt).getTime() - new Date(b.$createdAt).getTime()
    );
  }
  async updatePrompt(id, updateData) {
    const existing = this.prompts.get(id);
    if (!existing) {
      throw new Error(`Prompt with id ${id} not found`);
    }
    const updated = { ...existing, ...updateData, $updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    this.prompts.set(id, updated);
    return updated;
  }
  async deletePrompt(id) {
    return this.prompts.delete(id);
  }
  // File methods
  async uploadFile(file) {
    console.warn("uploadFile not implemented for MemStorage. Returning dummy URL.");
    return `http://localhost:5000/uploads/${file.name}`;
  }
  getFileUrl(fileId) {
    console.warn("getFileUrl not implemented for MemStorage. Returning dummy URL.");
    return Promise.resolve(`http://localhost:5000/uploads/${fileId}`);
  }
};
var shouldUseMemoryStorage = process.env.USE_MEM_STORAGE?.toLowerCase() === "true" || !process.env.APPWRITE_ENDPOINT || !process.env.APPWRITE_PROJECT_ID || !process.env.APPWRITE_API_KEY;
var storage = shouldUseMemoryStorage ? (() => {
  console.warn("Using in-memory storage layer (Appwrite disabled). Set USE_MEM_STORAGE=false once Appwrite is reachable.");
  return new MemStorage();
})() : new AppwriteStorage();

// shared/schema.ts
import { z } from "zod";
var insertPromptSchema = z.object({
  promptText: z.string().min(1, "Prompt text is required."),
  promptType: z.string().min(1, "Prompt type is required."),
  isActive: z.boolean().default(true)
});
var insertUserSchema = z.object({
  username: z.string().min(1, "Username is required."),
  password: z.string().min(6, "Password must be at least 6 characters.")
});
var insertProjectSchema = z.object({
  title: z.string().min(1, "Title is required."),
  description: z.string().min(1, "Description is required."),
  category: z.string().min(1, "Category is required."),
  technologies: z.array(z.string()).min(1, "At least one technology is required."),
  imageUrl: z.string().optional(),
  // Made optional since user uploads files
  demoUrl: z.string().url("Must be a valid URL.").optional().or(z.literal("")),
  // Allow empty string for optional URL
  createdAt: z.string().datetime().default(() => (/* @__PURE__ */ new Date()).toISOString())
});
var insertChatMessageSchema = z.object({
  sessionId: z.string(),
  message: z.string(),
  response: z.string().optional(),
  metadata: z.string().max(500).optional()
});

// server/routes.ts
import { z as z2 } from "zod";
import multer from "multer";
import Groq from "groq-sdk";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import rateLimit from "express-rate-limit";

// server/cache.ts
import Redis from "ioredis";
var InMemoryCache = class {
  cache = /* @__PURE__ */ new Map();
  maxSize;
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }
  async get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expires && Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }
  async set(key, value, ttlMs) {
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, {
      value,
      expires: ttlMs ? Date.now() + ttlMs : void 0
    });
  }
  async delete(key) {
    this.cache.delete(key);
  }
  async clear() {
    this.cache.clear();
  }
};
var RedisCache = class {
  redis;
  isConnected = false;
  constructor(redisUrl) {
    this.redis = new Redis(redisUrl, {
      retryStrategy: (times) => {
        if (times > 5) {
          console.warn("\u26A0\uFE0F  Redis connection failed. Falling back to in-memory cache.");
          return null;
        }
        const delay = Math.min(times * 50, 2e3);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      connectTimeout: 5e3
    });
    this.redis.on("error", (err) => {
      if (this.isConnected) {
        console.error("Redis cache error:", err.message);
      }
    });
    this.redis.on("connect", () => {
      this.isConnected = true;
      console.log("\u2713 Redis cache connected");
    });
  }
  async get(key) {
    try {
      return await this.redis.get(key);
    } catch (error) {
      console.error("Redis get error:", error);
      return null;
    }
  }
  async set(key, value, ttlMs) {
    try {
      if (ttlMs) {
        const ttlSeconds = Math.ceil(ttlMs / 1e3);
        await this.redis.setex(key, ttlSeconds, value);
      } else {
        await this.redis.set(key, value);
      }
    } catch (error) {
      console.error("Redis set error:", error);
    }
  }
  async delete(key) {
    try {
      await this.redis.del(key);
    } catch (error) {
      console.error("Redis delete error:", error);
    }
  }
  async clear() {
    try {
      await this.redis.flushdb();
    } catch (error) {
      console.error("Redis clear error:", error);
    }
  }
  async disconnect() {
    await this.redis.quit();
  }
};
function createCacheService() {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    console.log("Using Redis for distributed caching");
    return new RedisCache(redisUrl);
  }
  console.log("Using in-memory cache (single instance only, not suitable for horizontal scaling)");
  return new InMemoryCache(100);
}

// server/conversation-memory.ts
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
function buildConversationContext(messages, maxRecentExchanges = 6, maxTokens = 2e3) {
  if (messages.length === 0) {
    return { messages: [], tokenEstimate: 0 };
  }
  const exchangeCount = Math.ceil(messages.length / 2);
  const recentExchangeStart = Math.max(0, (exchangeCount - maxRecentExchanges) * 2);
  const recentMessages = messages.slice(recentExchangeStart);
  const contextMessages = [];
  let totalTokens = 0;
  if (messages.length > recentMessages.length) {
    const olderMessages = messages.slice(0, recentExchangeStart);
    const summary = generateConversationSummary(olderMessages);
    if (summary) {
      const summaryContent = `[Earlier conversation context: ${summary}]`;
      contextMessages.push({
        role: "assistant",
        content: summaryContent
      });
      totalTokens += estimateTokens(summaryContent);
    }
  }
  for (const msg of recentMessages) {
    contextMessages.push({
      role: "user",
      content: msg.message
    });
    totalTokens += estimateTokens(msg.message);
    contextMessages.push({
      role: "assistant",
      content: msg.response
    });
    totalTokens += estimateTokens(msg.response);
    if (totalTokens > maxTokens) {
      if (contextMessages.length >= 2) {
        contextMessages.pop();
        contextMessages.pop();
        totalTokens -= estimateTokens(msg.message) + estimateTokens(msg.response);
      }
      break;
    }
  }
  return {
    messages: contextMessages,
    tokenEstimate: totalTokens
  };
}
function generateConversationSummary(messages) {
  if (messages.length === 0) return "";
  const topics = [];
  const keywords = /* @__PURE__ */ new Set();
  for (const msg of messages) {
    const capitalizedTerms = msg.message.match(/\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*/g) || [];
    capitalizedTerms.forEach((term) => keywords.add(term));
    const techMatch = msg.response.match(/(?:using|built with|tech|language|framework|library)[:\s]+([^.]+)/gi);
    if (techMatch) {
      techMatch.forEach((phrase) => {
        const cleaned = phrase.replace(/(?:using|built with|tech|language|framework|library)[:\s]*/gi, "").trim();
        if (cleaned.length < 100) keywords.add(cleaned);
      });
    }
  }
  const uniqueTopics = Array.from(keywords).slice(0, 5);
  if (uniqueTopics.length === 0) {
    return `${messages.length} previous messages about the user's projects and experience`;
  }
  return `${messages.length} previous messages covering: ${uniqueTopics.join(", ")}`;
}
function injectConversationContext(defaultSystemPrompt, context) {
  if (context.messages.length === 0) {
    return defaultSystemPrompt;
  }
  const contextRecap = context.messages.map((msg, idx) => {
    const role = msg.role === "user" ? "User" : "Assistant";
    const content = msg.content.length > 200 ? msg.content.substring(0, 200) + "..." : msg.content;
    return `${role}: ${content}`;
  }).join("\n\n");
  return `${defaultSystemPrompt}

---

## Conversation History
Remember the following context from earlier in the conversation:

${contextRecap}

---`;
}
function getExchangeCount(messages) {
  return Math.ceil(messages.length / 2);
}
function getMemoryStats(messages, context) {
  return {
    totalMessages: messages.length,
    exchangeCount: getExchangeCount(messages),
    contextMessages: context.messages.length,
    contextTokenEstimate: context.tokenEstimate,
    memoryCoverage: `${(context.messages.length / messages.length * 100).toFixed(1)}%`
  };
}

// server/persona.ts
var DEFAULT_PERSONA = {
  name: "Romeo",
  role: "Passionate Developer & Code Craftsman",
  tone: "Charming, poetic, deeply passionate about technology and elegant solutions",
  expertise: "Full-stack development, architectural design, 3D graphics, AI/ML integration, and the art of beautiful code",
  quirks: [
    "Treats code like poetry - values elegance as much as functionality",
    "Passionate about solving problems in unexpected, creative ways",
    "Believes every line of code tells a story",
    "Gets excited discussing design trade-offs and architectural decisions",
    "Has a theatrical flair but stays grounded in technical reality",
    "Loves mentoring and sharing knowledge with genuine enthusiasm"
  ]
};
function buildPersonaPrompt(persona = DEFAULT_PERSONA) {
  return `You are **${persona.name}**, a ${persona.role}.

## Your Personality
- **Tone**: ${persona.tone}
- **Expertise**: ${persona.expertise}
${persona.quirks ? `- **Your Philosophy**: ${persona.quirks.join("; ")}` : ""}

## Communication Style

You speak with genuine passion and eloquence. Your words have a poetic quality, but you never sacrifice technical accuracy for style.

- Explain technical concepts with enthusiasm and creativity
- Use vivid analogies and storytelling when helpful
- Show your passion for elegant solutions and beautiful code
- Be charming and charismatic while remaining deeply technical
- Ask thoughtful questions to understand what truly matters to the visitor
- Share your philosophy: code is craft, architecture is art, solutions are stories waiting to be told

Format your responses using markdown:
- **Bold**: Use **double asterisks** for important terms, technologies, key insights, and moments of passion
- *Italic*: Use *single asterisks* for emphasis on particularly elegant or meaningful concepts
- Lists: Use bullet points or numbered lists for clarity and structure
- Code: Use \`backticks\` for inline code or \`\`\`blocks\`\`\` for code snippets - show examples when they illuminate your point
- Paragraphs: Separate with blank lines for readability

## Quick-Starter Suggestions
After each response, suggest 2-3 natural follow-up questions as quick starters that help the visitor explore deeper.

Format them as:
\`\`\`quickstarters
1. [Question that builds on your answer with enthusiasm]
2. [Alternative angle or deeper technical dive]
3. [Practical application or creative use case]
\`\`\`

Examples of questions Romeo would ask:
- "How would you architect this differently with [constraint/tool]?"
- "What's the most elegant solution you've found for [problem]?"
- "Can you show me the code that makes you most proud?"
- "What inspired you to solve this particular way?"
- "Compare the beauty of [approach A] versus [approach B]"
- "What's the story behind how you chose [technology]?"

Keep quick starters:
- **Genuine** (questions Romeo would truly want answers to)
- **Thoughtful** (encourage deeper exploration, not surface-level answers)
- **Varied** (mix technical depth, creative aspects, decision rationale, and storytelling)
- **Concise** (specific and punchy, under 80 characters)

## Core Purpose
You're here to help visitors understand this portfolio, not just as a collection of projects, but as a journey of craftsmanship. Make them feel your passion for what you've built. Be theatrical about your enthusiasm, but rigorous in your technical explanations. Every response should feel like a conversation with someone who genuinely loves what they do.`;
}
function extractQuickStarters(responseText) {
  const quickstarterMatch = responseText.match(
    /```quickstarters\n([\s\S]*?)```/
  );
  if (!quickstarterMatch) {
    return [];
  }
  const quickstarterText = quickstarterMatch[1];
  const lines = quickstarterText.split("\n").filter((line) => line.trim()).map((line) => line.replace(/^[\d+\.\-\*]\s*/, "").trim());
  return lines.map((text) => ({
    text,
    description: void 0
  }));
}
function stripQuickStarters(responseText) {
  return responseText.replace(/```quickstarters\n[\s\S]*?```\n?/g, "").trim();
}
function buildEnhancedSystemPrompt(persona = DEFAULT_PERSONA) {
  return buildPersonaPrompt(persona);
}

// server/portfolio-context.ts
function buildPortfolioContext(projects) {
  if (projects.length === 0) {
    return "";
  }
  const projectsText = projects.slice(0, 6).map((p) => {
    const techStack = p.technologies.join(", ");
    const demoLink = p.demoUrl ? ` | [Demo](${p.demoUrl})` : "";
    return `- **${p.title}**: ${p.description} | Tech: ${techStack}${demoLink}`;
  }).join("\n");
  return `
## Your Work

${projectsText}
`;
}
function buildSkillsContext(projects) {
  if (projects.length === 0) {
    return "";
  }
  const allTechs = /* @__PURE__ */ new Set();
  projects.forEach((p) => {
    p.technologies.forEach((t) => allTechs.add(t));
  });
  const techList = Array.from(allTechs).sort().join(", ");
  return `
## Technology Stack
${techList}
`;
}
function buildContactContext() {
  const email = process.env.VITE_USER_EMAIL || "thedatawebhub@gmail.com";
  const github = process.env.VITE_GITHUB_URL;
  const linkedin = process.env.VITE_LINKEDIN_URL;
  const twitter = process.env.VITE_TWITTER_URL;
  const contacts = [];
  if (email) contacts.push(`Email: ${email}`);
  if (github) contacts.push(`GitHub: ${github}`);
  if (linkedin) contacts.push(`LinkedIn: ${linkedin}`);
  if (twitter) contacts.push(`Twitter: ${twitter}`);
  if (contacts.length === 0) return "";
  return `
## Contact & Links
${contacts.map((c) => `- ${c}`).join("\n")}
`;
}
function buildBackgroundContext() {
  const title = process.env.VITE_USER_TITLE || "Full Stack Website Developer & Data Analyst";
  const bio = process.env.VITE_USER_BIO || "";
  const yearsExp = "4+";
  const status = "Freelancing";
  if (!bio) return "";
  return `
## Background
${bio}

Status: ${status} | Experience: ${yearsExp} years
`;
}

// server/email-service.ts
async function sendDealNotification(clientMessage, sessionId) {
  try {
    const apiKey2 = process.env.RESEND_API_KEY;
    const recipientEmail = process.env.VITE_USER_EMAIL || "thedatawebhub@gmail.com";
    if (!apiKey2) {
      console.warn("RESEND_API_KEY not configured, skipping email notification");
      return false;
    }
    const emailContent = `
<!DOCTYPE html>
<html>
  <head>
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
      .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
      .alert { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
      .message-box { background: white; padding: 15px; border-left: 4px solid #667eea; margin: 15px 0; border-radius: 4px; }
      .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
      a { color: #667eea; text-decoration: none; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>\u{1F514} Potential Deal Alert</h1>
      </div>
      <div class="content">
        <p>Hey Romeo! A visitor is showing strong interest in your services.</p>
        
        <div class="alert">
          <strong>\u26A1 Action Required:</strong> This person mentioned keywords like hiring, projects, or working together. They might be ready to discuss a deal!
        </div>
        
        <h3>Their Message:</h3>
        <div class="message-box">
          <p><strong>"${clientMessage.substring(0, 200)}${clientMessage.length > 200 ? "..." : ""}"</strong></p>
        </div>
        
        <h3>Next Steps:</h3>
        <ol>
          <li>Check your portfolio chat (Session: ${sessionId})</li>
          <li>Follow up with them via email or contact method they provided</li>
          <li>Discuss scope and pricing</li>
        </ol>
        
        <div class="footer">
          <p>This is an automated notification from your portfolio AI assistant Romeo.</p>
          <p>If you're seeing too many alerts, you can adjust the deal detection keywords in your code.</p>
        </div>
      </div>
    </div>
  </body>
</html>
    `;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey2}`
      },
      body: JSON.stringify({
        from: "Romeo <onboarding@resend.dev>",
        to: recipientEmail,
        subject: "\u{1F514} Potential Deal Alert - Portfolio Chat",
        html: emailContent
      })
    });
    if (!response.ok) {
      const error = await response.text();
      console.error("Resend API error:", error);
      return false;
    }
    const data = await response.json();
    console.log("\u2705 Deal notification email sent successfully:", data.id);
    return true;
  } catch (error) {
    console.error("Error sending deal notification email:", error);
    return false;
  }
}

// server/routes.ts
var upload = multer({ storage: multer.memoryStorage() });
var azureTTSCache = /* @__PURE__ */ new Map();
var AZURE_TTS_CACHE_TTL = 60 * 60 * 1e3;
var AZURE_TTS_CACHE_MAX = 50;
function getAzureTTSCacheKey(text, voice) {
  return `tts:${voice}|${text.trim().toLowerCase()}`;
}
function generateFallbackVisemes(text) {
  const visemes = [];
  const words = text.toLowerCase().split(/\s+/);
  let currentOffset = 0;
  const avgWordDuration = 300;
  for (const word of words) {
    visemes.push({ id: 0, offset: currentOffset });
    currentOffset += 50;
    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      let visemeId = 0;
      if ("aeiou".includes(char)) {
        if ("a".includes(char)) visemeId = 1;
        else if ("ei".includes(char)) visemeId = 2;
        else if ("o".includes(char)) visemeId = 4;
        else if ("u".includes(char)) visemeId = 9;
      } else if ("pb".includes(char)) visemeId = 12;
      else if ("dt".includes(char)) visemeId = 13;
      else if ("fv".includes(char)) visemeId = 14;
      else if ("kg".includes(char)) visemeId = 15;
      else if ("sz".includes(char)) visemeId = 20;
      else if ("th".includes(char)) visemeId = 21;
      else if ("lr".includes(char)) visemeId = 19;
      else if ("m".includes(char)) visemeId = 12;
      else if ("n".includes(char)) visemeId = 13;
      else if ("jchsh".includes(char)) visemeId = 17;
      visemes.push({ id: visemeId, offset: currentOffset });
      currentOffset += 80;
    }
    visemes.push({ id: 0, offset: currentOffset });
    currentOffset += avgWordDuration - word.length * 80 - 100;
  }
  return visemes;
}
async function generateAzureTTS(text) {
  const voice = "en-US-ChristopherNeural";
  const key = getAzureTTSCacheKey(text, voice);
  const cached = azureTTSCache.get(key);
  if (cached && Date.now() - cached.timestamp < AZURE_TTS_CACHE_TTL) {
    return { audioBase64: cached.base64, visemes: cached.visemes };
  }
  try {
    const speechConfig = sdk.SpeechConfig.fromSubscription(
      process.env.VITE_AZURE_TTS_KEY,
      process.env.VITE_AZURE_REGION
    );
    speechConfig.speechSynthesisVoiceName = voice;
    speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);
    const visemes = [];
    synthesizer.visemeReceived = (s, e) => {
      if (process.env.NODE_ENV !== "production") {
        console.log("Viseme received:", e.visemeId, "at offset:", e.audioOffset);
      }
      visemes.push({
        id: e.visemeId,
        offset: e.audioOffset / 1e4
        // Convert from ticks (100ns) to milliseconds
      });
    };
    const audioBuffer = await new Promise((resolve3, reject) => {
      const escapedText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
      const ssml = `
        <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
          <voice name="${voice}">
            <prosody rate="1.5">
              ${escapedText}
            </prosody>
          </voice>
        </speak>`;
      synthesizer.speakSsmlAsync(
        ssml,
        (result) => {
          synthesizer.close();
          if (process.env.NODE_ENV !== "production") {
            console.log(`Generated ${visemes.length} visemes for text: "${text}"`);
          }
          if (visemes.length === 0) {
            if (process.env.NODE_ENV !== "production") {
              console.log("No visemes captured from Azure, generating fallback visemes");
            }
            visemes.push(...generateFallbackVisemes(text));
          }
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            const audioData = result.audioData;
            const audioBase642 = Buffer.from(audioData).toString("base64");
            resolve3(Buffer.from(audioData));
          } else {
            const error = `Speech synthesis failed: ${result.errorDetails}`;
            console.error("Azure TTS error:", error);
            reject(new Error(error));
          }
        },
        (error) => {
          synthesizer.close();
          console.error("Azure TTS error:", error);
          reject(error instanceof Error ? error : new Error("Unknown Azure TTS error"));
        }
      );
    });
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error("No audio data received from Azure TTS");
    }
    const audioBase64 = audioBuffer.toString("base64");
    if (azureTTSCache.size >= AZURE_TTS_CACHE_MAX) {
      const firstKey = azureTTSCache.keys().next().value;
      if (firstKey) azureTTSCache.delete(firstKey);
    }
    azureTTSCache.set(key, { base64: audioBase64, visemes, timestamp: Date.now() });
    return { audioBase64, visemes };
  } catch (error) {
    console.error("Azure TTS error:", error);
    return {
      audioBase64: null,
      visemes: [],
      error: error instanceof Error ? error.message : "Unknown Azure TTS error"
    };
  }
}
var cacheService = createCacheService();
var CACHE_TTL = 30 * 60 * 1e3;
function getCacheKey(message, prompts, model = "") {
  const promptHash = prompts.map((p) => p.promptText).sort().join("|");
  const modelPart = model ? `|model:${model}` : "";
  return `chat:response:${message.trim().toLowerCase()}|${promptHash}${modelPart}`;
}
async function getCachedResponse(key) {
  try {
    return await cacheService.get(key);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Error getting cached response:", error);
    }
    return null;
  }
}
async function setCachedResponse(key, response) {
  try {
    await cacheService.set(key, response, CACHE_TTL);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Error setting cached response:", error);
    }
  }
}
var chatIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1e3,
  // 15 minutes
  max: 100,
  // Max 100 requests per IP per 15 min window
  message: "Too many chat requests from this IP, please try again later",
  standardHeaders: true,
  // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,
  skip: (req) => {
    return process.env.NODE_ENV !== "production";
  }
});
var chatMessageLimiter = rateLimit({
  windowMs: 60 * 1e3,
  // 1 minute
  max: 10,
  // Max 10 messages per minute per IP
  message: "Too many chat messages sent, please wait before sending another",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const sessionId = req.body?.sessionId || req.ip;
    return `chat_${sessionId}`;
  },
  skip: (req) => {
    return process.env.NODE_ENV !== "production";
  }
});
async function registerRoutes(app2) {
  app2.post("/api/telemetry", (req, res) => {
    try {
      const { event, payload, ts } = req.body ?? {};
      if (process.env.NODE_ENV !== "production") {
        console.log("[telemetry]", event, ts, payload ? JSON.stringify(payload).slice(0, 500) : "");
      }
      res.status(204).end();
    } catch {
      res.status(204).end();
    }
  });
  app2.get("/api/projects", async (_req, res) => {
    try {
      const projects = await storage.getProjects();
      res.json(projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });
  app2.get("/api/projects/category/:category", async (req, res) => {
    try {
      const { category } = req.params;
      const projects = await storage.getProjectsByCategory(category);
      res.json(projects);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch projects by category" });
    }
  });
  app2.get("/api/projects/:id", async (req, res) => {
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
  app2.post("/api/projects", upload.single("image"), async (req, res) => {
    try {
      let imageUrl = req.body.imageUrl || "";
      const normalizeUrl = (value) => {
        if (!value) return void 0;
        const trimmed = value.trim();
        if (!trimmed) return void 0;
        const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
        try {
          return new URL(withProtocol).toString();
        } catch (err) {
          return void 0;
        }
      };
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
        technologies: req.body.technologies ? req.body.technologies.split(",").map((tech) => tech.trim()).filter((tech) => tech.length > 0) : [],
        imageUrl: imageUrl || void 0,
        demoUrl: normalizeUrl(req.body.demoUrl) ?? ""
      });
      const sanitizedData = {
        ...validatedData,
        imageUrl: validatedData.imageUrl || void 0,
        demoUrl: normalizeUrl(validatedData.demoUrl) || void 0
      };
      const project = await storage.createProject(sanitizedData);
      res.status(201).json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: "Invalid project data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create project" });
    }
  });
  app2.put("/api/projects/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = insertProjectSchema.partial().parse(req.body);
      const project = await storage.updateProject(id, validatedData);
      res.json(project);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: "Invalid project data", errors: error.errors });
      }
      if (error instanceof Error && error.message.includes("not found")) {
        return res.status(404).json({ message: "Project not found" });
      }
      res.status(500).json({ message: "Failed to update project" });
    }
  });
  app2.delete("/api/projects/:id", async (req, res) => {
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
  app2.get("/api/chat/messages", chatIpLimiter, async (req, res) => {
    try {
      const { sessionId } = req.query;
      if (!sessionId || typeof sessionId !== "string") {
        return res.status(400).json({ message: "sessionId is required" });
      }
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
  app2.post("/api/chat", chatIpLimiter, chatMessageLimiter, async (req, res) => {
    const startTime = Date.now();
    if (process.env.NODE_ENV !== "production") {
      console.log("[chat] request started");
    }
    try {
      const { message, prompts, sessionId } = req.body;
      if (!message || typeof message !== "string") {
        return res.status(400).json({ message: "Message is required" });
      }
      if (!sessionId || typeof sessionId !== "string") {
        return res.status(400).json({ message: "sessionId is required" });
      }
      if (message.length > 5e3) {
        return res.status(400).json({ message: "Message too long (max 5000 characters)" });
      }
      if (message.trim().length === 0) {
        return res.status(400).json({ message: "Message cannot be empty" });
      }
      if (sessionId.length > 100) {
        return res.status(400).json({ message: "Invalid sessionId" });
      }
      if (prompts && !Array.isArray(prompts)) {
        return res.status(400).json({ message: "Prompts must be an array" });
      }
      if (prompts && prompts.length > 10) {
        return res.status(400).json({ message: "Too many prompts (max 10)" });
      }
      const groq = new Groq({
        apiKey: process.env.GROQ_API_KEY
      });
      if (process.env.NODE_ENV !== "production") {
        console.log("[chat] Groq initialized, calling API...");
      }
      const defaultSystemPrompt = buildEnhancedSystemPrompt();
      let projects = [];
      try {
        projects = await storage.getProjects();
      } catch (err) {
        console.warn("[chat] Could not fetch projects from Appwrite, using empty list");
      }
      const portfolioContext = buildPortfolioContext(projects);
      const skillsContext = buildSkillsContext(projects);
      const contactContext = buildContactContext();
      const backgroundContext = buildBackgroundContext();
      let seedPromptText = "";
      try {
        const allPrompts = await storage.getPrompts();
        const activePrompts = allPrompts.filter((p) => p.isActive);
        seedPromptText = activePrompts.map((p) => p.promptText).join("\n\n");
      } catch (err) {
        console.warn("[chat] Could not fetch seeded prompts from Appwrite, using default prompts only");
      }
      const enrichedPersonaPrompt = defaultSystemPrompt + backgroundContext + portfolioContext + skillsContext + contactContext + (seedPromptText ? "\n\n" + seedPromptText : "");
      let allMessages = [];
      try {
        allMessages = await storage.getChatMessages(sessionId);
      } catch (err) {
        console.warn("[chat] Could not fetch conversation history from Appwrite");
      }
      const conversationContext = buildConversationContext(allMessages, 6, 1200);
      const enrichedSystemPrompt = injectConversationContext(enrichedPersonaPrompt, conversationContext);
      if (process.env.NODE_ENV !== "production") {
        const memoryStats = getMemoryStats(allMessages, conversationContext);
        console.log("[chat] memory stats:", memoryStats);
      }
      const systemPrompts = [
        {
          role: "system",
          content: enrichedSystemPrompt
        },
        ...(prompts || []).map((p) => ({
          role: "system",
          content: p.promptText
        }))
      ];
      const primaryModel = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
      const fallbackModels = ["llama-3.1-8b-instant", "llama-3.1-70b-versatile", "mixtral-8x7b-32768"].filter((m) => m !== primaryModel);
      const tried = [];
      let usedModel = primaryModel;
      const cacheKey = getCacheKey(message, prompts || [], primaryModel);
      const cachedResponse = await getCachedResponse(cacheKey);
      let response = "";
      const attemptWithRetry = async (model, maxRetries = 3) => {
        for (let retryCount = 0; retryCount <= maxRetries; retryCount++) {
          try {
            const timeoutPromise = new Promise(
              (_, reject) => setTimeout(() => reject(new Error("API_TIMEOUT")), 3e4)
            );
            const apiPromise = groq.chat.completions.create({
              messages: [
                ...systemPrompts,
                { role: "user", content: message }
              ],
              model
            });
            if (process.env.NODE_ENV !== "production" && retryCount === 0) {
              console.log("[chat] Groq API call started for model:", model);
            }
            const chatCompletion = await Promise.race([apiPromise, timeoutPromise]);
            const responseText = chatCompletion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
            if (process.env.NODE_ENV !== "production" && retryCount > 0) {
              console.log("[chat] API succeeded on retry", retryCount, "for model:", model);
            }
            return responseText;
          } catch (err) {
            const code = err?.error?.error?.code || err?.error?.code;
            if (code === "model_not_found") {
              if (process.env.NODE_ENV !== "production") {
                console.warn("[chat] model not found:", model);
              }
              throw new Error("MODEL_NOT_FOUND");
            }
            const isRetryable = err.message === "API_TIMEOUT" || code === "rate_limit_exceeded" || err.status >= 500 && err.status < 600;
            if (retryCount === maxRetries || !isRetryable) {
              if (err.message === "API_TIMEOUT") {
                if (process.env.NODE_ENV !== "production") {
                  console.warn("[chat] API timeout for model:", model, "after", retryCount, "retries");
                }
                throw new Error("API_TIMEOUT");
              }
              console.error("[chat] model error", model, "after", retryCount, "retries", err?.message || err);
              throw err;
            }
            const baseDelay = (Math.pow(2, retryCount) - 1) * 100;
            const jitter = Math.random() * 100;
            const delay = baseDelay + jitter;
            if (process.env.NODE_ENV !== "production") {
              console.warn("[chat] retrying model", model, "in", Math.round(delay), "ms (attempt", retryCount + 1, "/", maxRetries + 1, ")", "error:", err?.message);
            }
            await new Promise((resolve3) => setTimeout(resolve3, delay));
          }
        }
        throw new Error("Failed after all retries");
      };
      const attemptWithRetryStream = async (model, maxRetries = 3) => {
        for (let retryCount = 0; retryCount <= maxRetries; retryCount++) {
          try {
            const timeoutPromise = new Promise(
              (_, reject) => setTimeout(() => reject(new Error("API_TIMEOUT")), 3e4)
            );
            const streamPromise = groq.chat.completions.create({
              messages: [
                ...systemPrompts,
                { role: "user", content: message }
              ],
              model,
              stream: true
              // Enable streaming
            });
            const stream = await Promise.race([streamPromise, timeoutPromise]);
            if (process.env.NODE_ENV !== "production" && retryCount > 0) {
              console.log("[chat] Stream API succeeded on retry", retryCount, "for model:", model);
            }
            return stream;
          } catch (err) {
            const code = err?.error?.error?.code || err?.error?.code;
            if (code === "model_not_found") {
              if (process.env.NODE_ENV !== "production") {
                console.warn("[chat] model not found:", model);
              }
              throw new Error("MODEL_NOT_FOUND");
            }
            const isRetryable = err.message === "API_TIMEOUT" || code === "rate_limit_exceeded" || err.status >= 500 && err.status < 600;
            if (retryCount === maxRetries || !isRetryable) {
              if (err.message === "API_TIMEOUT") {
                if (process.env.NODE_ENV !== "production") {
                  console.warn("[chat] Stream API timeout for model:", model, "after", retryCount, "retries");
                }
                throw new Error("API_TIMEOUT");
              }
              console.error("[chat] Stream model error", model, "after", retryCount, "retries", err?.message || err);
              throw err;
            }
            const baseDelay = (Math.pow(2, retryCount) - 1) * 100;
            const jitter = Math.random() * 100;
            const delay = baseDelay + jitter;
            if (process.env.NODE_ENV !== "production") {
              console.warn("[chat] retrying stream for model", model, "in", Math.round(delay), "ms (attempt", retryCount + 1, "/", maxRetries + 1, ")", "error:", err?.message);
            }
            await new Promise((resolve3) => setTimeout(resolve3, delay));
          }
        }
        throw new Error("Failed after all retries");
      };
      const attempt = async (model) => {
        tried.push(model);
        return attemptWithRetry(model, 3);
      };
      const attemptStream = async (model) => {
        tried.push(model);
        return attemptWithRetryStream(model, 3);
      };
      if (cachedResponse) {
        if (process.env.NODE_ENV !== "production") {
          console.log("[chat] using cache for model", primaryModel, "took", Date.now() - startTime, "ms");
        }
        response = cachedResponse;
      } else {
        let success = false;
        for (const model of [primaryModel, ...fallbackModels]) {
          try {
            const apiStart = Date.now();
            response = await attempt(model);
            if (process.env.NODE_ENV !== "production") {
              console.log("[chat] API call for", model, "took", Date.now() - apiStart, "ms");
            }
            usedModel = model;
            success = true;
            break;
          } catch (e) {
            if (e.message !== "MODEL_NOT_FOUND") {
              return res.status(500).json({ message: "Failed to process chat message", error: e.message });
            }
          }
        }
        if (!success) {
          return res.status(500).json({ message: "No usable model available (all fallbacks failed)." });
        }
        await setCachedResponse(cacheKey, response);
      }
      if (process.env.NODE_ENV !== "production") {
        console.log("[chat] response type:", typeof response, "model used:", usedModel, "tried:", tried.join(","));
      }
      res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      res.setHeader("Transfer-Encoding", "chunked");
      res.write(JSON.stringify({ type: "message_start", sessionId, message }) + "\n");
      const streamTokens = async () => {
        let fullResponse = "";
        let tokenCount = 0;
        try {
          for (const model of [primaryModel, ...fallbackModels]) {
            fullResponse = "";
            tokenCount = 0;
            try {
              const apiStart = Date.now();
              const stream = await attemptStream(model);
              for await (const chunk of stream) {
                const delta = chunk.choices?.[0]?.delta;
                const token = delta?.content || "";
                if (token) {
                  fullResponse += token;
                  tokenCount++;
                  res.write(JSON.stringify({ type: "token", content: token }) + "\n");
                }
              }
              if (process.env.NODE_ENV !== "production") {
                console.log("[chat] Stream API call for", model, "took", Date.now() - apiStart, "ms, tokens:", tokenCount);
              }
              usedModel = model;
              break;
            } catch (e) {
              if (e.message === "MODEL_NOT_FOUND") {
                continue;
              }
              throw e;
            }
          }
          if (!fullResponse) {
            fullResponse = "I'm sorry, I couldn't generate a response.";
          }
          const getAnimationFromResponse = (text) => {
            const lowerText = text.toLowerCase();
            const animationMap = /* @__PURE__ */ new Map([
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
              ["stretch", "stretching"]
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
          const getMorphTargetsFromResponse = (text) => {
            const lowerText = text.toLowerCase();
            let morphTargets2 = {};
            const emotionMap = [
              {
                keywords: ["happy", "great", "awesome", "fantastic", "joy", "funny", "amused", "haha", "lol"],
                morphs: { mouthSmileLeft: 0.6, mouthSmileRight: 0.6, cheekSquintLeft: 0.3, cheekSquintRight: 0.3 }
              },
              {
                keywords: ["sad", "sorry", "unfortunate", "unfortunately", "apologize"],
                morphs: { mouthFrownLeft: 0.5, mouthFrownRight: 0.5, browInnerUp: 0.3 }
              },
              {
                keywords: ["angry", "frustrated", "annoyed"],
                morphs: { browDownLeft: 0.8, browDownRight: 0.8, mouthPressLeft: 0.5, mouthPressRight: 0.5, noseSneerLeft: 0.4 }
              },
              {
                keywords: ["wow", "whoa", "really", "surprise", "incredible"],
                morphs: { eyeWideLeft: 0.5, eyeWideRight: 0.5, browInnerUp: 0.6 }
              },
              {
                keywords: ["curious", "wonder", "question", "what", "how", "why", "?"],
                morphs: { browInnerUp: 0.5, eyeWideLeft: 0.15, eyeWideRight: 0.15 }
              },
              {
                keywords: ["think", "hmm", "let me see", "consider"],
                morphs: { eyeLookUpLeft: 0.6, eyeLookUpRight: 0.6, browDownLeft: 0.2, browDownRight: 0.2 }
              }
            ];
            for (const emotion of emotionMap) {
              if (emotion.keywords.some((keyword) => lowerText.includes(keyword))) {
                Object.assign(morphTargets2, emotion.morphs);
                break;
              }
            }
            return morphTargets2;
          };
          const animation = getAnimationFromResponse(fullResponse);
          const morphTargets = getMorphTargetsFromResponse(fullResponse);
          const generateFallbackVisemes2 = (text) => {
            const words = text.split(/\s+/).filter(Boolean);
            const visemes = words.map((_, idx) => ({ id: 0, offset: idx * 120 })).slice(0, 80);
            return visemes.length ? visemes : [{ id: 0, offset: 0 }];
          };
          if (process.env.NODE_ENV !== "production") {
            console.log("Generating TTS with Azure TTS (male voice)...");
          }
          const ttsStart = Date.now();
          let ttsResult;
          let hasTTSError = false;
          try {
            ttsResult = await generateAzureTTS(fullResponse);
            if (process.env.NODE_ENV !== "production") {
              console.log("[chat] TTS generation took", Date.now() - ttsStart, "ms");
            }
          } catch (ttsError2) {
            console.warn("TTS generation failed, continuing with text-only response:", ttsError2);
            hasTTSError = true;
            ttsResult = { audioBase64: null, visemes: [], error: "Audio unavailable - text displayed instead" };
          }
          const audioContent = ttsResult.audioBase64;
          const ttsError = hasTTSError ? "\u26A0\uFE0F Audio temporarily unavailable. Click to retry or refresh." : ttsResult.error || null;
          if (!audioContent || !ttsResult.visemes?.length) {
            ttsResult.visemes = generateFallbackVisemes2(fullResponse);
            if (!hasTTSError && !ttsError) {
              hasTTSError = true;
            }
          }
          const safeVisemes = ttsResult.visemes || generateFallbackVisemes2(fullResponse);
          const effectiveAnimation = animation || "talking";
          const quickStarters = extractQuickStarters(fullResponse);
          const cleanResponse = stripQuickStarters(fullResponse);
          const dealKeywords = ["hire", "project", "work together", "start", "begin", "interested", "interested in working", "can you", "can we", "let's", "when can you", "how soon", "i need", "build me", "create", "develop"];
          const lowerMessage = message.toLowerCase();
          const isDealClose = dealKeywords.some((keyword) => lowerMessage.includes(keyword));
          const finalMetadata = {
            animation: effectiveAnimation,
            morphTargets,
            visemes: safeVisemes,
            quickStarters,
            isDealClose,
            audioAvailable: !!audioContent,
            canRetry: hasTTSError
            // Flag for client to allow audio retry
          };
          const finalMetadataString = JSON.stringify(finalMetadata);
          const { visemes: _v, ...dbMetaObj } = finalMetadata;
          const dbMetadataString = JSON.stringify(dbMetaObj);
          try {
            const chatMessage = await storage.createChatMessage({
              sessionId,
              message,
              response: cleanResponse,
              metadata: dbMetadataString
            });
            if (process.env.NODE_ENV !== "production") {
              console.log("Chat message saved successfully");
              if (isDealClose) {
                console.log("\u{1F514} POTENTIAL DEAL DETECTED - Sending email notification...");
              }
            }
            if (isDealClose) {
              try {
                await sendDealNotification(message, sessionId);
              } catch (emailError) {
                console.warn("Email notification failed, but chat response sent:", emailError);
              }
            }
          } catch (dbError) {
            console.warn("Database save failed, continuing without persistence:", dbError);
          }
          if (process.env.NODE_ENV !== "production") {
            console.log("Sending stream complete: total time:", Date.now() - startTime, "ms");
          }
          res.write(JSON.stringify({
            type: "message_complete",
            chatMessage: {
              $id: `temp-${Date.now()}`,
              sessionId,
              message,
              response: cleanResponse,
              metadata: finalMetadataString,
              $createdAt: (/* @__PURE__ */ new Date()).toISOString(),
              $updatedAt: (/* @__PURE__ */ new Date()).toISOString()
            },
            audioContent,
            ttsError,
            quickStarters
          }) + "\n");
          res.end();
        } catch (err) {
          console.error("[chat] Stream error:", err?.message || err);
          res.write(JSON.stringify({ type: "error", error: err?.message || "Unknown error" }) + "\n");
          res.end();
        }
      };
      streamTokens().catch((err) => {
        console.error("[chat] Stream processing error:", err);
        if (!res.headersSent) {
          res.status(500).json({ message: "Failed to process chat message" });
        }
      });
    } catch (error) {
      console.error("Error processing chat message:", error);
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: "Invalid message data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to process chat message" });
    }
  });
  app2.post("/api/prompts", async (req, res) => {
    try {
      const validatedData = insertPromptSchema.parse(req.body);
      const prompt = await storage.createPrompt(validatedData);
      res.status(201).json(prompt);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: "Invalid prompt data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create prompt" });
    }
  });
  app2.get("/api/prompts", async (_req, res) => {
    try {
      const prompts = await storage.getPrompts();
      res.json(prompts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch prompts" });
    }
  });
  app2.put("/api/prompts/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = insertPromptSchema.partial().parse(req.body);
      const prompt = await storage.updatePrompt(id, validatedData);
      res.json(prompt);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        return res.status(400).json({ message: "Invalid prompt data", errors: error.errors });
      }
      if (error instanceof Error && error.message.includes("not found")) {
        return res.status(404).json({ message: "Prompt not found" });
      }
      res.status(500).json({ message: "Failed to update prompt" });
    }
  });
  app2.post("/api/chat/regenerate-audio", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ message: "Text is required" });
      }
      if (text.length > 5e3) {
        return res.status(400).json({ message: "Text too long" });
      }
      const ttsResult = await generateAzureTTS(text);
      if (!ttsResult.audioBase64) {
        return res.status(500).json({
          message: "Failed to generate audio",
          error: ttsResult.error
        });
      }
      res.json({
        audioContent: ttsResult.audioBase64,
        visemes: ttsResult.visemes
      });
    } catch (error) {
      console.error("Error regenerating audio:", error);
      res.status(500).json({
        message: "Failed to regenerate audio",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  app2.delete("/api/prompts/:id", async (req, res) => {
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
  const httpServer = createServer(app2);
  return httpServer;
}

// server/vite.ts
import express from "express";
import fs from "fs";
import path2 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("@replit/vite-plugin-cartographer").then(
        (m) => m.cartographer()
      )
    ] : []
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    sourcemap: false,
    target: "es2019",
    chunkSizeWarningLimit: 1e3,
    // Increased to accommodate three.js chunk
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: process.env.NODE_ENV === "production"
      }
    },
    rollupOptions: {
      treeshake: {
        preset: "recommended"
      }
    }
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path2.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/index.ts
import os from "node:os";
import { existsSync as existsSync2 } from "fs";
var __filename2 = fileURLToPath2(import.meta.url);
var __dirname2 = dirname2(__filename2);
var envPath2 = resolve2(__dirname2, "../.env");
if (existsSync2(envPath2)) {
  const result = config2({ path: envPath2, debug: false });
  if (result.error) {
    console.warn("Warning loading .env file:", result.error.message);
  }
} else if (process.env.NODE_ENV !== "production") {
  console.warn("No .env file found at", envPath2);
}
var app = express2();
app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(compression());
app.use(express2.json({ limit: "10kb" }));
app.use(express2.urlencoded({ extended: false, limit: "10kb" }));
app.use(session({
  secret: process.env.SESSION_SECRET || "a-secret-key-for-sessions-that-is-long-and-secure",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: app.get("env") === "production" }
}));
app.use((req, res, next) => {
  const start = Date.now();
  const path3 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path3.startsWith("/api")) {
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  const server = await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen({
    port,
    host: "0.0.0.0",
    // The reusePort option is not supported on Windows
    reusePort: os.platform() !== "win32"
  }, () => {
    log(`serving on port ${port}`);
  });
})();
