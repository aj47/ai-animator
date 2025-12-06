
import React from 'react';
import { AnalysisResult, Segment } from '../types';
import { Sparkles, Film, Music, Layers, Clock, Loader2, Eye, Move } from 'lucide-react';

interface PromptSelectorProps {
  analysis: AnalysisResult;
  onGenerateSegment: (segment: Segment) => void;
  onViewSegment: (segment: Segment) => void;
  disabled: boolean;
}

const PromptSelector: React.FC<PromptSelectorProps> = ({ analysis, onGenerateSegment, onViewSegment, disabled }) => {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Analysis Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl">
          <div className="flex items-center gap-2 mb-2 text-purple-400">
            <Film className="w-4 h-4" />
            <h4 className="font-semibold text-sm uppercase tracking-wider">Visual Context</h4>
          </div>
          <p className="text-zinc-300 text-sm leading-relaxed">{analysis.visualSummary}</p>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl">
          <div className="flex items-center gap-2 mb-2 text-pink-400">
            <Music className="w-4 h-4" />
            <h4 className="font-semibold text-sm uppercase tracking-wider">Content Summary</h4>
          </div>
          <p className="text-zinc-300 text-sm leading-relaxed">{analysis.audioSummary}</p>
        </div>
      </div>

      <div>
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Layers className="w-5 h-5 text-green-400" />
          Detected Topics & Segments
        </h3>
        <p className="text-zinc-400 text-sm mb-6">
          Gemini identified these topics in your video. Generate Green Screen overlays for each topic individually.
        </p>

        <div className="space-y-3">
          {analysis.segments.map((segment) => (
            <div 
              key={segment.id}
              className={`
                relative flex items-center gap-4 p-4 rounded-xl border transition-all duration-300
                ${segment.status === 'success' 
                  ? 'bg-green-900/10 border-green-500/30' 
                  : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'}
              `}
            >
              {/* Timestamp */}
              <div className="flex flex-col items-center justify-center min-w-[60px] text-zinc-500">
                <Clock className="w-4 h-4 mb-1" />
                <span className="font-mono text-xs font-bold">{segment.formattedTime}</span>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h4 className="text-white font-bold truncate pr-4">{segment.topic}</h4>
                <p className="text-zinc-400 text-sm line-clamp-1">{segment.description}</p>
                <div className="flex items-center gap-2 mt-2">
                    <span className="inline-flex items-center gap-1 text-xs text-zinc-500 bg-zinc-800/50 px-2 py-0.5 rounded border border-zinc-800 truncate max-w-xs">
                        {segment.prompt}
                    </span>
                    {segment.animationPrompt && (
                        <span className="inline-flex items-center gap-1 text-xs text-blue-400/80 bg-blue-900/10 px-2 py-0.5 rounded border border-blue-900/30 truncate max-w-xs">
                            <Move className="w-3 h-3" />
                            {segment.animationPrompt}
                        </span>
                    )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                {segment.status === 'idle' && (
                  <button
                    onClick={() => onGenerateSegment(segment)}
                    disabled={disabled}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium transition-colors border border-zinc-700"
                  >
                    <Sparkles className="w-4 h-4 text-green-400" />
                    Generate
                  </button>
                )}

                {segment.status === 'generating' && (
                  <div className="flex items-center gap-2 px-4 py-2 text-zinc-400 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin text-green-500" />
                    Creating...
                  </div>
                )}

                {segment.status === 'success' && segment.imageUrl && (
                  <div className="flex items-center gap-3">
                    {/* Thumbnail Preview */}
                    <div className="h-10 w-16 bg-black rounded border border-green-500/50 overflow-hidden relative">
                         <img src={segment.imageUrl} className="w-full h-full object-cover" alt="Preview" />
                    </div>
                    <button
                      onClick={() => onViewSegment(segment)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500 hover:bg-green-400 text-black text-sm font-bold transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      View
                    </button>
                  </div>
                )}
                 
                 {segment.status === 'error' && (
                    <span className="text-red-400 text-xs">Failed</span>
                 )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PromptSelector;
