import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

interface QuickStartersProps {
  starters: Array<{ text: string; description?: string }>;
  onSelect: (text: string) => void;
  isLoading?: boolean;
}

/**
 * QuickStarters Component
 * 
 * Displays contextual quick-action buttons for the user to continue the conversation
 * based on AI suggestions from the system prompt persona.
 * 
 * Examples:
 * - "Explain project X like I'm 12"
 * - "Compare skills A vs B"
 * - "Show me code snippets"
 */
export default function QuickStarters({
  starters,
  onSelect,
  isLoading = false,
}: QuickStartersProps) {
  if (!starters || starters.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Quick Actions
      </p>
      <div className="flex flex-col gap-2">
        {starters.map((starter, idx) => (
          <Button
            key={idx}
            onClick={() => onSelect(starter.text)}
            disabled={isLoading}
            variant="outline"
            size="sm"
            className="justify-start text-left h-auto py-2 px-3 hover:bg-primary/10 hover:border-primary/50 transition-colors"
          >
            <span className="flex-1 text-xs leading-snug">
              {starter.text}
            </span>
            <ChevronRight className="w-3 h-3 ml-2 flex-shrink-0 text-muted-foreground" />
          </Button>
        ))}
      </div>
    </div>
  );
}
