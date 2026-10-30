import { assetUrl } from './deployment';
import { useEffect } from 'react';
import type { RoleGalleryItem } from './roles';
import { Emblem } from './Heraldry';

export function RoleViewerModal({
  item,
  onClose,
  onPrev,
  onNext,
  currentIndex,
  totalCount,
}: {
  item: RoleGalleryItem | null;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  currentIndex?: number;
  totalCount?: number;
}) {
  useEffect(() => {
    if (!item) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && onPrev) {
        onPrev();
      } else if (e.key === 'ArrowRight' && onNext) {
        onNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [item, onClose, onPrev, onNext]);

  if (!item) return null;

  return (
    <div
      className="role-viewer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`${item.fullName}法相鉴赏`}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`role-viewer-panel allegiance-${item.team}`}>
        {/* Top Control Bar */}
        <header className="role-viewer-head">
          <div className="role-viewer-faction-badge">
            <Emblem kind={item.team} />
            <span className="role-viewer-faction-text">{item.team === 'blue' ? '蓝方 · 取经正果' : '红方 · 群妖乱道'}</span>
            <span className="role-viewer-sep">·</span>
            <span className="role-viewer-title-pill">{item.title}</span>
          </div>
          <button
            type="button"
            className="secondary role-viewer-close-btn"
            onClick={onClose}
            aria-label="关闭鉴赏"
          >
            ✕ 关闭
          </button>
        </header>

        {/* Grand Artwork Stage */}
        <div className="role-viewer-art-stage">
          {onPrev && (
            <button
              type="button"
              className="role-viewer-nav-btn prev"
              onClick={onPrev}
              aria-label="查看上一位法相"
            >
              ⟨
            </button>
          )}

          <div className="role-viewer-image-frame">
            <img
              src={assetUrl(`/art/roles/${item.artPrefix}-640.webp?v=audit1`)}
              alt={item.fullName}
              className="role-viewer-img"
              width={640}
              height={640}
              loading="eager"
            />
            <div className="role-viewer-aura" aria-hidden="true" />
          </div>

          {onNext && (
            <button
              type="button"
              className="role-viewer-nav-btn next"
              onClick={onNext}
              aria-label="查看下一位法相"
            >
              ⟩
            </button>
          )}
        </div>

        {/* Caption & Lore */}
        <div className="role-viewer-info">
          <h2 className="role-viewer-name">{item.fullName}</h2>
          <p className="role-viewer-motto">“{item.motto}”</p>
          <p className="role-viewer-story">{item.story}</p>
        </div>

        {/* Footer Navigation Index */}
        {totalCount && typeof currentIndex === 'number' && (
          <footer className="role-viewer-foot">
            <div className="role-viewer-pagination">
              {onPrev && (
                <button type="button" className="text-button" onClick={onPrev}>
                  ⟨ 上一位
                </button>
              )}
              <span className="role-viewer-counter">
                {currentIndex + 1} / {totalCount}
              </span>
              {onNext && (
                <button type="button" className="text-button" onClick={onNext}>
                  下一位 ⟩
                </button>
              )}
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
