import {
  LoaderCircle,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Square,
} from "lucide-react";
import type { ClassroomVoice, VoiceState } from "../classroom-voice";
import type { ClassroomRole } from "../classroom";

export interface VoiceProps {
  controller: ClassroomVoice;
  state: VoiceState;
}
export function VoiceMicrophoneStatus({ voice }: { voice: VoiceProps }) {
  const { state, controller } = voice;
  if (state.microphone === "off") return null;
  return (
    <div
      className={`classroom-mic-status ${state.muted ? "is-muted" : ""}`}
      role="status"
    >
      {state.microphone === "requesting" ? (
        <LoaderCircle size={14} className="spin" />
      ) : state.muted ? (
        <MicOff size={14} />
      ) : (
        <Mic size={14} />
      )}
      <span>
        {state.microphone === "requesting"
          ? "等待麥克風權限"
          : state.muted
            ? "麥克風已靜音"
            : "麥克風已開啟"}
      </span>
      <button
        onClick={() => controller.stop()}
        aria-label={
          state.microphone === "requesting" ? "取消開啟麥克風" : "關閉麥克風"
        }
      >
        <Square size={12} />
        {state.microphone === "requesting" ? "取消" : "關閉"}
      </button>
    </div>
  );
}
export function ClassroomVoiceControls({
  voice,
  role,
  connected,
  signalingOpen,
}: {
  voice: VoiceProps;
  role: ClassroomRole | null;
  connected: number;
  signalingOpen: boolean;
}) {
  const { controller, state } = voice;
  return (
    <section className="classroom-voice" aria-label="教室語音控制">
      <div className="classroom-voice-intro">
        <Mic size={23} />
        <h3>
          {role === "teacher" ? "用聲音帶著全班練習" : "開麥，向老師說明問題"}
        </h3>
        <p>
          {role === "teacher"
            ? "你的聲音傳給已連線的同學；同學的聲音只傳給你。"
            : "你的聲音只傳給老師；也能一邊寫程式、一邊聽老師講解。"}
        </p>
      </div>
      <div className="classroom-voice-microphone">
        <h4>我的麥克風</h4>
        {state.microphone === "off" ? (
          <button
            className="primary"
            disabled={!role || !connected || !signalingOpen}
            onClick={() => void controller.start()}
          >
            <Mic size={16} />
            {role === "teacher" ? "開啟麥克風廣播" : "開啟麥克風傳給老師"}
          </button>
        ) : (
          <>
            <VoiceMicrophoneStatus voice={voice} />
            {state.microphone === "on" && (
              <button
                onClick={() => controller.mute()}
                aria-pressed={state.muted}
              >
                {state.muted ? <Mic size={16} /> : <MicOff size={16} />}
                {state.muted ? "恢復麥克風" : "暫時靜音麥克風"}
              </button>
            )}
          </>
        )}
        <p role="status">
          {state.microphone === "on"
            ? `語音已連接 ${state.sending} 位${role === "teacher" ? "同學" : "老師"}${state.muted ? "（已靜音）" : ""}`
            : "按開啟後才會取得麥克風權限；停止會釋放麥克風。"}
        </p>
      </div>
      <div className="classroom-voice-listen">
        <h4>{role === "teacher" ? "收聽同學" : "收聽老師"}</h4>
        <button
          onClick={() =>
            controller.listen(state.playbackBlocked || !state.listening)
          }
          aria-pressed={state.listening && !state.playbackBlocked}
        >
          {state.listening && !state.playbackBlocked ? (
            <VolumeX size={16} />
          ) : (
            <Volume2 size={16} />
          )}
          {state.playbackBlocked
            ? "點此播放語音"
            : state.listening
              ? "暫停收聽"
              : "啟用語音收聽"}
        </button>
        <p>
          {state.playbackBlocked
            ? "瀏覽器尚未允許播放，請按上方按鈕開始收聽。"
            : state.listening
              ? "已啟用收聽，切換頁面仍可聽見。"
              : "收聽不需開麥。請先啟用收聽，收到語音時即可播放。"}
        </p>
        <label className="classroom-voice-volume">
          收聽音量 · {Math.round(state.volume * 100)}%
          <input
            aria-label="語音收聽音量"
            type="range"
            min="0"
            max="100"
            value={Math.round(state.volume * 100)}
            onChange={(e) => controller.setVolume(Number(e.target.value) / 100)}
          />
        </label>
        <ul aria-label="目前收到的語音">
          {state.receiving.map((item) => (
            <li key={item.peer}>
              <Volume2 size={14} />
              <span>{item.name} · 語音連線中</span>
            </li>
          ))}
        </ul>
        {!state.receiving.length && <p>目前沒有收到語音。</p>}
      </div>
      {state.error && (
        <div className="classroom-voice-error" role="alert">
          <p>{state.error}</p>
          {state.microphone === "on" && (
            <button onClick={() => controller.retry()}>重試語音連線</button>
          )}
        </div>
      )}
      <p className="classroom-voice-note">
        建議使用耳機。語音即時傳送，不會錄音或儲存。結束教室連線也會停止麥克風與收聽。
      </p>
    </section>
  );
}
