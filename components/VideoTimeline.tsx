import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AnalysisResult, Segment } from '../types';
import { formatTime } from '../utils/videoUtils';
import {
  Play, Pause, SkipBack, SkipForward,
  Layers, Film, Sparkles, Eye, Loader2,
  ZoomIn, ZoomOut, Maximize2, Volume2, VolumeX,
  ChevronDown, ChevronRight, Diamond, Move
} from 'lucide-react';

interface VideoTimelineProps {
  videoUrl: string;
  videoDuration: number;
  analysis: AnalysisResult;
  onGenerateSegmentImage: (segment: Segment) => void;
  onGenerateSegmentVideo: (segment: Segment) => void;
  onViewSegment: (segment: Segment) => void;
  onBatchGenerateImages: () => void;
  onBatchAnimate: () => void;
  isBatchProcessing: boolean;
  disabled: boolean;
}

const VideoTimeline: React.FC<VideoTimelineProps> = ({
  videoUrl,
  videoDuration,
  analysis,
  onGenerateSegmentImage,
  onGenerateSegmentVideo,
  onViewSegment,
  onBatchGenerateImages,
  onBatchAnimate,
  isBatchProcessing,
  disabled
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayVideoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null);
  const [hoveredSegment, setHoveredSegment] = useState<Segment | null>(null);
  const [videoLayerExpanded, setVideoLayerExpanded] = useState(true);
  const [animationLayerExpanded, setAnimationLayerExpanded] = useState(true);
  const [showOverlay, setShowOverlay] = useState(true);

  // Calculate active segment based on current time
  const activeSegment = analysis.segments.find((segment, index) => {
    const nextSegment = analysis.segments[index + 1];
    const segmentEnd = nextSegment ? nextSegment.timestamp : videoDuration;
    return currentTime >= segment.timestamp && currentTime < segmentEnd;
  });

  // Sync video time with state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (!isDragging) {
        setCurrentTime(video.currentTime);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
    };
  }, [isDragging]);

  // Play/Pause controls
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  // Seek to time
  const seekTo = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;

    const clampedTime = Math.max(0, Math.min(time, videoDuration));
    video.currentTime = clampedTime;
    setCurrentTime(clampedTime);
  }, [videoDuration]);

  // Skip forward/backward
  const skip = (seconds: number) => {
    seekTo(currentTime + seconds);
  };

  // Jump to segment
  const jumpToSegment = (segment: Segment) => {
    seekTo(segment.timestamp);
    setSelectedSegment(segment);
  };

  // Timeline click handler
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const time = percentage * videoDuration;
    seekTo(time);
  };

  // Playhead drag handlers
  const handlePlayheadMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);

    const handleMouseMove = (e: MouseEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const percentage = x / rect.width;
      const time = percentage * videoDuration;
      seekTo(time);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Generate time markers
  const generateTimeMarkers = () => {
    const markers = [];
    const interval = videoDuration > 300 ? 60 : videoDuration > 60 ? 10 : 5;
    const scaledDuration = videoDuration * zoom;

    for (let i = 0; i <= videoDuration; i += interval) {
      const percentage = (i / videoDuration) * 100;
      markers.push(
        <div
          key={i}
          className="absolute flex flex-col items-center"
          style={{ left: `${percentage}%` }}
        >
          <div className="w-px h-2 bg-zinc-600" />
          <span className="text-[10px] text-zinc-500 mt-0.5 font-mono">
            {formatTime(i)}
          </span>
        </div>
      );
    }
    return markers;
  };

  // Get segment status color
  const getSegmentColor = (segment: Segment) => {
    switch (segment.status) {
      case 'idle': return 'bg-zinc-600 border-zinc-500';
      case 'generating-image': return 'bg-yellow-600/50 border-yellow-500 animate-pulse';
      case 'image-success': return 'bg-green-600/50 border-green-500';
      case 'generating-video': return 'bg-blue-600/50 border-blue-500 animate-pulse';
      case 'video-success': return 'bg-purple-600/50 border-purple-500';
      case 'error': return 'bg-red-600/50 border-red-500';
      default: return 'bg-zinc-600 border-zinc-500';
    }
  };

  // Get segment status icon
  const getSegmentIcon = (segment: Segment) => {
    switch (segment.status) {
      case 'generating-image':
      case 'generating-video':
        return <Loader2 className="w-3 h-3 animate-spin" />;
      case 'image-success':
        return <Sparkles className="w-3 h-3" />;
      case 'video-success':
        return <Film className="w-3 h-3" />;
      default:
        return <Diamond className="w-3 h-3" />;
    }
  };

  // Calculate segment width on timeline
  const getSegmentWidth = (segment: Segment, index: number) => {
    const nextSegment = analysis.segments[index + 1];
    const segmentEnd = nextSegment ? nextSegment.timestamp : videoDuration;
    const duration = segmentEnd - segment.timestamp;
    return (duration / videoDuration) * 100;
  };

  const playheadPosition = (currentTime / videoDuration) * 100;

  // Count stats
  const idleCount = analysis.segments.filter(s => s.status === 'idle').length;
  const readyToAnimateCount = analysis.segments.filter(s => s.status === 'image-success').length;
  const completedCount = analysis.segments.filter(s => s.status === 'video-success').length;

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Preview Area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Video Preview with Overlay */}
        <div className="bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800">
          <div className="flex items-center justify-between px-3 py-2 bg-zinc-800/50 border-b border-zinc-700">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-zinc-300">Preview</span>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-zinc-500">Show Overlay</span>
              <input
                type="checkbox"
                checked={showOverlay}
                onChange={(e) => setShowOverlay(e.target.checked)}
                className="w-4 h-4 rounded bg-zinc-700 border-zinc-600 text-purple-500 focus:ring-purple-500"
              />
            </label>
          </div>
          <div className="relative aspect-video bg-black">
            {/* Main Video */}
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full h-full object-contain"
              muted={isMuted}
              playsInline
            />

            {/* Overlay - Animation Preview */}
            {showOverlay && activeSegment && (activeSegment.videoUrl || activeSegment.imageUrl) && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {activeSegment.videoUrl ? (
                  <video
                    ref={overlayVideoRef}
                    src={activeSegment.videoUrl}
                    className="max-w-full max-h-full object-contain mix-blend-screen"
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                ) : activeSegment.imageUrl ? (
                  <img
                    src={activeSegment.imageUrl}
                    alt="Overlay"
                    className="max-w-[60%] max-h-[60%] object-contain"
                    style={{
                      mixBlendMode: 'screen',
                      filter: 'drop-shadow(0 0 10px rgba(0,255,0,0.3))'
                    }}
                  />
                ) : null}
              </div>
            )}

            {/* Current Segment Info Overlay */}
            {activeSegment && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                <div className="flex items-center gap-2 text-white">
                  <span className="px-2 py-0.5 bg-purple-500/80 rounded text-xs font-mono">
                    {activeSegment.formattedTime}
                  </span>
                  <span className="font-semibold truncate">{activeSegment.topic}</span>
                </div>
              </div>
            )}
          </div>

          {/* Playback Controls */}
          <div className="flex items-center justify-between px-4 py-3 bg-zinc-800/30">
            <div className="flex items-center gap-2">
              <button
                onClick={() => skip(-5)}
                className="p-2 rounded-lg hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
              >
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                onClick={togglePlay}
                className="p-3 rounded-full bg-white text-black hover:bg-zinc-200 transition-colors"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </button>
              <button
                onClick={() => skip(5)}
                className="p-2 rounded-lg hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-sm font-mono text-zinc-400">
                {formatTime(currentTime)} / {formatTime(videoDuration)}
              </span>
              <button
                onClick={toggleMute}
                className="p-2 rounded-lg hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Segment Info Panel */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/50 border-b border-zinc-700">
            <Layers className="w-4 h-4 text-green-400" />
            <span className="text-sm font-medium text-zinc-300">Active Segment</span>
          </div>

          {activeSegment ? (
            <div className="p-4 space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-zinc-700 rounded text-xs font-mono text-zinc-300">
                    {activeSegment.formattedTime}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    activeSegment.status === 'video-success' ? 'bg-purple-500/20 text-purple-300' :
                    activeSegment.status === 'image-success' ? 'bg-green-500/20 text-green-300' :
                    activeSegment.status.includes('generating') ? 'bg-yellow-500/20 text-yellow-300' :
                    'bg-zinc-700 text-zinc-400'
                  }`}>
                    {activeSegment.status.replace('-', ' ')}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white">{activeSegment.topic}</h3>
                <p className="text-sm text-zinc-400 mt-1">{activeSegment.description}</p>
              </div>

              <div className="space-y-2">
                <div className="p-3 bg-zinc-800/50 rounded-lg">
                  <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
                    <Sparkles className="w-3 h-3" />
                    Image Prompt
                  </div>
                  <p className="text-sm text-zinc-300">{activeSegment.prompt}</p>
                </div>
                {activeSegment.animationPrompt && (
                  <div className="p-3 bg-blue-900/20 rounded-lg border border-blue-500/20">
                    <div className="flex items-center gap-2 text-xs text-blue-400 mb-1">
                      <Move className="w-3 h-3" />
                      Animation
                    </div>
                    <p className="text-sm text-blue-200">{activeSegment.animationPrompt}</p>
                  </div>
                )}
              </div>

              {/* Thumbnail Preview */}
              {activeSegment.imageUrl && (
                <div className="relative">
                  <div className="aspect-video bg-black rounded-lg overflow-hidden border border-zinc-700">
                    {activeSegment.videoUrl ? (
                      <video
                        src={activeSegment.videoUrl}
                        className="w-full h-full object-contain"
                        autoPlay
                        loop
                        muted
                      />
                    ) : (
                      <img
                        src={activeSegment.imageUrl}
                        className="w-full h-full object-contain"
                        alt="Generated overlay"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2">
                {activeSegment.status === 'idle' && (
                  <button
                    onClick={() => onGenerateSegmentImage(activeSegment)}
                    disabled={disabled || isBatchProcessing}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-sm font-medium transition-all"
                  >
                    <Sparkles className="w-4 h-4" />
                    Generate Image
                  </button>
                )}
                {activeSegment.status === 'image-success' && (
                  <button
                    onClick={() => onGenerateSegmentVideo(activeSegment)}
                    disabled={disabled || isBatchProcessing}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-medium transition-all"
                  >
                    <Film className="w-4 h-4" />
                    Animate with Veo
                  </button>
                )}
                {(activeSegment.status === 'image-success' || activeSegment.status === 'video-success') && (
                  <button
                    onClick={() => onViewSegment(activeSegment)}
                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    View
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-zinc-500">
              <Layers className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Scrub the timeline to preview segments</p>
            </div>
          )}
        </div>
      </div>

      {/* Batch Actions Bar */}
      <div className="flex items-center justify-between bg-zinc-900/50 border border-zinc-800 rounded-xl p-3">
        <div className="flex items-center gap-4">
          <div className="text-sm">
            <span className="text-zinc-500">Segments: </span>
            <span className="text-white font-medium">{analysis.segments.length}</span>
          </div>
          <div className="h-4 w-px bg-zinc-700" />
          <div className="text-sm">
            <span className="text-zinc-500">Images: </span>
            <span className="text-green-400 font-medium">{analysis.segments.length - idleCount}</span>
          </div>
          <div className="h-4 w-px bg-zinc-700" />
          <div className="text-sm">
            <span className="text-zinc-500">Animated: </span>
            <span className="text-purple-400 font-medium">{completedCount}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!isBatchProcessing && idleCount > 0 && (
            <button
              onClick={onBatchGenerateImages}
              disabled={disabled}
              className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold py-2 px-4 rounded-lg transition-all text-sm"
            >
              <Sparkles className="w-4 h-4" />
              Generate All Images ({idleCount})
            </button>
          )}
          {!isBatchProcessing && readyToAnimateCount > 0 && (
            <button
              onClick={onBatchAnimate}
              disabled={disabled}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-2 px-4 rounded-lg transition-all text-sm"
            >
              <Film className="w-4 h-4" />
              Animate All ({readyToAnimateCount})
            </button>
          )}
          {isBatchProcessing && (
            <div className="flex items-center gap-2 px-4 py-2 bg-zinc-800 rounded-lg border border-zinc-700">
              <Loader2 className="w-4 h-4 animate-spin text-green-400" />
              <span className="text-sm text-zinc-300">Processing...</span>
            </div>
          )}
        </div>
      </div>

      {/* Timeline Editor */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        {/* Timeline Header with Zoom Controls */}
        <div className="flex items-center justify-between px-3 py-2 bg-zinc-800/50 border-b border-zinc-700">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-zinc-300">Timeline</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
              className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs text-zinc-500 w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom(Math.min(3, zoom + 0.25))}
              className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoom(1)}
              className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Time Ruler */}
        <div className="relative h-6 bg-zinc-800/30 border-b border-zinc-700 overflow-hidden">
          <div
            className="relative h-full"
            style={{ width: `${zoom * 100}%` }}
          >
            {generateTimeMarkers()}
          </div>
        </div>

        {/* Timeline Tracks */}
        <div
          ref={timelineRef}
          className="relative cursor-crosshair select-none"
          onClick={handleTimelineClick}
          style={{ minWidth: `${zoom * 100}%` }}
        >
          {/* Video Track */}
          <div className="border-b border-zinc-700">
            <div
              className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/30 cursor-pointer hover:bg-zinc-800/50"
              onClick={(e) => { e.stopPropagation(); setVideoLayerExpanded(!videoLayerExpanded); }}
            >
              {videoLayerExpanded ? <ChevronDown className="w-3 h-3 text-zinc-500" /> : <ChevronRight className="w-3 h-3 text-zinc-500" />}
              <Film className="w-3 h-3 text-purple-400" />
              <span className="text-xs font-medium text-zinc-400">Video</span>
            </div>
            {videoLayerExpanded && (
              <div className="relative h-12 bg-zinc-800/20">
                {/* Video track visualization */}
                <div className="absolute inset-y-2 inset-x-2 bg-purple-900/30 rounded border border-purple-500/30 flex items-center px-2">
                  <div className="flex items-center gap-2">
                    <Film className="w-4 h-4 text-purple-400" />
                    <span className="text-xs text-purple-300">Source Video • {formatTime(videoDuration)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Animation Overlay Track */}
          <div className="border-b border-zinc-700">
            <div
              className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/30 cursor-pointer hover:bg-zinc-800/50"
              onClick={(e) => { e.stopPropagation(); setAnimationLayerExpanded(!animationLayerExpanded); }}
            >
              {animationLayerExpanded ? <ChevronDown className="w-3 h-3 text-zinc-500" /> : <ChevronRight className="w-3 h-3 text-zinc-500" />}
              <Sparkles className="w-3 h-3 text-green-400" />
              <span className="text-xs font-medium text-zinc-400">Animation Overlays</span>
            </div>
            {animationLayerExpanded && (
              <div className="relative h-16 bg-zinc-800/20">
                {/* Segment blocks */}
                {analysis.segments.map((segment, index) => {
                  const left = (segment.timestamp / videoDuration) * 100;
                  const width = getSegmentWidth(segment, index);
                  const isActive = activeSegment?.id === segment.id;
                  const isHovered = hoveredSegment?.id === segment.id;
                  const isSelected = selectedSegment?.id === segment.id;

                  return (
                    <div
                      key={segment.id}
                      className={`absolute top-2 bottom-2 rounded-lg border transition-all cursor-pointer ${getSegmentColor(segment)} ${
                        isActive ? 'ring-2 ring-white/50' : ''
                      } ${isSelected ? 'ring-2 ring-blue-500' : ''} ${
                        isHovered ? 'scale-[1.02] z-10' : ''
                      }`}
                      style={{ left: `${left}%`, width: `${Math.max(width, 2)}%` }}
                      onClick={(e) => { e.stopPropagation(); jumpToSegment(segment); }}
                      onMouseEnter={() => setHoveredSegment(segment)}
                      onMouseLeave={() => setHoveredSegment(null)}
                      title={`${segment.topic} (${segment.formattedTime})`}
                    >
                      <div className="h-full flex items-center gap-1 px-2 overflow-hidden">
                        {getSegmentIcon(segment)}
                        <span className="text-xs font-medium truncate text-white/90">
                          {segment.topic}
                        </span>
                      </div>

                      {/* Keyframe diamond */}
                      <div className="absolute -top-1 left-0 transform -translate-x-1/2">
                        <Diamond className={`w-3 h-3 ${
                          segment.status === 'video-success' ? 'text-purple-400 fill-purple-400' :
                          segment.status === 'image-success' ? 'text-green-400 fill-green-400' :
                          'text-zinc-500 fill-zinc-500'
                        }`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
            style={{ left: `${playheadPosition}%` }}
          >
            {/* Playhead handle */}
            <div
              className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-red-500 rounded-sm rotate-45 cursor-ew-resize pointer-events-auto"
              onMouseDown={handlePlayheadMouseDown}
            />
          </div>
        </div>

        {/* Segment Keyframe List */}
        <div className="p-3 bg-zinc-800/20 border-t border-zinc-700">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {analysis.segments.map((segment) => (
              <button
                key={segment.id}
                onClick={() => jumpToSegment(segment)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  activeSegment?.id === segment.id
                    ? 'bg-white text-black'
                    : selectedSegment?.id === segment.id
                    ? 'bg-blue-500 text-white'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                <span className="font-mono text-[10px] opacity-70">{segment.formattedTime}</span>
                <span className="truncate max-w-[100px]">{segment.topic}</span>
                {getSegmentIcon(segment)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Hover Tooltip */}
      {hoveredSegment && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-zinc-900 border border-zinc-700 rounded-lg p-3 shadow-xl z-50 max-w-sm">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs text-zinc-500">{hoveredSegment.formattedTime}</span>
            <span className="font-bold text-white">{hoveredSegment.topic}</span>
          </div>
          <p className="text-xs text-zinc-400 line-clamp-2">{hoveredSegment.description}</p>
        </div>
      )}
    </div>
  );
};

export default VideoTimeline;
