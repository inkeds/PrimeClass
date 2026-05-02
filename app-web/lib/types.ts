export type MembershipTone = 'blue' | 'green' | 'gold' | 'red' | 'slate' | 'violet';

export type Pagination = {
  page: number;
  page_size: number;
  total: number;
};

export type ListPayload<T> = {
  list: T[];
  pagination: Pagination;
};

export type MembershipSnapshot = {
  status: string;
  package_name: string | null;
  package_tone: MembershipTone | null;
  started_at: string | null;
  expired_at: string | null;
  is_permanent: boolean;
};

export type LoginUserInfo = {
  user_id: string;
  nickname: string;
  avatar: string | null;
  user_level: string;
  register_source: string | null;
};

export type AppSession = {
  token: string;
  user_info: LoginUserInfo;
  membership: MembershipSnapshot;
};

export type BannerItem = {
  banner_id: string;
  title: string;
  subtitle: string | null;
  badge_text: string | null;
  image_url: string | null;
  link_type: string;
  link_value: string | null;
};

export type SubjectItem = {
  subject_code: string;
  subject_name: string;
};

export type GradeItem = {
  grade_code: string;
  grade_name: string;
};

export type HomeContinueLearning = {
  course_id: string;
  title: string;
  teacher_name: string | null;
  cover_url: string | null;
  lesson_id: string;
  lesson_title: string;
  progress: number;
  last_learned_at: string | null;
};

export type CourseSummary = {
  course_id: string;
  title: string;
  cover_url: string | null;
  difficulty: string | null;
  view_count: number;
  access_type: string;
  teacher_name: string | null;
  progress: number;
  course_type: string;
  subject: string | null;
  grade: string | null;
  term: string | null;
  version: string | null;
  recommendation_label: string | null;
  recommendation_tone: MembershipTone | null;
};

export type HomePayload = {
  current_version: string | null;
  current_version_code: string | null;
  current_version_name: string | null;
  banner_list: BannerItem[];
  subject_list: SubjectItem[];
  continue_learning: HomeContinueLearning | null;
  sync_course_list: CourseSummary[];
  vip_entry: {
    enabled: boolean;
    vip_copy: string | null;
    redeem_copy: string | null;
  };
};

export type VersionItem = {
  version_code: string;
  version_name: string;
};

export type TopicTag = {
  tag_id: string;
  tag_code: string;
  tag_name: string;
  subject_code: string | null;
};

export type LibraryItem = {
  record_id: string;
  course_id: string;
  title: string;
  teacher_name: string | null;
  cover_url: string | null;
  lesson_id: string;
  lesson_title: string;
  progress: number;
  watched_seconds: number;
  last_learned_at: string | null;
};

export type LibraryNoteItem = {
  note_id: string;
  course_id: string;
  course_title: string;
  lesson_id: string;
  lesson_title: string;
  cover_url: string | null;
  content: string | null;
  updated_at: string;
};

export type LibraryOverview = {
  history_count: number;
  download_count: number;
  favorite_count: number;
  note_count: number;
  continue_learning_list: LibraryItem[];
  favorite_course_list: CourseSummary[];
  recent_note_list: LibraryNoteItem[];
};

export type MePayload = {
  user_id: string;
  nickname: string;
  avatar: string | null;
  user_level: string;
  login_account: string | null;
  phone: string | null;
  register_source: string | null;
  created_at: string;
  last_login_at: string | null;
  membership_status: string;
  membership_expired_at: string | null;
  email: string | null;
  notification_settings: MeNotificationSettings;
  message_list: MeMessageItem[];
  message_count: number;
};

export type MeNotificationSettings = {
  email_course_update: boolean;
  email_membership_expiry: boolean;
  email_system_notice: boolean;
  in_app_system_notice: boolean;
};

export type MeMessageItem = {
  message_id: string;
  title: string;
  content: string;
  tone: 'info' | 'warning' | 'success' | 'vip';
  created_at: string | null;
};

export type DisplaySettings = {
  customer_service: {
    phone: string | null;
    wechat: string | null;
  };
  vip_copy: string | null;
  redeem_copy: string | null;
  banner_fallback: string | null;
};

export type CourseLesson = {
  lesson_id: string;
  parent_id: string | null;
  node_type: string;
  title: string;
  sort_order: number;
  duration_seconds: number;
  is_preview: boolean;
  access_type: string | null;
  progress: number;
};

export type CourseDetail = {
  course_id: string;
  title: string;
  description: string | null;
  teacher_name: string | null;
  subject: string | null;
  grade: string | null;
  term: string | null;
  version: string | null;
  access_type: string;
  cover_url: string | null;
  recommendation_label: string | null;
  recommendation_tone: MembershipTone | null;
  is_collected: boolean;
  lesson_list: CourseLesson[];
};

export type LessonPlayDetail = {
  lesson_id: string;
  lesson_title: string;
  media_url: string | null;
  media_kind: 'video' | 'audio' | 'unknown';
  media_asset_id: string | null;
  handout_url: string | null;
  handout_asset_id: string | null;
  note_enabled: boolean;
  note_content: string | null;
  note_updated_at: string | null;
  progress: number;
  can_access: boolean;
  access_denied_reason: string | null;
};

export type FavoriteToggleResult = {
  collected: boolean;
  favorite_count: number;
};

export type LessonNoteResult = {
  note_id: string | null;
  content: string | null;
  updated_at: string | null;
};

export type RedeemResult = {
  success: true;
  package_name: string | null;
  previous_expired_at: string | null;
  current_expired_at: string | null;
  is_permanent: boolean;
  repeated?: boolean;
};
