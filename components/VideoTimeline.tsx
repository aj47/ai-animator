
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AnalysisResult, Segment } from '../types';
import {
  Play, Pause, SkipBack, SkipForward,
  Layers, Film, Image, Video,
  ChevronLeft, ChevronRight,
  ZoomIn, ZoomOut, Eye, EyeOff,
  Diamond, Sparkles, Move, Clock,
  Maximize2, Minimize2
} from 'lucide-react';
import { formatTime } from '../utils/videoUtils';

interface VideoTimelineProps {
  videoUrl: string;
  videoDuration: number;
  analysis: AnalysisResult;
  segments: Segment[];
  onBack: () => void;
  onSegmentClick: (segment: Segment) => void;
}

interface LayerVisibility {
  video: boolean;
  overlays: boolean;
  animations: boolean;
}

const VideoTimeline: React.FC<VideoTimelineProps> = ({
  videoUrl,
  videoDuration,
  analysis,
  segments,
  onBack,
  onSegmentClick
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayVideoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>({
    video: true,
    overlays: true,
    animations: true
  });
  const [activeKeyframe, setActiveKeyframe] = useState<Segment | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Calculate timeline width based on zoom
  const timelineWidth = Math.max(100, videoDuration * 50 * zoom);

  // Pixels per second
  const pixelsPerSecond = timelineWidth / videoDuration;

  // Update current time from video
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);

      // Find if we're at a keyframe
      const activeSegment = segments.find(s =>
        Math.abs(s.timestamp - video.currentTime) < 0.5
      );
      if (activeSegment !== activeKeyframe) {
        setActiveKeyframe(activeSegment || null);
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [segments, activeKeyframe]);

  // Sync overlay video with main video
  useEffect(() => {
    if (overlayVideoRef.current && activeKeyframe?.videoUrl) {
      if (isPlaying) {
        overlayVideoRef.current.play().catch(() => {});
      } else {
        overlayVideoRef.current.pause();
      }
    }
  }, [isPlaying, activeKeyframe]);

  // Toggle play/pause
  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
  }, [isPlaying]);

  // Seek to time
  const seekTo = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;

    video.currentTime = Math.max(0, Math.min(time, videoDuration));
  }, [videoDuration]);

  // Jump to previous/next keyframe
  const jumpToKeyframe = useCallback((direction: 'prev' | 'next') => {
    const sortedSegments = [...segments].sort((a, b) => a.timestamp - b.timestamp);

    if (direction === 'prev') {
      const prev = sortedSegments.reverse().find(s => s.timestamp < currentTime - 0.5);
      if (prev) seekTo(prev.timestamp);
      else seekTo(0);
    } else {
      const next = sortedSegments.find(s => s.timestamp > currentTime + 0.5);
      if (next) seekTo(next.timestamp);
    }
  }, [segments, currentTime, seekTo]);

  // Handle timeline click/drag
  const handleTimelineInteraction = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const scrollLeft = timelineRef.current.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft;
    const time = (x / timelineWidth) * videoDuration;

    seekTo(time);
  }, [timelineWidth, videoDuration, seekTo]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handleTimelineInteraction(e);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        handleTimelineInteraction(e);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleTimelineInteraction]);

  // Toggle layer visibility
  const toggleLayer = (layer: keyof LayerVisibility) => {
    setLayerVisibility(prev => ({ ...prev, [layer]: !prev[layer] }));
  };

  // Get current overlay/animation for preview
  const getCurrentOverlay = (): Segment | null => {
    // Find the segment that's closest to current time (within a reasonable range)
    const activeSegment = segments.find(s =>
      currentTime >= s.timestamp && currentTime < s.timestamp + 5
    );
    return activeSegment || null;
  };

  const currentOverlay = getCurrentOverlay();

  // Generate time markers
  const generateTimeMarkers = () => {
    const markers = [];
    const interval = zoom > 2 ? 1 : zoom > 1 ? 2 : 5; // seconds

    for (let i = 0; i <= videoDuration; i += interval) {
      markers.push(
        <div
          key={i}
          className="absolute top-0 h-full flex flex-col items-center"
          style={{ left: `${(i / videoDuration) * 100}%` }}
        >
          <span className="text-[10px] text-zinc-500 font-mono">{formatTime(i)}</span>
          <div className="w-px h-2 bg-zinc-700" />
        </div>
      );
    }
    return markers;
  };

  return (
    <div className="w-full h-full flex flex-col bg-zinc-950 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Timeline
        </button>

        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-400">Video Editor</span>
          <span className="text-xs font-mono text-zinc-600">|</span>
          <span className="text-xs font-mono text-green-400">{segments.length} keyframes</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono text-zinc-500 w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom(z => Math.min(4, z + 0.25))}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Preview Panel */}
        <div className={`${isFullscreen ? 'flex-1' : 'w-1/2'} flex flex-col border-r border-zinc-800`}>
          {/* Video Preview with Overlay */}
          <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
            {/* Base Video */}
            {layerVisibility.video && (
              <video
                ref={videoRef}
                src={videoUrl}
                className="max-w-full max-h-full object-contain"
                playsInline
                muted
              />
            )}

            {/* Overlay Image */}
            {layerVisibility.overlays && currentOverlay?.imageUrl && !currentOverlay?.videoUrl && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <img
                  src={currentOverlay.imageUrl}
                  alt="Overlay"
                  className="max-w-full max-h-full object-contain mix-blend-screen"
                  style={{ opacity: 0.9 }}
                />
              </div>
            )}

            {/* Animation Video Overlay */}
            {layerVisibility.animations && currentOverlay?.videoUrl && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <video
                  ref={overlayVideoRef}
                  src={currentOverlay.videoUrl}
                  className="max-w-full max-h-full object-contain mix-blend-screen"
                  style={{ opacity: 0.9 }}
                  loop
                  muted
                  playsInline
                />
              </div>
            )}

            {/* Current Keyframe Info */}
            {activeKeyframe && (
              <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2 border border-zinc-700">
                <div className="flex items-center gap-2 text-xs">
                  <Diamond className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                  <span className="text-white font-medium">{activeKeyframe.topic}</span>
                  <span className="text-zinc-400 font-mono">{activeKeyframe.formattedTime}</span>
                </div>
              </div>
            )}

            {/* Fullscreen Toggle */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 rounded-lg text-zinc-400 hover:text-white transition-colors"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Time Display */}
            <div className="absolute bottom-4 left-4 bg-black/70 backdrop-blur-sm rounded-lg px-3 py-1.5 font-mono text-sm text-white">
              {formatTime(currentTime)} / {formatTime(videoDuration)}
            </div>
          </div>

          {/* Playback Controls */}
          <div className="h-16 flex items-center justify-center gap-4 bg-zinc-900/50 border-t border-zinc-800">
            <button
              onClick={() => seekTo(0)}
              className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
              title="Go to Start"
            >
              <SkipBack className="w-5 h-5" />
            </button>

            <button
              onClick={() => jumpToKeyframe('prev')}
              className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
              title="Previous Keyframe"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <button
              onClick={togglePlayPause}
              className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white shadow-lg shadow-purple-900/30 hover:scale-105 transition-transform"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>

            <button
              onClick={() => jumpToKeyframe('next')}
              className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
              title="Next Keyframe"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <button
              onClick={() => seekTo(videoDuration)}
              className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
              title="Go to End"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Right Panel - Layer Controls & Keyframe List */}
        {!isFullscreen && (
          <div className="w-1/2 flex flex-col overflow-hidden">
            {/* Layer Visibility */}
            <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/30">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Layers className="w-3 h-3" />
                Layer Visibility
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleLayer('video')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    layerVisibility.video
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                  }`}
                >
                  {layerVisibility.video ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  Video
                </button>
                <button
                  onClick={() => toggleLayer('overlays')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    layerVisibility.overlays
                      ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                      : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                  }`}
                >
                  {layerVisibility.overlays ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  Overlays
                </button>
                <button
                  onClick={() => toggleLayer('animations')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    layerVisibility.animations
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                  }`}
                >
                  {layerVisibility.animations ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  Animations
                </button>
              </div>
            </div>

            {/* Keyframe List */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Diamond className="w-3 h-3" />
                Keyframes ({segments.length})
              </h3>
              <div className="space-y-2">
                {segments.map((segment) => (
                  <button
                    key={segment.id}
                    onClick={() => {
                      seekTo(segment.timestamp);
                      onSegmentClick(segment);
                    }}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      activeKeyframe?.id === segment.id
                        ? 'bg-purple-900/20 border-purple-500/50'
                        : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Thumbnail */}
                      <div className="w-16 h-10 rounded overflow-hidden bg-zinc-800 flex-shrink-0 relative">
                        {segment.imageUrl ? (
                          <img src={segment.imageUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-600">
                            <Image className="w-4 h-4" />
                          </div>
                        )}
                        {segment.videoUrl && (
                          <div className="absolute bottom-0.5 right-0.5 bg-blue-500 rounded px-1">
                            <Film className="w-2 h-2 text-white" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-zinc-400">{segment.formattedTime}</span>
                          {segment.status === 'video-success' && (
                            <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded">Animated</span>
                          )}
                          {segment.status === 'image-success' && (
                            <span className="text-[10px] bg-green-500/20 text-green-300 px-1.5 py-0.5 rounded">Overlay</span>
                          )}
                        </div>
                        <h4 className="text-sm font-medium text-white truncate">{segment.topic}</h4>
                        <p className="text-xs text-zinc-500 truncate">{segment.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Timeline Track */}
      <div className="h-40 border-t border-zinc-800 bg-zinc-900/50 flex flex-col">
        {/* Track Labels */}
        <div className="flex border-b border-zinc-800">
          <div className="w-28 flex-shrink-0 border-r border-zinc-800" />
          <div
            ref={timelineRef}
            className="flex-1 relative overflow-x-auto cursor-pointer"
            style={{ height: '24px' }}
            onMouseDown={handleMouseDown}
          >
            <div
              className="relative h-full"
              style={{ width: `${timelineWidth}px` }}
            >
              {/* Time markers */}
              {generateTimeMarkers()}

              {/* Playhead */}
              <div
                className="absolute top-0 h-full w-0.5 bg-red-500 z-20 pointer-events-none"
                style={{ left: `${(currentTime / videoDuration) * 100}%` }}
              >
                <div className="w-3 h-3 bg-red-500 rounded-full -translate-x-[5px] -translate-y-0.5" />
              </div>
            </div>
          </div>
        </div>

        {/* Track Rows */}
        <div className="flex-1 flex overflow-hidden">
          {/* Track Labels Column */}
          <div className="w-28 flex-shrink-0 flex flex-col border-r border-zinc-800">
            {/* Video Track Label */}
            <div className="h-10 flex items-center gap-2 px-3 border-b border-zinc-800">
              <Video className="w-3 h-3 text-purple-400" />
              <span className="text-xs font-medium text-zinc-400">Video</span>
            </div>
            {/* Overlays Track Label */}
            <div className="h-10 flex items-center gap-2 px-3 border-b border-zinc-800">
              <Sparkles className="w-3 h-3 text-green-400" />
              <span className="text-xs font-medium text-zinc-400">Overlays</span>
            </div>
            {/* Animations Track Label */}
            <div className="h-10 flex items-center gap-2 px-3 border-b border-zinc-800">
              <Move className="w-3 h-3 text-blue-400" />
              <span className="text-xs font-medium text-zinc-400">Animations</span>
            </div>
          </div>

          {/* Track Content */}
          <div className="flex-1 overflow-x-auto overflow-y-hidden" onScroll={(e) => {
            // Sync scroll with time markers
            if (timelineRef.current) {
              timelineRef.current.scrollLeft = e.currentTarget.scrollLeft;
            }
          }}>
            <div
              className="h-full relative"
              style={{ width: `${timelineWidth}px` }}
              onMouseDown={handleMouseDown}
            >
              {/* Video Track */}
              <div className="h-10 relative border-b border-zinc-800">
                <div
                  className="absolute top-1 bottom-1 rounded bg-gradient-to-r from-purple-600/40 to-purple-500/40 border border-purple-500/30"
                  style={{ left: 0, right: 0 }}
                />
              </div>

              {/* Overlays Track */}
              <div className="h-10 relative border-b border-zinc-800">
                {segments.filter(s => s.imageUrl).map((segment) => (
                  <div
                    key={`overlay-${segment.id}`}
                    className={`absolute top-1 h-8 rounded cursor-pointer transition-all hover:ring-2 hover:ring-green-400 ${
                      activeKeyframe?.id === segment.id
                        ? 'bg-green-500/50 border-green-400'
                        : 'bg-green-600/30 border-green-500/30'
                    } border flex items-center px-2 gap-1`}
                    style={{
                      left: `${(segment.timestamp / videoDuration) * 100}%`,
                      width: `${Math.max(60, (5 / videoDuration) * 100)}%`,
                      maxWidth: '150px'
                    }}
                    onClick={() => seekTo(segment.timestamp)}
                    title={segment.topic}
                  >
                    <Diamond className="w-3 h-3 text-green-300 flex-shrink-0" />
                    <span className="text-[10px] text-green-200 truncate">{segment.topic}</span>
                  </div>
                ))}
              </div>

              {/* Animations Track */}
              <div className="h-10 relative border-b border-zinc-800">
                {segments.filter(s => s.videoUrl).map((segment) => (
                  <div
                    key={`anim-${segment.id}`}
                    className={`absolute top-1 h-8 rounded cursor-pointer transition-all hover:ring-2 hover:ring-blue-400 ${
                      activeKeyframe?.id === segment.id
                        ? 'bg-blue-500/50 border-blue-400'
                        : 'bg-blue-600/30 border-blue-500/30'
                    } border flex items-center px-2 gap-1`}
                    style={{
                      left: `${(segment.timestamp / videoDuration) * 100}%`,
                      width: `${Math.max(60, (5 / videoDuration) * 100)}%`,
                      maxWidth: '150px'
                    }}
                    onClick={() => seekTo(segment.timestamp)}
                    title={`${segment.topic} - Animation`}
                  >
                    <Film className="w-3 h-3 text-blue-300 flex-shrink-0" />
                    <span className="text-[10px] text-blue-200 truncate">{segment.topic}</span>
                  </div>
                ))}
              </div>

              {/* Playhead (on tracks) */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
                style={{ left: `${(currentTime / videoDuration) * 100}%` }}
              />

              {/* Keyframe markers */}
              {segments.map((segment) => (
                <div
                  key={`marker-${segment.id}`}
                  className="absolute top-0 bottom-0 w-px bg-yellow-500/30 pointer-events-none"
                  style={{ left: `${(segment.timestamp / videoDuration) * 100}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoTimeline;
