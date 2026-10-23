import { useState, useEffect } from 'react';
import { ROLE_CONFIG } from '@avalon/game-core';
import type { Role } from '@avalon/contracts';
import { roleTeam } from './Heraldry';
import { RolePortrait } from './RolePortrait';
import { roleMottos, roleNames, roleTitles } from './roles';
import { Modal } from './Modal';

export function RolePreferenceModal({
  open,
  onClose,
  currentPreferences,
  playerCount,
  disabled = false,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  currentPreferences: Role[];
  playerCount: number;
  disabled?: boolean;
  onSave: (preferences: Role[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Role[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelected(currentPreferences.slice(0, 3));
      setError(null);
    }
  }, [open, currentPreferences]);

  if (!open) return null;

  const validRoles = Array.from(new Set(ROLE_CONFIG[playerCount] ?? []));
  const blueRoles = validRoles.filter(r => roleTeam(r) === 'blue');
  const redRoles = validRoles.filter(r => roleTeam(r) === 'red');

  const handleToggleRole = (role: Role) => {
    if (disabled || saving) return;
    setError(null);
    const existingIndex = selected.indexOf(role);
    if (existingIndex !== -1) {
      setSelected(selected.filter(r => r !== role));
    } else {
      if (selected.length >= 3) {
        setError('最多只可选择 3 个心仪角色，可点击已选志愿移除后再选。');
        return;
      }
      setSelected([...selected, role]);
    }
  };

  const handleRemoveSlot = (index: number) => {
    if (disabled || saving) return;
    setError(null);
    setSelected(selected.filter((_, i) => i !== index));
  };

  const handleClear = () => {
    if (disabled || saving) return;
    setError(null);
    setSelected([]);
  };

  const handleConfirm = async () => {
    if (disabled || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(selected);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const slotLabels = ['第一志愿', '第二志愿', '第三志愿'];
  const slotTags = ['① 志愿', '② 志愿', '③ 志愿'];

  return (
    <Modal label="心仪选角" scene="library" onClose={onClose}>
      <div className="table-modal-sheet role-pref-sheet">
        {/* Header */}
        <div className="table-modal-head role-pref-head">
          <div className="role-pref-head-left">
            <strong className="role-pref-title">🎭 心仪选角 · 偏好匹配</strong>
            <span className="role-pref-sub">排位靠前优先满足 · 意向全员保密</span>
          </div>
          <button
            type="button"
            className="secondary tool-pill role-pref-close-btn"
            onClick={onClose}
            disabled={saving}
            aria-label="关闭"
          >
            关闭
          </button>
        </div>

        {/* 3 Compact Slots Bar (Single Row, only ~36px high!) */}
        <div className="role-pref-slots-strip">
          <div className="role-pref-slots-bar" aria-label="已选出战志愿">
            {[0, 1, 2].map(slotIdx => {
              const role = selected[slotIdx];
              return (
                <div
                  key={slotIdx}
                  className={`role-pref-slot-pill ${role ? 'is-filled' : 'is-empty'} slot-p${slotIdx + 1}`}
                  title={`${slotLabels[slotIdx]}：${role ? roleNames[role] : '待点选'}`}
                >
                  <span className="slot-rank-chip">{slotTags[slotIdx]}</span>
                  <span className="sr-only">{slotLabels[slotIdx]}</span>
                  {role ? (
                    <div className="slot-pill-content">
                      <span className="slot-avatar-mini">
                        <RolePortrait role={role} size="mini" />
                      </span>
                      <strong className="slot-pill-name">{roleNames[role]}</strong>
                      <button
                        type="button"
                        className="slot-pill-remove"
                        onClick={e => {
                          e.stopPropagation();
                          handleRemoveSlot(slotIdx);
                        }}
                        disabled={saving}
                        title={`移除${slotLabels[slotIdx]}`}
                        aria-label={`移除${slotLabels[slotIdx]}`}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <span className="slot-pill-empty">待点选</span>
                  )}
                </div>
              );
            })}
          </div>
          {selected.length > 0 && (
            <button
              type="button"
              className="role-pref-clear-link"
              onClick={handleClear}
              disabled={saving}
              title="清空已选志愿"
            >
              清空
            </button>
          )}
        </div>

        {error && <div className="role-pref-error-banner" role="alert">{error}</div>}

        {/* Scrollable Role Catalog */}
        <div className="role-pref-catalog-section">
          {/* Blue Camp */}
          <div className="role-camp-group">
            <h4 className="camp-heading blue-heading">
              <span>🔵 护经正道 · 神佛仙圣 ({blueRoles.length})</span>
            </h4>
            <div className="role-cards-grid">
              {blueRoles.map(role => {
                const selIdx = selected.indexOf(role);
                const isSelected = selIdx !== -1;
                return (
                  <button
                    key={role}
                    type="button"
                    className={`role-choice-card team-blue ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => handleToggleRole(role)}
                    disabled={saving}
                  >
                    {isSelected && (
                      <span className="choice-badge">
                        {slotTags[selIdx]}
                      </span>
                    )}
                    <div className="choice-portrait-wrap">
                      <RolePortrait role={role} size="mini" />
                    </div>
                    <div className="choice-details">
                      <div className="choice-title-row">
                        <strong className="choice-title">{roleNames[role]}</strong>
                        <span className="choice-subtitle">{roleTitles[role]}</span>
                      </div>
                      <p className="choice-motto">{roleMottos[role]}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Red Camp */}
          <div className="role-camp-group">
            <h4 className="camp-heading red-heading">
              <span>🔴 乱道妖魔 · 混世群妖 ({redRoles.length})</span>
            </h4>
            <div className="role-cards-grid">
              {redRoles.map(role => {
                const selIdx = selected.indexOf(role);
                const isSelected = selIdx !== -1;
                return (
                  <button
                    key={role}
                    type="button"
                    className={`role-choice-card team-red ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => handleToggleRole(role)}
                    disabled={saving}
                  >
                    {isSelected && (
                      <span className="choice-badge">
                        {slotTags[selIdx]}
                      </span>
                    )}
                    <div className="choice-portrait-wrap">
                      <RolePortrait role={role} size="mini" />
                    </div>
                    <div className="choice-details">
                      <div className="choice-title-row">
                        <strong className="choice-title">{roleNames[role]}</strong>
                        <span className="choice-subtitle">{roleTitles[role]}</span>
                      </div>
                      <p className="choice-motto">{roleMottos[role]}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Helpful matching mechanism note inside scrollable area */}
          <div className="role-pref-mechanics-note">
            <span className="note-icon">💡</span>
            <div className="note-body">
              <strong>王者荣耀式意向匹配机制说明：</strong>
              <span>
                系统开局打乱玩家顺位，排位靠前优先满足其第 1、第 2、第 3 志愿；若已被抢占或未设偏好，则从剩余角色中随机发牌。<strong>选角意向全员保密，他人不可见！</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Symmetrical, Beautiful Lacquer Footer */}
        <div className="role-pref-footer">
          <button
            type="button"
            className="secondary tool-pill role-pref-cancel-btn"
            onClick={onClose}
            disabled={saving}
          >
            取消
          </button>
          <button
            type="button"
            className="role-pref-submit-btn"
            onClick={handleConfirm}
            disabled={saving}
          >
            {saving
              ? '保存中…'
              : selected.length === 0
                ? '确认（不设偏好 · 盲选）'
                : `确认保存 (${selected.length}/3)`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
