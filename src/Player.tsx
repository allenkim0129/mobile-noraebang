import { useEffect, useRef, useState } from 'react';
import { ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react';
import type { Song } from './types.js';

interface YouTubePlayer {
  destroy(): void;
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
    onReady(): void;
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

export default function Player({ song, onEnded }: { song: Song; onEnded(): void }) {
  const host = useRef<HTMLDivElement>(null);
  const ended = useRef(onEnded);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [retry, setRetry] = useState(0);

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
      player = new window.YT.Player(target, {
        videoId: song.id,
        width: '100%',
        height: '100%',
        playerVars: { playsinline: 1, autoplay: 1, rel: 0, origin: window.location.origin },
        events: {
          onReady: () => { if (!disposed) setReady(true); },
          onStateChange: ({ data }) => { if (!disposed && data === 0) ended.current(); },
          onError: ({ data }) => { if (!disposed) setError(playerError(data)); },
          onAutoplayBlocked: () => { if (!disposed) setAutoplayBlocked(true); },
        },
      });
    }).catch((cause: unknown) => {
      if (!disposed) setError(cause instanceof Error ? cause.message : '플레이어를 불러오지 못했어요.');
    });
    return () => {
      disposed = true;
      player?.destroy();
    };
  }, [song.id, retry]);

  return (
    <>
      <div className="video-frame">
        {!ready && !error && <div className="player-loading" role="status"><LoaderCircle className="spin" /> YouTube 연결 중</div>}
        <div ref={host} className="youtube-host" />
      </div>
      {autoplayBlocked && !error && <p className="player-note">영상 안의 재생 버튼을 눌러 시작해 주세요.</p>}
      {error && (
        <div className="player-error" role="alert">
          <p>{error}</p>
          <div className="inline-actions">
            <button className="text-button" onClick={() => setRetry((value) => value + 1)}><RefreshCw size={14} /> 다시 시도</button>
            <a href={`https://www.youtube.com/watch?v=${song.id}`} target="_blank" rel="noopener noreferrer">YouTube에서 열기 <ExternalLink size={13} /></a>
          </div>
        </div>
      )}
    </>
  );
}
