import { Client, Databases, Account } from 'appwrite';

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT;
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID;

if (!endpoint || !projectId) {
  throw new Error('Appwrite endpoint and project ID are required.');
}

const client = new Client();
client
    .setEndpoint(endpoint)
    .setProject(projectId);

export const databases = new Databases(client);
export const account = new Account(client);
