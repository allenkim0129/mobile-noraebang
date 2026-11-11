import { ArrowDown, ArrowUp, ListMusic, X } from 'lucide-react';
import { displayTitle, providerName } from './lib/songs.js';
import type { Song } from './types.js';

export default function QueuePanel({ queue, onPlay, onRemove, onClear, onMove, id }: {
  queue: Song[];
  onPlay(song: Song): void;
  onRemove(id: string): void;
  onClear(): void;
  onMove?(id: string, direction: -1 | 1): void;
  id?: string;
}) {
  return (
    <section className="queue-card" id={id} aria-label="예약곡">
      <div className="queue-heading"><h2><ListMusic size={18} /> 다음에 부를 노래 <span>{queue.length}</span></h2>{queue.length > 0 && <button className="text-button" onClick={onClear}>비우기</button>}</div>
      {queue.length === 0 ? <div className="empty-queue"><ListMusic size={28} strokeWidth={1.4} /><p>아직 예약한 곡이 없어요</p><span>검색 결과의 + 버튼으로 담아보세요</span></div>
        : <ol className="queue-list">{queue.map((song, index) => <li key={song.id}>
          <span className="queue-number">{String(index + 1).padStart(2, '0')}</span>
          <button className="queue-song" title={displayTitle(song.title)} onClick={() => onPlay(song)}><strong>{displayTitle(song.title)}</strong><span>{providerName[song.provider]} · {song.channelTitle}</span></button>
          {onMove && <div className="queue-order" role="group" aria-label={`${index + 1}번 예약곡 순서 변경`}>
            <button className="icon-button" aria-label={`${displayTitle(song.title)} 예약 순서 위로`} disabled={index === 0} onClick={() => onMove(song.id, -1)}><ArrowUp size={16} /></button>
            <button className="icon-button" aria-label={`${displayTitle(song.title)} 예약 순서 아래로`} disabled={index === queue.length - 1} onClick={() => onMove(song.id, 1)}><ArrowDown size={16} /></button>
          </div>}
          <button className="icon-button" aria-label={`${displayTitle(song.title)} 예약 취소`} onClick={() => onRemove(song.id)}><X size={15} /></button>
        </li>)}</ol>}
      <p className="queue-note"><ArrowDown size={12} />곡이 끝나면 다음 예약곡이 이어져요 · 이 탭에서만 유지</p>
    </section>
  );
}
