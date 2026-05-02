import type { MembershipTone } from '@/lib/types';
import type { ReactNode } from 'react';
import Link from 'next/link';

import type { CourseSummary, LibraryItem, LibraryNoteItem } from '@/lib/types';
import { formatCount, formatPercent, formatRelativeTime, getAccessLabel } from '@/lib/utils';
import { ChevronRightIcon, ClockIcon, EyeIcon, GiftIcon, PlayIcon } from '@/components/icons';

export function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: {
    label: string;
    href: string;
  };
}) {
  return (
    <div className="section-title">
      <h3>{title}</h3>
      {action ? (
        <Link href={action.href} className="section-title__action">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export function CourseCard({
  course,
  hasVip = false,
  vipTone = 'gold',
}: {
  course: CourseSummary;
  hasVip?: boolean;
  vipTone?: MembershipTone;
}) {
  const isVipCourse = course.access_type === 'vip';
  const badgeLabel = isVipCourse ? (hasVip ? '已解锁' : getAccessLabel(course.access_type)) : getAccessLabel(course.access_type);
  const recommendationTone = course.recommendation_tone ?? 'blue';
  const coverBadgeLabel = course.recommendation_label || badgeLabel;
  const coverBadgeClassName = course.recommendation_label
    ? `course-badge is-recommendation tone-${recommendationTone}`
    : `course-badge${isVipCourse ? ' is-vip' : ''}${hasVip ? ' is-member' : ''} tone-${vipTone}`;

  return (
    <Link href={`/courses/${course.course_id}`} className="course-card">
      <div className="course-card__cover">
        {course.cover_url ? <img src={course.cover_url} alt={course.title} /> : <div className="cover-fallback" />}
        <div className={coverBadgeClassName}>{coverBadgeLabel}</div>
      </div>
      <div className="course-card__body">
        <div>
          <h4>{course.title}</h4>
          <p>
            {course.course_type === 'topic' ? '专题强化' : '同步基础'} · 难度：
            {course.difficulty || '★★'}
          </p>
        </div>
        <div className="course-card__meta">
          <strong className={`${isVipCourse ? 'is-vip' : ''}${hasVip ? ' is-member' : ''} tone-${vipTone}`}>
            {isVipCourse ? (hasVip ? '会员课' : 'VIP') : 'FREE'}
          </strong>
          <span>
            <EyeIcon className="course-card__meta-icon" />
            {formatCount(course.view_count)}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function LearningCard({ item }: { item: LibraryItem | { course_id: string; title: string; lesson_id: string; progress: number; cover_url: string | null; last_learned_at?: string | null; lesson_title?: string; } }) {
  const lessonTitle = 'lesson_title' in item && item.lesson_title ? item.lesson_title : '继续上次学习内容';
  const lastLearnedLabel =
    'last_learned_at' in item ? formatRelativeTime(item.last_learned_at ?? null) : '继续保持学习节奏';
  const progressLabel = formatPercent(item.progress);

  return (
    <Link href={`/lessons/${item.lesson_id}?courseId=${item.course_id}`} className="learning-card">
      <div className="learning-card__cover">
        {item.cover_url ? <img src={item.cover_url} alt={item.title} /> : <div className="cover-fallback" />}
      </div>
      <div className="learning-card__body">
        <div className="learning-card__head">
          <div className="learning-card__title-group">
            <h4>{item.title}</h4>
            <p>{lessonTitle}</p>
          </div>
          <span className="learning-card__badge">{progressLabel}</span>
        </div>
        <div className="progress-track" aria-label={`当前进度 ${progressLabel}`}>
          <span style={{ width: progressLabel }} />
        </div>
        <div className="learning-card__footer">
          <small>
            <ClockIcon className="learning-card__clock" />
            {lastLearnedLabel}
          </small>
          <span className="learning-card__action">
            继续学习
            <PlayIcon className="learning-card__play" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function NoteCard({ item }: { item: LibraryNoteItem }) {
  const preview = item.content?.replace(/\s+/g, ' ').trim() || '已保存笔记，可返回课时继续补充重点。';

  return (
    <Link href={`/lessons/${item.lesson_id}?courseId=${item.course_id}`} className="note-card">
      <div className="note-card__cover">
        {item.cover_url ? <img src={item.cover_url} alt={item.course_title} /> : <div className="cover-fallback" />}
      </div>
      <div className="note-card__body">
        <div className="note-card__meta">
          <h4>{item.lesson_title}</h4>
          <small>
            <ClockIcon className="note-card__clock" />
            {formatRelativeTime(item.updated_at)}
          </small>
        </div>
        <p>{preview}</p>
        <div className="note-card__footer">
          <span>{item.course_title}</span>
          <PlayIcon className="note-card__play" />
        </div>
      </div>
    </Link>
  );
}

export function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: 'blue' | 'orange' | 'red' | 'green';
}) {
  return (
    <div className={`stat-tile is-${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">
        <GiftIcon className="empty-state__icon-svg" />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function MenuRow({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  onClick?: () => void;
}) {
  return (
    <button type="button" className="menu-row" onClick={onClick}>
      <div className="menu-row__left">
        <div className="menu-row__icon">{icon}</div>
        <span>{label}</span>
      </div>
      <div className="menu-row__right">
        {hint ? <small>{hint}</small> : null}
        <ChevronRightIcon className="menu-row__arrow" />
      </div>
    </button>
  );
}
