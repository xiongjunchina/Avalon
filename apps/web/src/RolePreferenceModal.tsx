import { useState, useEffect } from 'react';
import { ROLE_CONFIG } from '@avalon/game-core';
import type { Role } from '@avalon/contracts';
import { roleTeam } from './Heraldry';
import { RolePortrait } from './RolePortrait';
import { roleMottos, roleNames, roleTitles } from './roles';
import { Modal } from './Modal';

type RolePreferenceProps = {
  open: boolean;
  onClose: () => void;
  currentPreferences: Role[];
  playerCount: number;
  disabled?: boolean;
  disabledReason?: string;
  onSave: (preferences: Role[]) => Promise<void>;
};

export function RolePreferenceModal(props: RolePreferenceProps) {
  // A new editing session starts when opened. Room snapshots must not reset its draft.
  return props.open ? <RolePreferenceForm {...props} /> : null;
}

function RolePreferenceForm({ onClose, currentPreferences, playerCount, disabled = false, disabledReason, onSave }: RolePreferenceProps) {
  const validRoles = Array.from(new Set(ROLE_CONFIG[playerCount] ?? []));
  const [selected, setSelected] = useState<Role[]>(() => currentPreferences.filter(role => validRoles.includes(role)).slice(0, 3));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const available = ROLE_CONFIG[playerCount] ?? [];
    setSelected(draft => draft.filter(role => available.includes(role)));
  }, [playerCount]);

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
    <Modal label="心仪选角" scene="library" onClose={() => { if (!saving) onClose(); }}>
      <div className="table-modal-sheet role-pref-sheet">
        {/* Header */}
        <div className="table-modal-head role-pref-head">
          <div className="role-pref-head-left">
            <strong className="role-pref-title">🎭 心仪选角 · 偏好匹配</strong>
            <span className="role-pref-sub">志愿提高机会 · 不保证命中</span>
          </div>
          <button
            type="button"
            className="role-pref-close-btn"
            onClick={onClose}
            disabled={saving}
            aria-label="关闭"
            title="关闭"
          >
            ✕
          </button>
        </div>

        {/* 3 Slots Status Section */}
        <div className="role-pref-slots-section">
          <div className="role-pref-slots-top-row">
            <div className="role-pref-slots-legend">
              <span className="legend-star">⭐</span>
              <span className="legend-title">出战意向志愿</span>
              <span className="legend-count">({selected.length}/3)</span>
            </div>
            {selected.length > 0 && (
              <button
                type="button"
                className="role-pref-clear-btn"
                onClick={handleClear}
                disabled={disabled || saving}
                title="清空已选志愿"
              >
                清空重选
              </button>
            )}
          </div>

          <div className="role-pref-slots-grid" aria-label="已选出战志愿">
            {[0, 1, 2].map(slotIdx => {
              const role = selected[slotIdx];
              return (
                <div
                  key={slotIdx}
                  className={`role-pref-slot-card ${role ? 'is-filled' : 'is-empty'} slot-rank-${slotIdx + 1}`}
                  onClick={() => role && handleRemoveSlot(slotIdx)}
                  title={role ? `第${slotIdx + 1}志愿：${roleNames[role]}（点击移除）` : `第${slotIdx + 1}志愿：待点选下方角色`}
                  role={role ? 'button' : undefined}
                  tabIndex={role ? 0 : undefined}
                >
                  <span className="slot-rank-tag">{slotTags[slotIdx]}</span>
                  <span className="sr-only">{slotLabels[slotIdx]}</span>
                  {role ? (
                    <div className="slot-card-body">
                      <span className="slot-card-avatar">
                        <RolePortrait role={role} size="mini" />
                      </span>
                      <strong className="slot-card-name">{roleNames[role]}</strong>
                      <span className="slot-card-remove-icon" aria-hidden="true" title="移除">✕</span>
                    </div>
                  ) : (
                    <span className="slot-card-placeholder">待选择</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {error && <div className="role-pref-error-banner" role="alert">{error}</div>}
        {disabled && !saving && disabledReason && <div className="role-pref-error-banner" role="status">{disabledReason}</div>}

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
                    disabled={disabled || saving}
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
                    disabled={disabled || saving}
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
              <strong>心仪角色加权说明：</strong>
              <span>
                第一、第二、第三志愿及其他角色的基础权重为 8 / 4 / 2 / 1。近期重复角色会降低权重，系统结合本局角色数量与保护条件随机发牌，不保证命中志愿。<strong>选角意向不向其他玩家公开。</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Symmetrical, Beautiful Lacquer Footer */}
        <div className="role-pref-footer">
          <button
            type="button"
            className="role-pref-cancel-btn"
            onClick={onClose}
            disabled={saving}
          >
            取消
          </button>
          <button
            type="button"
            className="role-pref-submit-btn"
            onClick={handleConfirm}
            disabled={disabled || saving}
          >
            {saving
              ? '保存中…'
              : selected.length === 0
                ? '盲选出战 (不设偏好)'
                : `确认出战偏好 (${selected.length}/3)`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
