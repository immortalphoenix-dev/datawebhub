import type { Project } from "@shared/schema";

/**
 * Build portfolio context from projects to inject into Romeo's system prompt
 */
export function buildPortfolioContext(projects: Project[]): string {
  if (projects.length === 0) {
    return "";
  }

  const projectsText = projects
    .slice(0, 6) // Limit to 6 most recent projects
    .map(p => {
      const techStack = p.technologies.join(", ");
      const demoLink = p.demoUrl ? ` | [Demo](${p.demoUrl})` : "";
      return `- **${p.title}**: ${p.description} | Tech: ${techStack}${demoLink}`;
    })
    .join("\n");

  return `\n## Your Work\n\n${projectsText}\n`;
}

/**
 * Build skills context from project technologies
 */
export function buildSkillsContext(projects: Project[]): string {
  if (projects.length === 0) {
    return "";
  }

  const allTechs = new Set<string>();
  projects.forEach(p => {
    p.technologies.forEach(t => allTechs.add(t));
  });

  const techList = Array.from(allTechs).sort().join(", ");
  
  return `\n## Technology Stack\n${techList}\n`;
}

/**
 * Format contact information
 */
export function buildContactContext(): string {
  const email = process.env.VITE_USER_EMAIL || "thedatawebhub@gmail.com";
  const github = process.env.VITE_GITHUB_URL;
  const linkedin = process.env.VITE_LINKEDIN_URL;
  const twitter = process.env.VITE_TWITTER_URL;
  
  const contacts = [];
  
  if (email) contacts.push(`Email: ${email}`);
  if (github) contacts.push(`GitHub: ${github}`);
  if (linkedin) contacts.push(`LinkedIn: ${linkedin}`);
  if (twitter) contacts.push(`Twitter: ${twitter}`);
  
  if (contacts.length === 0) return "";
  
  return `\n## Contact & Links\n${contacts.map(c => `- ${c}`).join("\n")}\n`;
}

/**
 * Format background information
 */
export function buildBackgroundContext(): string {
  const title = process.env.VITE_USER_TITLE || "Full Stack Website Developer & Data Analyst";
  const bio = process.env.VITE_USER_BIO || "";
  const yearsExp = "4+";
  const status = "Freelancing";
  
  if (!bio) return "";
  
  return `\n## Background\n${bio}\n\nStatus: ${status} | Experience: ${yearsExp} years\n`;
}
