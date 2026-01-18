import { Client, Databases, Account } from 'appwrite';

const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT;
const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID;

// Don't crash the app if Appwrite is not configured - just log a warning
// This allows the app to at least render, even if Appwrite features won't work
let client: Client | null = null;
let databases: Databases | null = null;
let account: Account | null = null;

if (endpoint && projectId) {
  client = new Client();
  client.setEndpoint(endpoint).setProject(projectId);
  databases = new Databases(client);
  account = new Account(client);
} else {
  console.warn(
    'Appwrite not configured. Set VITE_APPWRITE_ENDPOINT and VITE_APPWRITE_PROJECT_ID environment variables.'
  );
}

export { databases, account };
