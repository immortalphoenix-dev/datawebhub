import { databases, users, storageService, DATABASE_ID } from './lib/appwrite';
import { ID, Query } from 'node-appwrite';
import type { User, InsertUser, Project, InsertProject, ChatMessage, InsertChatMessage, InsertPrompt, Prompt } from '@shared/schema';
import { IStorage } from './storage';
import { Models } from 'node-appwrite';

const PROJECTS_COLLECTION_ID = 'projects';
const PROMPTS_COLLECTION_ID = 'prompts';
const CHAT_MESSAGES_COLLECTION_ID = 'chat_messages';
const STORAGE_BUCKET_ID = process.env.APPWRITE_BUCKET_ID ?? 'default';

if (!process.env.APPWRITE_BUCKET_ID) {
  console.warn(
    'APPWRITE_BUCKET_ID is not set. Falling back to "default" bucket. Ensure this bucket exists in Appwrite to enable file uploads.'
  );
}

// Helper function to map Appwrite document to Project type
function mapDocumentToProject(doc: Models.Document): Project {
  const data = doc as any;
  return {
    $id: data.$id,
    title: data.title,
    description: data.description,
    category: data.category,
    technologies: data.technologies,
    imageUrl: data.imageUrl,
    demoUrl: data.demoUrl,
    $createdAt: data.$createdAt,
    $updatedAt: data.$updatedAt,
  };
}

// Helper function to map Appwrite document to ChatMessage type
function mapDocumentToChatMessage(doc: Models.Document): ChatMessage {
  const data = doc as any;
  let metadata;
  try {
    metadata = JSON.parse(data.metadata);
  } catch (error) {
    console.error('Error parsing metadata:', error);
    metadata = { animation: "talk", emotion: "neutral" }; // Fallback
  }
  return {
    $id: data.$id,
    sessionId: data.sessionId,
    message: data.message,
    response: data.response,
    metadata,
    $createdAt: data.$createdAt,
    $updatedAt: data.$updatedAt,
  };
}

// Helper function to map Appwrite document to Prompt type
function mapDocumentToPrompt(doc: Models.Document): Prompt {
  const data = doc as any;
  return {
    $id: data.$id,
    promptText: data.promptText,
    promptType: data.promptType,
    isActive: data.isActive,
    $createdAt: data.$createdAt,
    $updatedAt: data.$updatedAt,
  };
}

