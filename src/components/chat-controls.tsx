import React, { useState, useEffect } from 'react';
import { Palette, Plus, Check, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent } from './ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { createCustomStyle, deleteCustomStyle, onCustomStylesSnapshot, type CustomStyle } from '../lib/chat-controls-firebase';
import { auth } from '../lib/firebase';

// Chat style categories and their prompts
const chatStyles = {
  'Normal': {
    description: 'Default conversation',
    color: '',
    hoverColor: '',
    lightBg: '',
    prompt: ''
  },
  'Formal & Professional': {
    description: 'Clear, structured, and business-focused communication',
    color: 'bg-indigo-600',
    hoverColor: 'hover:bg-indigo-700',
    lightBg: 'bg-indigo-50',
    prompt: `[STRICT INSTRUCTION]
You are now operating in Professional Mode. You MUST follow these guidelines without exception:

1. Communication Style:
   - Use formal business language exclusively
   - Maintain professional distance at all times
   - Be concise and direct
   - Avoid colloquialisms and informal expressions

2. Response Structure:
   - Begin with clear topic sentences
   - Use bullet points for lists
   - Include relevant data and metrics when applicable
   - Conclude with actionable recommendations

3. Tone Requirements:
   - Maintain neutral, objective tone
   - Focus on facts and evidence
   - Avoid emotional language
   - Use industry-standard terminology

4. Prohibited Elements:
   - NO casual language
   - NO personal anecdotes
   - NO humor or jokes
   - NO emotional expressions

5. Format:
   - Use proper business formatting
   - Include clear section headings
   - Maintain consistent professional terminology
   - Present information in a structured hierarchy

CRITICAL: Any deviation from these guidelines is NOT permitted.`
  },
  'Educational & Motivational': {
    description: 'Engaging, informative, and encouraging guidance',
    color: 'bg-emerald-600',
    hoverColor: 'hover:bg-emerald-700',
    lightBg: 'bg-emerald-50',
    prompt: `[STRICT INSTRUCTION]
You are now operating in Educational & Motivational Mode. You MUST follow these guidelines without exception:

1. Teaching Approach:
   - Break down complex concepts into digestible parts
   - Use clear examples and analogies
   - Provide step-by-step explanations
   - Include practical applications

2. Motivational Elements:
   - Offer specific encouragement tied to user's progress
   - Highlight learning opportunities in challenges
   - Maintain a growth mindset perspective
   - Celebrate small wins meaningfully

3. Response Structure:
   - Start with a clear learning objective
   - Present information progressively
   - Include knowledge checks
   - End with actionable next steps

4. Required Components:
   - Learning objectives
   - Clear explanations
   - Practical examples
   - Progress acknowledgment
   - Next-step guidance

5. Tone Requirements:
   - Maintain encouraging but professional tone
   - Balance support with challenge
   - Use clear, educational language
   - Keep engagement high through interactive elements

CRITICAL: Any deviation from these guidelines is NOT permitted.`
  },
  'Casual & Friendly': {
    description: 'Warm, approachable, and conversational support',
    color: 'bg-amber-600',
    hoverColor: 'hover:bg-amber-700',
    lightBg: 'bg-amber-50',
    prompt: `[STRICT INSTRUCTION]
You are now operating in Casual & Friendly Mode. You MUST follow these guidelines without exception:

1. Conversational Style:
   - Use natural, everyday language
   - Maintain warm, approachable tone
   - Include appropriate conversational markers
   - Keep responses relatable

2. Interaction Requirements:
   - Show active listening through references
   - Use conversational transitions
   - Include friendly acknowledgments
   - Maintain personal connection

3. Language Guidelines:
   - Use contractions naturally
   - Include conversational phrases
   - Keep technical terms minimal
   - Express ideas simply

4. Tone Elements:
   - Maintain consistent warmth
   - Show genuine interest
   - Use appropriate empathy
   - Keep energy positive

5. Response Structure:
   - Start with friendly acknowledgment
   - Use conversational flow
   - Include personal touches
   - End with encouraging closure

CRITICAL: While maintaining casualness, you must still be professional and helpful. Never compromise accuracy or helpfulness for friendliness.`
  }
};

interface ChatControlsProps {
  onStyleSelect: (style: string, prompt: string) => void;
  isBlackoutEnabled: boolean;
  isIlluminateEnabled: boolean;
  activeStyle: string | null;
}

