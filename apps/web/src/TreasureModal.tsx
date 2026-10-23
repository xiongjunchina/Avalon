import { useState } from 'react';
import type { Command, GameView, Player, Team } from '@avalon/contracts';
import { Modal } from './Modal';
import { PlayerToken } from './PlayerToken';
import { HeartBellControls, HeartBellMessageCard } from './HeartBell';

interface TreasureModalProps {
  open: boolean;
  onClose: () => void;
  self: NonNullable<GameView['self']>;
  players: Player[];
  game?: GameView;
  disabled?: boolean;
  send?: (action: Pick<Command, 'type' | 'payload'>) => void;
  treasuresEnabled?: boolean;
  userId?: string;
}

export function TreasureModal({
  open,
  onClose,
  self,
  players,
  game,
  disabled = false,
  send,
  treasuresEnabled = false,
  userId,
}: TreasureModalProps) {
  const [selectedTarget, setSelectedTarget] = useState('');
  const [assassinTarget, setAssassinTarget] = useState('');

  if (!open) return null;

  const is8Plus = players.length >= 8;
  const isTreasureModeActive = Boolean(treasuresEnabled && is8Plus);
  const nameOf = (id: string) => {
    const p = players.find(x => x.id === id);
    return p ? `${String(p.seat).padStart(2, '0')}号 · ${p.nickname}` : '未知仙友';
  };

  const handleSend = (action: Pick<Command, 'type' | 'payload'>) => {
    if (!send || disabled) return;
    send(action);
  };

  const tinStaff = self.treasures?.tinStaff;
  const guanyinMirror = self.treasures?.guanyinMirror;
  const humanBag = self.treasures?.humanBag;
  const jinguSeal = self.treasures?.jinguSeal;
  const bananaFan = self.treasures?.bananaFan;
  const jinguAllyId = self.treasures?.jinguAllyId;

  return (
    <Modal label="本命法宝" scene="mirror" onClose={onClose}>
      <div className="table-modal-sheet treasure-sheet">
        <div className="table-modal-head">
          <strong className="treasure-sheet-title">📿 本命法宝 · 仙家神兵</strong>
          <button type="button" className="secondary tool-pill" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="treasure-body">
          {isTreasureModeActive && self.treasures?.incomingHeartBell && <div className="treasure-card">
            <h3>同心铃 · 私密传音回看</h3>
            <HeartBellMessageCard message={self.treasures.incomingHeartBell} />
          </div>}
          {/* Case 1: Room did NOT enable 8-12 player treasure mode */}
          {!isTreasureModeActive && self.role !== 'assassin' && (
            <div className="treasure-empty-card">
              <span className="treasure-icon-large">🏮</span>
              <h4>仙家法宝 · 隐而不出</h4>
              <p className="hint">
                当前房间未开启【8-12人专属法宝模式】。本局依照经典阿瓦隆规则进行，唯有红孩儿可在终局刺杀阶段祭出火尖枪。
              </p>
            </div>
          )}

          {/* Case 2: Assassin (Red Boy) - Available regardless of treasure mode */}
          {self.role === 'assassin' && (
            <div className="treasure-card assassin-card">
              <div className="treasure-card-header">
                <span className="treasure-badge">🗡️ 刺客神兵</span>
                <h3>圣婴大王 · 火尖枪</h3>
              </div>
              <p className="treasure-desc">
                红孩儿成名神兵，三昧真火附着其上。终局刺杀阶段，选定你识破的真大圣孙悟空，一枪定乾坤！刺中真大圣群妖反败为胜；刺错则取经人胜。
              </p>

              {game?.phase === 'assassination' ? (
                <div className="treasure-action-box">
                  <label htmlFor="assassin-lance-target">请选择刺杀目标：</label>
                  <select
                    id="assassin-lance-target"
                    value={assassinTarget}
                    onChange={e => setAssassinTarget(e.target.value)}
                  >
                    <option value="">点击选择刺杀目标仙友</option>
                    {players
                      .filter(p => !self.evilIds.includes(p.id) && p.id !== game.assassinId)
                      .map(p => (
                        <option key={p.id} value={p.id}>
                          {String(p.seat).padStart(2, '0')}号 · {p.nickname}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="treasure-confirm-btn fire-btn"
                    disabled={!assassinTarget || disabled}
                    onClick={() => {
                      if (assassinTarget) {
                        handleSend({ type: 'assassinate', payload: { targetId: assassinTarget } });
                        onClose();
                      }
                    }}
                  >
                    🔥 祭出火尖枪 · 刺杀 {assassinTarget ? nameOf(assassinTarget) : ''}
                  </button>
                </div>
              ) : self.canDecideEarly ? (
                <div className="treasure-action-box">
                  <p className="alert-text">提前刺杀窗口已解锁！你可在此时提前发动刺杀决断：</p>
                  <button
                    type="button"
                    className="treasure-confirm-btn fire-btn"
                    disabled={disabled}
                    onClick={() => {
                      handleSend({ type: 'earlyAssassinationDecision', payload: { attempt: true } });
                      onClose();
                    }}
                  >
                    🗡️ 立即发动提前刺杀
                  </button>
                </div>
              ) : (
                <div className="treasure-status-idle">
                  <p>⏳ 火尖枪蓄势中：待进入终局刺杀阶段（或提前刺杀解锁）时在此刺出。</p>
                </div>
              )}
            </div>
          )}

          {/* Case 3: Treasures mode is active in 8-12 player game */}
          {isTreasureModeActive && (
            <>
              {/* Percival: Tin Staff */}
              {self.role === 'percival' && (
                <div className="treasure-card percival-card">
                  <div className="treasure-card-header">
                    <span className="treasure-badge">📿 圣僧信物</span>
                    <h3>大唐圣僧 · 九环锡杖</h3>
                  </div>
                  <p className="treasure-desc">
                    如来赐予圣僧之至宝。完成 2 轮任务后，可私密查验 1 位场上仙友的阵营气息。
                    <br />
                    <small className="hint">
                      ※ 排除自己与已知的真假美猴王；若查验目标为黄眉老怪，因其妖气深敛，仍显现为蓝方。
                    </small>
                  </p>

                  {tinStaff?.result ? (
                    <div className="treasure-result-box">
                      <div className="result-label">【锡杖显灵秘录】</div>
                      <div className="result-content">
                        仙友：<strong>{nameOf(tinStaff.result.targetId)}</strong>
                        <br />
                        气息：
                        <strong className={tinStaff.result.team === 'blue' ? 'text-blue' : 'text-red'}>
                          {tinStaff.result.team === 'blue' ? '✨ 取经正道（蓝方）' : '🔥 混世妖魔（红方）'}
                        </strong>
                      </div>
                    </div>
                  ) : tinStaff?.available ? (
                    <div className="treasure-action-box">
                      <label htmlFor="tin-staff-target">请选择查验目标（盲区仙友）：</label>
                      <select
                        id="tin-staff-target"
                        value={selectedTarget}
                        onChange={e => setSelectedTarget(e.target.value)}
                      >
                        <option value="">点击选择待查验仙友</option>
                        {players
                          .filter(p => p.id !== userId && !self.merlinCandidates.includes(p.id))
                          .map(p => (
                            <option key={p.id} value={p.id}>
                              {String(p.seat).padStart(2, '0')}号 · {p.nickname}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        className="treasure-confirm-btn"
                        disabled={!selectedTarget || disabled}
                        onClick={() => {
                          if (selectedTarget) {
                            handleSend({
                              type: 'useTreasure',
                              payload: { action: 'tinStaff', targetId: selectedTarget },
                            });
                          }
                        }}
                      >
                        📿 祭出九环锡杖 · 私密查验
                      </button>
                    </div>
                  ) : (
                    <div className="treasure-status-idle">
                      <p>
                        {tinStaff?.used
                          ? '✅ 九环锡杖本局已显灵使用完毕。'
                          : '⏳ 佛光蕴蓄中：需待第 2 轮任务结算完成后解锁。'}
                      </p>
                    </div>
                  )}

                  {/* Loyal Guardian revealed seal to Percival */}
                  {jinguAllyId && (
                    <div className="treasure-result-box seal-alliance-box">
                      <div className="result-label">👑【紧箍佛印 · 同修来投】</div>
                      <div className="result-content">
                        <strong>{nameOf(jinguAllyId)}</strong> 悄然捏动紧箍佛印向你自证！
                        <br />
                        <span className="text-blue">此仙友确系忠良取经护法同修，绝非妖魔！可全力倚重！</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Guinevere: Guanyin Mirror */}
              {self.role === 'guinevere' && (
                <div className="treasure-card guanyin-card">
                  <div className="treasure-card-header">
                    <span className="treasure-badge">🪞 慈航圣物</span>
                    <h3>救苦救难 · 慈航照妖镜</h3>
                  </div>
                  <p className="treasure-desc">
                    观世音菩萨灵觉神镜。发车表决通过后开启 4 秒专属决断期，可私密照耀车队中 1 位队员的心性纯浊。
                    <br />
                    <small className="hint">
                      ※ 纯属观音私密心证，绝不公开，不干涉或改动出牌结果。
                    </small>
                  </p>

                  {guanyinMirror?.result ? (
                    <div className="treasure-result-box">
                      <div className="result-label">【照妖镜显圣】</div>
                      <div className="result-content">
                        车队队员：<strong>{nameOf(guanyinMirror.result.targetId)}</strong>
                        <br />
                        心性照映：
                        <strong className={guanyinMirror.result.alignment === 'pure' ? 'text-blue' : 'text-red'}>
                          {guanyinMirror.result.alignment === 'pure' ? '✨ 心性纯良（好人）' : '🔥 妖气内伏（恶妖）'}
                        </strong>
                      </div>
                    </div>
                  ) : guanyinMirror?.available ? (
                    <div className="treasure-action-box">
                      <label htmlFor="guanyin-mirror-target">请选择车队中欲辨察的队员：</label>
                      <select
                        id="guanyin-mirror-target"
                        value={selectedTarget}
                        onChange={e => setSelectedTarget(e.target.value)}
                      >
                        <option value="">点击选择车队队员</option>
                        {game?.rounds.at(-1)?.team.map(id => {
                          const p = players.find(x => x.id === id);
                          if (!p || p.id === userId) return null;
                          return (
                            <option key={id} value={id}>
                              {String(p.seat).padStart(2, '0')}号 · {p.nickname}
                            </option>
                          );
                        })}
                      </select>
                      <button
                        type="button"
                        className="treasure-confirm-btn"
                        disabled={!selectedTarget || disabled}
                        onClick={() => {
                          if (selectedTarget) {
                            handleSend({
                              type: 'useTreasure',
                              payload: { action: 'guanyinMirror', targetId: selectedTarget },
                            });
                          }
                        }}
                      >
                        🪞 祭起照妖宝镜 · 辨察心性
                      </button>
                    </div>
                  ) : (
                    <div className="treasure-status-idle">
                      <p>
                        {guanyinMirror?.used
                          ? '✅ 慈航照妖镜本局已照耀完毕。'
                          : '⏳ 宝镜待机中：在任意一轮发车表决通过后，系统将自动开启 4 秒专属照耀窗口。'}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Mordred: Human Bag */}
              {self.role === 'mordred' && (
                <div className="treasure-card mordred-card">
                  <div className="treasure-card-header">
                    <span className="treasure-badge">🎒 弥勒至宝</span>
                    <h3>小雷音寺 · 后天人种袋</h3>
                  </div>
                  <p className="treasure-desc">
                    黄眉老怪偷下的佛门乾坤法宝。在第 3 轮或第 4 轮队长开始提名前，可将 1 位仙友收入袋中：该仙友本轮禁止被选入车队出战！
                    <br />
                    <small className="hint">※ 当轮队长不可被禁，整局限用 1 次，用于打破好人抱团车。</small>
                  </p>

                  {humanBag?.used ? (
                    <div className="treasure-result-box">
                      <div className="result-label">【袋中乾坤】</div>
                      <div className="result-content">
                        已在本局祭出后天人种袋！
                        <br />
                        禁锢仙友：<strong>{nameOf(humanBag.targetId || '')}</strong>
                      </div>
                    </div>
                  ) : humanBag?.available ? (
                    <div className="treasure-action-box">
                      <label htmlFor="human-bag-target">请选择欲收入袋中禁选的仙友：</label>
                      <select
                        id="human-bag-target"
                        value={selectedTarget}
                        onChange={e => setSelectedTarget(e.target.value)}
                      >
                        <option value="">点击选择禁锢目标</option>
                        {players
                          .filter(p => p.id !== game?.captainId)
                          .map(p => (
                            <option key={p.id} value={p.id}>
                              {String(p.seat).padStart(2, '0')}号 · {p.nickname}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        className="treasure-confirm-btn"
                        disabled={!selectedTarget || disabled}
                        onClick={() => {
                          if (selectedTarget) {
                            handleSend({
                              type: 'useTreasure',
                              payload: { action: 'humanBag', targetId: selectedTarget },
                            });
                          }
                        }}
                      >
                        🎒 祭起后天人种袋 · 禁选上车
                      </button>
                    </div>
                  ) : (
                    <div className="treasure-status-idle">
                      <p>
                        ⏳ 人种袋待命：需在第 3 轮或第 4 轮队长提名阶段（提车前）使用。
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Loyal Guardian: Jingu Seal */}
              {self.role === 'loyal' && (
                <div className="treasure-card loyal-card">
                  <div className="treasure-card-header">
                    <span className="treasure-badge">👑 护法信物</span>
                    <h3>取经护法 · 紧箍信物</h3>
                  </div>
                  <p className="treasure-desc">
                    头戴金箍，心向雷音。当局势危殆（好人已输 2 轮任务，比分 0:2 或 1:2）时激活。点击可消耗信物向大唐圣僧暗中明示你的护法座次！
                    <br />
                    <small className="hint">※ 你不知圣僧是谁，圣僧将私密获知你的座位号为绝对铁好人！</small>
                  </p>

                  {jinguSeal?.used ? (
                    <div className="treasure-result-box">
                      <div className="result-label">【佛印已传达】</div>
                      <div className="result-content">
                        你已捏动金箍向大唐圣僧亮明护法真身！
                        <br />
                        <span className="text-blue">圣僧已在暗中锁定你的座次，请全力辅佐圣僧逆转战局！</span>
                      </div>
                    </div>
                  ) : jinguSeal?.available ? (
                    <div className="treasure-action-box">
                      <p className="alert-text">取经队伍濒临绝境！紧箍信物已发光激活：</p>
                      <button
                        type="button"
                        className="treasure-confirm-btn gold-btn"
                        disabled={disabled}
                        onClick={() => {
                          handleSend({
                            type: 'useTreasure',
                            payload: { action: 'jinguSeal' },
                          });
                        }}
                      >
                        👑 默念紧箍佛印 · 向圣僧明示真身
                      </button>
                    </div>
                  ) : (
                    <div className="treasure-status-idle">
                      <p>⏳ 信物沉寂中：需待取经队伍遭遇 2 次任务失败（绝境逆风）时方可激活。</p>
                    </div>
                  )}
                </div>
              )}

              {/* Oberon: Banana Fan */}
              {self.role === 'oberon' && (
                <div className="treasure-card oberon-card">
                  <div className="treasure-card-header">
                    <span className="treasure-badge">🪭 平天神扇</span>
                    <h3>平天大圣 · 芭蕉神扇</h3>
                  </div>
                  <p className="treasure-desc">
                    太阴之精叶。若看出车队全是好人将直接拿分，可随时预设狂风。若本次组队投票通过，神扇将立刻掀起狂风吹散车队，换下任队长重新组队！
                    <br />
                    <small className="hint">
                      ※ 铁律锁：芭蕉扇吹散绝不计入 5 次流局上限，全场 0 秒等待无缝判定。
                    </small>
                  </p>

                  {bananaFan?.used ? (
                    <div className="treasure-result-box">
                      <div className="result-label">【芭蕉扇已出】</div>
                      <div className="result-content">
                        神扇狂风已在先前轮次成功吹散发车，本局法宝已消耗完毕。
                      </div>
                    </div>
                  ) : (
                    <div className="treasure-fan-toggle-box">
                      <div className="fan-status-indicator">
                        当前预设状态：
                        <strong className={bananaFan?.armed ? 'text-red font-bold' : 'text-blue'}>
                          {bananaFan?.armed ? '🌪️ 聚风待发（若投票通过则立刻吹散）' : '🍃 平息放行（按兵不动）'}
                        </strong>
                      </div>
                      <button
                        type="button"
                        className={`treasure-confirm-btn ${bananaFan?.armed ? 'cancel-fan-btn' : 'arm-fan-btn'}`}
                        disabled={disabled}
                        onClick={() => {
                          handleSend({
                            type: 'useTreasure',
                            payload: { action: 'bananaFan', armed: !bananaFan?.armed },
                          });
                        }}
                      >
                        {bananaFan?.armed ? '🍃 取消聚风（改为平息放行）' : '🌪️ 聚风待发（预设吹散本次通过）'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Merlin: Hidden Wisdom */}
              {self.role === 'merlin' && (
                <div className="treasure-card merlin-card">
                  <div className="treasure-card-header">
                    <span className="treasure-badge">🧘 大隐于市</span>
                    <h3>齐天大圣 · 潜龙勿用</h3>
                  </div>
                  <p className="treasure-desc">
                    圣婴大王红孩儿在暗中手执火尖枪，时刻窥伺真大圣踪迹。
                    <br />
                    大圣不持任何法宝、不起任何特殊波澜，以纯粹的大智慧在暗中引导唐三藏，深藏功名方为渡劫正道！
                  </p>
                </div>
              )}

              {/* Morgana: Shadow Twin */}
              {self.role === 'morgana' && (
                <div className="treasure-card morgana-card">
                  <div className="treasure-card-header">
                    <span className="treasure-badge">🎭 混世魔王</span>
                    <h3>假美猴王 · 随心机变</h3>
                  </div>
                  <p className="treasure-desc">
                    六耳猕猴精通变化，瞒天过海。已与妖魔同伙相认，且在唐三藏眼中与真大圣无异，静待时机乱真取胜。
                  </p>
                </div>
              )}

              {/* Female Demon: Minion */}
              {self.role === 'minion' && (
                <HeartBellControls bell={self.treasures?.heartBell} players={players} disabled={disabled || !send} send={handleSend} />
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
