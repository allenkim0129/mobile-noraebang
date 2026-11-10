export interface SearchSuggestion {
  label: string;
  detail: string;
  query: string;
  kind: 'song' | 'artist' | 'recent';
  correction: boolean;
}

const songs: ReadonlyArray<readonly [title: string, artist: string]> = [
  ['사랑하게될거야', '한로로'],
  ['사랑은 늘 도망가', '임영웅'],
  ['사랑했나봐', '윤도현'],
  ['사랑하기 때문에', '유재하'],
  ['사랑했지만', '김광석'],
  ['사랑에 연습이 있었다면', '임재현'],
  ['사랑의 바보', '더 넛츠'],
  ['사랑이 잘', '아이유'],
  ['사건의 지평선', '윤하'],
  ['밤편지', '아이유'],
  ['좋은 날', '아이유'],
  ['너의 의미', '아이유'],
  ['Love wins all', '아이유'],
  ['봄 사랑 벚꽃 말고', 'HIGH4 아이유'],
  ['한 페이지가 될 수 있게', 'DAY6'],
  ['예뻤어', 'DAY6'],
  ['Welcome to the Show', 'DAY6'],
  ['녹아내려요', 'DAY6'],
  ['HAPPY', 'DAY6'],
  ['입춘', '한로로'],
  ['비밀번호 486', '윤하'],
  ['기다리다', '윤하'],
  ['너의 모든 순간', '성시경'],
  ['두 사람', '성시경'],
  ['거리에서', '성시경'],
  ['희재', '성시경'],
  ['너였다면', '정승환'],
  ['이 소설의 끝을 다시 써보려 해', '한동근'],
  ['소주 한 잔', '임창정'],
  ['흔들리는 꽃들 속에서 네 샴푸향이 느껴진거야', '장범준'],
  ['벚꽃 엔딩', '버스커 버스커'],
  ['주저하는 연인들을 위해', '잔나비'],
  ['나에게로 떠나는 여행', '버즈'],
  ['가시', '버즈'],
  ['겁쟁이', '버즈'],
  ['응급실', 'izi'],
  ['보고 싶다', '김범수'],
  ['끝사랑', '김범수'],
  ['안녕', '폴킴'],
  ['모든 날 모든 순간', '폴킴'],
  ['눈의 꽃', '박효신'],
  ['야생화', '박효신'],
  ['취중고백', '김민석'],
  ['선물', '멜로망스'],
  ['사랑인가 봐', '멜로망스'],
  ['좋니', '윤종신'],
  ['오래된 노래', '스탠딩 에그'],
  ['첫눈처럼 너에게 가겠다', '에일리'],
  ['소나기', '이클립스'],
  ['나는 반딧불', '황가람'],
  ['Drowning', 'WOODZ'],
  ['Ditto', 'NewJeans'],
  ['Hype Boy', 'NewJeans'],
  ['봄날', '방탄소년단'],
  ['Dynamite', '방탄소년단'],
  ['LOVE DIVE', 'IVE'],
  ['I AM', 'IVE'],
  ['Supernova', 'aespa'],
  ['APT.', '로제 Bruno Mars'],
  ['Perfect', 'Ed Sheeran'],
  ['Someone Like You', 'Adele'],
  ['All of Me', 'John Legend'],
];

function normalize(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('ko').replace(/[^\p{L}\p{N}]/gu, '');
}

function prefixDistance(input: string[], candidate: string[], budget: number) {
  const end = Math.min(candidate.length, input.length + budget);
  let previous = Array.from({ length: end + 1 }, (_, index) => index);
  let beforePrevious: number[] = [];
  for (let i = 1; i <= input.length; i++) {
    const row = [i];
    for (let j = 1; j <= end; j++) {
      row[j] = Math.min(
        row[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (input[i - 1] === candidate[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && input[i - 1] === candidate[j - 2] && input[i - 2] === candidate[j - 1]) {
        row[j] = Math.min(row[j], beforePrevious[j - 2] + 1);
      }
    }
    beforePrevious = previous;
    previous = row;
  }
  return Math.min(...previous.slice(Math.max(1, input.length - budget)));
}

export function getSearchSuggestions(input: string, recentSearches: string[] = []): SearchSuggestion[] {
  const query = normalize(input);
  if (!query || input.length > 100) return [];
  const candidates: Array<Omit<SearchSuggestion, 'correction'> & { alternate?: string }> = [
    ...recentSearches.slice(0, 12).map((term) => ({
      label: term, detail: '이 탭에서 검색한 검색어', query: term, kind: 'recent' as const,
    })),
    ...songs.map(([title, artist]) => ({
      label: title, detail: artist, query: `${title} ${artist}`, kind: 'song' as const,
      alternate: `${artist} ${title}`,
    })),
    ...[...new Set(songs.map(([, artist]) => artist))].map((artist) => ({
      label: artist, detail: '가수로 검색', query: artist, kind: 'artist' as const,
    })),
  ];
  const characters = [...query.normalize('NFD')];
  const budget = query.length >= 5 ? 2 : 1;
  const canCorrect = query.length >= 2 && query.length <= 40 && characters.length >= 3;
  const seen = new Set<string>();

  return candidates.flatMap((candidate, index) => {
    const key = normalize(candidate.query);
    if (!key) return [];
    const label = normalize(candidate.label);
    const terms = [label, normalize(candidate.query), normalize(candidate.alternate ?? '')].filter(Boolean);
    let score = Number.POSITIVE_INFINITY;
    let correction = false;
    if (label.startsWith(query)) score = 0;
    else if (terms.some((term) => term.startsWith(query))) score = 2;
    else if (query.length >= 2 && label.includes(query)) score = 3;
    else if (canCorrect) {
      const distances = terms.map((term) => prefixDistance(characters, [...term.normalize('NFD')], budget));
      const distance = Math.min(...distances);
      if (distance <= budget) {
        score = 6 + distance + (distances[0] === distance ? 0 : 1);
        correction = distance > 0;
      }
    }
    if (!Number.isFinite(score)) return [];
    const { alternate: _alternate, ...suggestion } = candidate;
    return [{ suggestion: { ...suggestion, correction }, score, index }];
  }).sort((a, b) => a.score - b.score || a.index - b.index)
    .filter(({ suggestion }) => {
      const key = normalize(suggestion.query);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6)
    .map(({ suggestion }) => suggestion);
}

export function rememberSearch(previous: string[], query: string) {
  const term = query.trim().replace(/\s+/g, ' ');
  if (!term || term.length > 100) return previous;
  return [term, ...previous.filter((item) => normalize(item) !== normalize(term))].slice(0, 12);
}
