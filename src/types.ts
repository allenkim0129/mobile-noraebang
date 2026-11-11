export type Provider = 'tj' | 'ky' | 'other';
export type VocalPreference = 'any' | 'male' | 'female' | 'duet';

export interface SearchPreferences {
  vocal: VocalPreference;
  keyOffset: number;
}

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
  preferred?: Song[];
  official: Song[];
  alternatives: Song[];
  alternativesLoaded: boolean;
}

export interface ApiError {
  error: string;
  code: string;
}
