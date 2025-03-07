import React, { useState } from 'react';
import { Paperclip, Palette, Plus, Check } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

// Chat style categories and their prompts
const chatStyles = {
  'Formal & Professional': {
    description: 'Clear, structured, and business-focused communication',
    prompt: `You are a professional AI assistant focused on clear, structured communication. Your responses should be:
    - Well-organized and concise
    - Business-appropriate and formal
    - Focused on practical solutions
    - Data-driven when applicable
    Keep emotions minimal and maintain a professional distance while being helpful and courteous.`
  },
  'Educational & Motivational': {
    description: 'Engaging, informative, and encouraging guidance',
    prompt: `You are an educational mentor and motivational coach. Your responses should be:
    - Rich with explanations and examples
    - Encouraging and supportive
    - Focused on growth and learning
    - Breaking complex topics into digestible pieces
    Balance academic rigor with motivational encouragement to keep users engaged and learning.`
  },
  'Casual & Friendly': {
    description: 'Warm, approachable, and conversational support',
    prompt: `You are a friendly and approachable AI companion. Your responses should be:
    - Conversational and natural
    - Warm and empathetic
    - Using casual language appropriately
    - Including light humor when suitable
    Make users feel comfortable while maintaining helpfulness and reliability.`
  }
};

interface ChatControlsProps {
  onFileSelect: (file: File) => void;
  onStyleSelect: (style: string, prompt: string) => void;
  onCustomStyleCreate: (style: { name: string; description: string; prompt: string }) => void;
  isBlackoutEnabled: boolean;
  isIlluminateEnabled: boolean;
  activeStyle: string | null;
}

export function ChatControls({
  onFileSelect,
  onStyleSelect,
  onCustomStyleCreate,
  isBlackoutEnabled,
  isIlluminateEnabled,
  activeStyle,
}: ChatControlsProps) {
  const [isNewStyleDialogOpen, setIsNewStyleDialogOpen] = useState(false);
  const [newStyleName, setNewStyleName] = useState('');
  const [newStyleDescription, setNewStyleDescription] = useState('');
  const [newStylePrompt, setNewStylePrompt] = useState('');

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  const handleCreateStyle = () => {
    if (newStyleName && newStyleDescription && newStylePrompt) {
      onCustomStyleCreate({
        name: newStyleName,
        description: newStyleDescription,
        prompt: newStylePrompt,
      });
      setNewStyleName('');
      setNewStyleDescription('');
      setNewStylePrompt('');
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
    ? 'bg-gray-900 border-gray-700'
    : isIlluminateEnabled
    ? 'bg-white border-gray-200'
    : 'bg-gray-800 border-gray-600';

  const textClass = isBlackoutEnabled || !isIlluminateEnabled
    ? 'text-white'
    : 'text-gray-900';

  return (
    <div className="flex gap-2">
      {/* File Attachment Button */}
      <Button
        variant="outline"
        size="icon"
        className={`${buttonClass} transition-all duration-200`}
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
          <Button 
            variant="outline" 
            size="icon" 
            className={`${buttonClass} transition-all duration-200 ${
              activeStyle ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <Palette className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className={`w-80 p-0 ${popoverClass} shadow-lg rounded-lg border`}>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className={`font-medium leading-none ${textClass}`}>Chat Styles</h4>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 hover:bg-gray-700/50"
                onClick={() => setIsNewStyleDialogOpen(true)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-3">
              {Object.entries(chatStyles).map(([style, { description }]) => (
                <button
                  key={style}
                  className={`w-full text-left p-3 rounded-lg transition-all duration-200 ${
                    activeStyle === style
                      ? 'bg-blue-500 text-white'
                      : `hover:bg-gray-700/50 ${textClass}`
                  }`}
                  onClick={() => onStyleSelect(style, chatStyles[style].prompt)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{style}</div>
                      <div className={`text-sm ${
                        activeStyle === style ? 'text-blue-100' : 'opacity-70'
                      }`}>
                        {description}
                      </div>
                    </div>
                    {activeStyle === style && (
                      <Check className="h-5 w-5 text-white" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* New Style Dialog */}
      <Dialog open={isNewStyleDialogOpen} onOpenChange={setIsNewStyleDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
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
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus:ring-2 focus:ring-blue-500"
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
                className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="prompt" className="text-sm font-medium">
                AI Prompt
              </label>
              <textarea
                id="prompt"
                value={newStylePrompt}
                onChange={(e) => setNewStylePrompt(e.target.value)}
                className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-blue-500"
                placeholder="Define how the AI should behave in this style..."
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => setIsNewStyleDialogOpen(false)}
              className="hover:bg-gray-700/50"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateStyle}
              className="bg-blue-500 hover:bg-blue-600 text-white"
            >
              Create Style
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
