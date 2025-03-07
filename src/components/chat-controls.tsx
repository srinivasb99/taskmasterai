import React, { useState } from 'react';
import { Paperclip, Palette, Plus } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

// Chat style categories and their styles
const chatStyles = {
  'Formal & Professional': {
    Corporate: 'Businesslike, structured, and efficient.',
    Executive: 'High-level planning and decision-making focus.',
    Formal: 'Polite, professional, and to the point.',
    Analytical: 'Data-driven and strategic.',
    Minimalist: 'Clean, simple, and distraction-free.',
  },
  'Educational & Motivational': {
    Academic: 'Scholarly, structured, and research-oriented.',
    Mentor: 'Guidance-focused with lessons and explanations.',
    Coach: 'Encouraging but firm, like a personal trainer for productivity.',
    Motivational: 'High-energy, inspiring, and goal-oriented.',
    Mindful: 'Balance-focused, promoting well-being and deep work.',
  },
  'Casual & Friendly': {
    Friendly: 'Conversational, warm, and supportive.',
    Chill: 'Relaxed, low-pressure, and flexible.',
    Humorous: 'Playful, witty, and fun.',
    Encouraging: 'Positive reinforcement and soft motivation.',
    Companion: 'Like a helpful buddy for productivity.',
  },
};

interface ChatControlsProps {
  onFileSelect: (file: File) => void;
  onStyleSelect: (style: string) => void;
  onCustomStyleCreate: (style: { name: string; description: string }) => void;
  isBlackoutEnabled: boolean;
  isIlluminateEnabled: boolean;
}

export function ChatControls({
  onFileSelect,
  onStyleSelect,
  onCustomStyleCreate,
  isBlackoutEnabled,
  isIlluminateEnabled,
}: ChatControlsProps) {
  const [isNewStyleDialogOpen, setIsNewStyleDialogOpen] = useState(false);
  const [newStyleName, setNewStyleName] = useState('');
  const [newStyleDescription, setNewStyleDescription] = useState('');

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  const handleCreateStyle = () => {
    if (newStyleName && newStyleDescription) {
      onCustomStyleCreate({
        name: newStyleName,
        description: newStyleDescription,
      });
      setNewStyleName('');
      setNewStyleDescription('');
      setIsNewStyleDialogOpen(false);
    }
  };

  // Dynamic classes based on theme
  const buttonClass = isBlackoutEnabled
    ? 'bg-gray-800 hover:bg-gray-700 text-white'
    : isIlluminateEnabled
    ? 'bg-gray-200 hover:bg-gray-300 text-gray-900'
    : 'bg-gray-700 hover:bg-gray-600 text-gray-200';

  const popoverClass = isBlackoutEnabled
    ? 'bg-gray-800 border-gray-700'
    : isIlluminateEnabled
    ? 'bg-white border-gray-300'
    : 'bg-gray-700 border-gray-600';

  const textClass = isBlackoutEnabled || !isIlluminateEnabled
    ? 'text-white'
    : 'text-gray-900';

  return (
    <div className="flex gap-2">
      {/* File Attachment Button */}
      <Button
        variant="outline"
        size="icon"
        className={buttonClass}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <Paperclip className="h-4 w-4" />
        <input
          type="file"
          id="file-input"
          className="hidden"
          onChange={handleFileChange}
          accept="image/*,.pdf,.doc,.docx,.txt"
        />
      </Button>

      {/* Style Selection Button */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" className={buttonClass}>
            <Palette className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className={`w-80 p-0 ${popoverClass}`}>
          <div className="grid gap-4">
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className={`font-medium leading-none ${textClass}`}>Chat Styles</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setIsNewStyleDialogOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-2">
                {Object.entries(chatStyles).map(([category, styles]) => (
                  <div key={category}>
                    <h5 className={`text-sm font-medium mb-1 ${textClass}`}>{category}</h5>
                    <div className="grid gap-1">
                      {Object.entries(styles).map(([style, description]) => (
                        <button
                          key={style}
                          className={`text-left px-2 py-1 rounded hover:bg-blue-500 hover:text-white transition-colors ${textClass}`}
                          onClick={() => onStyleSelect(style)}
                        >
                          <div className="font-medium">{style}</div>
                          <div className="text-xs opacity-70">{description}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* New Style Dialog */}
      <Dialog open={isNewStyleDialogOpen} onOpenChange={setIsNewStyleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Custom Style</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="name" className="text-sm font-medium">
                Style Name
              </label>
              <input
                id="name"
                value={newStyleName}
                onChange={(e) => setNewStyleName(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="description" className="text-sm font-medium">
                Description
              </label>
              <textarea
                id="description"
                value={newStyleDescription}
                onChange={(e) => setNewStyleDescription(e.target.value)}
                className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => setIsNewStyleDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateStyle}>Create Style</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