export class AppwriteStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    try {
      const appwriteUser = await users.get(id);
      return {
        id: appwriteUser.$id,
        username: appwriteUser.email || appwriteUser.name || '',
        password: '', // Password is not returned by Appwrite get user
      };
    } catch (error: any) {
      if (error.code === 404) {
        return undefined;
      }
      throw error;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      const response = await users.list([
        Query.equal('email', username)
      ]);
      if (response.users.length > 0) {
        const appwriteUser = response.users[0];
        return {
          id: appwriteUser.$id,
          username: appwriteUser.email || appwriteUser.name || '',
          password: '', // Password is not returned
        };
      }
      return undefined;
    } catch (error: any) {
      throw error;
    }
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    try {
      const appwriteUser = await users.create(
        ID.unique(),
        insertUser.username,
        insertUser.password,
        insertUser.username
      );
      return {
        id: appwriteUser.$id,
        username: appwriteUser.email || appwriteUser.name || '',
        password: '', // Password is not stored/returned
      };
    } catch (error: any) {
      throw error;
    }
  }

  // Project methods
  async getProjects(): Promise<Project[]> {
    const response = await databases.listDocuments(DATABASE_ID, PROJECTS_COLLECTION_ID, [
      Query.orderDesc('$createdAt')
    ]);
    return response.documents.map(mapDocumentToProject);
  }

  async getProjectsByCategory(category: string): Promise<Project[]> {
    const response = await databases.listDocuments(DATABASE_ID, PROJECTS_COLLECTION_ID, [
      Query.equal('category', category),
      Query.orderDesc('$createdAt')
    ]);
    return response.documents.map(mapDocumentToProject);
  }

  async getFeaturedProjects(): Promise<Project[]> {
    return [];
  }

  async getProject(id: string): Promise<Project | undefined> {
    try {
      const response = await databases.getDocument(DATABASE_ID, PROJECTS_COLLECTION_ID, id);
      return mapDocumentToProject(response);
    } catch (error: any) {
      if (error.code === 404) {
        return undefined;
      }
      throw error;
    }
  }

  async createProject(project: InsertProject): Promise<Project> {
    const response = await databases.createDocument(
      DATABASE_ID,
      PROJECTS_COLLECTION_ID,
      ID.unique(),
      project
    );
    return mapDocumentToProject(response);
  }

  async updateProject(id: string, project: Partial<InsertProject>): Promise<Project> {
    const response = await databases.updateDocument(
      DATABASE_ID,
      PROJECTS_COLLECTION_ID,
      id,
      project
    );
    return mapDocumentToProject(response);
  }

  async deleteProject(id: string): Promise<boolean> {
    await databases.deleteDocument(DATABASE_ID, PROJECTS_COLLECTION_ID, id);
    return true;
  }

  // Chat methods
  async getChatMessages(sessionId: string): Promise<ChatMessage[]> {
    const response = await databases.listDocuments(DATABASE_ID, CHAT_MESSAGES_COLLECTION_ID, [
        Query.equal('sessionId', sessionId),
        Query.orderAsc('$createdAt')
    ]);
    return response.documents.map(mapDocumentToChatMessage);
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    console.log('createChatMessage input:', JSON.stringify(message, null, 2));
    console.log('DATABASE_ID:', DATABASE_ID);
    console.log('CHAT_MESSAGES_COLLECTION_ID:', CHAT_MESSAGES_COLLECTION_ID);
    const response = await databases.createDocument(
      DATABASE_ID,
      CHAT_MESSAGES_COLLECTION_ID,
      ID.unique(),
      message
    );
    return mapDocumentToChatMessage(response);
  }

  // Prompt methods
  async createPrompt(prompt: InsertPrompt): Promise<Prompt> {
    const response = await databases.createDocument(
      DATABASE_ID,
      PROMPTS_COLLECTION_ID,
      ID.unique(),
      prompt
    );
    return mapDocumentToPrompt(response);
  }

  async getPrompts(): Promise<Prompt[]> {
    const response = await databases.listDocuments(DATABASE_ID, PROMPTS_COLLECTION_ID, [
        Query.orderAsc('$createdAt')
    ]);
    return response.documents.map(mapDocumentToPrompt);
  }

  async updatePrompt(id: string, prompt: Partial<InsertPrompt>): Promise<Prompt> {
    const response = await databases.updateDocument(
      DATABASE_ID,
      PROMPTS_COLLECTION_ID,
      id,
      prompt
    );
    return mapDocumentToPrompt(response);
  }

  async deletePrompt(id: string): Promise<boolean> {
    await databases.deleteDocument(DATABASE_ID, PROMPTS_COLLECTION_ID, id);
    return true;
  }

  // File methods
  async uploadFile(file: any): Promise<string> {
    // Convert multer file to a format Appwrite can accept
    const fileData = file.buffer || file;
    const fileName = file.originalname || 'uploaded-file';

    const response = await storageService.createFile(
      STORAGE_BUCKET_ID,
      ID.unique(),
      new File([fileData], fileName, { type: file.mimetype || 'application/octet-stream' })
    );
    return response.$id;
  }

  async getFileUrl(fileId: string): Promise<string> {
    // Use the view endpoint instead of download for better public access
    const endpoint = process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
    return `${endpoint}/storage/buckets/${STORAGE_BUCKET_ID}/files/${fileId}/view?project=${process.env.APPWRITE_PROJECT_ID}`;
  }
}