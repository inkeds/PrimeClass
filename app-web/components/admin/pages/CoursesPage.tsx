'use client';

import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';

import {
  ActionIconButton,
  Badge,
  Banner,
  EmptyState,
  LoadingBlock,
  Modal,
  PageHeader,
  Panel,
} from '@/components/admin/AdminUI';
import { apiRequest, getAssetFileUrl, toQueryString, type ListPayload } from '@/components/admin/lib/api';
import type { ContentDimensionItem, ContentDimensionsPayload, ContentDimensionType } from '@/components/admin/lib/content-dimensions';
import { formatDateTime, formatNumber } from '@/components/admin/lib/format';
import { getErrorMessage } from '@/components/admin/shared';

type CourseTab = 'courses' | 'tags' | 'assets';

type CourseItem = {
  course_id: string;
  course_no: string;
  course_type: string;
  title: string;
  subtitle: string | null;
  recommendation: string | null;
  subject_code: string | null;
  grade_code: string | null;
  term_code: string | null;
  version_code: string | null;
  teacher_name: string | null;
  cover_asset_id: string | null;
  cover_url: string | null;
  access_type: string;
  status: string;
  view_count: number;
  favorite_count: number;
  sort_order: number;
  updated_at: string;
};

type CourseDetail = {
  course: CourseItem & {
    description: string | null;
    recommendation: string | null;
  };
  lessons: LessonItem[];
  topic_tags: TopicTag[];
};

type LessonItem = {
  lesson_id: string;
  parent_id: string | null;
  node_type: string;
  title: string;
  sort_order: number;
  status: string;
  video_asset_id?: string | null;
  handout_asset_id?: string | null;
  note_template_asset_id?: string | null;
  duration_seconds: number;
  is_preview: boolean;
  access_type: string | null;
};

type TopicTag = {
  tag_id: string;
  tag_code: string;
  tag_name: string;
  subject_code: string | null;
  sort_order: number;
  status: string;
  remark: string | null;
};

type AssetItem = {
  asset_id: string;
  asset_no: string;
  provider: string;
  origin_name: string;
  asset_type: string;
  business_type: string | null;
  mime_type?: string | null;
  ext?: string | null;
  size: number;
  public_url: string | null;
  status: string;
  created_at: string;
};

type StorageSettingsSummary = {
  default_provider: 'local' | 's3' | 'tencent_cos' | 'ftp';
};

type DictionaryBadgeTone = 'blue' | 'green' | 'gold' | 'red' | 'slate' | 'violet';

type RecommendationOption = {
  id: string;
  item_code: string;
  item_name: string;
  extra: Record<string, unknown>;
};

type CourseFormState = {
  course_id?: string;
  course_type: string;
  title: string;
  subtitle: string;
  subject_code: string;
  grade_code: string;
  term_code: string;
  version_code: string;
  teacher_name: string;
  description: string;
  recommendation: string;
  cover_asset_id: string;
  access_type: string;
  status: string;
  sort_order: string;
  topic_tag_ids: string[];
};

type LessonFormState = {
  title: string;
  parent_id: string;
  node_type: string;
  status: string;
  video_asset_id: string;
  handout_asset_id: string;
  duration_seconds: string;
  is_preview: boolean;
  access_type: string;
};

const emptyCourseForm: CourseFormState = {
  course_type: 'sync',
  title: '',
  subtitle: '',
  subject_code: '',
  grade_code: '',
  term_code: '',
  version_code: '',
  teacher_name: '',
  description: '',
  recommendation: '',
  cover_asset_id: '',
  access_type: 'free',
  status: 'draft',
  sort_order: '0',
  topic_tag_ids: [],
};

const emptyLessonForm: LessonFormState = {
  title: '',
  parent_id: '',
  node_type: 'lesson',
  status: 'draft',
  video_asset_id: '',
  handout_asset_id: '',
  duration_seconds: '0',
  is_preview: false,
  access_type: '',
};

const storageProviderLabels: Record<StorageSettingsSummary['default_provider'], string> = {
  local: '本地存储',
  s3: 'S3 存储桶',
  tencent_cos: '腾讯云 COS',
  ftp: 'FTP 存储',
};

const ROOT_LESSON_PARENT_KEY = '__root__';
const LESSON_SORT_STEP = 10;

function getLessonSiblingKey(parentId: string | null) {
  return parentId ?? ROOT_LESSON_PARENT_KEY;
}

function normalizeDictionaryBadgeTone(value: unknown): DictionaryBadgeTone {
  if (typeof value !== 'string') {
    return 'blue';
  }

  const normalized = value.trim().toLowerCase();

  if (['blue', 'green', 'gold', 'red', 'slate', 'violet'].includes(normalized)) {
    return normalized as DictionaryBadgeTone;
  }

  return 'blue';
}

function compareLessonsByOrder(left: LessonItem, right: LessonItem) {
  return left.sort_order - right.sort_order || left.lesson_id.localeCompare(right.lesson_id);
}

function filterDimensionOptions(
  items: ContentDimensionItem[],
  relationType: ContentDimensionType,
  activeCode: string,
) {
  if (!activeCode) {
    return items;
  }

  return items.filter((item) => {
    const relationItems = item.relations[relationType];

    return relationItems.length === 0 || relationItems.some((entry) => entry.item_code === activeCode);
  });
}

