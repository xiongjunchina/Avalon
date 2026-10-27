import type { Replay, Role, RoleAssignmentAudit } from '@avalon/contracts';
import { roleNames } from './roles';

const protectionLevels: Record<RoleAssignmentAudit['protectionLevel'], string> = {
  0: '0 · 全部保护生效',
  1: '1 · 放宽特殊角色冷却',
  2: '2 · 同时放宽蓝方保护',
  3: '3 · 同时放宽视野角色保护',
};

/** Mount only from the authenticated admin replay, never the player-facing ReplayView. */
export function AdminRoleAssignmentAudit({ replay }: { replay: Replay }) {
  const audit = replay.roleAssignmentAudit;
  if (!replay.endedAt || !replay.result || !audit) return null;

  return <details className="admin-deal-audit">
    <summary>发牌依据</summary>
    <div className="admin-deal-audit-body">
      <dl className="admin-deal-audit-meta">
        <dt>算法版本</dt><dd>{audit.algorithmVersion}</dd>
        <dt>权重版本</dt><dd>{audit.weightVersion}</dd>
        <dt>保护退让</dt><dd>{protectionLevels[audit.protectionLevel]}</dd>
        {audit.roleOrder?.length ? <><dt>角色区间顺序</dt><dd>{audit.roleOrder.map(role => roleNames[role]).join(' → ')}</dd></> : null}
      </dl>
      <p className="admin-deal-audit-note">以下为开局时保存的依据。权重是相对抽取机会，并非命中概率；完整分配还需满足本局角色数量与保护约束。</p>
      <ol className="admin-deal-audit-players">
        {audit.playerOrder.map(userId => {
          const entry = audit.players[userId];
          if (!entry) return null;
          const draw = audit.draws.find(d => d.userId === userId);
          const player = replay.players.find(p => p.id === userId);
          const protections = [
            entry.protections.visionGuaranteed && '视野角色保护',
            entry.protections.blueGuaranteed && '蓝方保护',
            entry.protections.bossCooldown && '特殊角色冷却',
          ].filter(Boolean);
          return <li key={userId}>
            <div className="admin-deal-audit-player-head">
              <strong>{player ? `${player.seat}号 ${player.nickname}` : '未知玩家'}</strong>
              <span>最终：{roleNames[entry.assignedRole]}</span>
            </div>
            <dl className="admin-deal-audit-meta">
              <dt>心仪志愿</dt><dd>{entry.preferences.length ? entry.preferences.map((role, i) => `${i + 1}. ${roleNames[role]}`).join(' / ') : '未设置'}</dd>
              <dt>最近角色</dt><dd>{entry.recentRoles.length ? entry.recentRoles.map(role => roleNames[role]).join(' → ') : '无历史记录'}{entry.recentRoles.length > 0 && '（最近在前）'}</dd>
              <dt>保护条件</dt><dd>{protections.length ? protections.join('、') : '无'}</dd>
              <dt>相对权重</dt><dd>{Object.entries(entry.weights).map(([role, weight]) => `${roleNames[role as Role]} ${weight}`).join(' / ') || '无'}</dd>
              {draw && <><dt>随机抽样</dt><dd>票值 {draw.ticket}<br/>区间总权重 {draw.totalWeight}</dd></>}
            </dl>
          </li>;
        })}
      </ol>
    </div>
  </details>;
}
