
import React from 'react';
import { AnalysisResult, Segment } from '../types';
import { Sparkles, Film, Music, Layers, Clock, Loader2, Eye, Move, Zap, PlayCircle, Wand2 } from 'lucide-react';

interface PromptSelectorProps {
  analysis: AnalysisResult;
  onGenerateSegmentImage: (segment: Segment) => Promise<string | null>;
  onGenerateSegmentVideo: (segment: Segment) => Promise<string | null>;
  onViewSegment: (segment: Segment) => void;
  onBatchGenerateImages: () => void;
  onBatchAnimate: () => void;
  onFullAutoGenerate: () => void;
  isBatchProcessing: boolean;
  disabled: boolean;
}

const PromptSelector: React.FC<PromptSelectorProps> = ({ 
  analysis, 
  onGenerateSegmentImage, 
  onGenerateSegmentVideo,
  onViewSegment, 
  onBatchGenerateImages,
  onBatchAnimate,
  onFullAutoGenerate,
  isBatchProcessing,
  disabled 
}) => {
  
  const totalCount = analysis.segments.length;
  
  // Counts for button states
  const idleCount = analysis.segments.filter(s => s.status === 'idle').length;
  const readyToAnimateCount = analysis.segments.filter(s => s.status === 'image-success').length;
  const fullyCompleteCount = analysis.segments.filter(s => s.status === 'video-success').length;

  const isAllComplete = fullyCompleteCount === totalCount;
  
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
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-6">
            <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-green-400" />
                Detected Topics & Segments
                </h3>
                <p className="text-zinc-400 text-sm mt-1">
                Generate Green Screen overlays for each topic, then animate them with Veo.
                </p>
            </div>

            {/* Batch Actions */}
            <div className="flex flex-wrap gap-3">
                
                {isBatchProcessing ? (
                    <div className="flex items-center gap-3 bg-zinc-800 px-5 py-2 rounded-full border border-zinc-700 animate-pulse">
                        <Loader2 className="w-4 h-4 animate-spin text-green-400" />
                        <span className="text-sm font-medium text-zinc-300">Parallel Processing...</span>
                    </div>
                ) : (
                    <>
                         {/* Full Auto Button (Only if there are things to do) */}
                         {!isAllComplete && (
                             <button
                                onClick={onFullAutoGenerate}
                                disabled={disabled}
                                className="flex items-center gap-2 bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 hover:from-green-500 hover:to-teal-500 text-white font-bold py-2 px-6 rounded-full transition-all shadow-lg shadow-green-900/20 text-sm border border-white/10"
                             >
                                <Wand2 className="w-4 h-4" />
                                Magic Auto-Generate All
                             </button>
                         )}

                         {/* Granular Batch Actions */}
                        {idleCount > 0 && (
                            <button 
                                onClick={onBatchGenerateImages}
                                disabled={disabled}
                                className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-medium py-2 px-5 rounded-full transition-all border border-zinc-700 text-sm"
                            >
                                <Zap className="w-4 h-4" />
                                Images Only ({idleCount})
                            </button>
                        )}

                        {readyToAnimateCount > 0 && (
                            <button 
                                onClick={onBatchAnimate}
                                disabled={disabled}
                                className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-medium py-2 px-5 rounded-full transition-all border border-zinc-700 text-sm"
                            >
                                <Film className="w-4 h-4" />
                                Animate Only ({readyToAnimateCount})
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>

        <div className="space-y-3">
          {analysis.segments.map((segment) => (
            <div
              key={segment.id}
              onClick={() => onViewSegment(segment)}
              className={`
                relative flex flex-col lg:flex-row lg:items-center gap-4 p-4 rounded-xl border transition-all duration-300 cursor-pointer
                ${segment.status.includes('success')
                  ? 'bg-green-900/10 border-green-500/30 hover:border-green-500/50'
                  : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-600'}
              `}
            >
              {/* Top Row: Timestamp + Topic + Actions */}
              <div className="flex items-center gap-4 w-full lg:w-auto">
                {/* Timestamp */}
                <div className="flex flex-col items-center justify-center min-w-[60px] text-zinc-500">
                  <Clock className="w-4 h-4 mb-1" />
                  <span className="font-mono text-xs font-bold">{segment.formattedTime}</span>
                </div>

                {/* Topic & Description */}
                <div className="flex-1 min-w-0 lg:min-w-[200px]">
                  <h4 className="text-white font-bold">{segment.topic}</h4>
                  <p className="text-zinc-400 text-sm line-clamp-2">{segment.description}</p>
                </div>
              </div>

              {/* Prompts - expanded view */}
              <div className="flex-1 flex flex-col gap-2 min-w-0">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-3 h-3 text-green-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-zinc-400 line-clamp-2">{segment.prompt}</p>
                </div>
                {segment.animationPrompt && (
                  <div className="flex items-start gap-2">
                    <Move className="w-3 h-3 text-blue-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-blue-400/80 line-clamp-2">{segment.animationPrompt}</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                {/* IDLE: Generate Image */}
                {segment.status === 'idle' && (
                  <button
                    onClick={() => onGenerateSegmentImage(segment)}
                    disabled={disabled || isBatchProcessing}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium transition-colors border border-zinc-700"
                  >
                    <Sparkles className="w-4 h-4 text-green-400" />
                    Generate
                  </button>
                )}

                {/* GENERATING IMAGE */}
                {segment.status === 'generating-image' && (
                  <div className="flex items-center gap-2 px-4 py-2 text-zinc-400 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin text-green-500" />
                    Painting...
                  </div>
                )}

                {/* IMAGE SUCCESS or VIDEO GENERATING/SUCCESS */}
                {(segment.status === 'image-success' || segment.status === 'generating-video' || segment.status === 'video-success') && segment.imageUrl && (
                  <div className="flex items-center gap-3">
                    {/* Thumbnail Preview */}
                    <div className="h-12 w-20 bg-black rounded border border-green-500/50 overflow-hidden relative group cursor-pointer">
                         <img src={segment.imageUrl} className="w-full h-full object-cover" alt="Preview" />
                         {segment.status === 'video-success' && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                <PlayCircle className="w-6 h-6 text-white" />
                            </div>
                         )}
                    </div>

                    {/* Action: Animate (if not yet animated) */}
                    {segment.status === 'image-success' && (
                        <button
                            onClick={() => onGenerateSegmentVideo(segment)}
                            disabled={disabled}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors shadow-lg shadow-blue-900/20"
                            title="Generate Video Animation with Veo"
                        >
                            <Film className="w-3 h-3" />
                            Animate
                        </button>
                    )}

                    {segment.status === 'generating-video' && (
                        <div className="flex items-center gap-1 text-blue-400 text-xs font-mono">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Veo...
                        </div>
                    )}
                  </div>
                )}

                {segment.status === 'error' && (
                  <span className="text-red-400 text-xs">Failed</span>
                )}

                {/* Always show View/Details button */}
                <button
                  onClick={() => onViewSegment(segment)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                    segment.imageUrl
                      ? 'bg-green-500 hover:bg-green-400 text-black'
                      : 'bg-zinc-700 hover:bg-zinc-600 text-white'
                  }`}
                >
                  <Eye className="w-4 h-4" />
                  {segment.imageUrl ? 'View' : 'Details'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PromptSelector;
