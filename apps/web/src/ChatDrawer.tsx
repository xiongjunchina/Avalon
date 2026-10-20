import { useEffect, useRef, useState } from 'react';
import type { RoomChatMessage } from '@avalon/contracts';
import { api } from './api';
import './chat.css';

const TACTICAL_PHRASES = [
  '我是取经好人',
  '建议本轮流局',
  '队长选我，必是红心',
  '我看见假猴了！',
  '刺客别急，听我一言',
  '全票准行，即刻出征',
  '有人在浑水摸鱼',
  '这局必须查验他！',
  '平票也算流局，谨慎投！',
  '相信我，我带飞',
];

interface ChatDrawerProps {
  roomId: string;
  messages: RoomChatMessage[];
  onClose: () => void;
  onSent?: (text: string) => void;
}

export function ChatDrawer({ roomId, messages, onClose, onSent }: ChatDrawerProps) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState('');
  const streamEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Setup Web Speech Recognition if available
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = 'zh-CN';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsRecording(true);
        setVoiceNotice('正在聆听中，请说话…');
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0]?.[0]?.transcript;
        if (transcript) {
          setText(prev => (prev ? `${prev} ${transcript}` : transcript));
        }
        setIsRecording(false);
        setVoiceNotice('');
      };

      recognition.onerror = () => {
        setIsRecording(false);
        setVoiceNotice('语音识别未捕获，请重试');
        setTimeout(() => setVoiceNotice(''), 2500);
      };

      recognition.onend = () => {
        setIsRecording(false);
        setVoiceNotice('');
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const handleToggleVoice = () => {
    if (!recognitionRef.current) {
      alert('当前浏览器未开放原生语音识别，请直接使用手机键盘自带的语音输入键');
      return;
    }
    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      try {
        recognitionRef.current.start();
      } catch {
        recognitionRef.current.stop();
        setIsRecording(false);
      }
    }
  };

  const handleSend = async (contentToSend?: string) => {
    const content = (contentToSend ?? text).trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      await api(`/rooms/${roomId}/chat`, { text: content });
      onSent?.(content);
      setText('');
      // Auto close drawer after sending so view returns immediately to game table
      onClose();
    } catch (err: any) {
      alert(err.message || '发送失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat-drawer-backdrop" onClick={onClose}>
      <div className="chat-drawer-sheet" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="chat-drawer-header">
          <span className="chat-drawer-title">
            <span>💬 法坛传音</span>
            <small style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 400 }}>
              （发送后头像上方将自动冒泡提示全场）
            </small>
          </span>
          <button type="button" className="chat-drawer-close-btn" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        {/* Tactical Quick Phrases */}
        <div className="chat-tactical-section">
          <div className="chat-tactical-label">⚡ 快捷战术密语（点击直接秒发）：</div>
          <div className="chat-tactical-grid">
            {TACTICAL_PHRASES.map(phrase => (
              <button
                key={phrase}
                type="button"
                className="chat-tactical-chip"
                onClick={() => void handleSend(phrase)}
              >
                {phrase}
              </button>
            ))}
          </div>
        </div>

        {/* Chat Stream History */}
        <div className="chat-drawer-stream">
          {messages.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#64748b', fontSize: '12px', padding: '16px' }}>
              暂无法坛发言，点击上方常用语或打字传音
            </div>
          ) : (
            messages.map(m => (
              <div key={m.messageId} className="chat-stream-item">
                <span className="chat-stream-seat">{m.seat > 0 ? `${m.seat}号` : '旁观'}</span>
                <span className="chat-stream-name">{m.nickname}：</span>
                <span className="chat-stream-text">{m.text}</span>
              </div>
            ))
          )}
          <div ref={streamEndRef} />
        </div>

        {/* Voice recording notice */}
        {voiceNotice && (
          <div style={{ padding: '4px 16px', fontSize: '12px', color: '#38bdf8', background: 'rgba(56,189,248,0.1)' }}>
            🎙️ {voiceNotice}
          </div>
        )}

        {/* Input Bar */}
        <form
          className="chat-drawer-input-bar"
          onSubmit={e => {
            e.preventDefault();
            void handleSend();
          }}
        >
          <button
            type="button"
            className={`chat-voice-btn ${isRecording ? 'is-recording' : ''}`}
            onClick={handleToggleVoice}
            title="语音转文字"
          >
            🎙️
          </button>
          <input
            type="text"
            className="chat-text-input"
            placeholder="输入传音内容，发送后自动收起…"
            value={text}
            onChange={e => setText(e.target.value)}
            maxLength={100}
            autoFocus
          />
          <button type="submit" disabled={busy || !text.trim()} className="chat-send-btn">
            发送
          </button>
        </form>
      </div>
    </div>
  );
}
