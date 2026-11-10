export type Provider = 'tj' | 'ky' | 'other';

export interface AppConfig {
  searchConfigured: boolean;
  hosting: 'local' | 'vercel';
}

export interface Song {
  id: string;
  title: string;
  channelTitle: string;
  provider: Provider;
}

export interface SearchResults {
  official: Song[];
  alternatives: Song[];
  alternativesLoaded: boolean;
}

export interface ApiError {
  error: string;
  code: string;
}
