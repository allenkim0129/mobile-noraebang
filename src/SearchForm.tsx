import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { ArrowRight, Clock3, LoaderCircle, MicVocal, Music2, Search } from 'lucide-react';
import { getSearchSuggestions, type SearchSuggestion } from './lib/suggestions.js';

interface SearchFormProps {
  mode: 'search' | 'link';
  value: string;
  searching: boolean;
  recentSearches: string[];
  inputRef: RefObject<HTMLInputElement | null>;
  onChange(value: string): void;
  onSubmit(value: string): void;
}

export default function SearchForm({ mode, value, searching, recentSearches, inputRef, onChange, onSubmit }: SearchFormProps) {
  const root = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const suggestions = mode === 'search' ? getSearchSuggestions(value, recentSearches) : [];
  const visible = mode === 'search' && open && Boolean(value.trim());
  const activeOption = visible && active >= 0 ? suggestions[active] : undefined;

  function dismiss() {
    setOpen(false);
    setActive(-1);
  }

  useEffect(() => {
    function clickOutside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
        setOpen(false);
        setActive(-1);
      }
    }
    document.addEventListener('pointerdown', clickOutside);
    return () => document.removeEventListener('pointerdown', clickOutside);
  }, []);

  useEffect(() => {
    if (visible && active >= 0) {
      document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
    }
  }, [active, visible, listId]);

  function select(suggestion: SearchSuggestion) {
    onChange(suggestion.query);
    dismiss();
    onSubmit(suggestion.query);
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) {
      if (event.key === 'Enter') event.preventDefault();
      return;
    }
    if (event.key === 'Tab' || event.key === 'Escape') {
      if (event.key === 'Escape' && visible) event.preventDefault();
      dismiss();
      return;
    }
    if (mode !== 'search' || !value.trim()) return;
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && suggestions.length) {
      event.preventDefault();
      setOpen(true);
      const current = visible ? active : -1;
      setActive(event.key === 'ArrowDown' ? (current + 1) % suggestions.length
        : current <= 0 ? suggestions.length - 1 : current - 1);
    } else if (event.key === 'Enter' && activeOption) {
      event.preventDefault();
      select(activeOption);
    }
  }

  return (
    <div className="search-input-group" ref={root} onBlur={(event) => {
      if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) dismiss();
    }}>
      <form className="search-form" onSubmit={(event) => {
        event.preventDefault();
        if (composing.current) return;
        dismiss();
        onSubmit(value);
      }}>
        <label className="sr-only" htmlFor="song-search">{mode === 'search' ? '곡 제목 또는 가수' : 'YouTube 영상 링크'}</label>
        <Search size={21} className="search-field-icon" />
        <input ref={inputRef} id="song-search" value={value}
          onChange={(event) => { onChange(event.target.value); setActive(-1); setOpen(true); }}
          onFocus={() => { setOpen(true); setActive(-1); }}
          onKeyDown={keyDown}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={() => { composing.current = false; }}
          role={mode === 'search' ? 'combobox' : undefined}
          aria-autocomplete={mode === 'search' ? 'list' : undefined}
          aria-expanded={mode === 'search' ? visible : undefined}
          aria-controls={visible ? listId : undefined}
          aria-activedescendant={activeOption ? `${listId}-${active}` : undefined}
          aria-describedby={mode === 'search' ? `${listId}-help` : undefined}
          placeholder={mode === 'search' ? '곡 제목이나 가수를 검색해 보세요' : 'YouTube 영상 링크를 붙여 넣으세요'}
          maxLength={mode === 'search' ? 100 : 2048} autoComplete="off" autoCapitalize="none" spellCheck={false}
          enterKeyHint={mode === 'search' ? 'search' : 'go'} />
        <button className="search-submit" type="submit" disabled={searching} aria-label={mode === 'search' ? '검색' : '링크 재생'}>
          {searching ? <LoaderCircle className="spin" size={20} /> : <ArrowRight size={21} />}
        </button>
      </form>
      {mode === 'search' && <span className="sr-only" id={`${listId}-help`}>방향키로 추천을 고르고 Enter로 검색하거나, 검색어를 직접 입력하고 Enter를 누르세요. Escape로 추천을 닫을 수 있습니다.</span>}
      {visible && (
        <div className="autocomplete-panel">
          <div className="autocomplete-heading">검색어 추천 <span>입력 중 API 사용 없음</span></div>
          <ul id={listId} role="listbox" aria-label="추천 검색어">
            {suggestions.map((suggestion, index) => (
              <li key={suggestion.query} id={`${listId}-${index}`} role="option" aria-selected={active === index}
                className={`autocomplete-option ${active === index ? 'active' : ''}`}
                onMouseDown={(event) => event.preventDefault()} onClick={() => select(suggestion)}>
                <span className="autocomplete-icon">{suggestion.kind === 'recent' ? <Clock3 size={16} /> : suggestion.kind === 'artist' ? <MicVocal size={16} /> : <Music2 size={16} />}</span>
                <span className="autocomplete-label"><strong>{suggestion.label}</strong><span>{suggestion.detail}</span></span>
                {suggestion.correction && <span className="correction-badge">오타 후보</span>}
                <ArrowRight size={14} className="autocomplete-arrow" />
              </li>
            ))}
          </ul>
          {!suggestions.length && <p className="autocomplete-empty">추천 검색어가 없어요. Enter로 직접 검색해 보세요.</p>}
          <div className="autocomplete-footer">준비된 곡·가수 목록과 최근 검색 기반 · 선택하면 영상 검색</div>
          <span className="sr-only" role="status">{suggestions.length ? `추천 검색어 ${suggestions.length}개` : '추천 검색어 없음'}</span>
        </div>
      )}
    </div>
  );
}
