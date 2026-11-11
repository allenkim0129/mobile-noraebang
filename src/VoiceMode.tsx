import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Volume2 } from 'lucide-react';
import { displayTitle, providerName } from './lib/songs.js';
import { recognitionConstructor, recognitionError, type Recognition } from './lib/speech.js';
import { automaticVoiceSong, parseVoiceChoice, parseVoiceConfirmation, parseVoiceQuery, voiceCandidates } from './lib/voice.js';
import type { ApiError, SearchResults, Song } from './types.js';

type Phase = 'idle' | 'listening' | 'searching' | 'speaking' | 'playback' | 'error';

export default function VoiceMode({ consent, configured, configError, issue, playbackStarted, onConsent, onPrepare, onPlay, onPause, onResume, onPrivacy }: {
  consent: boolean;
  configured: boolean | null;
  configError: string;
  issue: { message: string; requiresTap?: boolean } | null;
  playbackStarted: number;
  onConsent(): void;
  onPrepare(song: Song): void;
  onPlay(song: Song): void;
  onPause(): void;
  onResume(): void;
  onPrivacy(): void;
}) {
  const [speechConsent, setSpeechConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('“아이유의 밤편지 찾아줘”처럼 말해 주세요.');
  const [transcript, setTranscript] = useState('');
  const [candidates, setCandidates] = useState<Song[]>([]);
  const [page, setPage] = useState(0);
  const [pendingSong, setPendingSong] = useState<Song | null>(null);
  const [requiresTap, setRequiresTap] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const request = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const props = useRef({ onPrepare, onPlay, onPause, onResume });
  props.current = { onPrepare, onPlay, onPause, onResume };
  const supported = Boolean(recognitionConstructor() && window.speechSynthesis && window.SpeechSynthesisUtterance);
  const enabled = supported && speechConsent && consent && configured === true && !configError;

  function invalidate() {
    generation.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const active = recognition.current;
    recognition.current = null;
    if (active) {
      active.onresult = null;
      active.onerror = null;
      active.onend = null;
      active.abort();
    }
    request.current?.abort();
    request.current = null;
    window.speechSynthesis?.cancel();
    return generation.current;
  }

  function fail(text: string) {
    invalidate();
    setPhase('error');
    setMessage(text);
  }

  function speak(text: string, after?: () => void) {
    const token = invalidate();
    props.current.onPause();
    setMessage(text);
    setPhase('speaking');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ko-KR';
    const finish = () => {
      if (token !== generation.current) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (after) after();
      else setPhase('idle');
    };
    utterance.onend = finish;
    utterance.onerror = () => {
      if (token === generation.current) fail('음성 안내를 재생하지 못했어요. 정차 후 화면을 확인해 주세요.');
    };
    timer.current = setTimeout(() => {
      if (token === generation.current) fail('음성 안내가 완료되지 않았어요. 정차 후 다시 시도해 주세요.');
    }, 60_000);
    try { window.speechSynthesis.speak(utterance); }
    catch { fail('음성 안내를 시작하지 못했어요. 정차 후 다시 시도해 주세요.'); }
  }

  function cancel() {
    invalidate();
    setCandidates([]);
    setPendingSong(null);
    setRequiresTap(false);
    setPage(0);
    setPhase('idle');
    setMessage('취소했어요. 마이크는 꺼져 있어요.');
  }

  function play(song: Song) {
    invalidate();
    setCandidates([]);
    setPendingSong(null);
    setRequiresTap(false);
    setPage(0);
    setPhase('playback');
    setMessage(`${providerName[song.provider]} ${displayTitle(song.title)} 재생을 요청했어요. 마이크는 꺼져 있어요. 재생이 차단되면 정차 후 영상 안의 재생 버튼을 눌러 주세요.`);
    props.current.onPlay(song);
  }

  function confirm(song: Song) {
    setCandidates([]);
    setPendingSong(song);
    setRequiresTap(false);
    props.current.onPrepare(song);
    speak(`${providerName[song.provider]}, ${displayTitle(song.title).slice(0, 100)}. 재생할까요? 재생해, 또는 취소라고 말해 주세요.`,
      () => listen('confirm', [], 0, song));
  }

  function readCandidates(songs: Song[], nextPage: number) {
    setPage(nextPage);
    const batch = songs.slice(nextPage * 3, nextPage * 3 + 3);
    const choices = batch.map((song, index) => `${index + 1}번, ${providerName[song.provider]}, ${displayTitle(song.title).slice(0, 100)}`).join('. ');
    speak(`정확히 일치하는 공식 반주를 확정하지 못했어요. ${choices}. 첫 번째, 두 번째, 세 번째, 다른 후보, 다시 검색, 또는 취소라고 말해 주세요.`,
      () => listen('choice', songs, nextPage));
  }

  async function search(text: string) {
    const parsed = parseVoiceQuery(text);
    if (!parsed) {
      speak('가수와 곡명을 알아듣지 못했어요. 말하기를 누른 뒤 아이유의 밤편지 찾아줘처럼 말해 주세요.');
      return;
    }
    const token = invalidate();
    const controller = new AbortController();
    request.current = controller;
    setPhase('searching');
    setMessage(`“${parsed.query}” 반주를 찾고 있어요.`);
    timer.current = setTimeout(() => {
      if (token === generation.current) fail('검색 응답이 늦어 중단했어요. 정차 후 다시 시도해 주세요.');
    }, 20_000);
    try {
      const params = new URLSearchParams({ q: parsed.query });
      const response = await fetch(`/api/search?${params}`, { signal: controller.signal });
      if (controller.signal.aborted || token !== generation.current) return;
      if (!response.ok) {
        const body: ApiError = await response.json();
        throw new Error(body.error || '검색하지 못했어요. 잠시 후 다시 시도해 주세요.');
      }
      const results: SearchResults = await response.json();
      if (controller.signal.aborted || token !== generation.current) return;
      const songs = voiceCandidates(results);
      const exact = automaticVoiceSong(songs, parsed);
      if (exact) {
        confirm(exact);
      } else if (songs.length) {
        setCandidates(songs);
        readCandidates(songs, 0);
      } else {
        speak('반주를 찾지 못했어요. 말하기를 누르고 가수와 곡명을 다시 말해 주세요.');
      }
    } catch (error: unknown) {
      if (controller.signal.aborted || token !== generation.current) return;
      speak(error instanceof Error ? error.message : '검색 중 문제가 생겼어요. 다시 시도해 주세요.');
    }
  }

  function listen(kind: 'search' | 'choice' | 'confirm', songs = candidates, selectedPage = page, selectedSong = pendingSong) {
    if (!enabled) return;
    const Constructor = recognitionConstructor();
    if (!Constructor) { fail('이 브라우저는 음성 인식을 지원하지 않아요. 일반 모드를 이용해 주세요.'); return; }
    const token = invalidate();
    props.current.onPause();
    let active: Recognition;
    try { active = new Constructor(); }
    catch { fail('음성 인식을 준비하지 못했어요. 정차 후 브라우저 설정을 확인해 주세요.'); return; }
    recognition.current = active;
    active.lang = 'ko-KR';
    active.continuous = false;
    active.interimResults = false;
    active.maxAlternatives = 1;
    setPhase('listening');
    setMessage(kind === 'search' ? '듣고 있어요. 가수와 곡명을 말해 주세요.'
      : kind === 'confirm' ? '재생할까요? “재생해” 또는 “취소”라고 말해 주세요.'
        : '듣고 있어요. 후보 번호 또는 취소라고 말해 주세요.');
    active.onresult = (event) => {
      if (token !== generation.current) return;
      const result = Array.from(event.results).find((item) => item.isFinal);
      if (!result) return;
      const text = result[0].transcript.trim();
      invalidate();
      setTranscript(text);
      const choice = parseVoiceChoice(text);
      if (choice.type === 'cancel') { cancel(); return; }
      if (kind === 'search') {
        setCandidates([]);
        setPage(0);
        void search(text);
      } else if (kind === 'confirm') {
        const answer = parseVoiceConfirmation(text);
        if (answer === 'play' && selectedSong) play(selectedSong);
        else if (answer === 'search') {
          setPendingSong(null);
          speak('가수와 곡명을 말해 주세요.', () => listen('search', [], 0));
        } else {
          speak('재생 여부를 확인하지 못했어요. 말하기를 누른 뒤 재생해, 또는 취소라고 말해 주세요.');
        }
      } else if (choice.type === 'search') {
        setCandidates([]);
        setPage(0);
        speak('가수와 곡명을 말해 주세요.', () => listen('search', [], 0));
      } else if (choice.type === 'next') {
        readCandidates(songs, (selectedPage + 1) * 3 < songs.length ? selectedPage + 1 : 0);
      } else if (choice.type === 'select' && songs[selectedPage * 3 + choice.index]) {
        confirm(songs[selectedPage * 3 + choice.index]);
      } else {
        speak('후보 번호를 확인하지 못했어요. 말하기를 누른 뒤 첫 번째, 두 번째, 세 번째, 또는 취소라고 말해 주세요.');
      }
    };
    active.onerror = ({ error }) => {
      if (token === generation.current) fail(recognitionError(error));
    };
    active.onend = () => {
      if (token === generation.current) fail('음성을 인식하지 못했어요. 정차 후 말하기를 눌러 주세요.');
    };
    timer.current = setTimeout(() => {
      if (token === generation.current) fail('듣기 시간이 끝났어요. 마이크를 껐습니다. 정차 후 말하기를 눌러 주세요.');
    }, 15_000);
    try { active.start(); }
    catch { fail('음성 인식을 시작하지 못했어요. 정차 후 말하기 버튼을 직접 눌러 주세요.'); }
  }

  useEffect(() => {
    function hide() {
      if (document.visibilityState !== 'hidden') return;
      invalidate();
      props.current.onPause();
      setCandidates([]);
      setPendingSong(null);
      setRequiresTap(false);
      setPhase('idle');
      setMessage('화면을 벗어나 음성 처리를 중단했어요. 정차 후 다시 시작해 주세요.');
    }
    document.addEventListener('visibilitychange', hide);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      invalidate();
    };
  }, []);

  useEffect(() => {
    if (!issue) return;
    setRequiresTap(Boolean(issue.requiresTap));
    if (speechConsent) speak(issue.message);
    else {
      invalidate();
      setPhase('idle');
      setMessage(issue.message);
    }
  }, [issue, speechConsent]);

  useEffect(() => {
    if (!playbackStarted) return;
    invalidate();
    setCandidates([]);
    setPendingSong(null);
    setRequiresTap(false);
    setPhase('playback');
    setMessage('영상이 재생 중이에요. 마이크는 꺼져 있어요.');
  }, [playbackStarted]);

  const busy = phase === 'listening' || phase === 'searching' || phase === 'speaking';
  const setupNeeded = !consent || !speechConsent || !supported || configured !== true || Boolean(configError);
  return (
    <section className="voice-panel" aria-label="한 곡 음성 검색">
      <p className={`voice-status ${phase}`} role={phase === 'error' ? 'alert' : 'status'} aria-live="polite" title={message}>{message}</p>
      <div className="voice-actions">
        <button className="voice-listen" disabled={!enabled || busy} onClick={() => {
          if (pendingSong) listen('confirm');
          else if (candidates.length) listen('choice');
          else {
            setPage(0);
            setTranscript('');
            listen('search', [], 0);
          }
        }}><Mic size={22} />{phase === 'listening' ? '듣는 중' : '말하기'}</button>
        <button className="voice-stop outline-button" onClick={() => {
          cancel();
          props.current.onPause();
          setMessage('중지했어요. 마이크를 끄고 재생을 일시정지했어요.');
        }}><Square size={20} /> 중지</button>
        {requiresTap && <button className="voice-play outline-button" onClick={() => {
          cancel();
          props.current.onResume();
          setMessage('재생을 다시 요청했어요. 마이크는 꺼져 있어요.');
        }}>재생</button>}
        <button className="voice-details-toggle text-button" aria-expanded={detailsOpen || setupNeeded} aria-controls="voice-details" onClick={() => setDetailsOpen((value) => !value)}>안내</button>
      </div>
      <div id="voice-details" hidden={!detailsOpen && !setupNeeded}>
        <h1>한 곡 음성 검색</h1>
        <p className="voice-safety">설정·권한 허용·화면 조작은 정차 후 해 주세요. 잠금·백그라운드의 무터치 동작은 보장하지 않습니다.</p>
        {!supported && <p className="error-banner" role="alert">이 브라우저는 필요한 음성 인식·안내 기능을 지원하지 않아요. 일반 모드를 이용해 주세요.</p>}
        {configError && <p className="error-banner" role="alert">{configError}</p>}
        {configured === false && <p className="error-banner" role="alert">서버에 YouTube 검색 API 키가 설정되지 않았어요. 일반 모드의 설정 안내를 확인해 주세요.</p>}
        {configured === null && !configError && <p role="status">검색 설정 확인 중이에요.</p>}
        {!consent && <div className="voice-consent"><p>YouTube 검색어는 서버와 Google에 전달되며 영상 재생 시 기기 정보·쿠키가 처리될 수 있어요.</p><button className="outline-button" onClick={onConsent}>YouTube 연결에 동의</button></div>}
        {!speechConsent && <div className="voice-consent"><p>말하기를 누르면 마이크를 사용합니다. 브라우저의 음성 인식 서비스로 음성이 전송될 수 있어요. 앱 서버는 음성을 받거나 녹음·저장하지 않으며 인식한 검색어만 검색 서버로 보냅니다. 음성 명령은 이 탭에서만 처리합니다.</p><button className="outline-button" onClick={() => setSpeechConsent(true)}>음성 처리 안내에 동의</button></div>}
        <p className="voice-detail-message">{message}</p>
        {transcript && <p className="voice-transcript">인식한 말: {transcript}</p>}
        {pendingSong && <p>재생 확인 대기: {providerName[pendingSong.provider]} · {displayTitle(pendingSong.title)}</p>}
        {candidates.length > 0 && <ol className="voice-candidates" aria-label="음성 선택 후보">{candidates.slice(page * 3, page * 3 + 3).map((song, index) => <li key={song.id}>{index + 1}번 · {providerName[song.provider]} · {displayTitle(song.title)}</li>)}</ol>}
        {candidates.length > 0 && !busy && <button className="outline-button" disabled={!enabled} onClick={() => readCandidates(candidates, page)}><Volume2 size={18} /> 후보 다시 듣기</button>}
        <button className="text-button" onClick={() => { cancel(); props.current.onResume(); setMessage('재생을 다시 요청했어요. 차단되면 정차 후 영상 안의 재생 버튼을 눌러 주세요.'); }}>재생 재개</button>
        <p className="voice-help">예: “한로로의 입춘 찾아줘” · 후보 선택: “첫 번째”, “다른 후보”, “다시 검색”, “취소”. 곡을 고르면 “재생할까요?”라고 묻습니다. “재생해”라고 답해 주세요. 음성 확인은 Safari의 터치 권한을 대신하지 않으므로 최초 재생에 직접 터치가 필요할 수 있어요. 성별·키 조건과 예약곡은 사용하지 않습니다.</p>
        <button className="text-button" onClick={() => { cancel(); props.current.onPause(); onPrivacy(); }}>이용·개인정보 안내</button>
      </div>
    </section>
  );
}
