
import React, { useState } from 'react';
import { AnalysisResult, Segment } from '../types';
import { Sparkles, Film, Music, Layers, Clock, Loader2, Move, Zap, PlayCircle, Wand2, Pencil, Check, X, RefreshCw, Download } from 'lucide-react';

// Inline SegmentCard component with full editing capabilities
interface SegmentCardProps {
  segment: Segment;
  onGenerateImage: (segment: Segment) => Promise<string | null>;
  onGenerateVideo: (segment: Segment) => Promise<string | null>;
  onUpdatePrompts: (segmentId: string, prompt: string, animationPrompt: string) => void;
  onRegenerateImage: (segment: Segment) => void;
  disabled: boolean;
  isBatchProcessing: boolean;
}

const SegmentCard: React.FC<SegmentCardProps> = ({
  segment,
  onGenerateImage,
  onGenerateVideo,
  onUpdatePrompts,
  onRegenerateImage,
  disabled,
  isBatchProcessing,
}) => {
  // Default to edit mode if no image has been generated yet
  const [isEditing, setIsEditing] = useState(!segment.imageUrl);
  const [editedPrompt, setEditedPrompt] = useState(segment.prompt);
  const [editedAnimationPrompt, setEditedAnimationPrompt] = useState(segment.animationPrompt);

  const isGenerating = segment.status === 'generating-image' || segment.status === 'generating-video';
  const hasImage = !!segment.imageUrl;
  const hasVideo = !!segment.videoUrl;

  const handleSave = () => {
    onUpdatePrompts(segment.id, editedPrompt, editedAnimationPrompt);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedPrompt(segment.prompt);
    setEditedAnimationPrompt(segment.animationPrompt);
    setIsEditing(false);
  };

  const handleSaveAndGenerate = () => {
    onUpdatePrompts(segment.id, editedPrompt, editedAnimationPrompt);
    setIsEditing(false);
    setTimeout(() => onRegenerateImage(segment), 50);
  };

  // Sync state when segment props change
  React.useEffect(() => {
    if (!isEditing) {
      setEditedPrompt(segment.prompt);
      setEditedAnimationPrompt(segment.animationPrompt);
    }
  }, [segment.prompt, segment.animationPrompt, isEditing]);

  // Exit edit mode when image is generated
  React.useEffect(() => {
    if (segment.imageUrl) {
      setIsEditing(false);
    }
  }, [segment.imageUrl]);

  return (
    <div
      className={`
        rounded-xl border transition-all duration-300 overflow-hidden
        ${segment.status.includes('success')
          ? 'bg-green-900/10 border-green-500/30'
          : 'bg-zinc-900/50 border-zinc-800'}
      `}
    >
      {/* Header Row */}
      <div className="flex items-center gap-4 p-4 border-b border-zinc-800/50">
        {/* Timestamp */}
        <div className="flex flex-col items-center justify-center min-w-[60px] text-zinc-500">
          <Clock className="w-4 h-4 mb-1" />
          <span className="font-mono text-xs font-bold">{segment.formattedTime}</span>
        </div>

        {/* Topic & Description */}
        <div className="flex-1 min-w-0">
          <h4 className="text-white font-bold text-lg">{segment.topic}</h4>
          <p className="text-zinc-400 text-sm">{segment.description}</p>
        </div>

        {/* Status Badge */}
        <div className="shrink-0">
          {isGenerating && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 rounded-full text-xs text-zinc-300">
              <Loader2 className="w-3 h-3 animate-spin" />
              {segment.status === 'generating-image' ? 'Generating...' : 'Animating...'}
            </div>
          )}
          {segment.status === 'video-success' && (
            <span className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-full text-xs font-medium">Complete</span>
          )}
          {segment.status === 'image-success' && (
            <span className="px-3 py-1.5 bg-yellow-500/20 text-yellow-400 rounded-full text-xs font-medium">Image Ready</span>
          )}
          {segment.status === 'error' && (
            <span className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-full text-xs font-medium">Error</span>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col lg:flex-row">
        {/* Left: Prompts */}
        <div className="flex-1 p-4 space-y-3">
          {/* Image Prompt */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-green-400" />
                <span className="text-xs font-bold text-green-300 uppercase tracking-wider">Image Prompt</span>
              </div>
              {!isEditing && !isGenerating && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-xs text-zinc-500 hover:text-white flex items-center gap-1 transition-colors"
                >
                  <Pencil className="w-3 h-3" /> Edit
                </button>
              )}
            </div>
            {isEditing ? (
              <textarea
                value={editedPrompt}
                onChange={(e) => setEditedPrompt(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 focus:outline-none focus:border-green-500 resize-none"
                rows={3}
              />
            ) : (
              <p className="text-sm text-zinc-300 bg-zinc-800/50 rounded-lg p-3 border border-zinc-800">{segment.prompt}</p>
            )}
          </div>

          {/* Animation Prompt */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Move className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-bold text-blue-300 uppercase tracking-wider">Animation Prompt</span>
            </div>
            {isEditing ? (
              <textarea
                value={editedAnimationPrompt}
                onChange={(e) => setEditedAnimationPrompt(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 resize-none"
                rows={2}
              />
            ) : (
              <p className="text-sm text-blue-300/80 bg-blue-900/20 rounded-lg p-3 border border-blue-900/30">{segment.animationPrompt}</p>
            )}
          </div>

          {/* Edit Actions */}
          {isEditing && (
            <div className="flex items-center gap-2 pt-2">
              {/* Only show Cancel/Save if there's already an image (re-editing) */}
              {hasImage && (
                <>
                  <button
                    onClick={handleCancel}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
                  >
                    <X className="w-3 h-3" /> Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-white rounded-full transition-colors"
                  >
                    <Check className="w-3 h-3" /> Save
                  </button>
                </>
              )}
              <button
                onClick={handleSaveAndGenerate}
                disabled={disabled || isBatchProcessing}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-600 hover:bg-green-500 text-white rounded-full transition-colors disabled:opacity-50"
              >
                {hasImage ? (
                  <><RefreshCw className="w-3 h-3" /> Save & Regenerate</>
                ) : (
                  <><Sparkles className="w-3 h-3" /> Generate Image</>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Right: Preview & Actions */}
        <div className="lg:w-80 p-4 border-t lg:border-t-0 lg:border-l border-zinc-800/50 flex flex-col gap-4">
          {/* Preview Area */}
          <div className="aspect-video bg-black rounded-lg overflow-hidden border border-zinc-700 relative">
            {hasVideo ? (
              <video
                src={segment.videoUrl}
                className="w-full h-full object-contain"
                autoPlay
                loop
                muted
                playsInline
              />
            ) : hasImage ? (
              <img src={segment.imageUrl} className="w-full h-full object-contain" alt="Generated" />
            ) : isGenerating ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500">
                <Loader2 className="w-8 h-8 animate-spin text-green-500 mb-2" />
                <span className="text-xs">Generating...</span>
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600">
                <Sparkles className="w-8 h-8 mb-2 opacity-30" />
                <span className="text-xs">No preview yet</span>
              </div>
            )}
            {hasVideo && (
              <div className="absolute top-2 right-2">
                <PlayCircle className="w-5 h-5 text-white drop-shadow-lg" />
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            {/* When no image and in edit mode, the generate button is in the edit actions */}
            {/* When generating, show status */}
            {!hasImage && isGenerating && (
              <div className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-zinc-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                {segment.status === 'generating-image' ? 'Generating...' : 'Processing...'}
              </div>
            )}

            {hasImage && !isGenerating && (
              <>
                <button
                  onClick={() => onRegenerateImage(segment)}
                  disabled={disabled}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium transition-colors border border-zinc-700"
                  title="Regenerate Image"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>

                {!hasVideo && (
                  <button
                    onClick={() => onGenerateVideo(segment)}
                    disabled={disabled}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
                  >
                    <Film className="w-4 h-4" />
                    Animate
                  </button>
                )}

                {/* Download */}
                <a
                  href={hasVideo ? segment.videoUrl : segment.imageUrl}
                  download={hasVideo ? `animation-${segment.formattedTime.replace(':', '-')}.mp4` : `image-${segment.formattedTime.replace(':', '-')}.png`}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white hover:bg-zinc-200 text-black text-xs font-medium transition-colors"
                  title="Download"
                >
                  <Download className="w-3 h-3" />
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface PromptSelectorProps {
  analysis: AnalysisResult;
  onGenerateSegmentImage: (segment: Segment) => Promise<string | null>;
  onGenerateSegmentVideo: (segment: Segment) => Promise<string | null>;
  onViewSegment: (segment: Segment) => void;
  onBatchGenerateImages: () => void;
  onBatchAnimate: () => void;
  onFullAutoGenerate: () => void;
  onUpdateSegmentPrompts: (segmentId: string, prompt: string, animationPrompt: string) => void;
  onRegenerateImage: (segment: Segment) => void;
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
  onUpdateSegmentPrompts,
  onRegenerateImage,
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

        <div className="space-y-4">
          {analysis.segments.map((segment) => (
            <SegmentCard
              key={segment.id}
              segment={segment}
              onGenerateImage={onGenerateSegmentImage}
              onGenerateVideo={onGenerateSegmentVideo}
              onUpdatePrompts={onUpdateSegmentPrompts}
              onRegenerateImage={onRegenerateImage}
              disabled={disabled}
              isBatchProcessing={isBatchProcessing}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default PromptSelector;
