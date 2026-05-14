'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Panzoom from '@panzoom/panzoom';

interface Props {
  svg: string;
  onClose: () => void;
}

export function MermaidModal({ svg, onClose }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panzoomRef = useRef<ReturnType<typeof Panzoom> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const canvas = document.querySelector('.mermaid-modal-canvas') as HTMLElement;
    if (!canvas) return;

    const ro = new ResizeObserver(() => {
      ro.disconnect();
      const svgEl = el.querySelector('svg');
      if (!svgEl) return;

      const svgRect = svgEl.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();

      const scale = Math.min(
        (canvasRect.width - 64) / (svgRect.width || 800),
        (canvasRect.height - 64) / (svgRect.height || 600),
        1,
      );

      const instance = Panzoom(el, {
        maxScale: 50,
        minScale: 0.01,
        startScale: scale,
        startX: (canvasRect.width - (svgRect.width || 800) * scale) / 2,
        startY: (canvasRect.height - (svgRect.height || 600) * scale) / 2,
        step: 0.15,
        cursor: 'grab',
      });
      panzoomRef.current = instance;

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        instance.zoomWithWheel(e);
      };
      canvas.addEventListener('wheel', onWheel, { passive: false });
    });

    ro.observe(canvas);
    return () => {
      ro.disconnect();
      panzoomRef.current?.destroy();
      panzoomRef.current = null;
    };
  }, [svg]);

  return createPortal(
    <div className="mermaid-modal-backdrop" onClick={onClose}>
      <div className="mermaid-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="mermaid-modal-toolbar">
          <div className="flex items-center gap-1">
            <button onClick={() => panzoomRef.current?.zoomIn({ animate: true })} className="mermaid-modal-btn" title="Zoom in">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
              </svg>
            </button>
            <button onClick={() => panzoomRef.current?.zoomOut({ animate: true })} className="mermaid-modal-btn" title="Zoom out">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>
              </svg>
            </button>
            <button onClick={() => panzoomRef.current?.reset({ animate: true })} className="mermaid-modal-btn" title="Reset">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
              </svg>
            </button>
          </div>
          <button onClick={onClose} className="mermaid-modal-btn" title="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="mermaid-modal-canvas">
          <div ref={wrapperRef} dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
