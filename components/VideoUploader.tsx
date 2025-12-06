import React, { useCallback, useState } from 'react';
import { MAX_VIDEO_SIZE_MB } from '../constants';
import { Upload, FileVideo, AlertCircle } from 'lucide-react';

interface VideoUploaderProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
}

const VideoUploader: React.FC<VideoUploaderProps> = ({ onFileSelect, isLoading }) => {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const validateAndPass = (file: File) => {
    if (!file.type.startsWith('video/')) {
      setError("Please upload a video file.");
      return;
    }
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_VIDEO_SIZE_MB) {
      setError(`File too large (${sizeMB.toFixed(1)}MB). Max size is ${MAX_VIDEO_SIZE_MB}MB for browser processing.`);
      return;
    }
    setError(null);
    onFileSelect(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndPass(e.dataTransfer.files[0]);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndPass(e.target.files[0]);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      <div
        className={`relative group border-2 border-dashed rounded-2xl p-12 transition-all duration-300 ease-in-out
          ${dragActive ? 'border-pink-500 bg-pink-500/10 scale-[1.02]' : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-500'}
          ${isLoading ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}
        `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          accept="video/*"
          onChange={handleChange}
          disabled={isLoading}
        />
        
        <div className="flex flex-col items-center text-center space-y-4">
          <div className={`p-4 rounded-full transition-colors ${dragActive ? 'bg-pink-500/20' : 'bg-zinc-800'}`}>
            <Upload className={`w-8 h-8 ${dragActive ? 'text-pink-400' : 'text-zinc-400'}`} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white mb-1">Upload Video</h3>
            <p className="text-sm text-zinc-400">Drag & drop or click to browse</p>
          </div>
          <div className="text-xs text-zinc-500 px-4 py-2 bg-zinc-900 rounded-full border border-zinc-800">
            Max size: {MAX_VIDEO_SIZE_MB}MB • MP4, MOV, WebM
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-900/20 border border-red-900/50 rounded-lg flex items-center gap-3 text-red-400 animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}
    </div>
  );
};

export default VideoUploader;
