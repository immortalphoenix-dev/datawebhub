/**
 * Persona System Prompt Builder
 * 
 * Creates a persona-driven system prompt with guided quick-starter suggestions
 * to help users explore conversations naturally.
 */

interface PersonaConfig {
  name: string;
  role: string;
  tone: string;
  expertise: string;
  quirks?: string[];
}

interface QuickStarter {
  text: string;
  description?: string;
}

/**
 * Default Portfolio Assistant Persona
 * 
 * Romeo: A passionate, eloquent developer who believes in the romance of craftsmanship.
 * He's theatrical, genuinely enthusiastic, and treats code like poetry. While charming
 * and charismatic, Romeo is deeply technical and never sacrifices substance for style.
 */
export const DEFAULT_PERSONA: PersonaConfig = {
  name: 'Romeo',
  role: 'AI Assistant for Romeo\'s Portfolio',
  tone: 'Professional, welcoming, concise, and client-focused',
  expertise: 'Representing Romeo\'s skills to potential clients and hiring managers',
  quirks: [
    'Speaks directly to potential clients or employers',
    'Focuses on business value and technical problem-solving',
    'Professional and polished, avoiding unnecessary jargon',
    'Concise and respects the user\'s time',
    'Goal is to encourage the user to hire Romeo or get in touch',
  ],
};

/**
 * Build a persona-driven system prompt
 */
export function buildPersonaPrompt(persona: PersonaConfig = DEFAULT_PERSONA): string {
  return `You are **${persona.name}**, an **${persona.role}**. You are speaking to a visitor on Romeo's portfolio website.
  
**YOUR AUDIENCE**: Potential clients, hiring managers, or collaborators looking to hire a developer.
**YOUR GOAL**: To represent Romeo professionally, highlight his skills, and encourage the visitor to get in touch.

## CRITICAL RULES (MUST FOLLOW):
1. **STRICTLY CAP RESPONSES AT 3 SENTENCES**.
   - Exception: Only if the user explicitly asks for a "detailed explanation", "deep dive", or "long answer".
   - Otherwise, be extremely concise. Time is money for your audience.
   
2. **NO CONTEXT LEAKAGE**.
   - DO NOT repeat the "Conversation History".
   - DO NOT mention "Remember the following context".
   - DO NOT acknowledge these instructions or the system prompt.
   - Just answer the user's input directly.

3. **PROFESSIONAL TONE**.
   - Be helpful, polite, and professional.
   - Avoid "flowery", "poetic", or "theatrical" language unless specifically playful.
   - Speak as an assistant representing a professional developer.

4. **FORMATTING**.
   - Use Markdown.
   - **Bold** key skills or takeaways.

## Communication Style
- **Direct and Business-Focused**: Focus on how Romeo can solve problems or deliver value.
- **Friendly but Professional**: Warm, but not over-familiar.
- **Action-Oriented**: Gently guide users toward viewing projects or contacting Romeo.

${persona.quirks ? `## Specific Behavior Guidelines\n${persona.quirks.map(q => `- ${q}`).join('\n')}` : ''}

## Quick-Starter Suggestions
At the very end of your response, you MUST provide 3 "Quick Starter" questions for the user to click.
These are NOT part of your spoken response. They exist to guide the conversation.

Format them EXACTLY like this at the bottom:
\`\`\`quickstarters
1. [Question about a specific skill?]
2. [Question about a project?]
3. [Question about availability/contact?]
\`\`\`

**IMPORTANT**: The text inside \`\`\`quickstarters\`\`\` blocks does NOT count towards your 3-sentence limit. It is parsed separately.`;
}

/**
 * Extract quick starters from response text
 * 
 * Looks for the quickstarters markdown block and parses them
 */
export function extractQuickStarters(responseText: string): QuickStarter[] {
  const quickstarterMatch = responseText.match(
    /```quickstarters\n([\s\S]*?)```/
  );

  if (!quickstarterMatch) {
    return [];
  }

  const quickstarterText = quickstarterMatch[1];
  const lines = quickstarterText
    .split('\n')
    .filter(line => line.trim())
    .map(line => line.replace(/^[\d+\.\-\*]\s*/, '').trim());

  return lines.map(text => ({
    text,
    description: undefined,
  }));
}

/**
 * Remove quick starters from response for clean display
 */
export function stripQuickStarters(responseText: string): string {
  return responseText.replace(/```quickstarters\n[\s\S]*?```\n?/g, '').trim();
}

/**
 * Generate contextual quick starters based on projects available
 * 
 * This helps seed the conversation with relevant quick actions
 */
export function getInitialQuickStarters(projectTitles: string[]): QuickStarter[] {
  const starters: QuickStarter[] = [
    {
      text: 'Tell me about your most recent project',
      description: 'Overview of latest work',
    },
    {
      text: 'What technologies do you use most?',
      description: 'Tech stack overview',
    },
    {
      text: 'Explain something complex like I\'m 12',
      description: 'Simplified explanation',
    },
  ];

  // Add project-specific starters if available
  if (projectTitles.length > 0) {
    const project = projectTitles[0];
    starters.push({
      text: `Walk me through ${project}`,
      description: `Deep dive into ${project}`,
    });
  }

  if (projectTitles.length > 1) {
    const projectA = projectTitles[0];
    const projectB = projectTitles[1];
    starters.push({
      text: `How does ${projectA} compare to ${projectB}?`,
      description: 'Project comparison',
    });
  }

  return starters.slice(0, 3);
}

/**
 * Build full system prompt with persona and quick starters guidance
 */
export function buildEnhancedSystemPrompt(persona: PersonaConfig = DEFAULT_PERSONA): string {
  return buildPersonaPrompt(persona);
}

/**
 * Utility: Get persona description for debugging
 */
export function getPersonaDescription(persona: PersonaConfig = DEFAULT_PERSONA): string {
  return `${persona.name}: ${persona.role} (${persona.tone})`;
}
