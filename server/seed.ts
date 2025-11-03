import { storage } from "./storage";

async function seed() {
  console.log("Seeding database...");

  // Skip user creation for portfolio - not needed
  console.log("Skipping user creation for portfolio application.");

  // Seed projects
  console.log("Seeding projects...");
  const existingProjects = await storage.getProjects();
  
  // Clear existing projects for fresh seeding
  if (existingProjects.length > 0) {
    console.log("Clearing existing projects...");
    for (const project of existingProjects) {
      await storage.deleteProject(project.$id);
    }
  }

  const projects = [
    {
      title: "Church Management Platform",
      description: "A comprehensive church management system designed to streamline administrative operations and community engagement for religious organizations. This full-featured platform provides robust tools for membership management, minister coordination, multi-branch organization, and circuit oversight. Key features include sophisticated role-based access control ensuring data security and appropriate permissions, intelligent event scheduling with conflict resolution, automated attendance tracking with detailed analytics, and comprehensive financial contribution management with reporting capabilities. The system supports hierarchical organizational structures typical of religious institutions, enabling seamless coordination between local churches, regional circuits, and central administration. Built with scalability in mind, it handles growing congregations efficiently while maintaining data integrity and providing real-time insights for church leaders to make informed decisions and focus on their spiritual mission.",
      category: "web",
      technologies: ["HTML", "Tailwind", "React", "TypeScript", "ExpressJS", "NoSQL"],
      imageUrl: "https://via.placeholder.com/400x300/4f46e5/ffffff?text=Church+Management+Platform",
      demoUrl: "https://methodist-gateway-ms.vercel.app",
      createdAt: new Date().toISOString()
    }
  ];

  for (const project of projects) {
    await storage.createProject(project);
    console.log(`Created project: ${project.title}`);
  }

  // Seed prompts
  console.log("Seeding prompts...");
  const existingPrompts = await storage.getPrompts();

  // Clear existing prompts for fresh seeding
  if (existingPrompts.length > 0) {
    console.log("Clearing existing prompts...");
    for (const prompt of existingPrompts) {
      await storage.deletePrompt(prompt.$id);
    }
  }

  const prompts = [
    {
      promptText: "You are Romeo's AI assistant for his portfolio website. Romeo is a self-taught website designer and data analyst with 3+ years of experience in full-stack development and quantitative research. He specializes in building responsive web applications using React, TypeScript, and Next.js, while applying advanced statistical analysis and data visualization techniques. Working independently as a freelance developer, he has delivered custom solutions for clients in e-commerce, analytics, and mobile platforms. Be helpful, professional, and highlight his expertise in web development and data analysis. When discussing his work, emphasize his self-taught background and freelance experience.",
      promptType: "system",
      isActive: true
    },
    {
      promptText: "When asked about Romeo's technical skills, mention his expertise in: JavaScript, TypeScript, React, Next.js, Tailwind CSS, Node.js, Express.js, Python, data analysis, statistical modeling, econometrics, Android development, and responsive web design.",
      promptType: "skills",
      isActive: true
    },
    {
      promptText: "For questions about Romeo's experience, highlight his freelance work delivering custom web applications and data analysis solutions for clients in various industries including e-commerce, analytics, and mobile platforms.",
      promptType: "experience",
      isActive: true
    }
  ];

  for (const prompt of prompts) {
    await storage.createPrompt(prompt);
    console.log(`Created prompt: ${prompt.promptType}`);
  }

  console.log("Seeding complete.");
}

seed().catch((error) => {
  console.error("Failed to seed database:", error);
  process.exit(1);
});
