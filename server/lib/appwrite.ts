import { existsSync } from 'fs';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '../../.env');

// Only load .env if it exists (won't exist in cloud deployments)
if (existsSync(envPath)) {
  const result = config({ path: envPath, debug: false });
  if (result.error) {
    console.warn('Warning loading .env:', result.error.message);
  }
}

import { Client, Databases, Users, Storage, Account } from 'node-appwrite';

const endpoint = process.env.APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

// Don't crash if Appwrite isn't configured - let storage.ts fallback to MemStorage
let databases: Databases | null = null;
let users: Users | null = null;
let storageService: Storage | null = null;
let account: Account | null = null;
let DATABASE_ID: string = '';

if (endpoint && projectId && apiKey) {
  const client = new Client();
  client.setEndpoint(endpoint).setProject(projectId).setKey(apiKey);

  databases = new Databases(client);
  users = new Users(client);
  storageService = new Storage(client);
  account = new Account(client);
  DATABASE_ID = process.env.APPWRITE_DATABASE_ID || '';

  if (!DATABASE_ID) {
    console.warn('APPWRITE_DATABASE_ID not set - some features may not work');
  }
} else {
  console.warn('Appwrite server not configured. Set APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, and APPWRITE_API_KEY.');
}

export { databases, users, storageService, account, DATABASE_ID };
