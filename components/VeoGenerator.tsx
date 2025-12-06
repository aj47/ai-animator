
import React, { useRef, useEffect, useState } from 'react';
import { Download, ArrowLeft, Play, Move, Film, Loader2, RefreshCw, Pencil, Check, X, Sparkles } from 'lucide-react';
import { Segment } from '../types';

interface VeoGeneratorProps {
  segment: Segment;
  originalVideoUrl: string | null;
  onBack: () => void;
  onAnimate: (segment: Segment) => void;
  onRegenerateImage: (segment: Segment) => void;
  onUpdateSegmentPrompts: (segmentId: string, prompt: string, animationPrompt: string) => void;
  onGenerateImage: (segment: Segment) => void;
}

const VeoGenerator: React.FC<VeoGeneratorProps> = ({ segment, originalVideoUrl, onBack, onAnimate, onRegenerateImage, onUpdateSegmentPrompts, onGenerateImage }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Edit mode state
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState(segment.prompt);
  const [editedAnimationPrompt, setEditedAnimationPrompt] = useState(segment.animationPrompt);

  // Auto-seek to the timestamp when mounted
  useEffect(() => {
    if (videoRef.current && segment.timestamp) {
      videoRef.current.currentTime = segment.timestamp;
    }
  }, [segment.timestamp]);

  // Sync edited prompts when segment changes
  useEffect(() => {
    setEditedPrompt(segment.prompt);
    setEditedAnimationPrompt(segment.animationPrompt);
  }, [segment.prompt, segment.animationPrompt]);

  const handleReplay = () => {
    if (videoRef.current) {
        videoRef.current.currentTime = segment.timestamp;
        videoRef.current.play();
    }
  };

  const handleSavePrompts = () => {
    onUpdateSegmentPrompts(segment.id, editedPrompt, editedAnimationPrompt);
    setIsEditingPrompt(false);
  };

  const handleCancelEdit = () => {
    setEditedPrompt(segment.prompt);
    setEditedAnimationPrompt(segment.animationPrompt);
    setIsEditingPrompt(false);
  };

  const handleRegenerateWithNewPrompt = () => {
    onUpdateSegmentPrompts(segment.id, editedPrompt, editedAnimationPrompt);
    setIsEditingPrompt(false);
    // Trigger regeneration after a small delay to let state update
    setTimeout(() => onRegenerateImage(segment), 50);
  };

  const isGenerating = segment.status === 'generating-image' || segment.status === 'generating-video';

  const handleGenerateAndSave = () => {
    onUpdateSegmentPrompts(segment.id, editedPrompt, editedAnimationPrompt);
    setIsEditingPrompt(false);
    setTimeout(() => onGenerateImage(segment), 50);
  };

  return (
    <div className="w-full max-w-6xl mx-auto animate-in fade-in zoom-in-95 duration-300">

      <button
        onClick={onBack}
        className="mb-6 flex items-center gap-2 text-zinc-400 hover:text-white transition-colors group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        Back to Timeline
      </button>

      <div className="flex flex-col items-center justify-center space-y-6">

          <div className="flex flex-col items-center text-center space-y-1">
              <span className="text-green-500 font-mono text-xs font-bold uppercase tracking-wider">
                {segment.formattedTime} • {segment.topic}
              </span>
              <h2 className="text-2xl font-bold text-white">
                  {segment.imageUrl ? 'Generated Overlay' : 'Segment Details'}
              </h2>
          </div>

          <div className="flex flex-col lg:flex-row gap-6 w-full justify-center items-start">
              {/* Original Video Context */}
              {originalVideoUrl && (
                  <div className="flex flex-col gap-2 flex-1 w-full max-w-lg">
                      <div className="flex justify-between items-center px-1">
                          <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Context (Input)</span>
                          <button onClick={handleReplay} className="text-xs text-zinc-400 hover:text-white flex items-center gap-1"><Play className="w-3 h-3" /> Replay Segment</button>
                      </div>
                      <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-zinc-800">
                          <video
                              ref={videoRef}
                              src={originalVideoUrl}
                              className="w-full h-full object-contain opacity-80"
                              controls
                              playsInline
                          />
                      </div>
                      <p className="text-xs text-zinc-500 mt-2 italic">
                        " {segment.description} "
                      </p>
                  </div>
              )}

              {/* Generated Result (Image or Video) OR Placeholder */}
              <div className="flex flex-col gap-2 flex-1 w-full max-w-lg">
                   <span className="text-xs font-bold text-green-500 uppercase tracking-widest text-center lg:text-left">
                       {segment.videoUrl ? 'Green Screen Animation' : segment.imageUrl ? 'Green Screen Overlay' : 'Preview Area'}
                   </span>

                  <div className="relative aspect-video bg-black rounded-xl overflow-hidden shadow-2xl shadow-green-900/20 border border-zinc-700">
                      {segment.videoUrl ? (
                          <video
                            src={segment.videoUrl}
                            className="w-full h-full object-contain"
                            autoPlay
                            loop
                            muted
                            playsInline
                            controls
                          />
                      ) : segment.imageUrl ? (
                          <img
                              src={segment.imageUrl}
                              alt="Generated Green Screen Asset"
                              className="w-full h-full object-contain"
                          />
                      ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500">
                            {isGenerating ? (
                              <>
                                <Loader2 className="w-12 h-12 animate-spin text-green-500 mb-3" />
                                <span className="text-sm">Generating image...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-12 h-12 mb-3 opacity-30" />
                                <span className="text-sm">No image generated yet</span>
                                <span className="text-xs text-zinc-600 mt-1">Edit prompts below, then generate</span>
                              </>
                            )}
                          </div>
                      )}
                  </div>

                  {/* Prompts Section - Editable */}
                  <div className="mt-4 space-y-3">
                    {/* Image Prompt */}
                    <div className="p-3 rounded-lg bg-green-900/10 border border-green-900/30">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-green-400" />
                          <h4 className="text-xs font-bold text-green-300 uppercase tracking-wider">Image Prompt</h4>
                        </div>
                        {!isEditingPrompt && !isGenerating && (
                          <button
                            onClick={() => setIsEditingPrompt(true)}
                            className="text-xs text-zinc-400 hover:text-white flex items-center gap-1"
                          >
                            <Pencil className="w-3 h-3" /> Edit
                          </button>
                        )}
                      </div>
                      {isEditingPrompt ? (
                        <textarea
                          value={editedPrompt}
                          onChange={(e) => setEditedPrompt(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 focus:outline-none focus:border-green-500 resize-none"
                          rows={2}
                        />
                      ) : (
                        <p className="text-sm text-zinc-300">{segment.prompt}</p>
                      )}
                    </div>

                    {/* Animation Prompt */}
                    <div className="p-3 rounded-lg bg-blue-900/10 border border-blue-900/30">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Move className="w-4 h-4 text-blue-400" />
                          <h4 className="text-xs font-bold text-blue-300 uppercase tracking-wider">Animation Prompt</h4>
                        </div>
                      </div>
                      {isEditingPrompt ? (
                        <textarea
                          value={editedAnimationPrompt}
                          onChange={(e) => setEditedAnimationPrompt(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 resize-none"
                          rows={2}
                        />
                      ) : (
                        <p className="text-sm text-zinc-300">{segment.animationPrompt}</p>
                      )}
                    </div>

                    {/* Edit Mode Actions */}
                    {isEditingPrompt && (
                      <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                          onClick={handleCancelEdit}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
                        >
                          <X className="w-3 h-3" /> Cancel
                        </button>
                        <button
                          onClick={handleSavePrompts}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 text-white rounded-full transition-colors"
                        >
                          <Check className="w-3 h-3" /> Save
                        </button>
                        <button
                          onClick={handleRegenerateWithNewPrompt}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-600 hover:bg-green-500 text-white rounded-full transition-colors"
                        >
                          <RefreshCw className="w-3 h-3" /> Save & Regenerate
                        </button>
                      </div>
                    )}
                  </div>
              </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-4 pt-4 border-t border-zinc-800 w-full justify-center">
              {/* Generate / Regenerate Button */}
              {!isEditingPrompt && (
                isGenerating ? (
                  <div className="flex items-center gap-2 text-zinc-400 text-sm font-medium px-4 py-3">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {segment.status === 'generating-image' ? 'Generating Image...' : 'Generating Animation...'}
                  </div>
                ) : segment.imageUrl ? (
                  <button
                    onClick={() => onRegenerateImage(segment)}
                    className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-3 px-6 rounded-full transition-colors border border-zinc-700"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Regenerate Image
                  </button>
                ) : (
                  <button
                    onClick={() => onGenerateImage(segment)}
                    className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white font-medium py-3 px-6 rounded-full transition-colors shadow-lg shadow-green-900/20"
                  >
                    <Sparkles className="w-4 h-4" />
                    Generate Image
                  </button>
                )
              )}

              {/* Animate Button - only show if image exists */}
              {segment.imageUrl && !segment.videoUrl && !isEditingPrompt && !isGenerating && (
                <button
                  onClick={() => onAnimate(segment)}
                  className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-6 rounded-full transition-colors shadow-lg shadow-blue-900/20"
                >
                  <Film className="w-4 h-4" />
                  Animate with Veo
                </button>
              )}

              {/* Download - only show if image exists */}
              {!isEditingPrompt && segment.imageUrl && (
                segment.videoUrl ? (
                   <a
                      href={segment.videoUrl}
                      download={`gemini-animation-${segment.formattedTime.replace(':','-')}.mp4`}
                      className="flex items-center justify-center gap-2 bg-white text-black font-bold py-3 px-8 rounded-full hover:bg-zinc-200 transition-colors"
                  >
                      <Download className="w-4 h-4" />
                      Download Video (MP4)
                  </a>
                ) : (
                  <a
                      href={segment.imageUrl}
                      download={`gemini-overlay-${segment.formattedTime.replace(':','-')}.png`}
                      className="flex items-center justify-center gap-2 bg-white text-black font-bold py-3 px-8 rounded-full hover:bg-zinc-200 transition-colors"
                  >
                      <Download className="w-4 h-4" />
                      Download Image
                  </a>
                )
              )}
          </div>
      </div>
    </div>
  );
};

export default VeoGenerator;
