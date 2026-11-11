import { describePreferences, vocalLabels } from './lib/preferences.js';
import type { SearchPreferences as Preferences, VocalPreference } from './types.js';

export default function SearchPreferences({ value, onChange }: { value: Preferences; onChange(value: Preferences): void }) {
  return (
    <div className="search-preferences" role="group" aria-label="반주 검색 조건" title="검색할 때만 적용합니다. 기본은 키 지정 없음이며, 1키는 반음입니다. 영상 자체의 키는 바뀌지 않습니다.">
      <div className="vocal-options" role="group" aria-label="선호 버전">
        {(['any', 'male', 'female', 'duet'] satisfies VocalPreference[]).map((vocal) => (
          <button key={vocal} type="button" aria-pressed={value.vocal === vocal}
            onClick={() => onChange({ ...value, vocal })}>{vocalLabels[vocal]}</button>
        ))}
      </div>
      <div className="key-options" role="group" aria-label="검색용 키 조절">
        <span>검색 키</span>
        <button type="button" aria-label="검색 키 반음 낮추기" disabled={value.keyOffset <= -6}
          onClick={() => onChange({ ...value, keyOffset: value.keyOffset - 1 })}>−</button>
        <output aria-live="polite" aria-label={describePreferences(value)}>{value.keyOffset === 0 ? '기본' : `${value.keyOffset > 0 ? '+' : ''}${value.keyOffset}`}</output>
        <button type="button" aria-label="검색 키 반음 높이기" disabled={value.keyOffset >= 6}
          onClick={() => onChange({ ...value, keyOffset: value.keyOffset + 1 })}>+</button>
      </div>
    </div>
  );
}
