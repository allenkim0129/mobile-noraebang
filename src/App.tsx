import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown, ArrowRight, AudioLines, Check, ChevronRight, CircleHelp,
  ExternalLink, Headphones, Link, ListMusic, LoaderCircle, Maximize2,
  MicVocal, Music2, Play, Plus, Search, ShieldCheck, SkipForward, Sparkles, X,
} from 'lucide-react';
import Player, { type PlayerHandle } from './Player.js';
import SearchForm from './SearchForm.js';
import { appendToQueue, displayTitle, songFromUrl } from './lib/songs.js';
import { rememberSearch } from './lib/suggestions.js';
import type { ApiError, AppConfig, Provider, SearchResults, Song } from './types.js';

const suggestions = ['아이유 밤편지', 'DAY6 한 페이지가 될 수 있게', '윤하 사건의 지평선'];
const providerName: Record<Provider, string> = { tj: 'TJ', ky: '금영', other: 'YouTube' };

function ProviderBadge({ provider }: { provider: Provider }) {
  return <span className={`provider-badge ${provider}`}>{providerName[provider]}</span>;
}

function SongRow({ song, playing, queued, onPlay, onQueue }: {
  song: Song;
  playing: boolean;
  queued: boolean;
  onPlay(): void;
  onQueue(): void;
}) {
  return (
    <article className={`song-row ${playing ? 'is-playing' : ''}`}>
      <button className={`song-art ${song.provider}`} onClick={onPlay} aria-label={`${displayTitle(song.title)} 재생`}>
        {playing ? <AudioLines size={23} /> : <Play size={21} fill="currentColor" />}
      </button>
      <button className="song-description" onClick={onPlay}>
        <span className="song-title">{displayTitle(song.title)}</span>
        <span className="song-channel"><ProviderBadge provider={song.provider} />{song.channelTitle}</span>
      </button>
      <button className={`icon-button queue-add ${queued ? 'is-queued' : ''}`} onClick={onQueue} disabled={queued}
        aria-label={queued ? `${displayTitle(song.title)} 예약됨` : `${displayTitle(song.title)} 예약하기`}
        title={queued ? '이미 예약한 곡' : '예약하기'}>
        {queued ? <Check size={19} /> : <Plus size={19} />}
      </button>
    </article>
  );
}

