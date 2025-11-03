import { z } from "zod";

// Appwrite User types
export interface User {
  id: string;
  username: string;
  password?: string; // Password might not always be present
}

export interface InsertUser {
  username: string;
  password?: string;
}

// Appwrite Project types
export interface Project {
  $id: string; // Appwrite document ID
  title: string;
  description: string;
  category: string;
  technologies: string[];
  imageUrl?: string;
  demoUrl?: string;
  $createdAt: string; // Appwrite system attribute
  $updatedAt: string; // Appwrite system attribute
}

export interface InsertProject {
  title: string;
  description: string;
  category: string;
  technologies: string[];
  imageUrl?: string;
  demoUrl?: string;
  createdAt?: string;
}

// Appwrite ChatMessage types
export interface ChatMessage {
  $id: string; // Appwrite document ID
  sessionId: string;
  message: string;
  response: string;
  metadata?: any; // for storing animation data, emotion, etc.
  $createdAt: string; // Appwrite system attribute
  $updatedAt: string; // Appwrite system attribute
}

export interface InsertChatMessage {
  sessionId: string;
  message: string;
  response: string;
  metadata?: any;
}

// Appwrite Prompt types
export interface Prompt {
  $id: string; // Appwrite document ID
  promptText: string;
  promptType: string;
  isActive: boolean;
  $createdAt: string; // Appwrite system attribute
  $updatedAt: string; // Appwrite system attribute
}

export interface InsertPrompt {
  promptText: string;
  promptType: string;
  isActive: boolean;
}

export const insertPromptSchema = z.object({
  promptText: z.string().min(1, "Prompt text is required."),
  promptType: z.string().min(1, "Prompt type is required."),
  isActive: z.boolean().default(true),
});

// Zod schemas for validation (used in backend routes)
export const insertUserSchema = z.object({
  username: z.string().min(1, "Username is required."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

export const insertProjectSchema = z.object({
  title: z.string().min(1, "Title is required."),
  description: z.string().min(1, "Description is required."),
  category: z.string().min(1, "Category is required."),
  technologies: z.array(z.string()).min(1, "At least one technology is required."),
  imageUrl: z.string().optional(), // Made optional since user uploads files
  demoUrl: z.string().url("Must be a valid URL.").optional().or(z.literal('')), // Allow empty string for optional URL
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
});

export const insertChatMessageSchema = z.object({
  sessionId: z.string(),
  message: z.string(),
  response: z.string().optional(),
  metadata: z.string().max(500).optional(),
});