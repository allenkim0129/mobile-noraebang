import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react';
import type { Song } from './types.js';

interface YouTubePlayer {
  playVideo(): void;
  pauseVideo(): void;
  cueVideoById(options: { videoId: string; startSeconds: number }): void;
  loadVideoById(options: { videoId: string; startSeconds: number }): void;
  destroy(): void;
}

export interface PlayerHandle {
  play(song: Song): void;
  prepare(song: Song): void;
  pause(): void;
  resume(): void;
}

interface PlayerOptions {
  videoId: string;
  width: string;
  height: string;
  playerVars: Record<string, string | number>;
  events: {
    onStateChange(event: { data: number }): void;
    onError(event: { data: number }): void;
    onAutoplayBlocked(): void;
    onReady(event: { target: YouTubePlayer }): void;
  };
}

declare global {
  interface Window {
    YT?: { Player: new (element: HTMLElement, options: PlayerOptions) => YouTubePlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | undefined;

function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    let timer: ReturnType<typeof setTimeout>;
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      window.onYouTubeIframeAPIReady = undefined;
      reject(new Error('YouTube 플레이어를 불러오지 못했어요. 네트워크나 콘텐츠 차단 설정을 확인해 주세요.'));
    };
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer);
      resolve();
    };
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = fail;
    timer = setTimeout(fail, 15_000);
    document.head.append(script);
  }).catch((error: unknown) => {
    apiPromise = undefined;
    throw error;
  });
  return apiPromise;
}

function playerError(code: number) {
  if (code === 101 || code === 150) return '이 영상은 외부 재생이 제한되어 있어요. 다른 반주를 고르거나 YouTube에서 열어 주세요.';
  if (code === 100) return '삭제되었거나 비공개인 영상이에요. 다른 반주를 골라 주세요.';
  if (code === 153) return 'YouTube가 사이트 정보를 확인하지 못했어요. 브라우저의 Referer 차단 설정을 확인해 주세요.';
  return '이 영상을 재생하지 못했어요. 다시 시도하거나 다른 반주를 골라 주세요.';
}

export default function Player({ song, startPaused = false, onEnded, onIssue, onPlaying, ref }: { song: Song; startPaused?: boolean; onEnded(): void; onIssue?(message: string, requiresTap?: boolean): void; onPlaying?(): void; ref: Ref<PlayerHandle> }) {
  const host = useRef<HTMLDivElement>(null);
  const ended = useRef(onEnded);
  const selected = useRef(song);
  const instance = useRef<YouTubePlayer | null>(null);
  const instanceReady = useRef(false);
  const shouldPlay = useRef(!startPaused);
  const prepared = useRef(startPaused);
  const issue = useRef(onIssue);
  issue.current = onIssue;
  const playing = useRef(onPlaying);
  playing.current = onPlaying;
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [retry, setRetry] = useState(0);

  useImperativeHandle(ref, () => ({
    play(nextSong) {
      const usePrepared = prepared.current && selected.current.id === nextSong.id;
      shouldPlay.current = true;
      prepared.current = false;
      selected.current = nextSong;
      setError('');
      setAutoplayBlocked(false);
      if (instanceReady.current && instance.current) {
        if (usePrepared) instance.current.playVideo();
        else instance.current.loadVideoById({ videoId: nextSong.id, startSeconds: 0 });
      }
    },
    prepare(nextSong) {
      shouldPlay.current = false;
      prepared.current = true;
      selected.current = nextSong;
      setError('');
      setAutoplayBlocked(false);
      if (instanceReady.current) instance.current?.cueVideoById({ videoId: nextSong.id, startSeconds: 0 });
    },
    pause() {
      shouldPlay.current = false;
      if (instanceReady.current) instance.current?.pauseVideo();
    },
    resume() {
      shouldPlay.current = true;
      if (instanceReady.current) instance.current?.playVideo();
    },
  }), []);

  useEffect(() => { ended.current = onEnded; }, [onEnded]);
  useEffect(() => {
    let disposed = false;
    let player: YouTubePlayer | undefined;
    setError('');
    setReady(false);
    setAutoplayBlocked(false);
    void loadYouTubeApi().then(() => {
      if (disposed || !host.current || !window.YT) return;
      const target = document.createElement('div');
      host.current.replaceChildren(target);
      const initialVideoId = selected.current.id;
      player = new window.YT.Player(target, {
        videoId: initialVideoId,
        width: '100%',
        height: '100%',
        playerVars: { playsinline: 1, autoplay: 0, rel: 0, origin: window.location.origin },
        events: {
          onReady: ({ target: readyPlayer }) => {
            if (disposed) return;
            instance.current = readyPlayer;
            instanceReady.current = true;
            setReady(true);
            if (!shouldPlay.current) readyPlayer.cueVideoById({ videoId: selected.current.id, startSeconds: 0 });
            else if (selected.current.id === initialVideoId) readyPlayer.playVideo();
            else readyPlayer.loadVideoById({ videoId: selected.current.id, startSeconds: 0 });
          },
          onStateChange: ({ data }) => {
            if (disposed) return;
            if (data === 1) {
              setAutoplayBlocked(false);
              playing.current?.();
            }
            if (data === 0) ended.current();
          },
          onError: ({ data }) => {
            if (disposed) return;
            const message = playerError(data);
            setError(message);
            issue.current?.(message);
          },
          onAutoplayBlocked: () => {
            if (disposed) return;
            setAutoplayBlocked(true);
            issue.current?.('브라우저가 음성 확인 뒤의 재생을 차단했어요. 정차 후 아래 재생 버튼이나 영상 안의 재생 버튼을 한 번 직접 눌러 주세요.', true);
          },
        },
      });
      instance.current = player;
    }).catch((cause: unknown) => {
      if (!disposed) {
        const message = cause instanceof Error ? cause.message : '플레이어를 불러오지 못했어요.';
        setError(message);
        issue.current?.(message);
      }
    });
    return () => {
      disposed = true;
      instanceReady.current = false;
      instance.current = null;
      player?.destroy();
    };
  }, [retry]);

  return (
    <>
      <div className="video-frame">
        {!ready && !error && <div className="player-loading" role="status"><LoaderCircle className="spin" /> YouTube 연결 중</div>}
        <div ref={host} className="youtube-host" />
      </div>
      {autoplayBlocked && !error && <p className="player-note">브라우저가 재생 시작을 차단했어요. 영상 안의 ▶ 버튼을 직접 눌러 주세요. iPhone Safari에서는 첫 재생에 직접 터치가 필요할 수 있어요.</p>}
      {error && (
        <div className="player-error" role="alert">
          <p>{error}</p>
          <div className="inline-actions">
            <button className="text-button" onClick={() => {
              shouldPlay.current = true;
              setRetry((value) => value + 1);
            }}><RefreshCw size={14} /> 다시 시도</button>
            <a href={`https://www.youtube.com/watch?v=${song.id}`} target="_blank" rel="noopener noreferrer">YouTube에서 열기 <ExternalLink size={13} /></a>
          </div>
        </div>
      )}
    </>
  );
}
