
import React, { useRef, useEffect } from 'react';
import { Download, ArrowLeft, Play, Move, Film, Loader2 } from 'lucide-react';
import { Segment } from '../types';

interface VeoGeneratorProps {
  segment: Segment;
  originalVideoUrl: string | null;
  onBack: () => void;
  onAnimate: (segment: Segment) => void;
}

const VeoGenerator: React.FC<VeoGeneratorProps> = ({ segment, originalVideoUrl, onBack, onAnimate }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Auto-seek to the timestamp when mounted
  useEffect(() => {
    if (videoRef.current && segment.timestamp) {
      videoRef.current.currentTime = segment.timestamp;
    }
  }, [segment.timestamp]);

  const handleReplay = () => {
    if (videoRef.current) {
        videoRef.current.currentTime = segment.timestamp;
        videoRef.current.play();
    }
  }

  if (!segment.imageUrl) return null;

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
                  Generated Overlay
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

              {/* Generated Result (Image or Video) */}
              <div className="flex flex-col gap-2 flex-1 w-full max-w-lg">
                   <span className="text-xs font-bold text-green-500 uppercase tracking-widest text-center lg:text-left">
                       {segment.videoUrl ? 'Green Screen Animation' : 'Green Screen Overlay'}
                   </span>
                  
                  <div className="relative aspect-video bg-black rounded-xl overflow-hidden shadow-2xl shadow-green-900/20 border border-green-500/50">
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
                      ) : (
                          <img 
                              src={segment.imageUrl} 
                              alt="Generated Green Screen Asset"
                              className="w-full h-full object-contain" 
                          />
                      )}
                  </div>

                  {/* Animation Guide / Action */}
                  <div className="mt-2 p-3 rounded-lg bg-blue-900/10 border border-blue-900/30 flex items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <div className="p-1.5 bg-blue-500/20 rounded-md shrink-0">
                            <Move className="w-4 h-4 text-blue-400" />
                        </div>
                        <div>
                            <h4 className="text-xs font-bold text-blue-300 uppercase tracking-wider mb-0.5">Animation Guide</h4>
                            <p className="text-sm text-zinc-300">{segment.animationPrompt}</p>
                        </div>
                    </div>
                    
                    {/* Animate Button in Detail View */}
                    {!segment.videoUrl && (
                        segment.status === 'generating-video' ? (
                            <div className="flex items-center gap-2 text-blue-400 text-xs font-bold px-4 py-2">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Animating...
                            </div>
                        ) : (
                            <button 
                                onClick={() => onAnimate(segment)}
                                className="shrink-0 flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 px-4 rounded-full transition-colors shadow-lg shadow-blue-900/20"
                            >
                                <Film className="w-3 h-3" />
                                Animate
                            </button>
                        )
                    )}
                  </div>
              </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-4 border-t border-zinc-800 w-full justify-center">
              {segment.videoUrl ? (
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
              )}
          </div>
      </div>
    </div>
  );
};

export default VeoGenerator;
