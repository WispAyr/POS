import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight } from 'lucide-react';

interface ImageZoomModalProps {
  images: Array<{ url: string; type: string; label?: string }>;
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
}

export function ImageZoomModal({
  images,
  initialIndex = 0,
  isOpen,
  onClose,
}: ImageZoomModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset state when modal opens or image changes
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
      setScale(1);
      setRotation(0);
      setPosition({ x: 0, y: 0 });
      setIsLoading(true);
    }
  }, [isOpen, initialIndex]);

  // Reset transform when changing images
  useEffect(() => {
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
    setIsLoading(true);
  }, [currentIndex]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          if (currentIndex > 0) setCurrentIndex((i) => i - 1);
          break;
        case 'ArrowRight':
          if (currentIndex < images.length - 1) setCurrentIndex((i) => i + 1);
          break;
        case '+':
        case '=':
          setScale((s) => Math.min(s + 0.25, 5));
          break;
        case '-':
          setScale((s) => Math.max(s - 0.25, 0.5));
          break;
        case 'r':
          setRotation((r) => (r + 90) % 360);
          break;
        case '0':
          setScale(1);
          setRotation(0);
          setPosition({ x: 0, y: 0 });
          break;
      }
    },
    [isOpen, currentIndex, images.length, onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Mouse drag for panning
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale((s) => Math.max(0.5, Math.min(5, s + delta)));
  };

  // Double click to zoom
  const handleDoubleClick = () => {
    if (scale === 1) {
      setScale(2);
    } else {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  };

  if (!isOpen || images.length === 0) return null;

  const currentImage = images[currentIndex];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/50 backdrop-blur-sm">
        <div className="text-white">
          <span className="font-medium">
            {currentImage.label || currentImage.type || `Image ${currentIndex + 1}`}
          </span>
          {images.length > 1 && (
            <span className="text-gray-400 ml-2">
              {currentIndex + 1} / {images.length}
            </span>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScale((s) => Math.max(s - 0.25, 0.5))}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="Zoom out (-)"
          >
            <ZoomOut size={20} />
          </button>
          <span className="text-white/70 text-sm min-w-[50px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(s + 0.25, 5))}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="Zoom in (+)"
          >
            <ZoomIn size={20} />
          </button>
          <div className="w-px h-6 bg-white/20 mx-2" />
          <button
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="Rotate (R)"
          >
            <RotateCw size={20} />
          </button>
          <div className="w-px h-6 bg-white/20 mx-2" />
          <button
            onClick={onClose}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="Close (Escape)"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Main Image Area */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden flex items-center justify-center"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in' }}
      >
        {/* Loading spinner */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {/* Image */}
        <img
          src={currentImage.url}
          alt={currentImage.label || currentImage.type}
          className="max-w-none select-none transition-opacity duration-300"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
            opacity: isLoading ? 0 : 1,
            maxHeight: '85vh',
            maxWidth: '90vw',
          }}
          onLoad={() => setIsLoading(false)}
          onError={() => setIsLoading(false)}
          draggable={false}
        />

        {/* Navigation arrows */}
        {images.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (currentIndex > 0) setCurrentIndex((i) => i - 1);
              }}
              disabled={currentIndex === 0}
              className="absolute left-4 p-3 bg-black/50 hover:bg-black/70 text-white rounded-full disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft size={24} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (currentIndex < images.length - 1) setCurrentIndex((i) => i + 1);
              }}
              disabled={currentIndex === images.length - 1}
              className="absolute right-4 p-3 bg-black/50 hover:bg-black/70 text-white rounded-full disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight size={24} />
            </button>
          </>
        )}
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="px-4 py-3 bg-black/50 backdrop-blur-sm">
          <div className="flex justify-center gap-2 overflow-x-auto pb-1">
            {images.map((img, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={`
                  relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all
                  ${idx === currentIndex ? 'border-blue-500 ring-2 ring-blue-500/50' : 'border-transparent hover:border-white/30'}
                `}
              >
                <img
                  src={img.url}
                  alt={img.label || img.type}
                  className="w-full h-full object-cover"
                />
                {img.label && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] px-1 py-0.5 truncate">
                    {img.label}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Keyboard hints */}
      <div className="absolute bottom-20 left-4 text-white/40 text-xs space-y-1">
        <div>Arrow keys: Navigate</div>
        <div>+/- or scroll: Zoom</div>
        <div>R: Rotate | 0: Reset</div>
        <div>Double-click: Toggle zoom</div>
      </div>
    </div>
  );
}

export default ImageZoomModal;
