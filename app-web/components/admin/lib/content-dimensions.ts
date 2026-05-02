export const CONTENT_DIMENSION_TYPES = ['version', 'subject', 'grade', 'term'] as const;

export type ContentDimensionType = (typeof CONTENT_DIMENSION_TYPES)[number];

export type ContentDimensionRelationItem = {
  id: string;
  item_code: string;
  item_name: string;
  status: string;
};

export type ContentDimensionItem = {
  id: string;
  type: ContentDimensionType;
  type_name: string;
  type_status: string;
  type_remark: string | null;
  item_code: string;
  item_name: string;
  parent_id: string | null;
  sort_order: number;
  status: string;
  extra: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  flags: {
    is_default: boolean;
    home_visible: boolean;
  };
  relations: Record<ContentDimensionType, ContentDimensionRelationItem[]>;
  metrics: {
    course_count: number;
  };
};

export type ContentDimensionTypeMeta = {
  type: ContentDimensionType;
  label: string;
  description: string;
};

export type ContentDimensionsPayload = {
  dimension_types: ContentDimensionTypeMeta[];
  dimensions: Record<ContentDimensionType, ContentDimensionItem[]>;
};

export const CONTENT_DIMENSION_LABELS: Record<ContentDimensionType, string> = {
  version: '教材版本',
  subject: '学科导航',
  grade: '年级',
  term: '学期',
};
