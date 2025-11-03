import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '../../.env');

const result = config({ path: envPath, debug: false });
if (result.error) {
  console.error('Error loading .env:', result.error);
}

import { Client, Databases, Users, Storage, Account } from 'node-appwrite';

const endpoint = process.env.APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
  throw new Error('Appwrite server environment variables are required.');
}

const client = new Client();
client
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);

export const databases = new Databases(client);
export const users = new Users(client);
export const storageService = new Storage(client);
export const account = new Account(client);

export const DATABASE_ID = process.env.APPWRITE_DATABASE_ID!;

if (!DATABASE_ID) {
    throw new Error('Appwrite database ID is required.');
}