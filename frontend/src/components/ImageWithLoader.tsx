import { useState, useEffect } from 'react';
import { Camera, ImageOff } from 'lucide-react';

interface ImageWithLoaderProps {
    src: string | undefined;
    alt: string;
    className?: string;
    onClick?: () => void;
    showPlaceholderIcon?: boolean;
}

export function ImageWithLoader({
    src,
    alt,
    className = '',
    onClick,
    showPlaceholderIcon = true
}: ImageWithLoaderProps) {
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Reset states when src changes
        setIsLoading(true);
        setHasError(false);
        setIsVisible(false);
    }, [src]);

    if (!src) {
        return showPlaceholderIcon ? (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                <Camera className="w-12 h-12 text-gray-600 opacity-30" />
            </div>
        ) : null;
    }

    return (
        <div className="relative w-full h-full overflow-hidden">
            {/* Skeleton loader */}
            {isLoading && !hasError && (
                <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent skeleton-shimmer" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-10 h-10 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
                    </div>
                </div>
            )}

            {/* Error state */}
            {hasError && (
                <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                    <div className="text-center text-gray-500">
                        <ImageOff className="w-10 h-10 mx-auto mb-2 opacity-50" />
                        <span className="text-xs">Failed to load</span>
                    </div>
                </div>
            )}

            {/* Actual image */}
            <img
                src={src}
                alt={alt}
                className={`
                    ${className}
                    transition-all duration-500 ease-out
                    ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-105'}
                `}
                loading="lazy"
                onClick={onClick}
                onLoad={() => {
                    setIsLoading(false);
                    // Small delay for smoother transition
                    setTimeout(() => setIsVisible(true), 50);
                }}
                onError={() => {
                    setIsLoading(false);
                    setHasError(true);
                }}
            />
        </div>
    );
}

// Smaller variant for thumbnails
export function ThumbnailWithLoader({
    src,
    alt,
    className = '',
    onClick
}: ImageWithLoaderProps) {
    const [isLoading, setIsLoading] = useState(true);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        setIsLoading(true);
        setIsVisible(false);
    }, [src]);

    if (!src) return null;

    return (
        <div className="relative w-full h-full overflow-hidden bg-black">
            {isLoading && (
                <div className="absolute inset-0 bg-gray-800">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent skeleton-shimmer" />
                </div>
            )}
            <img
                src={src}
                alt={alt}
                className={`
                    ${className}
                    transition-all duration-300
                    ${isVisible ? 'opacity-100' : 'opacity-0'}
                `}
                loading="lazy"
                onClick={onClick}
                onLoad={() => {
                    setIsLoading(false);
                    setTimeout(() => setIsVisible(true), 30);
                }}
                onError={() => setIsLoading(false)}
            />
        </div>
    );
}
