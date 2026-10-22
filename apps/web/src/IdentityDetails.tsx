import { useState } from 'react';
import type { Command, GameView, Player } from '@avalon/contracts';
import { ROLE_CONFIG } from '@avalon/game-core';
import { IdentityCard } from './RolePortrait';
import { PlayerToken } from './PlayerToken';
import { getRoleGalleryItem } from './roles';
import { RoleViewerModal } from './RoleViewerModal';
import { TreasureModal } from './TreasureModal';
import { roleDescriptions } from './GuidePanel';

/** Only the server-projected, private self view is accepted. Never infer other roles. */
export function IdentityDetails({
  self,
  players,
  game,
  disabled = false,
  send,
  treasuresEnabled = false,
}: {
  self: NonNullable<GameView['self']>;
  players: Player[];
  game?: GameView;
  disabled?: boolean;
  send?: (action: Pick<Command, 'type' | 'payload'>) => void;
  treasuresEnabled?: boolean;
}) {
  const [viewingArt, setViewingArt] = useState(false);
  const [treasureOpen, setTreasureOpen] = useState(false);
  const galleryItem = getRoleGalleryItem(self.role, self.loyalGuardian, self.femaleDemon);

  const candidates = self.merlinCandidates.length ? self.merlinCandidates
    : self.guinevereCandidates?.length ? self.guinevereCandidates
    : self.guardianClue?.targetIds?.length ? self.guardianClue.targetIds
    : self.evilIds;
  const title = self.merlinCandidates.length ? '两位大圣 · 真假待辨'
    : self.guinevereCandidates?.length ? '两道天机 · 尚待查证'
    : self.guardianClue ? self.guardianClue.title
    : self.role === 'merlin' ? '你火眼金睛识破的群妖' : self.evilIds.length ? '与你相认的同伙群妖' : '取经漫漫 · 静观其变';
  const description = self.merlinCandidates.length ? '一位是真大圣孙悟空，一位是假大圣六耳猕猴，无法分辨对应身份。'
    : self.guinevereCandidates?.length ? '一位是假扮佛祖的黄眉老怪，一位是取经正果同伴，无法分辨对应身份。'
    : self.guardianClue ? self.guardianClue.description
    : self.role === 'merlin' ? (ROLE_CONFIG[players.length]?.includes('mordred') ? '本局含黄眉老怪（假扮如来设小雷音寺），他不在你的火眼金睛视野中；所见成员仅知阵营，不知角色。' : '以上是本局全部群妖成员，仅知阵营，不知具体角色。')
    : self.evilIds.length ? (ROLE_CONFIG[players.length]?.includes('oberon') ? '本局牛魔王独霸一方不参与相认；同伙仅知阵营，不知角色。' : '以上是与你相认的群妖同伙，仅知阵营，不知具体角色。')
    : '没有其他初始身份线索，请从发言与取经战况中判断。';

  const is8Plus = players.length >= 8;
  const isTreasureModeActive = Boolean(treasuresEnabled && is8Plus);
  const canClickTreasure = isTreasureModeActive || self.role === 'assassin';

  let treasureSub = '';
  if (!isTreasureModeActive) {
    if (self.role === 'assassin') {
      if (game?.phase === 'assassination') {
        treasureSub = '🔥 终局刺杀 · 点击祭出火尖枪！';
      } else if (self.canDecideEarly) {
        treasureSub = '🗡️ 提前刺杀窗口已解锁';
      } else {
        treasureSub = '火尖枪（刺客专属神兵）';
      }
    } else {
      treasureSub = '未开启法宝模式（仅刺客可用神兵）';
    }
  } else {
    if (self.role === 'percival') {
      treasureSub = self.treasures?.tinStaff?.used
        ? '九环锡杖（已显灵）'
        : self.treasures?.tinStaff?.available
          ? '✨ 可私密查验盲区仙友！'
          : '九环锡杖（第2轮任务后解锁）';
    } else if (self.role === 'guinevere') {
      treasureSub = self.treasures?.guanyinMirror?.used
        ? '慈航照妖镜（已照耀）'
        : self.treasures?.guanyinMirror?.available
          ? '✨ 可照耀车队队员！'
          : '慈航照妖镜（发车后可用）';
    } else if (self.role === 'mordred') {
      treasureSub = self.treasures?.humanBag?.used
        ? '后天人种袋（已收人）'
        : self.treasures?.humanBag?.available
          ? '✨ 可禁选1人上车！'
          : '后天人种袋（第3/4轮提名前解锁）';
    } else if (self.role === 'loyal') {
      treasureSub = self.treasures?.jinguSeal?.used
        ? '紧箍信物（已通灵）'
        : self.treasures?.jinguSeal?.available
          ? '✨ 绝境信物已激活！'
          : '紧箍信物（好人绝境时激活）';
    } else if (self.role === 'oberon') {
      treasureSub = self.treasures?.bananaFan?.used
        ? '芭蕉神扇（已吹散）'
        : self.treasures?.bananaFan?.armed
          ? '🌪️ 聚风待发（通过则吹散）'
          : '芭蕉神扇（点击预设吹散）';
    } else if (self.role === 'assassin') {
      treasureSub = game?.phase === 'assassination'
        ? '🔥 终局刺杀 · 祭出火尖枪！'
        : '火尖枪（刺客专属神兵）';
    } else if (self.role === 'merlin') {
      treasureSub = '齐天大圣 · 无为而治（大隐潜行）';
    } else if (self.role === 'morgana') {
      treasureSub = '假美猴王 · 随心机变';
    } else {
      treasureSub = '混世妖仙 · 待机而动';
    }
  }

  return (
    <>
      <IdentityCard
        role={self.role}
        loyalGuardian={self.loyalGuardian}
        femaleDemon={self.femaleDemon}
        onInspect={() => setViewingArt(true)}
      />
      <section className="identity-knowledge" aria-label="你的身份视野">
        <h3>{title}</h3>
        {!!candidates.length && <div className="identity-vision" data-count={candidates.length}>{candidates.map(id => {
          const player = players.find(p => p.id === id);
          return player ? <PlayerToken key={id} player={player} /> : null;
        })}</div>}
        <p>{description}</p>
      </section>

      {/* Role Strategy Tip */}
      {roleDescriptions[self.role]?.tip && (
        <div className="identity-tip-capsule" title="本角色的取经心法秘诀">
          <span className="tip-capsule-badge">💡 玩法心法</span>
          <p className="tip-capsule-text">{roleDescriptions[self.role].tip}</p>
        </div>
      )}

      {/* Unified Treasure Entry Button inside Identity Sheet */}
      <div className="identity-treasure-row">
        <button
          type="button"
          className={`identity-treasure-entry-btn ${canClickTreasure ? 'is-enabled' : 'is-locked'}`}
          disabled={!canClickTreasure}
          onClick={() => setTreasureOpen(true)}
          title={canClickTreasure ? '点击查看本命法宝与神兵绝技' : '房主未启用专属法宝模式，仅刺客可用神兵'}
        >
          <span className="treasure-entry-icon">📿</span>
          <span className="treasure-entry-info">
            <strong>本命法宝 · 仙家神兵</strong>
            <small>{treasureSub}</small>
          </span>
          <span className="treasure-entry-chevron">{canClickTreasure ? '❯' : '🔒'}</span>
        </button>
      </div>

      {viewingArt && (
        <RoleViewerModal
          item={galleryItem}
          onClose={() => setViewingArt(false)}
        />
      )}

      <TreasureModal
        open={treasureOpen}
        onClose={() => setTreasureOpen(false)}
        self={self}
        players={players}
        game={game}
        disabled={disabled}
        send={send}
        treasuresEnabled={treasuresEnabled}
      />
    </>
  );
}
