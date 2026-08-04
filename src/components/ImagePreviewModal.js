import React, { useEffect } from 'react';
import Image from 'next/image';

const ImagePreviewModal = ({ src, alt = '预览图像', onClose }) => {
  useEffect(() => {
    if (!src) return;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-w-6xl w-full px-4 max-h-[90vh] flex justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-10 right-2 text-white hover:text-amber-300 transition-colors"
          aria-label="关闭预览"
        >
          <span className="text-3xl leading-none">×</span>
        </button>
        <div className="relative w-full flex justify-center h-[90vh]">
          <div className="relative w-full h-full">
            <Image
              src={src}
              alt={alt}
              fill
              sizes="100vw"
              className="object-contain rounded-xl shadow-2xl"
              priority
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImagePreviewModal;
