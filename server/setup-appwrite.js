import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../.env') });

import { Client, Databases, ID, Permission, Role, Query } from 'node-appwrite';

async function setupAppwrite() {
  try {
    const client = new Client();
    const databases = new Databases(client);

    client
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);

    const databaseId = process.env.APPWRITE_DATABASE_ID;

    if (!databaseId) {
      throw new Error('APPWRITE_DATABASE_ID is not set in your .env file.');
    }

    console.log(`Using Database ID: ${databaseId}`);

    // --- Create Projects Collection ---
    const projectsCollectionId = 'projects';
    try {
      console.log('Creating Projects collection...');
      await databases.createCollection(databaseId, projectsCollectionId, 'Projects', [
          Permission.read(Role.any()),
          Permission.create(Role.users()),
          Permission.update(Role.users()),
          Permission.delete(Role.users()),
      ]);
      console.log('Projects collection created.');

      console.log('Creating attributes for Projects collection...');
      await databases.createStringAttribute(databaseId, projectsCollectionId, 'title', 255, true);
      await databases.createStringAttribute(databaseId, projectsCollectionId, 'description', 10000, true); // Merged description
      await databases.createStringAttribute(databaseId, projectsCollectionId, 'category', 255, true);
      await databases.createStringAttribute(databaseId, projectsCollectionId, 'technologies', 255, true, undefined, true); // Array of strings
      await databases.createUrlAttribute(databaseId, projectsCollectionId, 'imageUrl', true); // Assuming imageUrl is required
      await databases.createUrlAttribute(databaseId, projectsCollectionId, 'demoUrl', false);
      await databases.createDatetimeAttribute(databaseId, projectsCollectionId, 'createdAt', true); // createdAt attribute
      console.log('Attributes for Projects collection created.');
    } catch (e) {
      if (e.code === 409) {
        console.log('Projects collection already exists.');
      } else {
        throw e;
      }
    }

    // --- Create Prompts Collection ---
    const promptsCollectionId = 'prompts';
    try {
      console.log('Creating Prompts collection...');
      await databases.createCollection(databaseId, promptsCollectionId, 'Prompts', [
          Permission.read(Role.users()),
          Permission.create(Role.users()),
          Permission.update(Role.users()),
          Permission.delete(Role.users()),
      ]);
      console.log('Prompts collection created.');

      console.log('Creating attributes for Prompts collection...');
      await databases.createStringAttribute(databaseId, promptsCollectionId, 'promptText', 10000, true);
      await databases.createStringAttribute(databaseId, promptsCollectionId, 'promptType', 255, true);
      await databases.createBooleanAttribute(databaseId, promptsCollectionId, 'isActive', true); // Removed default value
      console.log('Attributes for Prompts collection created.');
    } catch (e) {
      if (e.code === 409) {
        console.log('Prompts collection already exists.');
      } else {
        throw e;
      }
    }

    // --- Create Chat Messages Collection ---
    const chatMessagesCollectionId = 'chat_messages';
    try {
      console.log('Creating Chat Messages collection...');
      await databases.createCollection(databaseId, chatMessagesCollectionId, 'Chat Messages', [
        Permission.read(Role.any()),
        Permission.create(Role.any()), // Allow anyone to create a chat message
      ]);
      console.log('Chat Messages collection created.');

      console.log('Creating attributes for Chat Messages collection...');
      await databases.createStringAttribute(databaseId, chatMessagesCollectionId, 'message', 10000, true);
      await databases.createStringAttribute(databaseId, chatMessagesCollectionId, 'response', 10000, true);
      await databases.createStringAttribute(databaseId, chatMessagesCollectionId, 'metadata', 10000, false); // Assuming metadata is a JSON string
      console.log('Attributes for Chat Messages collection created.');
    } catch (e) {
      if (e.code === 409) {
        console.log('Chat Messages collection already exists.');
      } else {
        throw e;
      }
    }

    // --- Seed Data ---
    console.log('Seeding data...');

    // NOTE: Real projects are already in Appwrite. Only seed prompts, not projects.
    const exampleProjects = []; // Empty - don't seed fake projects

    for (const projectData of exampleProjects) {
      try {
        const existingProjects = await databases.listDocuments(databaseId, projectsCollectionId, [
          Query.equal('title', projectData.title)
        ]);
        if (existingProjects.documents.length === 0) {
          await databases.createDocument(databaseId, projectsCollectionId, ID.unique(), projectData);
          console.log(`Seeded project: ${projectData.title}`);
        } else {
          console.log(`Project already exists: ${projectData.title}`);
        }
      } catch (e) {
        console.error(`Error seeding project ${projectData.title}:`, e);
      }
    }

    const examplePrompts = [
      {
        promptText: `You are Romeo, a freelance full-stack website developer and data analyst with 4+ years of experience. Your role is to help potential clients understand your services, pricing, and how to work with you. Be professional, passionate, and always point them toward email (thedatawebhub@gmail.com) when they're ready to discuss a project.`,
        promptType: 'system_persona',
        isActive: true,
      },
      {
        promptText: `## Services & Pricing

### Full-Stack Web Development
**Base Price:** ₦500,000 - ₦2,000,000+ (or equivalent in USD)
**Complexity tiers:**
- Simple (landing pages, portfolios, blogs): ₦500k - ₦800k
- Moderate (e-commerce, dashboards, CMS): ₦800k - ₦1.5M
- Complex (real-time features, integrations, custom solutions): ₦1.5M - ₦2M+

**Includes:** Responsive design, modern tech stack (React, Next.js, TypeScript), performance optimization, deployment setup.

### Data Analysis & Visualization
**Base Price:** ₦50,000 - ₦500,000+ (or equivalent in USD)
**Complexity tiers:**
- Basic analysis (data cleaning, simple reports): ₦50k - ₦150k
- Moderate (dashboards, statistical analysis): ₦150k - ₦300k
- Advanced (ML models, predictive analytics, custom solutions): ₦300k - ₦500k+

### App Integration Add-on
If your website needs a mobile app (iOS/Android):
- **Add 50% - 100%** to the base web development price
- E.g., ₦1M web + ₦500k-1M for app = ₦1.5M - ₦2M total

### Payment Terms
- **Model:** Per-project payment
- **Currency:** Nigerian Naira (₦) or USD (negotiable)
- **Method:** Direct bank transfer
- **Deposit:** 30-50% upfront to start, remainder on completion
- **Timeline:** ASAP after we reach agreement via email

### Availability & Capacity
- **Concurrent Projects:** Maximum 2-3 active projects
- **Start Time:** Immediately after deal agreement
- **Turnaround:** 4-8 weeks depending on complexity
- **Solo/Team:** Currently solo (can scale with your project needs)`,
        promptType: 'pricing_services',
        isActive: true,
      },
      {
        promptText: `## Skills & Technology Stack

**Frontend:** React, Next.js, TypeScript, TailwindCSS, Vite, Three.js (3D)
**Backend:** Node.js, Express, Groq API, Azure AI Services, serverless functions
**Databases:** PostgreSQL, MongoDB, Firebase, Appwrite
**DevOps:** Docker, AWS, GitHub Actions, CI/CD pipelines
**Data Tools:** Python, SQL, statistical analysis, data visualization (Matplotlib, D3.js)
**APIs:** REST, real-time streaming, payment integration (Stripe), AI integration

**Specializations:** 
- Building responsive, performant web applications
- Real-time data processing and visualization
- AI/ML integration (LLMs, voice, chat systems)
- Full-stack architecture design
- Data-driven solutions`,
        promptType: 'skills',
        isActive: true,
      },
      {
        promptText: `## Contact & Next Steps

**Email:** thedatawebhub@gmail.com (primary contact - use this to discuss projects)
**GitHub:** https://github.com/romeo-codeit
**LinkedIn:** https://www.linkedin.com/in/divine-timothy-356475317/
**Twitter:** https://x.com/thedatawebhub

**When you're ready to work together:**
1. Email me at thedatawebhub@gmail.com with:
   - Project description
   - What you need built
   - Your timeline
   - Budget range (if you have one)
2. We'll have a quick chat to align on scope and pricing
3. Agreement signed, deposit paid, we start immediately

I'm currently freelancing and always excited to discuss new projects!`,
        promptType: 'contact_info',
        isActive: true,
      },
      {
        promptText: `## About Romeo

Romeo is a self-taught full-stack website developer and data analyst with 4+ years of professional experience in full-stack development and quantitative research. He specializes in building responsive, high-performance web applications using modern tech stacks like React, TypeScript, and Next.js, while applying advanced statistical analysis and data visualization techniques to solve real-world problems.

**Current Status:** Freelancing | Open for new projects
**Approach:** Code is poetry—every project is treated as a craft, with attention to architecture, performance, and user experience.
**Philosophy:** Build solutions that are elegant, scalable, and data-driven.

Romeo has worked on diverse projects ranging from e-commerce platforms to data analysis dashboards, always bringing both technical rigor and creative problem-solving to each engagement.`,
        promptType: 'experience_background',
        isActive: true,
      },
    ];

    for (const promptData of examplePrompts) {
      try {
        const existingPrompts = await databases.listDocuments(databaseId, promptsCollectionId, [
          Query.equal('promptType', promptData.promptType)
        ]);
        if (existingPrompts.documents.length === 0) {
          await databases.createDocument(databaseId, promptsCollectionId, ID.unique(), promptData);
          console.log(`Seeded prompt: ${promptData.promptType}`);
        } else {
          console.log(`Prompt already exists: ${promptData.promptType}`);
        }
      } catch (e) {
        console.error(`Error seeding prompt ${promptData.promptType}:`, e);
      }
    }

    console.log('Appwrite setup completed successfully!');

  } catch (error) {
    console.error('Error setting up Appwrite:', error);
  }
}

setupAppwrite();
