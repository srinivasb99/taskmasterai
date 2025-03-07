import React, { useState } from 'react';
import { Palette, Plus, Check } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent } from './ui/dialog';
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
  onStyleSelect: (style: string, prompt: string) => void;
  onCustomStyleCreate: (style: { name: string; description: string; prompt: string }) => void;
  isBlackoutEnabled: boolean;
  isIlluminateEnabled: boolean;
  activeStyle: string | null;
}

export function ChatControls({
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
      {/* Style Selection Button */}
      <Popover>
        <PopoverTrigger asChild>
          <Button 
            variant="outline" 
            size="icon" 
            className={`${buttonClass} transition-all duration-200 relative ${
              activeStyle ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <Palette className="h-4 w-4" />
            {activeStyle && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className={`w-80 p-0 ${popoverClass} shadow-lg rounded-lg border`}
          align="start"
          sideOffset={5}
        >
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className={`font-medium ${textClass}`}>Chat Styles</h4>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 hover:bg-gray-700/50 rounded-full"
                onClick={() => setIsNewStyleDialogOpen(true)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-1">
              {Object.entries(chatStyles).map(([style, { description, prompt }]) => (
                <button
                  key={style}
                  className={`w-full text-left px-3 py-2 rounded-md transition-all duration-200 ${
                    activeStyle === style
                      ? 'bg-blue-500/90 text-white'
                      : `hover:bg-gray-700/20 ${textClass}`
                  }`}
                  onClick={() => onStyleSelect(style, prompt)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {style}
                        {activeStyle === style && (
                          <Check className="h-4 w-4 text-white" />
                        )}
                      </div>
                      <div className={`text-sm ${
                        activeStyle === style ? 'text-blue-100' : 'opacity-70'
                      }`}>
                        {description}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* New Style Dialog */}
      <Dialog open={isNewStyleDialogOpen} onOpenChange={setIsNewStyleDialogOpen}>
        <DialogContent className={`sm:max-w-[425px] ${popoverClass} p-6`}>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className={`text-sm font-medium ${textClass}`}>
                Style Name
              </label>
              <input
                value={newStyleName}
                onChange={(e) => setNewStyleName(e.target.value)}
                className={`w-full px-3 py-2 rounded-md border ${
                  isBlackoutEnabled || !isIlluminateEnabled
                    ? 'bg-gray-800 border-gray-700 text-white'
                    : 'bg-white border-gray-200 text-gray-900'
                } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                placeholder="e.g., Technical Expert"
              />
            </div>

            <div className="space-y-2">
              <label className={`text-sm font-medium ${textClass}`}>
                Description
              </label>
              <textarea
                value={newStyleDescription}
                onChange={(e) => setNewStyleDescription(e.target.value)}
                className={`w-full px-3 py-2 rounded-md border ${
                  isBlackoutEnabled || !isIlluminateEnabled
                    ? 'bg-gray-800 border-gray-700 text-white'
                    : 'bg-white border-gray-200 text-gray-900'
                } focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] resize-none`}
                placeholder="Brief description of how this style communicates..."
              />
            </div>

            <div className="space-y-2">
              <label className={`text-sm font-medium ${textClass}`}>
                AI Prompt
              </label>
              <textarea
                value={newStylePrompt}
                onChange={(e) => setNewStylePrompt(e.target.value)}
                className={`w-full px-3 py-2 rounded-md border ${
                  isBlackoutEnabled || !isIlluminateEnabled
                    ? 'bg-gray-800 border-gray-700 text-white'
                    : 'bg-white border-gray-200 text-gray-900'
                } focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[120px] resize-none`}
                placeholder="Define how the AI should behave in this style..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button
              variant="ghost"
              onClick={() => setIsNewStyleDialogOpen(false)}
              className={`${textClass} hover:bg-gray-700/20`}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateStyle}
              className="bg-blue-500 hover:bg-blue-600 text-white"
              disabled={!newStyleName || !newStyleDescription || !newStylePrompt}
            >
              Create Style
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
