import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { Brain, Save } from 'lucide-react';
import type { UserContext } from '../lib/ai-context-firebase';

interface ContextDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (context: Partial<UserContext>) => void;
  initialContext?: UserContext | null;
  isBlackoutEnabled: boolean;
  isIlluminateEnabled: boolean;
}

export function ContextDialog({
  isOpen,
  onClose,
  onSave,
  initialContext,
  isBlackoutEnabled,
  isIlluminateEnabled
}: ContextDialogProps) {
  const [context, setContext] = useState<Partial<UserContext>>({
    workDescription: '',
    shortTermFocus: '',
    longTermGoals: '',
    otherContext: ''
  });

  useEffect(() => {
    if (initialContext) {
      setContext(initialContext);
    }
  }, [initialContext]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(context);
    onClose();
  };

  const inputClass = isBlackoutEnabled
    ? 'bg-gray-800 border-gray-700 text-white'
    : isIlluminateEnabled
    ? 'bg-white border-gray-200 text-gray-900'
    : 'bg-gray-700 border-gray-600 text-gray-200';

  const labelClass = isBlackoutEnabled || !isIlluminateEnabled
    ? 'text-gray-200'
    : 'text-gray-900';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`sm:max-w-[600px] ${
        isBlackoutEnabled
          ? 'bg-gray-900 border-gray-700'
          : isIlluminateEnabled
          ? 'bg-white border-gray-200'
          : 'bg-gray-800 border-gray-700'
      }`}>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Brain className="w-6 h-6 text-blue-500" />
            <h2 className={`text-xl font-semibold ${labelClass}`}>
              Context Settings
            </h2>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className={`text-sm font-medium ${labelClass}`}>
                Work Description
              </label>
              <textarea
                value={context.workDescription}
                onChange={(e) => setContext(prev => ({ ...prev, workDescription: e.target.value }))}
                className={`w-full px-3 py-2 rounded-lg border ${inputClass} min-h-[100px]`}
                placeholder="Describe your work, role, and responsibilities..."
              />
            </div>

            <div className="space-y-2">
              <label className={`text-sm font-medium ${labelClass}`}>
                Short Term Focus
              </label>
              <textarea
                value={context.shortTermFocus}
                onChange={(e) => setContext(prev => ({ ...prev, shortTermFocus: e.target.value }))}
                className={`w-full px-3 py-2 rounded-lg border ${inputClass} min-h-[100px]`}
                placeholder="What are your immediate priorities and focus areas?"
              />
            </div>

            <div className="space-y-2">
              <label className={`text-sm font-medium ${labelClass}`}>
                Long Term Goals
              </label>
              <textarea
                value={context.longTermGoals}
                onChange={(e) => setContext(prev => ({ ...prev, longTermGoals: e.target.value }))}
                className={`w-full px-3 py-2 rounded-lg border ${inputClass} min-h-[100px]`}
                placeholder="What are your long-term objectives and aspirations?"
              />
            </div>

            <div className="space-y-2">
              <label className={`text-sm font-medium ${labelClass}`}>
                Other Context
              </label>
              <textarea
                value={context.otherContext}
                onChange={(e) => setContext(prev => ({ ...prev, otherContext: e.target.value }))}
                className={`w-full px-3 py-2 rounded-lg border ${inputClass} min-h-[100px]`}
                placeholder="Any other relevant context or information..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className={labelClass}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 text-white hover:bg-blue-700"
              >
                <Save className="w-4 h-4 mr-2" />
                Save Context
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
