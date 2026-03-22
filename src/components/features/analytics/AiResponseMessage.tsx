
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Code, ImagePlus } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ChatMessageLike {
  id: string;
  role: 'user' | 'ai';
  content: string;
  type?: 'text' | 'analysis' | 'chart';
  chartData?: string;
}

interface AiResponseMessageProps {
  message: ChatMessageLike;
  onAddToSlides?: (message: ChatMessageLike) => void;
  onRunPython?: (code: string) => void;
}

export const AiResponseMessage: React.FC<AiResponseMessageProps> = ({ message, onAddToSlides, onRunPython }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [editableCode, setEditableCode] = useState<string | null>(null);

  if (message.type === 'chart' && message.chartData) {
    return (
      <div className="relative bg-muted rounded-lg p-4 space-y-3 border">
        {onAddToSlides && (
          <Button
            size="icon"
            variant="secondary"
            onClick={() => onAddToSlides(message)}
            className="absolute top-3 right-3 h-8 w-8 rounded-full shadow"
            aria-label="Add chart to slides"
          >
            <ImagePlus className="h-4 w-4" />
          </Button>
        )}
        <p className="text-sm font-semibold pr-10">
          {message.content?.trim() || "Here's the generated plot:"}
        </p>
        <img
          src={message.chartData}
          alt="AI generated chart"
          className="w-full rounded-md border bg-background"
        />
      </div>
    );
  }

  const codeBlockRegex = /```(?:python|py)?([\s\S]*?)```/i;
  const match = message.content?.match(codeBlockRegex);

  if (!match) {
    return (
      <div className="overflow-x-auto whitespace-pre-wrap break-words">
        <ReactMarkdown>{message.content}</ReactMarkdown>
      </div>
    );
  }

  const pythonCode = match[1].trim();
  const textContent = message.content.replace(codeBlockRegex, '').trim();
  const currentCode = editableCode ?? pythonCode;

  return (
    <div className="space-y-4">
      {textContent && (
        <div className="overflow-x-auto whitespace-pre-wrap break-words">
          <ReactMarkdown>{textContent}</ReactMarkdown>
        </div>
      )}
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Python Code Block</h4>
          <div className="flex items-center gap-2">
            {onRunPython && (
              <Button variant="outline" size="sm" onClick={() => onRunPython(currentCode)}>
                Run Script
              </Button>
            )}
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                <Code className="h-4 w-4" />
                <span className="sr-only">Toggle code visibility</span>
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>
        <CollapsibleContent className="space-y-2">
          <div className="rounded-md border bg-muted p-4 font-mono text-sm">
            {onRunPython ? (
              <textarea
                value={currentCode}
                onChange={(e) => setEditableCode(e.target.value)}
                className="w-full min-h-[200px] text-xs font-mono whitespace-pre-wrap bg-muted border-none outline-none resize-y"
              />
            ) : (
              <pre className="whitespace-pre-wrap">{pythonCode}</pre>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
