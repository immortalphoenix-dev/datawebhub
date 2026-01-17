import type { ChatMessage } from "@shared/schema";

/**
 * Conversation Memory Management
 * 
 * Maintains a short-term transcript of the last N exchanges to provide
 * conversational context to the LLM without overwhelming the prompt.
 * 
 * Strategy:
 * - Keep last 6 exchanges (12 messages: 6 user + 6 AI) for context
 * - When exceeding limit, summarize older messages to preserve context
 * - Estimate token usage to avoid prompt bloat (roughly 1 token per 4 chars)
 * - Include full recent messages for continuity
 */

interface ConversationContext {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  tokenEstimate: number;
}

/**
 * Rough token estimation (Groq models typically use ~1 token per 4 characters)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Build conversation context from message history
 * 
 * Returns the last N exchanges in format suitable for LLM with memory.
 * Automatically summarizes older conversations if they get too long.
 * 
 * @param messages - Full chat message history (oldest first)
 * @param maxRecentExchanges - Number of recent exchanges to keep (default: 6)
 * @param maxTokens - Maximum tokens for memory context (default: 2000, leaving ~5000+ for user query & response)
 * @returns Formatted messages ready for LLM system prompt
 */
export function buildConversationContext(
  messages: ChatMessage[],
  maxRecentExchanges: number = 6,
  maxTokens: number = 2000
): ConversationContext {
  if (messages.length === 0) {
    return { messages: [], tokenEstimate: 0 };
  }

  const exchangeCount = Math.ceil(messages.length / 2); // Each exchange = user msg + AI response
  
  // Extract recent exchanges
  const recentExchangeStart = Math.max(0, (exchangeCount - maxRecentExchanges) * 2);
  const recentMessages = messages.slice(recentExchangeStart);

  // Build context messages
  const contextMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let totalTokens = 0;

  // Add a summary of conversation if there are older messages
  if (messages.length > recentMessages.length) {
    const olderMessages = messages.slice(0, recentExchangeStart);
    const summary = generateConversationSummary(olderMessages);
    
    if (summary) {
      const summaryContent = `[Earlier conversation context: ${summary}]`;
      contextMessages.push({
        role: 'assistant',
        content: summaryContent,
      });
      totalTokens += estimateTokens(summaryContent);
    }
  }

  // Add recent messages
  for (const msg of recentMessages) {
    // User message
    contextMessages.push({
      role: 'user',
      content: msg.message,
    });
    totalTokens += estimateTokens(msg.message);

    // AI response
    contextMessages.push({
      role: 'assistant',
      content: msg.response,
    });
    totalTokens += estimateTokens(msg.response);

    // Stop if we're approaching token limit
    if (totalTokens > maxTokens) {
      // Remove the last pair if we exceeded limit
      if (contextMessages.length >= 2) {
        contextMessages.pop(); // Remove assistant
        contextMessages.pop(); // Remove user
        totalTokens -= estimateTokens(msg.message) + estimateTokens(msg.response);
      }
      break;
    }
  }

  return {
    messages: contextMessages,
    tokenEstimate: totalTokens,
  };
}

/**
 * Generate a concise summary of older conversation
 * Extracts key topics and maintains context without bloating the prompt
 */
function generateConversationSummary(messages: ChatMessage[]): string {
  if (messages.length === 0) return '';

  // Extract key terms and topics from the conversation
  const topics: string[] = [];
  const keywords = new Set<string>();

  for (const msg of messages) {
    // Extract capitalized terms (likely proper nouns / project names)
    const capitalizedTerms = msg.message.match(/\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*/g) || [];
    capitalizedTerms.forEach(term => keywords.add(term));

    // Extract key phrases from responses (technologies, skills, etc.)
    const techMatch = msg.response.match(/(?:using|built with|tech|language|framework|library)[:\s]+([^.]+)/gi);
    if (techMatch) {
      techMatch.forEach(phrase => {
        const cleaned = phrase.replace(/(?:using|built with|tech|language|framework|library)[:\s]*/gi, '').trim();
        if (cleaned.length < 100) keywords.add(cleaned);
      });
    }
  }

  // Get unique keywords and limit to 5 key topics
  const uniqueTopics = Array.from(keywords).slice(0, 5);

  if (uniqueTopics.length === 0) {
    return `${messages.length} previous messages about the user's projects and experience`;
  }

  return `${messages.length} previous messages covering: ${uniqueTopics.join(', ')}`;
}

/**
 * Format conversation context for system prompt
 * 
 * This adds a context section to the system prompt that includes
 * recent conversation history without overwhelming the model.
 * 
 * @param defaultSystemPrompt - Base system prompt
 * @param context - Conversation context from buildConversationContext()
 * @returns System prompt with conversation context injected
 */
export function injectConversationContext(
  defaultSystemPrompt: string,
  context: ConversationContext
): string {
  if (context.messages.length === 0) {
    return defaultSystemPrompt;
  }

  // Format context messages as a readable recap
  const contextRecap = context.messages
    .map((msg, idx) => {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      // Truncate very long messages in context
      const content = msg.content.length > 200 
        ? msg.content.substring(0, 200) + '...'
        : msg.content;
      return `${role}: ${content}`;
    })
    .join('\n\n');

  return `${defaultSystemPrompt}

---

## Conversation History
Remember the following context from earlier in the conversation:

${contextRecap}

---`;
}

/**
 * Utility: Get the number of exchanges in the conversation
 */
export function getExchangeCount(messages: ChatMessage[]): number {
  return Math.ceil(messages.length / 2);
}

/**
 * Utility: Get memory-related stats for debugging
 */
export function getMemoryStats(messages: ChatMessage[], context: ConversationContext) {
  return {
    totalMessages: messages.length,
    exchangeCount: getExchangeCount(messages),
    contextMessages: context.messages.length,
    contextTokenEstimate: context.tokenEstimate,
    memoryCoverage: `${((context.messages.length / messages.length) * 100).toFixed(1)}%`,
  };
}
