'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { AppShell } from '@/components/app-shell';
import { useAppContext } from '@/components/app-provider';
import { ArrowLeftIcon, LockIcon, PlayIcon, StarIcon } from '@/components/icons';
import { EmptyState } from '@/components/ui-blocks';
import { favoriteCourse, getCourseDetail, isUnauthorizedError, unfavoriteCourse } from '@/lib/api';
import type { CourseDetail } from '@/lib/types';
import {
  buildRedirect,
  formatPercent,
  getAccessLabel,
  getMembershipTone,
  hasVipMembership,
  isPermanentMembership,
} from '@/lib/utils';

export default function CourseDetailPage() {
  const params = useParams<{ courseId: string }>();
  const router = useRouter();
  const { openRedeem, session, showToast, logout } = useAppContext();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [favoritePending, setFavoritePending] = useState(false);
  const hasVip = hasVipMembership(session?.membership);
  const isPermanent = isPermanentMembership(session?.membership);
  const vipTone = getMembershipTone(session?.membership);

  useEffect(() => {
    let active = true;

    async function loadCourse() {
      setLoading(true);

      try {
        const data = await getCourseDetail(params.courseId, session?.token);

        if (active) {
          setCourse(data);
        }
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

    void loadCourse();

    return () => {
      active = false;
    };
  }, [params.courseId, session?.token]);

  async function handleToggleFavorite() {
    if (!course) {
      return;
    }

    if (!session?.token) {
      showToast('请先登录后再管理收藏', 'error');
      router.push(buildRedirect(`/courses/${params.courseId}`));
      return;
    }

    setFavoritePending(true);

    try {
      const result = course.is_collected
        ? await unfavoriteCourse(session.token, course.course_id)
        : await favoriteCourse(session.token, course.course_id);

      setCourse((current) => (current ? { ...current, is_collected: result.collected } : current));
      showToast(result.collected ? '已加入收藏' : '已取消收藏');
    } catch (error) {
      if (isUnauthorizedError(error)) {
        logout();
        router.push(buildRedirect(`/courses/${params.courseId}`));
        return;
      }

      showToast(error instanceof Error ? error.message : '收藏操作失败', 'error');
    } finally {
      setFavoritePending(false);
    }
  }

  return (
    <AppShell showNav={false}>
      <div className="page-scroll">
        <header className="detail-header">
          <Link href="/" className="back-button">
            <ArrowLeftIcon className="back-button__icon" />
          </Link>
          <span>课程详情</span>
          <div className="detail-header__placeholder" />
        </header>

        <main className="page-body">
          {loading ? (
            <div className="skeleton-card skeleton-card--large" />
          ) : course ? (
            <>
              {(() => {
                const previewLesson = course.lesson_list.find((item) => item.is_preview);
                const firstLesson = course.lesson_list[0] ?? null;
                const entryLesson = previewLesson ?? firstLesson;
                const needsMembership = course.access_type === 'vip' && !hasVip && !previewLesson;
                const entryHref = entryLesson
                  ? `/lessons/${entryLesson.lesson_id}?courseId=${course.course_id}`
                  : null;
                const recommendationTone = course.recommendation_tone ?? 'blue';

                return (
                  <section className={`course-hero${course.access_type === 'vip' ? ' is-vip' : ''}${hasVip ? ' is-member' : ''} tone-${vipTone}`}>
                    <div className="course-hero__copy">
                      <div className="course-hero__badge-row">
                        {course.recommendation_label ? (
                          <span className={`course-hero__badge is-recommendation tone-${recommendationTone}`}>
                            {course.recommendation_label}
                          </span>
                        ) : null}
                        <span className={`course-hero__badge${course.access_type === 'vip' ? ' is-vip' : ''}${hasVip ? ' is-member' : ''} tone-${vipTone}`}>
                          {course.access_type === 'vip'
                            ? hasVip
                              ? `${isPermanent ? '永久' : 'VIP'} 已解锁`
                              : getAccessLabel(course.access_type)
                            : getAccessLabel(course.access_type)}
                        </span>
                      </div>
                      <h1>{course.title}</h1>
                      <p>{course.description || `${course.teacher_name || '名师'} 主讲 · 同步课程详解`}</p>
                      <div className="course-hero__meta">
                        <span>{course.subject || '课程'}</span>
                        <span>{course.version || '教材同步'}</span>
                        <span>{course.teacher_name || '优学课堂'}</span>
                        <span>{course.lesson_list.length} 个节点</span>
                      </div>
                      <div className="course-hero__actions">
                        {needsMembership ? (
                          <button type="button" className="primary-button primary-button--inline is-vip-dark" onClick={openRedeem}>
                            开通后学习
                          </button>
                        ) : entryHref ? (
                          <Link href={entryHref} className={`primary-button primary-button--inline${course.access_type === 'vip' ? ' is-vip-dark' : ''}`}>
                            {previewLesson && !hasVip ? '先试看' : '立即学习'}
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          className={`course-hero__collect${course.is_collected ? ' is-active' : ''}`}
                          onClick={handleToggleFavorite}
                          disabled={favoritePending}
                        >
                          <StarIcon className="course-hero__collect-icon" />
                          <span>{favoritePending ? '处理中...' : course.is_collected ? '已收藏' : '收藏'}</span>
                        </button>
                      </div>
                    </div>
                    {course.cover_url ? <img src={course.cover_url} alt={course.title} className="course-hero__image" /> : null}
                  </section>
                );
              })()}

              <section className="lesson-section">
                <div className="section-title">
                  <h3>课时目录</h3>
                </div>
                {course.lesson_list.length ? (
                  <div className="lesson-list">
                    {course.lesson_list.map((lesson, index) => {
                      const accessType = lesson.access_type ?? course.access_type;
                      const needsVip = accessType === 'vip' && !lesson.is_preview;
                      const showLock = needsVip && !hasVip;
                      const lessonLabel = lesson.is_preview
                        ? '可试看'
                        : needsVip
                          ? hasVip
                            ? '已解锁'
                            : getAccessLabel(accessType)
                          : getAccessLabel(accessType);

                      return (
                        <Link
                          key={lesson.lesson_id}
                          href={`/lessons/${lesson.lesson_id}?courseId=${course.course_id}`}
                          className={`lesson-item${needsVip ? ' is-vip' : ''}${showLock ? ' is-locked' : ''}${needsVip && hasVip ? ' is-unlocked' : ''} tone-${vipTone}`}
                        >
                          <div className="lesson-item__index">{String(index + 1).padStart(2, '0')}</div>
                          <div className="lesson-item__body">
                            <div className="lesson-item__title">
                              <h4>{lesson.title}</h4>
                              {showLock ? <LockIcon className="lesson-item__lock" /> : null}
                            </div>
                            <div className="lesson-item__meta">
                              <span>{lesson.duration_seconds > 0 ? `${Math.ceil(lesson.duration_seconds / 60)} 分钟` : '视频课时'}</span>
                              <span>{lessonLabel}</span>
                              {lesson.progress > 0 ? <strong>已学 {formatPercent(lesson.progress)}</strong> : null}
                            </div>
                            {lesson.progress > 0 ? (
                              <div className="progress-track">
                                <span style={{ width: formatPercent(lesson.progress) }} />
                              </div>
                            ) : null}
                          </div>
                          <PlayIcon className="lesson-item__play" />
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState title="暂无已发布课时" description="当前课程的可学习内容暂未开放，请稍后再看。" />
                )}
              </section>
            </>
          ) : (
            <EmptyState title="课程不存在或已下架" description="当前课程可能已下线，返回首页重新选择即可。" />
          )}
        </main>
      </div>
    </AppShell>
  );
}
