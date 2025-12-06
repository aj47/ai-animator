
import React from 'react';
import { AnalysisResult, Segment } from '../types';
import { Sparkles, Film, Music, Layers, Clock, Loader2, Eye, Move, Zap, PlayCircle } from 'lucide-react';

interface PromptSelectorProps {
  analysis: AnalysisResult;
  onGenerateSegmentImage: (segment: Segment) => void;
  onGenerateSegmentVideo: (segment: Segment) => void;
  onViewSegment: (segment: Segment) => void;
  onBatchGenerateImages: () => void;
  onBatchAnimate: () => void;
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
  isBatchProcessing,
  disabled 
}) => {
  
  const totalCount = analysis.segments.length;
  
  // Counts for button states
  const idleCount = analysis.segments.filter(s => s.status === 'idle').length;
  const readyToAnimateCount = analysis.segments.filter(s => s.status === 'image-success').length;

  // Progress logic
  const completedImagesCount = analysis.segments.filter(s => s.status !== 'idle' && s.status !== 'generating-image').length;
  const completedVideosCount = analysis.segments.filter(s => s.status === 'video-success').length;
  
  // Simple visual progress: If we have mostly images, show image progress. If we have mostly videos pending, show video progress?
  // Let's stick to a generic "progress" based on what's actionable.
  // Actually, we can just show a progress bar if batch processing is active.
  
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
                {/* 1. Generate Images */}
                {!isBatchProcessing && idleCount > 0 && (
                    <button 
                        onClick={onBatchGenerateImages}
                        disabled={disabled}
                        className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold py-2 px-5 rounded-full transition-all shadow-lg shadow-purple-900/20 text-sm"
                    >
                        <Zap className="w-4 h-4 fill-current" />
                        Generate Images ({idleCount})
                    </button>
                )}

                {/* 2. Animate Videos */}
                {!isBatchProcessing && readyToAnimateCount > 0 && (
                    <button 
                        onClick={onBatchAnimate}
                        disabled={disabled}
                        className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-2 px-5 rounded-full transition-all shadow-lg shadow-blue-900/20 text-sm"
                    >
                        <Film className="w-4 h-4" />
                        Animate All ({readyToAnimateCount})
                    </button>
                )}

                {isBatchProcessing && (
                    <div className="flex items-center gap-3 bg-zinc-800 px-5 py-2 rounded-full border border-zinc-700">
                        <Loader2 className="w-4 h-4 animate-spin text-green-400" />
                        <span className="text-sm font-medium text-zinc-300">Processing Batch...</span>
                    </div>
                )}
            </div>
        </div>

        <div className="space-y-3">
          {analysis.segments.map((segment) => (
            <div 
              key={segment.id}
              className={`
                relative flex items-center gap-4 p-4 rounded-xl border transition-all duration-300
                ${segment.status.includes('success')
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
                <div className="flex flex-wrap items-center gap-2 mt-2">
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
                {/* IDLE: Generate Image */}
                {segment.status === 'idle' && (
                  <button
                    onClick={() => onGenerateSegmentImage(segment)}
                    disabled={disabled || isBatchProcessing}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium transition-colors border border-zinc-700"
                  >
                    <Sparkles className="w-4 h-4 text-green-400" />
                    Image
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
                    <div className="h-10 w-16 bg-black rounded border border-green-500/50 overflow-hidden relative group cursor-pointer" onClick={() => onViewSegment(segment)}>
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
