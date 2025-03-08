import React from 'react';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { 
  ThumbsUp, 
  ThumbsDown, 
  CheckCircle, 
  XCircle,
  Lightbulb,
  ArrowRight
} from 'lucide-react';
import type { DeepInsightAction } from '../lib/ai-context-firebase';

interface DeepInsightDialogProps {
  isOpen: boolean;
  onClose: () => void;
  action: DeepInsightAction;
  onVote: (vote: 'up' | 'down') => void;
  onAccept: () => void;
  onDecline: () => void;
  isBlackoutEnabled: boolean;
  isIlluminateEnabled: boolean;
}

export function DeepInsightDialog({
  isOpen,
  onClose,
  action,
  onVote,
  onAccept,
  onDecline,
  isBlackoutEnabled,
  isIlluminateEnabled
}: DeepInsightDialogProps) {
  const bgClass = isBlackoutEnabled
    ? 'bg-gray-900 border-gray-700'
    : isIlluminateEnabled
    ? 'bg-white border-gray-200'
    : 'bg-gray-800 border-gray-700';

  const textClass = isBlackoutEnabled || !isIlluminateEnabled
    ? 'text-gray-200'
    : 'text-gray-900';

  const sectionClass = isBlackoutEnabled
    ? 'bg-gray-800 border-gray-700'
    : isIlluminateEnabled
    ? 'bg-gray-100 border-gray-200'
    : 'bg-gray-700 border-gray-600';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`sm:max-w-[600px] ${bgClass}`}>
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-6 h-6 text-yellow-500" />
            <h2 className={`text-xl font-semibold ${textClass}`}>
              DeepInsight Suggestion
            </h2>
          </div>

          <div className={`p-4 rounded-lg border ${sectionClass}`}>
            <h3 className={`text-lg font-medium mb-2 ${textClass}`}>
              Suggested Action
            </h3>
            <p className={`mb-4 ${textClass}`}>{action.description}</p>

            <div className="space-y-4">
              <div>
                <h4 className={`text-sm font-medium mb-1 ${textClass}`}>
                  Reasoning
                </h4>
                <p className={`text-sm ${textClass}`}>{action.reasoning}</p>
              </div>

              <div>
                <h4 className={`text-sm font-medium mb-1 ${textClass}`}>
                  Expected Impact
                </h4>
                <p className={`text-sm ${textClass}`}>{action.impact}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                onClick={() => onVote('up')}
                variant="ghost"
                className={`${textClass} hover:bg-green-500/20`}
              >
                <ThumbsUp className="w-4 h-4 mr-1" />
                {action.votes.upvotes}
              </Button>
              <Button
                onClick={() => onVote('down')}
                variant="ghost"
                className={`${textClass} hover:bg-red-500/20`}
              >
                <ThumbsDown className="w-4 h-4 mr-1" />
                {action.votes.downvotes}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={onDecline}
                variant="ghost"
                className="text-red-500 hover:bg-red-500/20"
              >
                <XCircle className="w-4 h-4 mr-1" />
                Decline
              </Button>
              <Button
                onClick={onAccept}
                className="bg-green-600 text-white hover:bg-green-700"
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                Accept
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