export default function App() {
  const [query, setQuery] = useState('');
  const [link, setLink] = useState('');
  const [mode, setMode] = useState<'search' | 'link'>('search');
  const [filter, setFilter] = useState<'all' | 'tj' | 'ky'>('all');
  const [lastQuery, setLastQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [hosting, setHosting] = useState<AppConfig['hosting']>('local');
  const [configError, setConfigError] = useState('');
  const [current, setCurrent] = useState<Song | null>(null);
  const [playbackSequence, setPlaybackSequence] = useState(0);
  const [queue, setQueue] = useState<Song[]>([]);
  const [notice, setNotice] = useState('');
  const [consent, setConsent] = useState(false);
  const [consentReady, setConsentReady] = useState(false);
  const [storageWarning, setStorageWarning] = useState('');
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const request = useRef<AbortController | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const stage = useRef<HTMLElement>(null);
  const player = useRef<PlayerHandle>(null);
  const privacyDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    try {
      setConsent(localStorage.getItem('norae-consent-v1') === 'accepted');
    } catch {
      setStorageWarning('브라우저 저장소를 사용할 수 없어 동의 설정은 이 탭에서만 유지돼요.');
    }
    setConsentReady(true);
    const controller = new AbortController();
    void fetch('/api/config', { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('서버 설정을 확인하지 못했어요. 페이지를 새로고침해 주세요.');
      const data: AppConfig = await response.json();
      if (typeof data.searchConfigured !== 'boolean' || !['local', 'vercel'].includes(data.hosting)) {
        throw new Error('서버 설정 응답이 올바르지 않아요.');
      }
      setConfigured(data.searchConfigured);
      setHosting(data.hosting);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setConfigError(error instanceof Error ? error.message : '서버에 연결하지 못했어요.');
    });
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const dialog = privacyDialog.current;
    if (privacyOpen) dialog?.showModal();
    else dialog?.close();
  }, [privacyOpen]);

  useEffect(() => {
    if (!current) return;
    stage.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  }, [current, playbackSequence]);

  function acceptConsent() {
    setConsent(true);
    try {
      localStorage.setItem('norae-consent-v1', 'accepted');
    } catch {
      setStorageWarning('동의 설정을 저장하지 못했어요. 이 탭에서는 계속 사용할 수 있어요.');
    }
  }

  function canConnect() {
    if (consent) return true;
    setNotice('먼저 아래 YouTube 연결 안내를 확인하고 동의해 주세요.');
    document.getElementById('consent-notice')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }

  async function searchSongs(term: string, alternatives = false) {
    if (!canConnect()) return;
    const normalized = term.trim();
    if (!normalized || normalized.length > 100) {
      setSearchError('곡 제목이나 가수를 1~100자로 입력해 주세요.');
      searchInput.current?.focus();
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setSearching(true);
    setSearchError('');
    setLastQuery(normalized);
    if (!alternatives) {
      setResults(null);
      setFilter('all');
    }
    try {
      const params = new URLSearchParams({ q: normalized });
      if (alternatives) params.set('alternatives', 'true');
      const response = await fetch(`/api/search?${params}`, { signal: controller.signal });
      if (!response.ok) {
        const body: ApiError = await response.json();
        throw new Error(body.error || '검색하지 못했어요. 잠시 후 다시 시도해 주세요.');
      }
      const data: SearchResults = await response.json();
      if (controller.signal.aborted) return;
      setResults(data);
      setRecentSearches((previous) => rememberSearch(previous, normalized));
    } catch (error) {
      if (controller.signal.aborted) return;
      setSearchError(error instanceof Error ? error.message : '검색 중 문제가 생겼어요.');
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }

  function playSong(song: Song) {
    if (!canConnect()) return;
    // Send playback during the user action instead of recreating the iframe in an effect.
    player.current?.play(song);
    setCurrent(song);
    setPlaybackSequence((value) => value + 1);
    setQueue((items) => items.filter((item) => item.id !== song.id));
  }

  function addToQueue(song: Song) {
    setQueue((items) => appendToQueue(items, song));
    setNotice('예약 목록에 담았어요.');
  }

  function playNext() {
    const next = queue[0];
    if (next) playSong(next);
    else setNotice('마지막 곡이에요. 다음에 부를 곡을 예약해 보세요.');
  }

  function submit(value: string) {
    if (mode === 'search') {
      void searchSongs(value);
      return;
    }
    if (!canConnect()) return;
    const song = songFromUrl(value);
    if (!song) {
      setSearchError('올바른 YouTube 영상 링크를 입력해 주세요. 재생목록 링크만으로는 재생할 수 없어요.');
      return;
    }
    setSearchError('');
    playSong(song);
  }

  async function fullscreen() {
    try {
      if (!stage.current?.requestFullscreen) {
        setNotice('이 브라우저에서는 영상 안의 전체화면 버튼을 사용해 주세요.');
        return;
      }
      await stage.current.requestFullscreen();
    } catch {
      setNotice('전체화면으로 전환하지 못했어요. 영상 안의 전체화면 버튼을 사용해 주세요.');
    }
  }

  const official = results?.official.filter((song) => filter === 'all' || song.provider === filter) ?? [];
  const queueIds = new Set(queue.map((song) => song.id));
  const nextSong = queue[0];

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="norae. 홈"><span className="brand-icon"><AudioLines size={23} /></span>norae<span className="brand-dot">.</span></a>
        <span className="header-caption">나만의 작은 노래방</span>
        <a className="header-queue" href="#queue"><ListMusic size={17} /> 예약곡 <span>{queue.length}</span></a>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span className="live-dot" /> YOUR ROOM, YOUR STAGE</div>
            <h1>오늘은, 어떤 노래를<br /><span>부르고 싶나요?</span></h1>
            <p>익숙한 반주에 나만의 목소리를.<br className="mobile-break" /> 설치 없이, 지금 여기가 노래방.</p>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <span className="art-star star-one">✦</span><span className="art-star star-two">✧</span>
            <span className="floating-note note-one"><Music2 size={26} /></span>
            <span className="floating-note note-two"><Music2 size={18} /></span>
            <div className="mic-disc"><MicVocal size={71} strokeWidth={1.35} /></div>
            <div className="art-label"><span /> JUST PRESS PLAY</div>
          </div>
        </section>

        <div className={`workspace ${current ? 'is-playing' : ''}`}>
          <section className="stage-card" ref={stage} aria-label="노래 재생">
            <div className="panel-heading"><span className="eyebrow"><span className={`live-dot ${current ? '' : 'muted'}`} /> NOW PLAYING</span><button className="icon-button" aria-label="플레이어 크게 보기" title="크게 보기" disabled={!current} onClick={() => void fullscreen()}><Maximize2 size={16} /></button></div>
            <div className="next-up">
              <span className="next-up-label"><SkipForward size={14} /> 다음 곡</span>
              <div className="next-up-song" role="status" aria-label="다음 예약곡" aria-live="polite" aria-atomic="true">{nextSong
                ? <><ProviderBadge provider={nextSong.provider} /><strong title={displayTitle(nextSong.title)}>{displayTitle(nextSong.title)}</strong></>
                : <span>예약곡이 없어요</span>}</div>
              <button className="next-button" onClick={playNext} disabled={!queue.length} aria-label="다음 예약곡 재생" title="다음 예약곡"><SkipForward size={20} /></button>
            </div>
            {current ? <Player ref={player} song={current} onEnded={playNext} /> : <div className="empty-stage"><div className="stage-rings"><MicVocal size={33} strokeWidth={1.5} /></div><strong>무대가 준비됐어요</strong><p>노래를 선택하면 여기에 재생돼요</p><div className="equalizer" aria-hidden="true">{Array.from({ length: 19 }, (_, i) => <span key={i} style={{ height: `${8 + ((i * 13 + 7) % 25)}px` }} />)}</div></div>}
            <div className="now-playing-info">
              <div><span className="track-caption">{current ? '지금 부르는 곡' : '오늘의 주인공은 당신'}</span><h2>{current ? displayTitle(current.title) : '첫 소절을 시작해 볼까요?'}</h2><p>{current ? current.channelTitle : '좋아하는 노래 한 곡이면 충분해요.'}</p></div>
            </div>
            <div className="stage-footnote"><Music2 size={13} />가사와 반주는 YouTube 원본 영상으로 제공돼요</div>
          </section>

          <section className="discovery" aria-label="노래 검색">
            <div className="search-card">
              <div className="search-tabs" aria-label="검색 방식">
                <button className={mode === 'search' ? 'active' : ''} onClick={() => { setMode('search'); setSearchError(''); }}><Search size={16} /> 노래 검색</button>
                <button className={mode === 'link' ? 'active' : ''} onClick={() => { setMode('link'); setSearchError(''); }}><Link size={16} /> YouTube 링크</button>
              </div>
              <SearchForm mode={mode} value={mode === 'search' ? query : link} inputRef={searchInput}
                searching={searching} recentSearches={recentSearches}
                onChange={mode === 'search' ? setQuery : setLink} onSubmit={submit} />
              <div className="search-hint"><ShieldCheck size={14} />{mode === 'search' ? '금영 반주를 먼저, TJ와 다른 MR도 찾아드려요' : '검색 API 키 없이도 영상 링크로 바로 재생할 수 있어요'}</div>
            </div>

            {consentReady && !consent && (
              <div className="consent-notice" id="consent-notice">
                <ShieldCheck size={20} />
                <div><strong>YouTube 연결 안내</strong><p>검색어는 Google에 전달되며, 영상 재생 시 YouTube가 기기 정보·쿠키 등을 처리할 수 있어요. <button onClick={() => setPrivacyOpen(true)}>이용·개인정보 안내</button></p></div>
                <button className="small-primary" onClick={acceptConsent}>동의하고 시작</button>
              </div>
            )}
            {storageWarning && <p className="status-banner" role="status">{storageWarning}</p>}
            {(configured === false || configError) && (
              <div className="status-banner"><CircleHelp size={17} /><div>{configError || (hosting === 'vercel'
                ? <>Vercel의 Project Settings → Environment Variables에 <code>YOUTUBE_API_KEY</code>를 등록하고 다시 배포해 주세요.</>
                : <>검색을 연결하려면 서버의 <code>.env</code>에 <code>YOUTUBE_API_KEY</code>를 설정해 주세요.</>)}
                <button className="text-button" onClick={() => { setMode('link'); setSearchError(''); searchInput.current?.focus(); }}>YouTube 링크로 바로 재생 <ArrowRight size={13} /></button></div></div>
            )}
            {searchError && <div className="error-banner" role="alert"><CircleHelp size={18} /><span>{searchError}</span></div>}

            {!results && !searching && (
              <>
                <div className="suggestions"><span>이런 곡은 어때요?</span><div>{suggestions.map((term) => <button key={term} onClick={() => { setQuery(term); setMode('search'); void searchSongs(term); }}>{term}<ChevronRight size={13} /></button>)}</div></div>
                <div className="section-heading"><h2>나만의 무대를 시작해요</h2><span>첫 곡부터, 앙코르까지</span></div>
                <div className="start-card">
                  <div className="start-illustration" aria-hidden="true"><div className="record"><div><Music2 size={24} /></div></div><span className="record-spark">✦</span></div>
                  <h3>당신의 첫 곡을 기다리고 있어요</h3>
                  <p>좋아하는 가수나 곡 제목을 검색해 보세요.<br />부르고 싶은 노래는 예약 목록에 차곡차곡.</p>
                  <button className="outline-button" onClick={() => searchInput.current?.focus()}>첫 곡 찾으러 가기 <ArrowRight size={15} /></button>
                </div>
                <div className="feature-strip">
                  <div><span className="feature-icon purple"><ShieldCheck size={20} /></span><strong>금영 반주 우선</strong><p>금영 → TJ 순서로</p></div>
                  <div><span className="feature-icon peach"><ListMusic size={20} /></span><strong>끊기지 않는 무드</strong><p>예약곡 자동 이어 부르기</p></div>
                  <div><span className="feature-icon green"><Headphones size={20} /></span><strong>어디서든 가볍게</strong><p>설치 없는 웹 노래방</p></div>
                </div>
              </>
            )}

            {searching && !results && <div className="search-loading" role="status"><LoaderCircle size={28} className="spin" /><h3>부르고 싶은 곡을 찾고 있어요</h3><p>금영 · TJ 공식 채널을 확인하는 중이에요.</p></div>}
            {results && (
              <div className="search-results" aria-busy={searching}>
                <div className="section-heading result-heading"><h2>‘{lastQuery}’ 검색 결과</h2><span>YouTube 검색</span></div>
                <div className="result-filters" aria-label="공식 채널 필터">
                  {(['all', 'ky', 'tj'] as const).map((value) => <button key={value} aria-pressed={filter === value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{value === 'all' ? '공식 채널 전체' : providerName[value]}</button>)}
                </div>
                <div className="list-heading"><ShieldCheck size={15} /><h3>공식 노래방 반주</h3><span>{official.length}곡</span></div>
                {official.length ? official.map((song) => <SongRow key={song.id} song={song} playing={current?.id === song.id} queued={queueIds.has(song.id)} onPlay={() => playSong(song)} onQueue={() => addToQueue(song)} />)
                  : <div className="empty-results">{results.official.length ? '이 채널에서는 검색된 반주가 없어요. 다른 채널도 확인해 보세요.' : '공식 채널에서 반주를 찾지 못했어요. 아래 다른 MR 후보를 확인해 보세요.'}</div>}
                <div className="alternative-section">
                  <div className="list-heading"><Music2 size={15} /><h3>다른 MR도 찾아보기</h3></div>
                  <p className="alternative-note">다른 채널의 영상은 보컬 포함 여부와 반주 품질이 다를 수 있어요.</p>
                  {results.alternativesLoaded ? results.alternatives.length
                    ? results.alternatives.map((song) => <SongRow key={song.id} song={song} playing={current?.id === song.id} queued={queueIds.has(song.id)} onPlay={() => playSong(song)} onQueue={() => addToQueue(song)} />)
                    : <div className="empty-results">다른 MR 후보도 찾지 못했어요. 검색어를 바꾸거나 YouTube 링크를 입력해 주세요.</div>
                    : <button className="outline-button" disabled={searching} onClick={() => void searchSongs(lastQuery, true)}>{searching ? <LoaderCircle size={15} className="spin" /> : <Search size={15} />} 다른 채널의 MR 검색</button>}
                </div>
              </div>
            )}
          </section>

          <aside className="stage-column">
            <section className="queue-card" id="queue" aria-label="예약곡">
              <div className="queue-heading"><h2><ListMusic size={18} /> 다음에 부를 노래 <span>{queue.length}</span></h2>{queue.length > 0 && <button className="text-button" onClick={() => { setQueue([]); setNotice('예약 목록을 비웠어요.'); }}>비우기</button>}</div>
              {queue.length === 0 ? <div className="empty-queue"><ListMusic size={28} strokeWidth={1.4} /><p>아직 예약한 곡이 없어요</p><span>검색 결과의 + 버튼으로 담아보세요</span></div>
                : <ol className="queue-list">{queue.map((song, index) => <li key={song.id}><span className="queue-number">{String(index + 1).padStart(2, '0')}</span><button className="queue-song" onClick={() => playSong(song)}><strong>{displayTitle(song.title)}</strong><span>{providerName[song.provider]} · {song.channelTitle}</span></button><button className="icon-button" aria-label={`${displayTitle(song.title)} 예약 취소`} onClick={() => setQueue((items) => items.filter((item) => item.id !== song.id))}><X size={15} /></button></li>)}</ol>}
              <p className="queue-note"><ArrowDown size={12} />곡이 끝나면 다음 예약곡이 이어져요 · 이 탭에서만 유지</p>
            </section>
            <div className="little-note"><Sparkles size={16} /><p>잘 부르지 않아도 괜찮아요.<br /><strong>좋아하는 노래니까, 그걸로 충분해요.</strong></p></div>
          </aside>
        </div>
      </main>

      <footer><span className="footer-brand">norae.</span><span>노래가 필요한 모든 순간.</span><button onClick={() => setPrivacyOpen(true)}>이용·개인정보 안내 <ExternalLink size={11} /></button></footer>
      <div className={`toast ${notice ? 'visible' : ''}`} role="status" aria-live="polite">{notice && <><Check size={17} />{notice}</>}</div>
      <dialog ref={privacyDialog} className="privacy-dialog" onCancel={() => setPrivacyOpen(false)} onClose={() => setPrivacyOpen(false)}>
        <div className="dialog-heading"><h2>이용·개인정보 안내</h2><button className="icon-button" aria-label="안내 닫기" onClick={() => setPrivacyOpen(false)}><X size={20} /></button></div>
        <p>norae.는 개인의 비상업적 노래 연습을 위한 웹 노래방 프로토타입입니다. 녹음, 반주 다운로드, 키 조절 기능은 제공하지 않습니다.</p>
        <h3>YouTube 연결</h3><p>YouTube API Services로 검색하고 공식 플레이어로 영상을 재생합니다. 사용 시 <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube 서비스 약관</a>에 동의하게 됩니다. Google의 데이터 처리는 <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google 개인정보처리방침</a>을 따릅니다.</p>
        <h3>처리하는 정보</h3><p>검색어는 검색 서버와 Google에 전달됩니다. 서버는 검색 결과를 최대 5분 동안 메모리에 보관하며, 요청 제한을 위해 IP 주소와 요청 횟수를 최대 1분 동안 메모리에서 처리합니다. 별도 검색 기록 DB나 분석 도구는 사용하지 않습니다. 호스팅 업체의 접속 로그 정책은 배포 환경에 따라 달라집니다.</p>
        <p>입력 중 자동 추천은 준비된 곡·가수 목록과 이 탭의 최근 검색어로 기기에서 처리하며, 추천을 선택하거나 검색을 실행하기 전에는 검색어를 서버로 보내지 않습니다. 최근 검색어와 예약 목록은 이 탭의 메모리에만 유지되고 새로고침하면 삭제됩니다.</p>
        <p>영상 재생 시 YouTube가 IP 주소, 기기 정보 및 쿠키 등을 처리할 수 있습니다. 기기 저장소에는 연결 동의 여부만 저장합니다. 마이크와 카메라는 사용하지 않습니다.</p>
        <h3>제한 사항</h3><p>영상 가용성, 광고, 재생 제한은 YouTube와 권리자의 설정을 따릅니다. 개인용이라는 표기가 별도 이용허락을 대신하지 않으며, 공개 서비스나 수익화 전에는 정책·권리 범위를 다시 검토해야 합니다.</p>
        {consent && <button className="outline-button" onClick={() => {
          request.current?.abort();
          setSearching(false);
          setCurrent(null);
          setQueue([]);
          setResults(null);
          setRecentSearches([]);
          setConsent(false);
          try { localStorage.removeItem('norae-consent-v1'); }
          catch { setStorageWarning('저장된 동의 설정을 지우지 못했어요. 브라우저 사이트 데이터를 직접 삭제해 주세요.'); }
          setPrivacyOpen(false);
          setNotice('YouTube 연결 동의를 철회했어요. 검색과 재생을 중단했어요.');
        }}>연결 동의 철회 및 목록 지우기</button>}
      </dialog>
    </div>
  );
}
