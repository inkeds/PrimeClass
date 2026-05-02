'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { AppShell } from '@/components/app-shell';
import { useAppContext } from '@/components/app-provider';
import { ArrowLeftIcon, DownloadIcon, FileTextIcon, LockIcon, PlayIcon, StarIcon } from '@/components/icons';
import { EmptyState } from '@/components/ui-blocks';
import {
  favoriteCourse,
  getAppAssetFileUrl,
  getCourseDetail,
  getLessonPlayDetail,
  isUnauthorizedError,
  saveLessonNote,
  unfavoriteCourse,
  updateLearningProgress,
} from '@/lib/api';
import type { CourseDetail, LessonPlayDetail } from '@/lib/types';
import {
  buildRedirect,
  formatDateLabel,
  getMembershipTone,
  hasVipMembership,
  isPermanentMembership,
} from '@/lib/utils';

const progressOptions = [25, 50, 100];

export default function LessonPage() {
  const params = useParams<{ lessonId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('courseId');
  const { openRedeem, session, showToast, logout } = useAppContext();
  const [lesson, setLesson] = useState<LessonPlayDetail | null>(null);
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [favoritePending, setFavoritePending] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const hasVip = hasVipMembership(session?.membership);
  const isPermanent = isPermanentMembership(session?.membership);
  const vipTone = getMembershipTone(session?.membership);
  const redirectPath = courseId ? `/lessons/${params.lessonId}?courseId=${courseId}` : `/lessons/${params.lessonId}`;
  const favoriteCourseId = course?.course_id ?? courseId;
  const noteChanged = normalizeNoteContent(noteDraft) !== normalizeNoteContent(lesson?.note_content ?? '');

  useEffect(() => {
    let active = true;

    async function loadPageData() {
      setLoading(true);
      setNoteDraft('');

      try {
        const [lessonData, courseData] = await Promise.all([
          getLessonPlayDetail(params.lessonId, session?.token),
          courseId ? getCourseDetail(courseId, session?.token) : Promise.resolve(null),
        ]);

        if (!active) {
          return;
        }

        setLesson(lessonData);
        setCourse(courseData);
        setNoteDraft(lessonData.note_content ?? '');
      } catch (error) {
        if (isUnauthorizedError(error)) {
          logout();
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadPageData();

    return () => {
      active = false;
    };
  }, [courseId, params.lessonId, session?.token]);

  async function handleToggleFavorite() {
    if (!favoriteCourseId) {
      return;
    }

    if (!session?.token) {
      showToast('请先登录后再管理收藏', 'error');
      router.push(buildRedirect(redirectPath));
      return;
    }

    setFavoritePending(true);

    try {
      const result = course?.is_collected
        ? await unfavoriteCourse(session.token, favoriteCourseId)
        : await favoriteCourse(session.token, favoriteCourseId);

      setCourse((current) => (current ? { ...current, is_collected: result.collected } : current));
      showToast(result.collected ? '已加入收藏' : '已取消收藏');
    } catch (error) {
      if (isUnauthorizedError(error)) {
        logout();
        router.push(buildRedirect(redirectPath));
        return;
      }

      showToast(error instanceof Error ? error.message : '收藏操作失败', 'error');
    } finally {
      setFavoritePending(false);
    }
  }

  async function handleSaveNote() {
    if (!lesson) {
      return;
    }

    if (!session?.token) {
      showToast('请先登录后再保存笔记', 'error');
      router.push(buildRedirect(redirectPath));
      return;
    }

    if (!lesson.note_enabled) {
      showToast('当前课时未开放笔记功能', 'error');
      return;
    }

    setNoteSaving(true);

    try {
      const result = await saveLessonNote(session.token, params.lessonId, noteDraft);

      setLesson((current) =>
        current
          ? {
              ...current,
              note_content: result.content,
              note_updated_at: result.updated_at,
            }
          : current,
      );
      setNoteDraft(result.content ?? '');
      showToast(result.content ? '笔记已保存' : '笔记已清空');
    } catch (error) {
      if (isUnauthorizedError(error)) {
        logout();
        router.push(buildRedirect(redirectPath));
        return;
      }

      showToast(error instanceof Error ? error.message : '笔记保存失败', 'error');
    } finally {
      setNoteSaving(false);
    }
  }

  async function handleProgressUpdate(progress: number) {
    if (!session?.token || !courseId) {
      showToast('请先登录后再同步学习进度', 'error');
      return;
    }

    setSaving(progress);

    try {
      await updateLearningProgress(session.token, {
        course_id: courseId,
        lesson_id: params.lessonId,
        progress,
        watched_seconds: progress * 12,
      });

      setLesson((current) => (current ? { ...current, progress } : current));
      showToast(`已记录 ${progress}% 学习进度`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '进度保存失败', 'error');
    } finally {
      setSaving(null);
    }
  }

  const mediaUrl =
    lesson?.media_url || (lesson?.media_asset_id ? getAppAssetFileUrl(lesson.media_asset_id, session?.token) : null);
  const handoutUrl =
    lesson?.handout_url || (lesson?.handout_asset_id ? getAppAssetFileUrl(lesson.handout_asset_id, session?.token) : null);

  return (
    <AppShell showNav={false}>
      <div className="page-scroll">
        <div className="player-floating-back">
          <Link href={courseId ? `/courses/${courseId}` : '/'} className="back-button">
            <ArrowLeftIcon className="back-button__icon" />
          </Link>
        </div>

        <main className="page-body page-body--flush">
          {loading ? (
            <div className="player-skeleton" />
          ) : lesson ? (
            <>
              <section className="player-stage">
                {lesson.can_access && mediaUrl ? (
                  lesson.media_kind === 'audio' ? (
                    <div className="player-stage__audio">
                      <div className="player-stage__audio-copy">
                        <span>音频课程</span>
                        <strong>{lesson.lesson_title}</strong>
                      </div>
                      <audio className="player-stage__audio-element" controls preload="metadata" src={mediaUrl} />
                    </div>
                  ) : (
                    <video className="player-stage__video" controls preload="metadata" src={mediaUrl} />
                  )
                ) : (
                  <div className={`player-stage__locked${lesson.can_access ? '' : ' is-vip'}${hasVip ? ' is-member' : ''} tone-${vipTone}`}>
                    {lesson.can_access ? <PlayIcon className="player-stage__locked-icon" /> : <LockIcon className="player-stage__locked-icon" />}
                    <h2>
                      {lesson.can_access
                        ? '课程媒体待上传'
                        : hasVip
                          ? `${isPermanent ? '永久' : 'VIP'} 权益已开通`
                          : '当前课时需要开通 VIP 权益'}
                    </h2>
                    <p>
                      {lesson.can_access
                        ? '音频或视频素材尚未配置，可先查看课程目录。'
                        : hasVip
                          ? '当前账号已有会员权益，请返回课程目录切换其他已开放课时，或联系后台补充媒体资源。'
                          : lesson.access_denied_reason ?? '开通会员后即可解锁当前课时与专题课程。'}
                    </p>
                    {!lesson.can_access && !hasVip ? (
                      <button type="button" className="primary-button primary-button--inline is-vip-dark" onClick={openRedeem}>
                        去兑换激活码
                      </button>
                    ) : null}
                  </div>
                )}
              </section>

              <section className="player-panel">
                <div className="player-panel__header">
                  <div className="player-panel__title">
                    <h1>{lesson.lesson_title}</h1>
                    <p>{course?.title ?? '课程播放页'} · {course?.teacher_name ?? '优学课堂'}</p>
                  </div>
                  {favoriteCourseId ? (
                    <button
                      type="button"
                      className={`player-panel__collect${course?.is_collected ? ' is-active' : ''}`}
                      onClick={handleToggleFavorite}
                      disabled={favoritePending}
                    >
                      <StarIcon className="player-panel__collect-icon" />
                      <span>{favoritePending ? '处理中...' : course?.is_collected ? '已收藏' : '收藏'}</span>
                    </button>
                  ) : null}
                </div>
                <div className="player-actions">
                  {handoutUrl ? (
                    <a className="secondary-button is-panel" href={handoutUrl} target="_blank" rel="noreferrer">
                      <DownloadIcon className="secondary-button__icon" />
                      下载讲义
                    </a>
                  ) : (
                    <button type="button" className="secondary-button is-panel" disabled>
                      <DownloadIcon className="secondary-button__icon" />
                      暂无讲义
                    </button>
                  )}
                  <Link href={courseId ? `/courses/${courseId}` : '/'} className="secondary-button is-panel">
                    <PlayIcon className="secondary-button__icon" />
                    查看目录
                  </Link>
                </div>
                <div className="progress-chip-row">
                  {progressOptions.map((progress) => (
                    <button
                      key={progress}
                      type="button"
                      className={`progress-chip${lesson.progress === progress ? ' is-active' : ''}`}
                      onClick={() => handleProgressUpdate(progress)}
                      disabled={saving === progress || !lesson.can_access}
                    >
                      {saving === progress ? '保存中...' : `标记 ${progress}%`}
                    </button>
                  ))}
                </div>
              </section>

              <section className="lesson-notes">
                <div className="lesson-notes__header">
                  <div className="lesson-notes__lead">
                    <div className="lesson-notes__icon">
                      <FileTextIcon className="lesson-notes__icon-svg" />
                    </div>
                    <div className="lesson-notes__intro">
                      <h3>随堂笔记</h3>
                      <p>
                        {lesson.note_enabled
                          ? lesson.note_updated_at
                            ? `上次保存于 ${formatDateLabel(lesson.note_updated_at)}`
                            : '记录本节课重点、易错点和作业提醒，保存后会同步到学习库。'
                          : '当前课时未解锁，暂时不能记录随堂笔记。'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="ghost-button lesson-notes__reset"
                    onClick={() => setNoteDraft(lesson.note_content ?? '')}
                    disabled={!lesson.note_enabled || noteSaving || !noteChanged}
                  >
                    撤销
                  </button>
                </div>
                <div className={`lesson-notes__editor${lesson.note_enabled ? '' : ' is-disabled'}`}>
                  <textarea
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    disabled={!lesson.note_enabled || noteSaving}
                    maxLength={5000}
                    placeholder={
                      lesson.note_enabled
                        ? '记录本节课的公式、易错点、例题思路和复习提醒...'
                        : '开通当前课时权限后可使用随堂笔记'
                    }
                  />
                  <div className="lesson-notes__footer">
                    <span className="lesson-notes__hint">
                      {lesson.note_enabled ? '保存后会同步到学习库的最近笔记' : '当前课时暂不支持笔记'}
                    </span>
                    <div className="lesson-notes__actions">
                      <span className="lesson-notes__count">{noteDraft.length}/5000</span>
                      <button
                        type="button"
                        className="primary-button primary-button--inline lesson-notes__save"
                        onClick={handleSaveNote}
                        disabled={!lesson.note_enabled || noteSaving || !noteChanged}
                      >
                        {noteSaving ? '保存中...' : normalizeNoteContent(noteDraft) ? '保存笔记' : '清空笔记'}
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {course?.lesson_list?.length ? (
                <section className="lesson-section">
                  <div className="section-title">
                    <h3>本课程其他课时</h3>
                  </div>
                  <div className="lesson-list">
                    {course.lesson_list.map((item) => {
                      const accessType = item.access_type ?? course.access_type;
                      const needsVip = accessType === 'vip' && !item.is_preview;
                      const showLock = needsVip && !hasVip;

                      return (
                        <Link
                          key={item.lesson_id}
                          href={`/lessons/${item.lesson_id}?courseId=${course.course_id}`}
                          className={`lesson-item${item.lesson_id === params.lessonId ? ' is-current' : ''}${needsVip ? ' is-vip' : ''}${showLock ? ' is-locked' : ''}${needsVip && hasVip ? ' is-unlocked' : ''} tone-${vipTone}`}
                        >
                          <div className="lesson-item__index">{String(item.sort_order || 0).padStart(2, '0')}</div>
                          <div className="lesson-item__body">
                            <div className="lesson-item__title">
                              <h4>{item.title}</h4>
                              {showLock ? <LockIcon className="lesson-item__lock" /> : null}
                            </div>
                            <div className="lesson-item__meta">
                              <span>{item.duration_seconds > 0 ? `${Math.ceil(item.duration_seconds / 60)} 分钟` : '视频课时'}</span>
                              <span>{item.is_preview ? '可试看' : needsVip ? (hasVip ? '已解锁' : 'VIP 免费') : 'FREE'}</span>
                              <strong>{item.progress}%</strong>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ) : null}
            </>
          ) : (
            <EmptyState title="课时不存在或已下架" description="当前播放链接已失效，请返回课程详情重新进入。" />
          )}
        </main>
      </div>
    </AppShell>
  );
}

function normalizeNoteContent(value: string) {
  return value.replace(/\r\n/g, '\n').trim();
}
