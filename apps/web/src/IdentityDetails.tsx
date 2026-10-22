import { useState } from 'react';
import type { Command, GameView, Player } from '@avalon/contracts';
import { identityKnowledge, identityTreasure } from './identity-presentation';
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

  const { candidates, title, description } = identityKnowledge(self, players.length);
  const { enabled: canClickTreasure, description: treasureSub } = identityTreasure(self, players.length, treasuresEnabled, game);

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
