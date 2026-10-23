import type { Player, SelfTreasures } from '@avalon/contracts';
import { Modal } from './Modal';
import { PlayerAvatar } from './Heraldry';

export function GuanyinResultDialog({ result, players, onClose }: {
  result: NonNullable<NonNullable<SelfTreasures['guanyinMirror']>['result']>;
  players: Player[];
  onClose: () => void;
}) {
  const player = players.find(p => p.id === result.targetId);
  const pure = result.alignment === 'pure';
  return (
    <Modal label="慈航照妖镜 · 私密查验结果" scene="mirror" onClose={onClose} sound={false}>
      <section className="table-modal-sheet guanyin-result-sheet" onClick={e => e.stopPropagation()}>
        <header className="table-modal-head">
          <strong>慈航照妖镜</strong>
          <span className="guanyin-private-tag">仅你可见</span>
        </header>
        <p className="guanyin-result-kicker">查验已完成</p>
        <div className="guanyin-result-avatar">
          <PlayerAvatar avatar={player?.avatar} avatarUrl={player?.avatarUrl} wechatAvatarUrl={player?.wechatAvatarUrl} fallbackKind="cards" />
        </div>
        <h3>{player ? `${String(player.seat).padStart(2, '0')}号 · ${player.nickname}` : '本轮查验的仙友'}</h3>
        <p className={`guanyin-result-alignment ${pure ? 'is-pure' : 'is-evil'}`}>
          <strong>{pure ? '心性纯良' : '妖气内伏'}</strong>
          <span>{pure ? '取经阵营 · 好人' : '妖魔阵营 · 恶妖'}</span>
        </p>
        <p className="guanyin-result-note">仅知阵营，不揭示具体角色。其他玩家正常继续对局。</p>
        <button type="button" className="treasure-confirm-btn" onClick={onClose}>已阅，返回对局</button>
        <small>稍后可点击对局页「法宝」再次查看</small>
      </section>
    </Modal>
  );
}