export function ChatControls({
  onStyleSelect,
  isBlackoutEnabled,
  isIlluminateEnabled,
  activeStyle,
}: ChatControlsProps) {
  const [isNewStyleDialogOpen, setIsNewStyleDialogOpen] = useState(false);
  const [newStyleName, setNewStyleName] = useState('');
  const [newStyleDescription, setNewStyleDescription] = useState('');
  const [newStylePrompt, setNewStylePrompt] = useState('');
  const [customStyles, setCustomStyles] = useState<CustomStyle[]>([]);
  const [user, setUser] = useState(auth.currentUser);

  // Set Normal style as default on mount
  useEffect(() => {
    if (activeStyle === null) {
      onStyleSelect('Normal', chatStyles.Normal.prompt);
    }
  }, [activeStyle, onStyleSelect]);

  // Listen for custom styles
  useEffect(() => {
    if (!user) return;

    const unsubscribe = onCustomStylesSnapshot(user.uid, (styles) => {
      setCustomStyles(styles);
    });

    return () => unsubscribe();
  }, [user]);

  // Auth state listener
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
    });

    return () => unsubscribe();
  }, []);

  const handleCreateStyle = async () => {
    if (!user || !newStyleName || !newStyleDescription || !newStylePrompt) return;

    try {
      await createCustomStyle(user.uid, {
        name: newStyleName,
        description: newStyleDescription,
        prompt: newStylePrompt,
      });

      setNewStyleName('');
      setNewStyleDescription('');
      setNewStylePrompt('');
      setIsNewStyleDialogOpen(false);
    } catch (error) {
      console.error('Error creating style:', error);
    }
  };

  const handleDeleteStyle = async (styleId: string) => {
    try {
      await deleteCustomStyle(styleId);
    } catch (error) {
      console.error('Error deleting style:', error);
    }
  };

  // Get active style color
  const getStyleColor = () => {
    if (!activeStyle) return '';
    if (activeStyle === 'Normal') return '';
    
    // Check built-in styles
    if (chatStyles[activeStyle]) {
      return chatStyles[activeStyle].color;
    }
    
    // Check custom styles
    const customStyle = customStyles.find(s => s.name === activeStyle);
    return customStyle?.color || '';
  };

  const getStyleHoverColor = () => {
    if (!activeStyle) return '';
    if (activeStyle === 'Normal') return '';
    
    if (chatStyles[activeStyle]) {
      return chatStyles[activeStyle].hoverColor;
    }
    
    const customStyle = customStyles.find(s => s.name === activeStyle);
    return customStyle?.hoverColor || '';
  };

  // Dynamic classes based on theme
  const buttonClass = activeStyle && activeStyle !== 'Normal'
    ? `${getStyleColor()} ${getStyleHoverColor()} text-white`
    : isBlackoutEnabled
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
            className={`${buttonClass} transition-all duration-200 relative rounded-full`}
          >
            <Palette className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          className={`w-80 p-0 ${popoverClass} shadow-lg rounded-xl border`}
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

            {/* Built-in Styles */}
            <div className="space-y-1">
              {Object.entries(chatStyles).map(([style, { description, prompt, color }]) => (
                <button
                  key={style}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all duration-200 ${
                    activeStyle === style
                      ? style === 'Normal'
                        ? 'bg-gray-600 text-white'
                        : `${color} text-white`
                      : style === 'Normal'
                        ? textClass
                        : `hover:${chatStyles[style].lightBg} ${textClass}`
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
                        activeStyle === style ? 'text-white/90' : 'opacity-70'
                      }`}>
                        {description}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Custom Styles */}
            {customStyles.length > 0 && (
              <div className="mt-4">
                <h5 className={`text-sm font-medium mb-2 ${textClass}`}>Custom Styles</h5>
                <div className="space-y-1">
                  {customStyles.map((style) => (
                    <button
                      key={style.id}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-all duration-200 group ${
                        activeStyle === style.name
                          ? `${style.color} text-white`
                          : `hover:${style.lightBg} ${textClass}`
                      }`}
                      onClick={() => onStyleSelect(style.name, style.prompt)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {style.name}
                            {activeStyle === style.name && (
                              <Check className="h-4 w-4 text-white" />
                            )}
                          </div>
                          <div className={`text-sm ${
                            activeStyle === style.name ? 'text-white/90' : 'opacity-70'
                          }`}>
                            {style.description}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`opacity-0 group-hover:opacity-100 transition-opacity ${
                            activeStyle === style.name ? 'text-white' : textClass
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteStyle(style.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* New Style Dialog */}
      <Dialog open={isNewStyleDialogOpen} onOpenChange={setIsNewStyleDialogOpen}>
        <DialogContent className={`sm:max-w-[425px] ${popoverClass} p-6 rounded-xl`}>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className={`text-sm font-medium ${textClass}`}>
                Style Name
              </label>
              <input
                value={newStyleName}
                onChange={(e) => setNewStyleName(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border ${
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
                className={`w-full px-3 py-2 rounded-lg border ${
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
                className={`w-full px-3 py-2 rounded-lg border ${
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
              className={`${textClass} hover:bg-gray-700/20 rounded-lg`}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateStyle}
              className="bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
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
