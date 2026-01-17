import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../.env') });

import { Client, Databases, Query } from 'node-appwrite';

async function deleteOldPrompts() {
  try {
    const client = new Client();
    const databases = new Databases(client);

    client
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);

    const databaseId = process.env.APPWRITE_DATABASE_ID;
    const promptsCollectionId = 'prompts';

    // Get all prompts
    const response = await databases.listDocuments(databaseId, promptsCollectionId);
    
    console.log(`Found ${response.documents.length} prompts. Deleting all...`);

    for (const doc of response.documents) {
      await databases.deleteDocument(databaseId, promptsCollectionId, doc.$id);
      console.log(`✅ Deleted prompt: ${doc.promptType}`);
    }

    console.log('\n✅ All old prompts deleted! Ready for fresh seeding.');
  } catch (error) {
    console.error('Error during cleanup:', error.message);
  }
}

deleteOldPrompts();
