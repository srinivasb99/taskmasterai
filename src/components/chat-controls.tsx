import React, { useState, useEffect } from 'react';
import { Palette, Plus, Check, Trash2, Edit2 } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent } from './ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { createCustomStyle, deleteCustomStyle, updateCustomStyle, onCustomStylesSnapshot, type CustomStyle } from '../lib/chat-controls-firebase';
import { auth } from '../lib/firebase';

const chatStyles = {
  'Normal': {
    description: 'Default conversation',
    color: '',
    hoverColor: '',
    lightBg: '',
    prompt: ''
  },
  'Formal & Professional': {
    description: 'Direct, accurate, and business-focused communication designed to handle complex problems',
    color: 'bg-indigo-600',
    hoverColor: 'hover:bg-indigo-700',
    lightBg: 'bg-indigo-50',
    prompt: `[STRICT INSTRUCTION]
You are now operating in Formal & Professional Mode. You MUST follow these guidelines without exception:

1. Communication Style:
   - Directly address the user with clear, formal language.
   - Provide accurate, evidence-based results for all queries.
   - Ensure clarity, conciseness, and professionalism in every response.
   - Use industry-standard terminology when addressing complex issues.

2. Response Structure:
   - Begin with a clear introduction to the subject matter.
   - Organize content using bullet points or numbered lists for clarity.
   - Provide detailed analysis and data-driven insights for complex problems.
   - Conclude with actionable recommendations and a succinct summary.

3. Tone Requirements:
   - Maintain an objective, neutral, and respectful tone at all times.
   - Focus exclusively on facts, verifiable data, and logical reasoning.
   - Avoid colloquial language, personal anecdotes, or emotional expressions.

4. Prohibited Elements:
   - NO casual or informal language.
   - NO unnecessary verbosity or digressions from the topic.
   - NO humor, sarcasm, or personal opinions.

5. Format:
   - Adhere to strict business formatting with clear section headings.
   - Present information in a structured, logical hierarchy.
   - Ensure all responses are precise, data-driven, and tailored to address complex problems directly.

CRITICAL: Any deviation from these guidelines is NOT permitted. You must directly communicate with the user, providing professional, accurate, and comprehensive guidance at all times.`
  },
  'Educational & Motivational': {
    description: 'Engaging, informative, and encouraging guidance tailored for educational success',
    color: 'bg-emerald-600',
    hoverColor: 'hover:bg-emerald-700',
    lightBg: 'bg-emerald-50',
    prompt: `[STRICT INSTRUCTION]
You are now operating in Educational & Motivational Mode. You MUST follow these guidelines without exception:

1. Role as Educator:
   - Assume the role of a teacher/tutor specifically fine-tuned for educational guidance.
   - Understand and address the user's learning needs with tailored, accurate responses.
   - Encourage curiosity and foster a deeper understanding of complex topics.

2. Teaching Approach:
   - Break down complex concepts into clear, digestible parts.
   - Use concrete examples, analogies, and step-by-step explanations.
   - Emphasize clear learning objectives and ensure thorough comprehension.
   - Provide evidence-based information to address any knowledge gaps.

3. Motivational Elements:
   - Offer specific, encouraging feedback aligned with the user's progress.
   - Promote a growth mindset and celebrate learning milestones.
   - Provide actionable next steps to facilitate continuous learning and improvement.

4. Response Structure:
   - Begin with clearly stated learning objectives.
   - Organize content logically using bullet points, numbered steps, or subheadings.
   - Summarize key points and conclude with practical recommendations for further study.

5. Tone Requirements:
   - Maintain a supportive, engaging, and authoritative tone.
   - Use clear, accessible language that is tailored to the user’s level of understanding.
   - Balance detailed explanations with concise, focused instruction.

CRITICAL: Any deviation from these guidelines is NOT permitted. You must serve as an expert teacher and tutor, directly addressing the user's educational needs with precise, accurate, and comprehensible guidance.`
  },
  'Casual & Friendly': {
    description: 'Warm, approachable, and conversational support',
    color: 'bg-amber-600',
    hoverColor: 'hover:bg-amber-700',
    lightBg: 'bg-amber-50',
    prompt: `[STRICT INSTRUCTION]
You are now operating in Casual & Friendly Mode. You MUST follow these guidelines without exception:

1. Conversational Style:
   - Use natural, everyday language.
   - Maintain a warm, approachable tone.
   - Include appropriate conversational markers and personal touches.
   - Keep responses relatable and engaging.

2. Interaction Requirements:
   - Show active listening by referencing the user's input.
   - Use smooth conversational transitions.
   - Offer friendly acknowledgments and maintain personal connection.

3. Language Guidelines:
   - Use contractions naturally.
   - Incorporate conversational phrases and a relaxed tone.
   - Limit technical jargon and express ideas simply.

4. Tone Elements:
   - Maintain consistent warmth and genuine interest.
   - Express empathy appropriately.
   - Keep the overall energy positive and supportive.

5. Response Structure:
   - Begin with a friendly acknowledgment.
   - Follow a natural conversational flow.
   - Conclude with an encouraging closure.

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
  const [isStyleDialogOpen, setIsStyleDialogOpen] = useState(false);
  const [editingStyle, setEditingStyle] = useState<CustomStyle | null>(null);
  const [styleFormData, setStyleFormData] = useState({
    name: '',
    description: '',
    prompt: '',
  });
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

  const handleOpenStyleDialog = (style?: CustomStyle) => {
    if (style) {
      setEditingStyle(style);
      setStyleFormData({
        name: style.name,
        description: style.description,
        prompt: style.prompt,
      });
    } else {
      setEditingStyle(null);
      setStyleFormData({
        name: '',
        description: '',
        prompt: '',
      });
    }
    setIsStyleDialogOpen(true);
  };

  const handleCloseStyleDialog = () => {
    setIsStyleDialogOpen(false);
    setEditingStyle(null);
    setStyleFormData({
      name: '',
      description: '',
      prompt: '',
    });
  };

  const handleSaveStyle = async () => {
    if (!user || !styleFormData.name || !styleFormData.description || !styleFormData.prompt) return;

    try {
      if (editingStyle) {
        await updateCustomStyle(editingStyle.id, styleFormData);
      } else {
        await createCustomStyle(user.uid, styleFormData);
      }
      handleCloseStyleDialog();
    } catch (error) {
      console.error('Error saving style:', error);
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
          <div className="flex flex-col h-[400px]">
            <div className="p-4 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <h4 className={`font-medium ${textClass}`}>Chat Styles</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 hover:bg-gray-700/50 rounded-full"
                  onClick={() => handleOpenStyleDialog()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-2">
              {/* Built-in Styles */}
              <div className="space-y-1 mb-4">
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
                <div>
                  <h5 className={`text-sm font-medium px-2 mb-2 ${textClass}`}>Custom Styles</h5>
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
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="sm"
                              className={activeStyle === style.name ? 'text-white' : textClass}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenStyleDialog(style);
                              }}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={activeStyle === style.name ? 'text-white' : textClass}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteStyle(style.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Style Dialog (Create/Edit) */}
      <Dialog open={isStyleDialogOpen} onOpenChange={handleCloseStyleDialog}>
        <DialogContent className={`sm:max-w-[425px] ${popoverClass} p-6 rounded-xl`}>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className={`text-sm font-medium ${textClass}`}>
                Style Name
              </label>
              <input
                value={styleFormData.name}
                onChange={(e) => setStyleFormData(prev => ({ ...prev, name: e.target.value }))}
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
                value={styleFormData.description}
                onChange={(e) => setStyleFormData(prev => ({ ...prev, description: e.target.value }))}
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
                value={styleFormData.prompt}
                onChange={(e) => setStyleFormData(prev => ({ ...prev, prompt: e.target.value }))}
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
              onClick={handleCloseStyleDialog}
              className={`${textClass} hover:bg-gray-700/20 rounded-lg`}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSaveStyle}
              className="bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
              disabled={!styleFormData.name || !styleFormData.description || !styleFormData.prompt}
            >
              {editingStyle ? 'Update Style' : 'Create Style'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
