export function RoomVoiceHint({ enabled }: { enabled: boolean }) {
  return <p className="hint room-voice-hint">{enabled
    ? '网页语音支持 5–12 人。需要通话时，请全员使用网页版；小游戏当前不接入此语音。'
    : '普通房不启用内置语音，可同桌交流或自行通话；网页与小游戏可同房进行 5–12 人对局。'}</p>;
}
