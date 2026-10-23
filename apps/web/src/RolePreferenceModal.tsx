import { useState, useEffect } from 'react';
import { ROLE_CONFIG } from '@avalon/game-core';
import type { Role } from '@avalon/contracts';
import { roleTeam } from './Heraldry';
import { RolePortrait } from './RolePortrait';
import { roleMottos, roleNames, roleTitles } from './roles';

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

  // Sync current preferences when modal opens
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
      // Remove
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

  const handleMove = (index: number, direction: 'up' | 'down') => {
    if (disabled || saving) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= selected.length) return;
    const next = [...selected];
    const temp = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = temp;
    setSelected(next);
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

  return (
    <div
      className="role-pref-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="心仪选角设置"
      onClick={e => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="role-pref-dialog">
        <header className="role-pref-header">
          <div className="role-pref-title-wrap">
            <h2 className="role-pref-title">🎭 心仪选角 · 偏好匹配</h2>
            <span className="role-pref-sub">
              设置你期望出战的角色（最多 3 个），系统开局将按优先级顺延匹配
            </span>
          </div>
          <button
            type="button"
            className="role-pref-close-btn"
            onClick={onClose}
            disabled={saving}
            aria-label="关闭"
          >
            ✕
          </button>
        </header>

        {/* Selected Slots Section */}
        <section className="role-pref-slots-section">
          <div className="role-pref-slots-head">
            <span className="slots-label">
              已选志愿 (<strong>{selected.length}</strong>/3)
            </span>
            {selected.length > 0 && (
              <button
                type="button"
                className="role-pref-clear-btn"
                onClick={handleClear}
                disabled={saving}
              >
                清空重选
              </button>
            )}
          </div>

          <div className="role-pref-slots-grid">
            {[0, 1, 2].map(slotIdx => {
              const role = selected[slotIdx];
              const slotLabels = ['第一志愿', '第二志愿', '第三志愿'];
              const slotColorClasses = ['slot-p1', 'slot-p2', 'slot-p3'];

              return (
                <div
                  key={slotIdx}
                  className={`role-pref-slot-card ${role ? 'is-filled' : 'is-empty'} ${
                    slotColorClasses[slotIdx]
                  }`}
                >
                  <div className="slot-rank-tag">{slotLabels[slotIdx]}</div>
                  {role ? (
                    <div className="slot-content">
                      <div className="slot-portrait-mini">
                        <RolePortrait role={role} size="mini" />
                      </div>
                      <div className="slot-info">
                        <strong className="slot-name">{roleNames[role]}</strong>
                        <span className={`slot-camp camp-${roleTeam(role)}`}>
                          {roleTeam(role) === 'blue' ? '正道神佛' : '乱道群妖'}
                        </span>
                      </div>
                      <div className="slot-actions">
                        {slotIdx > 0 && (
                          <button
                            type="button"
                            className="slot-reorder-btn"
                            title="提升优先级"
                            onClick={() => handleMove(slotIdx, 'up')}
                            disabled={saving}
                          >
                            ▲
                          </button>
                        )}
                        {slotIdx < selected.length - 1 && (
                          <button
                            type="button"
                            className="slot-reorder-btn"
                            title="降低优先级"
                            onClick={() => handleMove(slotIdx, 'down')}
                            disabled={saving}
                          >
                            ▼
                          </button>
                        )}
                        <button
                          type="button"
                          className="slot-remove-btn"
                          title="移除"
                          onClick={() => handleRemoveSlot(slotIdx)}
                          disabled={saving}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="slot-empty-prompt">
                      <span>待选择</span>
                      <small>点击下方角色填入</small>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {error && <div className="role-pref-error-banner" role="alert">{error}</div>}

        {/* Available Roles Section */}
        <section className="role-pref-catalog-section">
          {/* Blue Camp */}
          <div className="role-camp-group">
            <h3 className="camp-heading blue-heading">
              <span>🔵 护经正道 · 神佛仙圣 ({blueRoles.length})</span>
            </h3>
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
                        第 {selIdx + 1} 志愿
                      </span>
                    )}
                    <div className="choice-portrait-wrap">
                      <RolePortrait role={role} size="mini" />
                    </div>
                    <div className="choice-details">
                      <strong className="choice-title">{roleNames[role]}</strong>
                      <span className="choice-subtitle">{roleTitles[role]}</span>
                      <p className="choice-motto">{roleMottos[role]}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Red Camp */}
          <div className="role-camp-group">
            <h3 className="camp-heading red-heading">
              <span>🔴 乱道妖魔 · 混世群妖 ({redRoles.length})</span>
            </h3>
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
                        第 {selIdx + 1} 志愿
                      </span>
                    )}
                    <div className="choice-portrait-wrap">
                      <RolePortrait role={role} size="mini" />
                    </div>
                    <div className="choice-details">
                      <strong className="choice-title">{roleNames[role]}</strong>
                      <span className="choice-subtitle">{roleTitles[role]}</span>
                      <p className="choice-motto">{roleMottos[role]}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Footer with Rules and Submit */}
        <footer className="role-pref-footer">
          <div className="role-pref-rules-hint">
            <span className="hint-icon">💡</span>
            <div className="hint-text">
              <strong>王者荣耀式意向匹配机制：</strong>
              <span>
                系统开局打乱玩家顺位，排位靠前优先满足其第 1、第 2、第 3 志愿；若已被抢占或未设偏好，则从剩余角色中随机发牌。<strong>选角意向全员保密，他人不可见！</strong>
              </span>
            </div>
          </div>
          <div className="role-pref-actions">
            <button
              type="button"
              className="secondary tool-pill"
              onClick={onClose}
              disabled={saving}
            >
              取消
            </button>
            <button
              type="button"
              className="mp-cyan-pill role-pref-submit-btn"
              onClick={handleConfirm}
              disabled={saving}
            >
              {saving ? '保存中…' : selected.length === 0 ? '保存（不设偏好·盲选）' : `确定保存 (${selected.length}/3)`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
