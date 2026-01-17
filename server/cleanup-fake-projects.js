import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../.env') });

import { Client, Databases, Query } from 'node-appwrite';

async function deleteProjects() {
  try {
    const client = new Client();
    const databases = new Databases(client);

    client
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);

    const databaseId = process.env.APPWRITE_DATABASE_ID;
    const projectsCollectionId = 'projects';

    // Projects to delete
    const projectsToDelete = [
      'E-commerce Platform',
      'Mobile Task Manager',
      'Design System Library'
    ];

    for (const projectTitle of projectsToDelete) {
      try {
        const response = await databases.listDocuments(databaseId, projectsCollectionId, [
          Query.equal('title', projectTitle)
        ]);
        
        if (response.documents.length > 0) {
          for (const doc of response.documents) {
            await databases.deleteDocument(databaseId, projectsCollectionId, doc.$id);
            console.log(`✅ Deleted fake project: ${projectTitle}`);
          }
        } else {
          console.log(`❌ Project not found: ${projectTitle}`);
        }
      } catch (e) {
        console.error(`Error deleting ${projectTitle}:`, e.message);
      }
    }

    console.log('\n✅ Cleanup complete! Only your real projects remain.');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

deleteProjects();
