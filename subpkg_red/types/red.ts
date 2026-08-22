export type RedCategoryKey =
  | 'study'
  | 'service'
  | 'activity'
  | 'convenience'
  | 'innovation'
  | 'practice';

export interface RedStructureItem {
  id: string;
  title: string;
  summary: string;
}

export interface RedTopicChild {
  id: string;
  title: string;
}

export interface RedTopicItem {
  id: string;
  title: string;
  summary: string;
  tags?: string[];
  children?: RedTopicChild[];
}

export interface RedCategory {
  id: number;
  key: RedCategoryKey;
  title: string;
  subtitle: string;
  summary: string;
  items: RedTopicItem[];
}