export function CoursesPage() {
  const [tab, setTab] = useState<CourseTab>('courses');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [courseTotal, setCourseTotal] = useState(0);
  const [publishedTotal, setPublishedTotal] = useState(0);
  const [courseTypeFilter, setCourseTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const [storageSettings, setStorageSettings] = useState<StorageSettingsSummary | null>(null);
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [topicTags, setTopicTags] = useState<TopicTag[]>([]);
  const [recommendationOptions, setRecommendationOptions] = useState<RecommendationOption[]>([]);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const [courseForm, setCourseForm] = useState<CourseFormState>(emptyCourseForm);
  const [courseCoverAsset, setCourseCoverAsset] = useState<AssetItem | null>(null);
  const [courseCoverUploading, setCourseCoverUploading] = useState(false);
  const [courseDetail, setCourseDetail] = useState<CourseDetail | null>(null);
  const [lessonModalOpen, setLessonModalOpen] = useState(false);
  const [lessonModalLoading, setLessonModalLoading] = useState(false);
  const [lessonCourseTitle, setLessonCourseTitle] = useState('');
  const [lessonForm, setLessonForm] = useState<LessonFormState>(emptyLessonForm);
  const [lessonMediaAsset, setLessonMediaAsset] = useState<AssetItem | null>(null);
  const [lessonHandoutAsset, setLessonHandoutAsset] = useState<AssetItem | null>(null);
  const [lessonMediaUploading, setLessonMediaUploading] = useState(false);
  const [lessonHandoutUploading, setLessonHandoutUploading] = useState(false);
  const [assetLibraryUploading, setAssetLibraryUploading] = useState(false);
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [tagForm, setTagForm] = useState<{
    tag_id?: string;
    tag_name: string;
    subject_code: string;
    sort_order: string;
    status: string;
    remark: string;
  }>({
    tag_name: '',
    subject_code: '',
    sort_order: '0',
    status: 'enabled',
    remark: '',
  });
  const [dimensions, setDimensions] = useState<Record<ContentDimensionType, ContentDimensionItem[]>>({
    subject: [],
    grade: [],
    term: [],
    version: [],
  });

  const dictionaryMaps = useMemo(
    () =>
      Object.fromEntries(
      Object.entries(dimensions).map(([key, items]) => [
          key,
          new Map(items.map((item) => [item.item_code, item.item_name])),
        ]),
      ) as Record<string, Map<string, string>>,
    [dimensions],
  );
  const versionDimensionOptions = dimensions.version;
  const subjectDimensionOptions = useMemo(
    () => filterDimensionOptions(dimensions.subject, 'version', courseForm.version_code),
    [courseForm.version_code, dimensions.subject],
  );
  const gradeDimensionOptions = useMemo(
    () => filterDimensionOptions(dimensions.grade, 'version', courseForm.version_code),
    [courseForm.version_code, dimensions.grade],
  );
  const termDimensionOptions = useMemo(
    () => filterDimensionOptions(dimensions.term, 'grade', courseForm.grade_code),
    [courseForm.grade_code, dimensions.term],
  );
  const dimensionOptionsMap = useMemo(
    () => ({
      subject: subjectDimensionOptions,
      grade: gradeDimensionOptions,
      term: termDimensionOptions,
      version: versionDimensionOptions,
    }),
    [gradeDimensionOptions, subjectDimensionOptions, termDimensionOptions, versionDimensionOptions],
  );
  const recommendationLookup = useMemo(() => {
    const lookup = new Map<string, { code: string; label: string; tone: DictionaryBadgeTone }>();

    recommendationOptions.forEach((item) => {
      const meta = {
        code: item.item_code,
        label: item.item_name,
        tone: normalizeDictionaryBadgeTone(item.extra.tone),
      };

      lookup.set(item.item_code, meta);
      lookup.set(item.item_name, meta);
    });

    return lookup;
  }, [recommendationOptions]);
  const recommendationSelectOptions = useMemo(() => {
    const options = recommendationOptions.map((item) => ({
      value: item.item_code,
      label: item.item_name,
    }));

    if (!courseForm.recommendation || options.some((item) => item.value === courseForm.recommendation)) {
      return options;
    }

    const matched = recommendationLookup.get(courseForm.recommendation);
    return [
      {
        value: courseForm.recommendation,
        label: matched ? matched.label : `${courseForm.recommendation}（历史值）`,
      },
      ...options,
    ];
  }, [courseForm.recommendation, recommendationLookup, recommendationOptions]);

  useEffect(() => {
    void bootstrap();
  }, []);

  async function bootstrap() {
    setLoading(true);
    setError('');

    try {
      await Promise.all([
        loadDimensions(),
        loadCourses(),
        loadCourseMetrics(),
        loadTopicTags(),
        loadRecommendationOptions(),
        loadAssets(),
        loadStorageSettings(),
      ]);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function loadDimensions() {
    const result = await apiRequest<ContentDimensionsPayload>('/content-dimensions');
    setDimensions(result.dimensions);
  }

  async function loadCourses() {
    const data = await apiRequest<ListPayload<CourseItem>>(
      `/courses${toQueryString({
        course_type: courseTypeFilter,
        status: statusFilter,
        keyword,
        page: 1,
        page_size: 20,
      })}`,
    );

    setCourses(data.list);
  }

  async function loadCourseMetrics() {
    const [allCourses, publishedCourses] = await Promise.all([
      apiRequest<ListPayload<CourseItem>>('/courses?page=1&page_size=1'),
      apiRequest<ListPayload<CourseItem>>('/courses?status=published&page=1&page_size=1'),
    ]);

    setCourseTotal(allCourses.pagination.total);
    setPublishedTotal(publishedCourses.pagination.total);
  }

  async function loadTopicTags() {
    const data = await apiRequest<ListPayload<TopicTag>>('/topic-tags?page=1&page_size=100');
    setTopicTags(data.list);
  }

  async function loadRecommendationOptions() {
    const data = await apiRequest<ListPayload<RecommendationOption>>(
      `/dictionaries${toQueryString({
        scope: 'general',
        type: 'recommend_tag',
        status: 'enabled',
        page: 1,
        page_size: 100,
      })}`,
    );
    setRecommendationOptions(data.list);
  }

  async function loadAssets() {
    const data = await apiRequest<ListPayload<AssetItem>>('/assets?page=1&page_size=20');
    setAssets(data.list);
  }

  async function loadStorageSettings() {
    const data = await apiRequest<StorageSettingsSummary>('/settings/storage');
    setStorageSettings({
      default_provider: data.default_provider,
    });
  }

  async function fetchCourseDetail(courseId: string) {
    return apiRequest<CourseDetail>(`/courses/${courseId}`);
  }

  useEffect(() => {
    if (!courseForm.recommendation) {
      return;
    }

    const normalizedCode = recommendationLookup.get(courseForm.recommendation)?.code;

    if (!normalizedCode || normalizedCode === courseForm.recommendation) {
      return;
    }

    setCourseForm((current) =>
      current.recommendation === courseForm.recommendation
        ? {
            ...current,
            recommendation: normalizedCode,
          }
        : current,
    );
  }, [courseForm.recommendation, recommendationLookup]);

  useEffect(() => {
    setCourseForm((current) => {
      let changed = false;
      const next = { ...current };

      if (
        current.subject_code &&
        current.version_code &&
        subjectDimensionOptions.length > 0 &&
        !subjectDimensionOptions.some((item) => item.item_code === current.subject_code)
      ) {
        next.subject_code = '';
        changed = true;
      }

      if (
        current.grade_code &&
        current.version_code &&
        gradeDimensionOptions.length > 0 &&
        !gradeDimensionOptions.some((item) => item.item_code === current.grade_code)
      ) {
        next.grade_code = '';
        next.term_code = '';
        changed = true;
      }

      if (
        current.term_code &&
        current.grade_code &&
        termDimensionOptions.length > 0 &&
        !termDimensionOptions.some((item) => item.item_code === current.term_code)
      ) {
        next.term_code = '';
        changed = true;
      }

      return changed ? next : current;
    });
  }, [gradeDimensionOptions, subjectDimensionOptions, termDimensionOptions]);

  function applyCourseDetail(detail: CourseDetail) {
    setCourseDetail(detail);
    setCourseForm({
      course_id: detail.course.course_id,
      course_type: detail.course.course_type,
      title: detail.course.title,
      subtitle: detail.course.subtitle || '',
      subject_code: detail.course.subject_code || '',
      grade_code: detail.course.grade_code || '',
      term_code: detail.course.term_code || '',
      version_code: detail.course.version_code || '',
      teacher_name: detail.course.teacher_name || '',
      description: detail.course.description || '',
      recommendation: detail.course.recommendation
        ? recommendationLookup.get(detail.course.recommendation)?.code ?? detail.course.recommendation
        : '',
      cover_asset_id: detail.course.cover_asset_id || '',
      access_type: detail.course.access_type,
      status: detail.course.status,
      sort_order: String(detail.course.sort_order),
      topic_tag_ids: detail.topic_tags.map((item) => item.tag_id),
    });
    setCourseCoverAsset(null);
  }

  function applyLessonDetail(detail: CourseDetail) {
    setCourseDetail(detail);
    setLessonCourseTitle(detail.course.title);
  }

  function resetLessonComposer() {
    setLessonForm(emptyLessonForm);
    setLessonMediaAsset(null);
    setLessonHandoutAsset(null);
  }

  async function refreshLessonManager(courseId: string) {
    const detail = await fetchCourseDetail(courseId);
    applyLessonDetail(detail);
    return detail;
  }

  function openCreateCourse() {
    setCourseDetail(null);
    resetLessonComposer();
    setCourseForm(emptyCourseForm);
    setCourseCoverAsset(null);
    setCourseModalOpen(true);
  }

  async function openEditCourse(courseId: string) {
    setCourseModalOpen(true);
    resetLessonComposer();
    setSubmitting(true);

    try {
      const detail = await fetchCourseDetail(courseId);
      applyCourseDetail(detail);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function openLessonManager(courseId: string, title?: string) {
    setLessonModalOpen(true);
    setLessonModalLoading(true);
    setLessonCourseTitle(title || '');
    resetLessonComposer();
    setError('');

    try {
      const detail = await fetchCourseDetail(courseId);
      applyLessonDetail(detail);
    } catch (requestError) {
      setLessonModalOpen(false);
      setCourseDetail(null);
      setError(getErrorMessage(requestError));
    } finally {
      setLessonModalLoading(false);
    }
  }

  function closeLessonManager() {
    setLessonModalOpen(false);
    setLessonModalLoading(false);
    setLessonCourseTitle('');
    setCourseDetail(null);
    resetLessonComposer();
  }

  async function saveCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    const payload = {
      course_type: courseForm.course_type,
      title: courseForm.title,
      subtitle: courseForm.subtitle || null,
      subject_code: courseForm.subject_code || null,
      grade_code: courseForm.grade_code || null,
      term_code: courseForm.term_code || null,
      version_code: courseForm.version_code || null,
      teacher_name: courseForm.teacher_name || null,
      description: courseForm.description || null,
      recommendation: courseForm.recommendation || null,
      cover_asset_id: courseForm.cover_asset_id || null,
      access_type: courseForm.access_type,
      status: courseForm.status,
      sort_order: Number(courseForm.sort_order || 0),
      topic_tag_ids: courseForm.topic_tag_ids,
    };

    try {
      if (courseForm.course_id) {
        const detail = await apiRequest<CourseDetail>(`/courses/${courseForm.course_id}`, { method: 'POST', body: payload });
        applyCourseDetail(detail);
      } else {
        const detail = await apiRequest<CourseDetail>('/courses', { method: 'POST', body: payload });
        applyCourseDetail(detail);
      }

      await Promise.all([loadCourses(), loadCourseMetrics()]);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!courseDetail?.course.course_id) {
      return;
    }

    setSubmitting(true);

    try {
      await apiRequest(`/courses/${courseDetail.course.course_id}/lessons`, {
        method: 'POST',
        body: {
          title: lessonForm.title,
          parent_id: lessonForm.parent_id || null,
          node_type: lessonForm.node_type,
          status: lessonForm.status,
          video_asset_id: lessonForm.video_asset_id || null,
          handout_asset_id: lessonForm.handout_asset_id || null,
          duration_seconds: Number(lessonForm.duration_seconds || 0),
          is_preview: lessonForm.is_preview,
          access_type: lessonForm.access_type || null,
        },
      });

      await refreshLessonManager(courseDetail.course.course_id);
      resetLessonComposer();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function updateCourseStatus(courseId: string, action: 'publish' | 'offline') {
    setSubmitting(true);

    try {
      await apiRequest(`/courses/${courseId}/${action}`, { method: 'POST' });
      await Promise.all([loadCourses(), loadCourseMetrics()]);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function removeCourse(courseId: string) {
    if (!window.confirm('确认删除当前课程吗？')) {
      return;
    }

    setSubmitting(true);

    try {
      await apiRequest(`/courses/${courseId}/delete`, { method: 'POST' });
      await Promise.all([loadCourses(), loadCourseMetrics()]);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function saveTopicTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);

    const payload = {
      tag_name: tagForm.tag_name,
      subject_code: tagForm.subject_code || null,
      sort_order: Number(tagForm.sort_order || 0),
      status: tagForm.status,
      remark: tagForm.remark || null,
    };

    try {
      if (tagForm.tag_id) {
        await apiRequest(`/topic-tags/${tagForm.tag_id}`, { method: 'POST', body: payload });
      } else {
        await apiRequest('/topic-tags', { method: 'POST', body: payload });
      }

      setTagModalOpen(false);
      await loadTopicTags();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function removeTopicTag(tagId: string) {
    if (!window.confirm('确认删除当前专题标签吗？')) {
      return;
    }

    setSubmitting(true);

    try {
      await apiRequest(`/topic-tags/${tagId}/delete`, { method: 'POST' });
      await loadTopicTags();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function removeAsset(assetId: string) {
    if (!window.confirm('确认删除当前资源吗？')) {
      return;
    }

    setSubmitting(true);

    try {
      await apiRequest(`/assets/${assetId}/delete`, { method: 'POST' });
      await loadAssets();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function removeLesson(lessonId: string, title: string) {
    if (!courseDetail?.course.course_id) {
      return;
    }

    if (!window.confirm(`确认删除“${title}”吗？如果是章节，会一并删除其下所有小节和课时。`)) {
      return;
    }

    setSubmitting(true);

    try {
      await apiRequest(`/lessons/${lessonId}/delete`, { method: 'POST' });
      await refreshLessonManager(courseDetail.course.course_id);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function moveLesson(lessonId: string, direction: 'up' | 'down') {
    if (!courseDetail?.course.course_id) {
      return;
    }

    const currentLesson = courseDetail.lessons.find((lesson) => lesson.lesson_id === lessonId);
    if (!currentLesson) {
      return;
    }

    const siblingLessons = courseDetail.lessons
      .filter((lesson) => lesson.parent_id === currentLesson.parent_id)
      .sort(compareLessonsByOrder);

    const currentIndex = siblingLessons.findIndex((lesson) => lesson.lesson_id === lessonId);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= siblingLessons.length) {
      return;
    }

    const reordered = [...siblingLessons];
    [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]];

    setSubmitting(true);

    try {
      await apiRequest(`/courses/${courseDetail.course.course_id}/lessons/sort`, {
        method: 'POST',
        body: {
          items: reordered.map((lesson, index) => ({
            lesson_id: lesson.lesson_id,
            sort_order: (index + 1) * LESSON_SORT_STEP,
          })),
        },
      });

      await refreshLessonManager(courseDetail.course.course_id);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function changeLessonStatus(lesson: LessonItem, nextStatus: string) {
    if (!courseDetail?.course.course_id || lesson.status === nextStatus) {
      return;
    }

    const previousStatus = lesson.status;
    setSubmitting(true);
    setCourseDetail((current) =>
      current
        ? {
            ...current,
            lessons: current.lessons.map((item) =>
              item.lesson_id === lesson.lesson_id
                ? {
                    ...item,
                    status: nextStatus,
                  }
                : item,
            ),
          }
        : current,
    );

    try {
      const updatedLesson = await apiRequest<LessonItem>(`/lessons/${lesson.lesson_id}/status`, {
        method: 'POST',
        body: {
          status: nextStatus,
        },
      });

      setCourseDetail((current) =>
        current
          ? {
              ...current,
              lessons: current.lessons.map((item) =>
                item.lesson_id === updatedLesson.lesson_id
                  ? {
                      ...item,
                      ...updatedLesson,
                    }
                  : item,
              ),
            }
          : current,
      );
    } catch (requestError) {
      setCourseDetail((current) =>
        current
          ? {
              ...current,
              lessons: current.lessons.map((item) =>
                item.lesson_id === lesson.lesson_id
                  ? {
                      ...item,
                      status: previousStatus,
                    }
                  : item,
              ),
            }
          : current,
      );
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  function detectAssetType(file: File): 'audio' | 'video' | 'document' | 'image' | 'other' {
    if (file.type.startsWith('audio/')) {
      return 'audio';
    }

    if (file.type.startsWith('video/')) {
      return 'video';
    }

    if (file.type.startsWith('image/')) {
      return 'image';
    }

    const extension = file.name.split('.').pop()?.toLowerCase() || '';

    if (['mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac'].includes(extension)) {
      return 'audio';
    }

    if (['mp4', 'mov', 'm4v', 'webm', 'm3u8'].includes(extension)) {
      return 'video';
    }

    if (['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'zip'].includes(extension)) {
      return 'document';
    }

    return 'other';
  }

  async function uploadAssetFile(
    file: File,
    options: {
      businessType: string;
      assetType?: 'audio' | 'video' | 'document' | 'image' | 'other';
    },
  ) {
    const formData = new FormData();
    formData.set('file', file);
    formData.set('asset_type', options.assetType || detectAssetType(file));
    formData.set('business_type', options.businessType);

    return apiRequest<AssetItem>('/assets/upload', {
      method: 'POST',
      rawBody: formData,
    });
  }

  async function handleLessonAssetUpload(
    event: ChangeEvent<HTMLInputElement>,
    target: 'media' | 'handout',
  ) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (target === 'media') {
      setLessonMediaUploading(true);
    } else {
      setLessonHandoutUploading(true);
    }

    try {
      const uploaded = await uploadAssetFile(file, {
        businessType: target === 'media' ? 'lesson_media' : 'lesson_handout',
        assetType: target === 'media' ? detectAssetType(file) : 'document',
      });

      if (target === 'media') {
        setLessonMediaAsset(uploaded);
        setLessonForm((current) => ({
          ...current,
          video_asset_id: uploaded.asset_id,
        }));
      } else {
        setLessonHandoutAsset(uploaded);
        setLessonForm((current) => ({
          ...current,
          handout_asset_id: uploaded.asset_id,
        }));
      }

      await loadAssets();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      if (target === 'media') {
        setLessonMediaUploading(false);
      } else {
        setLessonHandoutUploading(false);
      }
    }
  }

  async function handleCourseCoverUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (detectAssetType(file) !== 'image') {
      setError('课程封面仅支持上传图片文件');
      return;
    }

    setCourseCoverUploading(true);

    try {
      const uploaded = await uploadAssetFile(file, {
        businessType: 'course_cover',
        assetType: 'image',
      });

      setCourseCoverAsset(uploaded);
      setCourseForm((current) => ({
        ...current,
        cover_asset_id: uploaded.asset_id,
      }));

      await loadAssets();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setCourseCoverUploading(false);
    }
  }

  async function handleAssetLibraryUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setAssetLibraryUploading(true);

    try {
      await uploadAssetFile(file, {
        businessType: 'course_resource',
      });
      await loadAssets();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setAssetLibraryUploading(false);
    }
  }

  function clearLessonUpload(target: 'media' | 'handout') {
    if (target === 'media') {
      setLessonMediaAsset(null);
      setLessonForm((current) => ({
        ...current,
        video_asset_id: '',
      }));
      return;
    }

    setLessonHandoutAsset(null);
    setLessonForm((current) => ({
      ...current,
      handout_asset_id: '',
    }));
  }

  function clearCourseCover() {
    setCourseCoverAsset(null);
    setCourseForm((current) => ({
      ...current,
      cover_asset_id: '',
    }));
  }

  function openTagModal(tag?: TopicTag) {
    setTagForm(
      tag
        ? {
            tag_id: tag.tag_id,
            tag_name: tag.tag_name,
            subject_code: tag.subject_code || '',
            sort_order: String(tag.sort_order),
            status: tag.status,
            remark: tag.remark || '',
          }
        : {
            tag_name: '',
            subject_code: '',
            sort_order: '0',
            status: 'enabled',
            remark: '',
          },
    );
    setTagModalOpen(true);
  }

  function getDictName(type: ContentDimensionType, code?: string | null) {
    if (!code) {
      return '--';
    }

    return dictionaryMaps[type].get(code) || code;
  }

  function resolveRecommendation(value?: string | null) {
    if (!value) {
      return null;
    }

    return recommendationLookup.get(value) ?? { code: value, label: value, tone: 'blue' as const };
  }

  function quickSwitchCourseStatus(nextStatus: string) {
    setStatusFilter(nextStatus);
    window.setTimeout(() => {
      void loadCourses();
    }, 0);
  }

  function getLessonNodeLabel(nodeType: string) {
    if (nodeType === 'chapter') {
      return '章节';
    }

    if (nodeType === 'section') {
      return '小节';
    }

    return '课时';
  }

  function getLessonStatusLabel(status: string) {
    if (status === 'published') {
      return '已发布';
    }

    if (status === 'offline') {
      return '已下架';
    }

    return '草稿';
  }

  const lessonItems = courseDetail?.lessons ?? [];
  const lessonSummary = {
    total: lessonItems.length,
    published: lessonItems.filter((lesson) => lesson.status === 'published').length,
    preview: lessonItems.filter((lesson) => lesson.is_preview).length,
  };
  const lessonSiblingGroups = useMemo(() => {
    const groups = new Map<string, LessonItem[]>();

    lessonItems.forEach((lesson) => {
      const groupKey = getLessonSiblingKey(lesson.parent_id);
      const currentGroup = groups.get(groupKey) ?? [];
      currentGroup.push(lesson);
      groups.set(groupKey, currentGroup);
    });

    groups.forEach((group, key) => {
      groups.set(key, [...group].sort(compareLessonsByOrder));
    });

    return groups;
  }, [lessonItems]);
  const lessonSiblingMeta = useMemo(() => {
    const meta = new Map<string, { index: number; total: number }>();

    lessonSiblingGroups.forEach((group) => {
      group.forEach((lesson, index) => {
        meta.set(lesson.lesson_id, {
          index,
          total: group.length,
        });
      });
    });

    return meta;
  }, [lessonSiblingGroups]);
  const lessonViewItems = useMemo(() => {
    const lessonMap = new Map(lessonItems.map((lesson) => [lesson.lesson_id, lesson]));
    const depthCache = new Map<string, number>();
    const orderedLessons: Array<
      LessonItem & {
        depth: number;
        parentTitle: string;
      }
    > = [];
    const visited = new Set<string>();

    function resolveDepth(lesson: LessonItem, visited = new Set<string>()) {
      const cached = depthCache.get(lesson.lesson_id);
      if (cached !== undefined) {
        return cached;
      }

      if (!lesson.parent_id) {
        depthCache.set(lesson.lesson_id, 0);
        return 0;
      }

      if (visited.has(lesson.lesson_id)) {
        return 0;
      }

      const parent = lessonMap.get(lesson.parent_id);
      if (!parent) {
        depthCache.set(lesson.lesson_id, 0);
        return 0;
      }

      visited.add(lesson.lesson_id);
      const depth = Math.min(resolveDepth(parent, visited) + 1, 2);
      depthCache.set(lesson.lesson_id, depth);
      return depth;
    }

    function appendGroup(parentId: string | null) {
      const group = lessonSiblingGroups.get(getLessonSiblingKey(parentId)) ?? [];

      group.forEach((lesson) => {
        if (visited.has(lesson.lesson_id)) {
          return;
        }

        visited.add(lesson.lesson_id);
        const parent = lesson.parent_id ? lessonMap.get(lesson.parent_id) ?? null : null;

        orderedLessons.push({
          ...lesson,
          depth: resolveDepth(lesson),
          parentTitle: parent?.title ?? '',
        });

        appendGroup(lesson.lesson_id);
      });
    }

    appendGroup(null);

    lessonItems
      .slice()
      .sort(compareLessonsByOrder)
      .forEach((lesson) => {
        if (visited.has(lesson.lesson_id)) {
          return;
        }

        const parent = lesson.parent_id ? lessonMap.get(lesson.parent_id) ?? null : null;

        orderedLessons.push({
          ...lesson,
          depth: resolveDepth(lesson),
          parentTitle: parent?.title ?? '',
        });
      });

    return orderedLessons;
  }, [lessonItems, lessonSiblingGroups]);
  const lessonParentOptions = useMemo(() => {
    if (lessonForm.node_type === 'chapter') {
      return [];
    }

    return lessonViewItems
      .filter((lesson) =>
        lessonForm.node_type === 'section' ? lesson.node_type === 'chapter' : lesson.node_type !== 'lesson',
      )
      .map((lesson) => ({
        value: lesson.lesson_id,
        label: `${lesson.depth ? `${'-- '.repeat(lesson.depth)}` : ''}${getLessonNodeLabel(lesson.node_type)} · ${lesson.title}`,
      }));
  }, [lessonForm.node_type, lessonViewItems]);
  const isLessonNode = lessonForm.node_type === 'lesson';
  const lessonParentLabel =
    lessonForm.node_type === 'section'
      ? '所属章节'
      : lessonForm.node_type === 'lesson'
        ? '所属节点'
        : '挂载位置';

  useEffect(() => {
    if (!lessonForm.parent_id) {
      return;
    }

    if (lessonForm.node_type !== 'chapter' && lessonParentOptions.some((item) => item.value === lessonForm.parent_id)) {
      return;
    }

    setLessonForm((current) => ({
      ...current,
      parent_id: '',
    }));
  }, [lessonForm.node_type, lessonForm.parent_id, lessonParentOptions]);

  useEffect(() => {
    if (lessonForm.node_type === 'lesson') {
      return;
    }

    if (
      lessonForm.duration_seconds === '0' &&
      !lessonForm.is_preview &&
      !lessonForm.access_type &&
      !lessonForm.video_asset_id &&
      !lessonForm.handout_asset_id
    ) {
      return;
    }

    setLessonMediaAsset(null);
    setLessonHandoutAsset(null);
    setLessonForm((current) => ({
      ...current,
      video_asset_id: '',
      handout_asset_id: '',
      duration_seconds: '0',
      is_preview: false,
      access_type: '',
    }));
  }, [
    lessonForm.access_type,
    lessonForm.duration_seconds,
    lessonForm.handout_asset_id,
    lessonForm.is_preview,
    lessonForm.node_type,
    lessonForm.video_asset_id,
  ]);

  const defaultStorageLabel = storageSettings
    ? storageProviderLabels[storageSettings.default_provider]
    : '默认存储';
  const selectedCourseCoverAsset = useMemo(() => {
    if (!courseForm.cover_asset_id) {
      return null;
    }

    if (courseCoverAsset?.asset_id === courseForm.cover_asset_id) {
      return courseCoverAsset;
    }

    return assets.find((asset) => asset.asset_id === courseForm.cover_asset_id) ?? null;
  }, [assets, courseCoverAsset, courseForm.cover_asset_id]);
  const courseCoverPreviewUrl = courseForm.cover_asset_id
    ? selectedCourseCoverAsset?.public_url || getAssetFileUrl(courseForm.cover_asset_id)
    : '';
  const courseCoverName = selectedCourseCoverAsset?.origin_name || (courseForm.cover_asset_id ? '已上传课程封面' : '');

  return (
    <div className="page-stack">
      <PageHeader
        title="课程库管理"
        description="管理同步课、专题课、专题标签和课程资源。"
        actions={
          tab === 'courses' ? (
            <button className="button button-primary" onClick={openCreateCourse} type="button">
              上传新课程
            </button>
          ) : tab === 'tags' ? (
            <button className="button button-primary" onClick={() => openTagModal()} type="button">
              新增标签
            </button>
          ) : (
            <button className="button button-secondary" onClick={() => void loadAssets()} type="button">
              刷新资源
            </button>
          )
        }
      />

      {error ? <Banner tone="error">{error}</Banner> : null}

      <section className="course-top-stack">
        <div className="module-switch" role="tablist" aria-label="课程模块切换">
          {([
            { value: 'courses', label: '课程列表' },
            { value: 'tags', label: '专题标签' },
            { value: 'assets', label: '资源管理' },
          ] as const).map((item) => (
            <button
              key={item.value}
              aria-selected={tab === item.value}
              className={`module-switch-button${tab === item.value ? ' is-active' : ''}`}
              onClick={() => setTab(item.value)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'courses' ? (
          <div className="course-status-strip course-status-strip-wrap">
            <button
              className={`status-pill${statusFilter === '' ? ' is-active' : ''}`}
              onClick={() => quickSwitchCourseStatus('')}
              type="button"
            >
              全部课程 ({formatNumber(courseTotal)})
            </button>
            <button
              className={`status-pill${statusFilter === 'published' ? ' is-active' : ''}`}
              onClick={() => quickSwitchCourseStatus('published')}
              type="button"
            >
              已上架 ({formatNumber(publishedTotal)})
            </button>
          </div>
        ) : null}
      </section>

      {loading ? <LoadingBlock text="正在加载课程管理数据…" /> : null}

      {!loading && tab === 'courses' ? (
        <>
          <Panel title="课程列表" subtitle={`当前共 ${formatNumber(courseTotal)} 条记录`}>
            <form
              className="list-toolbar list-toolbar-stable"
              onSubmit={(event) => {
                event.preventDefault();
                void loadCourses();
              }}
            >
              <div className="list-toolbar-main">
                <label className="field field-compact field-grow">
                  <input
                    placeholder="搜索课程名称或讲师..."
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                  />
                </label>
                <label className="field field-compact">
                  <select value={courseTypeFilter} onChange={(event) => setCourseTypeFilter(event.target.value)}>
                    <option value="">全部分类</option>
                    <option value="sync">同步课</option>
                    <option value="topic">专题课</option>
                  </select>
                </label>
                <label className="field field-compact">
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                    <option value="">全部状态</option>
                    <option value="draft">草稿</option>
                    <option value="published">已发布</option>
                    <option value="offline">已下架</option>
                  </select>
                </label>
              </div>
              <div className="list-toolbar-actions">
                <button className="button button-primary" type="submit">
                  查询
                </button>
                <button className="button button-ghost" onClick={() => void loadCourses()} type="button">
                  刷新
                </button>
                <span className="toolbar-meta">共 {formatNumber(courseTotal)} 条记录</span>
              </div>
            </form>
            {courses.length === 0 ? (
              <EmptyState title="暂无课程数据" />
            ) : (
              <div className="table-wrap table-wrap-wide">
                <table className="data-table data-table-courses">
                  <thead>
                    <tr>
                      <th>课程</th>
                      <th>类型</th>
                      <th>学科/年级</th>
                      <th>权限</th>
                      <th>状态</th>
                      <th>热度</th>
                      <th>更新时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courses.map((course, index) => {
                      const courseCoverUrl = course.cover_url || (course.cover_asset_id ? getAssetFileUrl(course.cover_asset_id) : '');
                      const recommendation = resolveRecommendation(course.recommendation);

                      return (
                      <tr key={course.course_id}>
                        <td>
                          <div className="course-cell">
                            {courseCoverUrl ? (
                              <img className="course-cover course-cover-image" src={courseCoverUrl} alt={course.title} />
                            ) : (
                              <span className={`course-cover course-cover-${index % 4}`} aria-hidden="true" />
                            )}
                            <div>
                              <div className="table-title-row">
                                <div className="table-title">{course.title}</div>
                                {recommendation ? <Badge tone={recommendation.tone}>{recommendation.label}</Badge> : null}
                              </div>
                              <div className="table-subtitle">
                                主讲：{course.teacher_name || '未填写'} · {course.course_no}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <Badge tone={course.course_type === 'topic' ? 'gold' : 'blue'}>
                            {course.course_type === 'topic' ? '专题课' : '同步课'}
                          </Badge>
                        </td>
                        <td>
                          {getDictName('subject', course.subject_code)} / {getDictName('grade', course.grade_code)}
                        </td>
                        <td>
                          <Badge tone={course.access_type === 'vip' ? 'gold' : 'green'}>
                            {course.access_type === 'vip' ? 'VIP' : '免费'}
                          </Badge>
                        </td>
                        <td>
                          <Badge
                            tone={
                              course.status === 'published'
                                ? 'green'
                                : course.status === 'draft'
                                  ? 'gold'
                                  : 'slate'
                            }
                          >
                            {course.status === 'published' ? '已上架' : course.status === 'draft' ? '审核中' : '已下架'}
                          </Badge>
                        </td>
                        <td>
                          <div className="metric-stack">
                            <strong>{formatNumber(course.view_count)}</strong>
                            <span>{formatNumber(course.favorite_count)} 收藏</span>
                          </div>
                        </td>
                        <td className="table-cell-nowrap">{formatDateTime(course.updated_at).slice(0, 10)}</td>
                        <td>
                          <div className="table-actions">
                            <button
                              className="button button-ghost button-small button-inline"
                              onClick={() => void openLessonManager(course.course_id, course.title)}
                              type="button"
                            >
                              章节课时
                            </button>
                            <ActionIconButton
                              icon="edit"
                              label="编辑课程"
                              onClick={() => void openEditCourse(course.course_id)}
                            />
                            <ActionIconButton
                              disabled={submitting}
                              icon="toggle"
                              label={course.status === 'published' ? '下架课程' : '发布课程'}
                              onClick={() =>
                                void updateCourseStatus(
                                  course.course_id,
                                  course.status === 'published' ? 'offline' : 'publish',
                                )
                              }
                              tone="soft"
                            />
                            <ActionIconButton
                              disabled={submitting}
                              icon="delete"
                              label="删除课程"
                              onClick={() => void removeCourse(course.course_id)}
                              tone="danger"
                            />
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      ) : null}

      {!loading && tab === 'tags' ? (
        <Panel title="专题标签">
          {topicTags.length === 0 ? (
            <EmptyState title="暂无专题标签" />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>标签名称</th>
                    <th>学科</th>
                    <th>状态</th>
                    <th>排序</th>
                    <th>备注</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {topicTags.map((tag) => (
                    <tr key={tag.tag_id}>
                      <td>
                        <div className="table-title">{tag.tag_name}</div>
                        <div className="table-subtitle">{tag.tag_code}</div>
                      </td>
                      <td>{getDictName('subject', tag.subject_code)}</td>
                      <td>
                        <Badge tone={tag.status === 'enabled' ? 'green' : 'slate'}>{tag.status}</Badge>
                      </td>
                      <td>{tag.sort_order}</td>
                      <td>{tag.remark || '--'}</td>
                      <td>
                        <div className="table-actions">
                          <ActionIconButton icon="edit" label="编辑标签" onClick={() => openTagModal(tag)} />
                          <ActionIconButton
                            icon="delete"
                            label="删除标签"
                            onClick={() => void removeTopicTag(tag.tag_id)}
                            tone="danger"
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {!loading && tab === 'assets' ? (
        <Panel
          title="资源管理"
          subtitle={`上传后会直接写入当前默认存储：${defaultStorageLabel}，支持音频、MP4 与常见文档。`}
        >
          <div className="page-stack">
            <section className="asset-upload-card">
              <div className="asset-upload-card__copy">
                <strong>上传课程资源</strong>
                <p>常用场景是上传课程音频、MP4 视频和讲义附件，上传完成后会自动进入资源库。</p>
              </div>
              <label className="asset-upload-input">
                <span>{assetLibraryUploading ? '上传中…' : '选择文件并上传'}</span>
                <input
                  accept="audio/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip"
                  disabled={assetLibraryUploading}
                  onChange={(event) => void handleAssetLibraryUpload(event)}
                  type="file"
                />
              </label>
            </section>

            {assets.length === 0 ? (
              <EmptyState title="暂无资源数据" />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>资源</th>
                      <th>类型</th>
                      <th>存储</th>
                      <th>大小</th>
                      <th>状态</th>
                      <th>创建时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assets.map((asset) => {
                      const assetUrl = asset.public_url || getAssetFileUrl(asset.asset_id);

                      return (
                        <tr key={asset.asset_id}>
                          <td>
                            <div className="table-title">{asset.origin_name}</div>
                            <div className="table-subtitle">{asset.asset_no}</div>
                          </td>
                          <td>{asset.asset_type}</td>
                          <td>{asset.provider}</td>
                          <td>{asset.size}</td>
                          <td>
                            <Badge tone={asset.status === 'enabled' ? 'green' : 'slate'}>{asset.status}</Badge>
                          </td>
                          <td>{formatDateTime(asset.created_at)}</td>
                          <td>
                            <div className="table-actions">
                              <a
                                aria-label="访问资源"
                                className="icon-action icon-action-default"
                                href={assetUrl}
                                rel="noreferrer"
                                target="_blank"
                                title="访问资源"
                              >
                                <svg aria-hidden="true" viewBox="0 0 24 24">
                                  <path d="M14 5h5v5" />
                                  <path d="M10 14 19 5" />
                                  <path d="M19 13v5H5V5h5" />
                                </svg>
                                <span className="sr-only">访问资源</span>
                              </a>
                              <ActionIconButton
                                icon="delete"
                                label="删除资源"
                                onClick={() => void removeAsset(asset.asset_id)}
                                tone="danger"
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Panel>
      ) : null}

      <Modal
        open={courseModalOpen}
        title={courseForm.course_id ? '编辑课程' : '新增课程'}
        onClose={() => setCourseModalOpen(false)}
        width="large"
      >
        <form className="page-stack" onSubmit={saveCourse}>
          <div className="dialog-section-title">
            <strong>课程基础信息</strong>
            <span>这里只维护课程基础资料，章节与课时请在课程列表中单独进入管理。</span>
          </div>

          <div className="form-columns">
            <label className="field">
              <span>课程标题</span>
              <input
                required
                placeholder="例如：高一数学必修一函数基础"
                value={courseForm.title}
                onChange={(event) => setCourseForm((current) => ({ ...current, title: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>课程类型</span>
              <select
                value={courseForm.course_type}
                onChange={(event) => setCourseForm((current) => ({ ...current, course_type: event.target.value }))}
              >
                <option value="sync">同步课</option>
                <option value="topic">专题课</option>
              </select>
            </label>
          </div>

          <div className="form-columns form-columns-4">
            {(
              [
                ['subject', '学科'],
                ['grade', '年级'],
                ['term', '学期'],
                ['version', '教材版本'],
              ] as const
            ).map(([type, label]) => (
              <label className="field" key={type}>
                <span>{label}</span>
                <select
                  value={courseForm[`${type}_code`]}
                  onChange={(event) =>
                    setCourseForm((current) => ({
                      ...current,
                      [`${type}_code`]: event.target.value,
                    }))
                  }
                >
                  <option value="">未选择</option>
                  {dimensionOptionsMap[type as ContentDimensionType].map((item) => (
                    <option key={item.id} value={item.item_code}>
                      {item.item_name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="form-columns">
            <label className="field">
              <span>讲师名称</span>
              <input
                placeholder="例如：王老师"
                value={courseForm.teacher_name}
                onChange={(event) => setCourseForm((current) => ({ ...current, teacher_name: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>访问权限</span>
              <select
                value={courseForm.access_type}
                onChange={(event) => setCourseForm((current) => ({ ...current, access_type: event.target.value }))}
              >
                <option value="free">免费</option>
                <option value="vip">VIP</option>
              </select>
            </label>
          </div>

          <div className="form-columns">
            <label className="field">
              <span>课程状态</span>
              <select
                value={courseForm.status}
                onChange={(event) => setCourseForm((current) => ({ ...current, status: event.target.value }))}
              >
                <option value="draft">草稿</option>
                <option value="published">已上架</option>
                <option value="offline">已下架</option>
              </select>
            </label>
            <label className="field">
              <span>推荐标签</span>
              <select
                value={courseForm.recommendation}
                onChange={(event) => setCourseForm((current) => ({ ...current, recommendation: event.target.value }))}
              >
                <option value="">不设置</option>
                {recommendationSelectOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="asset-upload-card course-cover-upload">
            <div className="asset-upload-card__copy">
              <strong>课程封面</strong>
              <p>web 前台首页、课程详情和课程卡片都会优先显示这里上传的封面，建议使用 16:9 图片。</p>
              {courseCoverName ? <span className="field-hint">当前文件：{courseCoverName}</span> : null}
            </div>
            <div className="course-cover-upload__aside">
              <div className="course-cover-upload__preview">
                {courseCoverPreviewUrl ? (
                  <img src={courseCoverPreviewUrl} alt={courseForm.title || '课程封面预览'} />
                ) : (
                  <span>暂无封面</span>
                )}
              </div>
              <div className="course-cover-upload__actions">
                <label className="asset-upload-input asset-upload-input-inline">
                  {courseCoverUploading ? '上传中…' : courseForm.cover_asset_id ? '更换封面' : '上传封面'}
                  <input accept="image/*" disabled={courseCoverUploading} onChange={handleCourseCoverUpload} type="file" />
                </label>
                {courseForm.cover_asset_id ? (
                  <button className="button button-ghost" onClick={clearCourseCover} type="button">
                    移除封面
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {courseForm.course_type === 'topic' ? (
            <div className="field course-tag-field">
              <span>专题标签</span>
              <small>仅专题课可选，可多选。</small>
              {topicTags.length > 0 ? (
                <div className="course-tag-grid">
                  {topicTags.map((tag) => {
                    const checked = courseForm.topic_tag_ids.includes(tag.tag_id);

                    return (
                      <label className={`course-tag-option${checked ? ' is-active' : ''}`} key={tag.tag_id}>
                        <input
                          checked={checked}
                          className="course-tag-option__input"
                          onChange={(event) =>
                            setCourseForm((current) => ({
                              ...current,
                              topic_tag_ids: event.target.checked
                                ? [...current.topic_tag_ids, tag.tag_id]
                                : current.topic_tag_ids.filter((item) => item !== tag.tag_id),
                            }))
                          }
                          type="checkbox"
                        />
                        <span className="course-tag-option__check" aria-hidden="true">
                          {checked ? '✓' : ''}
                        </span>
                        <span className="course-tag-option__label">{tag.tag_name}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="course-tag-empty">暂无可选专题标签，请先在“专题标签”中创建。</div>
              )}
            </div>
          ) : null}

          <label className="field">
            <span>课程简介</span>
            <textarea
              placeholder="简要说明课程内容、适用年级和学习目标"
              rows={4}
              value={courseForm.description}
              onChange={(event) => setCourseForm((current) => ({ ...current, description: event.target.value }))}
            />
          </label>

          <details className="form-advanced">
            <summary>更多设置</summary>
            <div className="form-advanced__body">
              <div className="form-columns">
                <label className="field">
                  <span>副标题</span>
                  <input
                    value={courseForm.subtitle}
                    onChange={(event) => setCourseForm((current) => ({ ...current, subtitle: event.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>排序</span>
                  <input
                    type="number"
                    value={courseForm.sort_order}
                    onChange={(event) => setCourseForm((current) => ({ ...current, sort_order: event.target.value }))}
                  />
                </label>
              </div>
            </div>
          </details>

          <div className="button-row">
            <button className="button button-primary" disabled={submitting} type="submit">
              {submitting ? '保存中…' : '保存课程'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={lessonModalOpen}
        title={lessonCourseTitle ? `${lessonCourseTitle} · 章节课时` : '章节课时管理'}
        onClose={closeLessonManager}
        width="large"
      >
        {lessonModalLoading || !courseDetail ? (
          <LoadingBlock text="正在加载课程章节数据…" />
        ) : (
          <div className="page-stack">
            <div className="dialog-section-title">
              <strong>章节与课时</strong>
              <span>课程信息和课时上传已经拆分，这里专门维护目录结构、媒体文件和试看规则。</span>
            </div>

            <div className="course-modal-grid">
              <Panel title="章节概览" subtitle="当前课程下的章节、课时与发布状态">
                <div className="lesson-summary-strip">
                  <div className="lesson-summary-card">
                    <span>总节点</span>
                    <strong>{formatNumber(lessonSummary.total)}</strong>
                  </div>
                  <div className="lesson-summary-card">
                    <span>已发布</span>
                    <strong>{formatNumber(lessonSummary.published)}</strong>
                  </div>
                  <div className="lesson-summary-card">
                    <span>试看课时</span>
                    <strong>{formatNumber(lessonSummary.preview)}</strong>
                  </div>
                </div>

                {lessonItems.length ? (
                  <div className="lesson-board">
                    {lessonViewItems.map((lesson) => {
                      const siblingMeta = lessonSiblingMeta.get(lesson.lesson_id);
                      const canMoveUp = Boolean(siblingMeta && siblingMeta.index > 0);
                      const canMoveDown = Boolean(siblingMeta && siblingMeta.index < siblingMeta.total - 1);

                      return (
                        <article className={`lesson-card lesson-card-depth-${lesson.depth}`} key={lesson.lesson_id}>
                          <div className="lesson-card-head">
                            <div>
                              <div className="lesson-card-labels">
                                <span className={`lesson-node-pill lesson-node-pill-${lesson.node_type}`}>
                                  {getLessonNodeLabel(lesson.node_type)}
                                </span>
                                <span className={`lesson-status-pill lesson-status-pill-${lesson.status}`}>
                                  {getLessonStatusLabel(lesson.status)}
                                </span>
                                <span className="lesson-parent-path">
                                  {lesson.parentTitle ? `上级 · ${lesson.parentTitle}` : '一级节点'}
                                </span>
                              </div>
                              <strong>{lesson.title}</strong>
                              <span>
                                {siblingMeta ? `同级第 ${siblingMeta.index + 1} 位 / 共 ${siblingMeta.total} 项` : '同级顺序未计算'}
                                {` · 排序 ${lesson.sort_order}`}
                              </span>
                            </div>
                            <div className="lesson-card-actions">
                              <div className="lesson-status-switch" role="group" aria-label={`切换${lesson.title}状态`}>
                                {(['draft', 'published', 'offline'] as const).map((status) => (
                                  <button
                                    key={status}
                                    className={`lesson-status-chip lesson-status-chip-${status}${lesson.status === status ? ' is-active' : ''}`}
                                    aria-pressed={lesson.status === status}
                                    disabled={submitting}
                                    onClick={() => void changeLessonStatus(lesson, status)}
                                    type="button"
                                  >
                                    {getLessonStatusLabel(status)}
                                  </button>
                                ))}
                              </div>
                              <ActionIconButton
                                disabled={submitting || !canMoveUp}
                                icon="up"
                                label={`上移${getLessonNodeLabel(lesson.node_type)}`}
                                onClick={() => void moveLesson(lesson.lesson_id, 'up')}
                                tone="soft"
                              />
                              <ActionIconButton
                                disabled={submitting || !canMoveDown}
                                icon="down"
                                label={`下移${getLessonNodeLabel(lesson.node_type)}`}
                                onClick={() => void moveLesson(lesson.lesson_id, 'down')}
                                tone="soft"
                              />
                              <ActionIconButton
                                disabled={submitting}
                                icon="delete"
                                label={`删除${getLessonNodeLabel(lesson.node_type)}`}
                                onClick={() => void removeLesson(lesson.lesson_id, lesson.title)}
                                tone="danger"
                              />
                            </div>
                          </div>

                          <div className="lesson-card-meta">
                            <span>{lesson.duration_seconds} 秒</span>
                            <span>{lesson.access_type === 'vip' ? 'VIP' : lesson.access_type === 'free' ? '免费' : '跟随课程'}</span>
                            <span>{lesson.is_preview ? '支持试看' : '不支持试看'}</span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState title="还没有章节" description="先在右侧新增一条章节或课时记录。" />
                )}
              </Panel>

              <Panel title="新增章节 / 课时" subtitle={`课时媒体会上传到当前默认存储：${defaultStorageLabel}`}>
                <form className="lesson-form-layout" onSubmit={submitLesson}>
                  <section className="lesson-form-section">
                    <div className="lesson-form-section-head">
                      <strong>基础设置</strong>
                      <span>先确定当前节点类型、状态和挂载位置，保存后可在左侧继续微调顺序。</span>
                    </div>

                    <div className="lesson-form-basic-grid">
                      <label className="field field-span-2">
                        <span>标题</span>
                        <input
                          required
                          placeholder={`请输入${getLessonNodeLabel(lessonForm.node_type)}标题`}
                          value={lessonForm.title}
                          onChange={(event) => setLessonForm((current) => ({ ...current, title: event.target.value }))}
                        />
                      </label>
                      <label className="field">
                        <span>节点类型</span>
                        <select
                          value={lessonForm.node_type}
                          onChange={(event) => {
                            setLessonForm((current) => ({ ...current, node_type: event.target.value }));
                          }}
                        >
                          <option value="chapter">章节</option>
                          <option value="section">小节</option>
                          <option value="lesson">课时</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>状态</span>
                        <select
                          value={lessonForm.status}
                          onChange={(event) => setLessonForm((current) => ({ ...current, status: event.target.value }))}
                        >
                          <option value="draft">草稿</option>
                          <option value="published">已发布</option>
                          <option value="offline">已下架</option>
                        </select>
                      </label>
                      <label className="field field-span-2">
                        <span>{lessonParentLabel}</span>
                        <select
                          disabled={lessonForm.node_type === 'chapter'}
                          value={lessonForm.parent_id}
                          onChange={(event) => {
                            setLessonForm((current) => ({ ...current, parent_id: event.target.value }));
                          }}
                        >
                          <option value="">
                            {lessonForm.node_type === 'chapter' ? '章节默认直接挂在课程下' : '直接挂在课程下'}
                          </option>
                          {lessonParentOptions.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                        <small className="field-hint">
                          {lessonForm.node_type === 'chapter'
                            ? '章节作为一级目录节点，不需要选择上级。'
                            : lessonParentOptions.length
                              ? '可挂载到已有章节或小节下，形成课程目录层级。'
                              : '当前没有可挂载的父节点，保存后会直接显示在课程根目录。'}
                        </small>
                      </label>
                    </div>
                  </section>

                  {isLessonNode ? (
                    <>
                      <section className="lesson-form-section">
                        <div className="lesson-form-section-head">
                          <strong>媒体资源</strong>
                          <span>音频、MP4 和讲义会直接写入当前默认存储。</span>
                        </div>

                        <div className="lesson-upload-grid">
                          <article className="lesson-upload-card">
                            <div className="lesson-upload-card-copy">
                              <strong>课程音频 / MP4</strong>
                              <span>支持 mp3、m4a、wav、aac、ogg、flac、mp4 等格式。</span>
                            </div>
                            <div className="lesson-upload-stack">
                              <label className="asset-upload-input asset-upload-input-inline">
                                <span>{lessonMediaUploading ? '上传中…' : '上传媒体文件'}</span>
                                <input
                                  accept="audio/*,video/*,.mp3,.m4a,.aac,.wav,.ogg,.flac,.mp4,.mov,.m4v,.webm"
                                  disabled={lessonMediaUploading}
                                  onChange={(event) => void handleLessonAssetUpload(event, 'media')}
                                  type="file"
                                />
                              </label>
                              {lessonMediaAsset ? (
                                <div className="asset-pill-row">
                                  <a
                                    className="asset-pill"
                                    href={lessonMediaAsset.public_url || getAssetFileUrl(lessonMediaAsset.asset_id)}
                                    rel="noreferrer"
                                    target="_blank"
                                  >
                                    {lessonMediaAsset.origin_name}
                                  </a>
                                  <button
                                    className="button button-ghost button-inline"
                                    onClick={() => clearLessonUpload('media')}
                                    type="button"
                                  >
                                    移除
                                  </button>
                                </div>
                              ) : (
                                <small className="field-hint">建议先上传音频或 MP4，再补充时长与试看规则。</small>
                              )}
                            </div>
                          </article>

                          <article className="lesson-upload-card">
                            <div className="lesson-upload-card-copy">
                              <strong>讲义附件</strong>
                              <span>讲义为可选项，课时页会自动提供下载入口。</span>
                            </div>
                            <div className="lesson-upload-stack">
                              <label className="asset-upload-input asset-upload-input-inline">
                                <span>{lessonHandoutUploading ? '上传中…' : '上传讲义附件'}</span>
                                <input
                                  accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip"
                                  disabled={lessonHandoutUploading}
                                  onChange={(event) => void handleLessonAssetUpload(event, 'handout')}
                                  type="file"
                                />
                              </label>
                              {lessonHandoutAsset ? (
                                <div className="asset-pill-row">
                                  <a
                                    className="asset-pill"
                                    href={lessonHandoutAsset.public_url || getAssetFileUrl(lessonHandoutAsset.asset_id)}
                                    rel="noreferrer"
                                    target="_blank"
                                  >
                                    {lessonHandoutAsset.origin_name}
                                  </a>
                                  <button
                                    className="button button-ghost button-inline"
                                    onClick={() => clearLessonUpload('handout')}
                                    type="button"
                                  >
                                    移除
                                  </button>
                                </div>
                              ) : (
                                <small className="field-hint">支持 PDF、Office 文档和压缩包。</small>
                              )}
                            </div>
                          </article>
                        </div>
                      </section>

                      <section className="lesson-form-section">
                        <div className="lesson-form-section-head">
                          <strong>课时设置</strong>
                          <span>控制播放时长、权益和是否允许试看。</span>
                        </div>

                        <div className="lesson-form-lesson-grid">
                          <label className="field">
                            <span>时长（秒）</span>
                            <input
                              type="number"
                              value={lessonForm.duration_seconds}
                              onChange={(event) =>
                                setLessonForm((current) => ({ ...current, duration_seconds: event.target.value }))
                              }
                            />
                          </label>
                          <label className="field">
                            <span>权限</span>
                            <select
                              value={lessonForm.access_type}
                              onChange={(event) =>
                                setLessonForm((current) => ({ ...current, access_type: event.target.value }))
                              }
                            >
                              <option value="">跟随课程</option>
                              <option value="free">免费</option>
                              <option value="vip">VIP</option>
                            </select>
                          </label>
                          <label className="lesson-toggle-card">
                            <div>
                              <strong>允许试看</strong>
                              <span>开启后未开通用户也可试看当前课时。</span>
                            </div>
                            <input
                              checked={lessonForm.is_preview}
                              onChange={(event) =>
                                setLessonForm((current) => ({ ...current, is_preview: event.target.checked }))
                              }
                              type="checkbox"
                            />
                          </label>
                        </div>
                      </section>
                    </>
                  ) : (
                    <section className="lesson-form-note">
                      <strong>{getLessonNodeLabel(lessonForm.node_type)} 只维护目录结构</strong>
                      <span>当前节点无需上传媒体或设置试看，保存后可继续为它新增下级内容。</span>
                    </section>
                  )}

                  <div className="button-row lesson-form-submit">
                    <button className="button button-primary" disabled={submitting} type="submit">
                      新增{getLessonNodeLabel(lessonForm.node_type)}
                    </button>
                  </div>
                </form>
              </Panel>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={tagModalOpen} title={tagForm.tag_id ? '编辑专题标签' : '新增专题标签'} onClose={() => setTagModalOpen(false)}>
        <form className="page-stack" onSubmit={saveTopicTag}>
          <label className="field">
            <span>标签名称</span>
            <input
              required
              value={tagForm.tag_name}
              onChange={(event) => setTagForm((current) => ({ ...current, tag_name: event.target.value }))}
            />
          </label>
          <div className="form-columns">
            <label className="field">
              <span>学科</span>
              <select
                value={tagForm.subject_code}
                onChange={(event) => setTagForm((current) => ({ ...current, subject_code: event.target.value }))}
              >
                <option value="">未选择</option>
                {dimensions.subject.map((item) => (
                  <option key={item.id} value={item.item_code}>
                    {item.item_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>状态</span>
              <select
                value={tagForm.status}
                onChange={(event) => setTagForm((current) => ({ ...current, status: event.target.value }))}
              >
                <option value="enabled">enabled</option>
                <option value="disabled">disabled</option>
              </select>
            </label>
          </div>
          <div className="form-columns">
            <label className="field">
              <span>排序</span>
              <input
                type="number"
                value={tagForm.sort_order}
                onChange={(event) => setTagForm((current) => ({ ...current, sort_order: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>备注</span>
              <input
                value={tagForm.remark}
                onChange={(event) => setTagForm((current) => ({ ...current, remark: event.target.value }))}
              />
            </label>
          </div>
          <div className="button-row">
            <button className="button button-primary" disabled={submitting} type="submit">
              保存标签
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
