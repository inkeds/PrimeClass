'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { AppShell } from '@/components/app-shell';
import { useAppContext } from '@/components/app-provider';
import { ChevronDownIcon, EyeIcon, VideoIcon } from '@/components/icons';
import { EmptyState } from '@/components/ui-blocks';
import { getHome, getSubjects, getTopicCourses, getTopicTags, getVersions } from '@/lib/api';
import type { CourseSummary, HomePayload, SubjectItem, TopicTag, VersionItem } from '@/lib/types';
import { formatCount, getMembershipTone, hasVipMembership } from '@/lib/utils';

const subjectTones = [
  ['#fff1f2', '#e11d48'],
  ['#eff6ff', '#2563eb'],
  ['#f5f3ff', '#7c3aed'],
  ['#fff7ed', '#ea580c'],
  ['#ecfdf5', '#059669'],
];

export default function TopicsPage() {
  const { session } = useAppContext();
  const [home, setHome] = useState<HomePayload | null>(null);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [tags, setTags] = useState<TopicTag[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedVersion, setSelectedVersion] = useState<VersionItem | null>(null);
  const [versionPickerOpen, setVersionPickerOpen] = useState(false);
  const [courseList, setCourseList] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const hasVip = hasVipMembership(session?.membership);
  const vipTone = getMembershipTone(session?.membership);

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      setLoading(true);
      setError('');

      try {
        const [homeData, versionList, tagResponse] = await Promise.all([
          getHome(session?.token),
          getVersions(),
          getTopicTags(),
        ]);

        if (!active) {
          return;
        }

        const resolvedSelectedVersion =
          homeData.current_version_code
            ? versionList.find((item) => item.version_code === homeData.current_version_code) ?? {
                version_code: homeData.current_version_code,
                version_name: homeData.current_version_name ?? homeData.current_version ?? homeData.current_version_code,
              }
            : null;

        setHome(homeData);
        setVersions(versionList);
        setSubjects(homeData.subject_list);
        setTags(tagResponse.list);
        setSelectedVersion(resolvedSelectedVersion);
        setSelectedSubject('');
        setSelectedTag('');
      } catch (requestError) {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : '加载专题页失败');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadInitialData();

    return () => {
      active = false;
    };
  }, [session?.token]);

  useEffect(() => {
    let active = true;

    async function loadSubjects() {
      try {
        const list = await getSubjects(selectedVersion?.version_code ? { version: selectedVersion.version_code } : undefined);

        if (!active) {
          return;
        }

        setSubjects(list);

        if (selectedSubject && !list.some((item) => item.subject_code === selectedSubject)) {
          setSelectedSubject('');
        }
      } catch (requestError) {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : '加载学科失败');
        }
      }
    }

    void loadSubjects();

    return () => {
      active = false;
    };
  }, [selectedVersion?.version_code]);

  const filteredTags = useMemo(() => {
    const visibleSubjectCodes = new Set(subjects.map((item) => item.subject_code));

    return tags.filter((tag) => {
      if (tag.subject_code && visibleSubjectCodes.size > 0 && !visibleSubjectCodes.has(tag.subject_code)) {
        return false;
      }

      if (selectedSubject && tag.subject_code && tag.subject_code !== selectedSubject) {
        return false;
      }

      return true;
    });
  }, [selectedSubject, subjects, tags]);

  useEffect(() => {
    if (selectedTag && !filteredTags.some((tag) => tag.tag_id === selectedTag)) {
      setSelectedTag('');
    }
  }, [filteredTags, selectedTag]);

  useEffect(() => {
    let active = true;

    async function loadCourses() {
      setLoading(true);
      setError('');

      try {
        const response = await getTopicCourses(
          {
            tag_id: selectedTag || undefined,
            subject: selectedSubject || undefined,
            version: selectedVersion?.version_code,
            page_size: 12,
          },
          session?.token,
        );

        if (active) {
          setCourseList(response.list);
        }
      } catch (requestError) {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : '加载专题课程失败');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadCourses();

    return () => {
      active = false;
    };
  }, [selectedSubject, selectedTag, selectedVersion?.version_code, session?.token]);

  const currentVersionLabel =
    selectedVersion?.version_name ??
    (loading ? home?.current_version_name ?? home?.current_version ?? '选择教材版本' : '不限版本');

  return (
    <AppShell>
      <div className="page-scroll topic-page">
        <header className="topic-page__header">
          <div className="topic-page__topbar">
            <button type="button" className="version-trigger" onClick={() => setVersionPickerOpen(true)}>
              <span>{currentVersionLabel}</span>
              <ChevronDownIcon className="version-trigger__icon" />
            </button>
          </div>
          <h1>核心专题提分</h1>
          <div className="topic-page__subtitle">
            <span />
            <p>按教材版本和学科组织专题内容，聚焦重难点与阶段突破。</p>
          </div>
        </header>

        <main className="page-body page-body--topics">
          {error ? <div className="search-empty-tip is-warning">{error}</div> : null}

          {subjects.length > 0 ? (
            <section className="subject-grid subject-grid--topics">
              {subjects.map((subject, index) => {
                const [background, color] = subjectTones[index % subjectTones.length];
                const active = selectedSubject === subject.subject_code;

                return (
                  <button
                    key={subject.subject_code}
                    type="button"
                    className={`subject-tile${active ? ' is-active' : ''}`}
                    style={{ '--tile-bg': background, '--tile-color': color } as CSSProperties}
                    onClick={() =>
                      setSelectedSubject((current) => (current === subject.subject_code ? '' : subject.subject_code))
                    }
                  >
                    <div className="subject-tile__icon">{subject.subject_name.slice(0, 1)}</div>
                    <span>{subject.subject_name}</span>
                  </button>
                );
              })}
            </section>
          ) : null}

          <div className="chip-row">
            <button
              type="button"
              className={`filter-pill${selectedTag === '' ? ' is-active' : ''}`}
              onClick={() => setSelectedTag('')}
            >
              全部专题
            </button>
            {filteredTags.map((tag) => (
              <button
                key={tag.tag_id}
                type="button"
                className={`filter-pill${selectedTag === tag.tag_id ? ' is-active' : ''}`}
                onClick={() => setSelectedTag(tag.tag_id)}
              >
                {tag.tag_name}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="topic-list">
              <div className="topic-skeleton" />
              <div className="topic-skeleton" />
            </div>
          ) : courseList.length > 0 ? (
            <div className="topic-list">
              {courseList.map((course) => (
                <article key={course.course_id} className={`topic-card${course.access_type === 'vip' ? ' is-vip' : ''}${hasVip ? ' is-member' : ''} tone-${vipTone}`}>
                  <div className="topic-card__header">
                    <span className="topic-card__tag">
                      {(course.version ? `${course.version} · ` : '') +
                        (course.subject ? `${course.subject} · ` : '') +
                        (tags.find((tag) => tag.tag_id === selectedTag)?.tag_name || '专题课程')}
                    </span>
                    <span className={`topic-card__badge${course.access_type === 'vip' ? ' is-vip' : ''}${hasVip ? ' is-member' : ''} tone-${vipTone}`}>
                      {course.access_type === 'vip' ? (hasVip ? '已解锁' : 'VIP 免费') : '公开课'}
                    </span>
                  </div>
                  <h3 className="topic-card__title">《{course.title}》</h3>
                  <p className="topic-card__desc">
                    {course.teacher_name ? `${course.teacher_name} 主讲，` : ''}
                    聚焦核心模块，结合题型拆解与方法总结，适合阶段性专题突破。
                  </p>
                  <div className="topic-card__footer">
                    <div className="topic-card__stats">
                      <span>
                        <VideoIcon className="topic-card__stat-icon" />
                        专题课
                      </span>
                      <span>
                        <EyeIcon className="topic-card__stat-icon" />
                        {formatCount(course.view_count)}
                      </span>
                    </div>
                    <Link className={`topic-card__action${course.access_type === 'vip' ? ' is-vip' : ''}${hasVip ? ' is-member' : ''} tone-${vipTone}`} href={`/courses/${course.course_id}`}>
                      {course.access_type === 'vip' ? (hasVip ? '立即学习' : '查看详情') : '立即开启'}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="暂无专题内容" description="当前教材版本与学科组合下还没有已发布专题课。" />
          )}
        </main>

        {versionPickerOpen ? (
          <div className="modal-backdrop" onClick={() => setVersionPickerOpen(false)}>
            <div className="version-modal" onClick={(event) => event.stopPropagation()}>
              <h3>选择教材版本</h3>
              <div className="version-modal__list">
                <button
                  type="button"
                  className={`filter-pill${selectedVersion === null ? ' is-active' : ''}`}
                  onClick={() => {
                    setSelectedVersion(null);
                    setVersionPickerOpen(false);
                  }}
                >
                  不限版本
                </button>
                {versions.map((version) => (
                  <button
                    key={version.version_code}
                    type="button"
                    className={`filter-pill${selectedVersion?.version_code === version.version_code ? ' is-active' : ''}`}
                    onClick={() => {
                      setSelectedVersion(version);
                      setVersionPickerOpen(false);
                    }}
                  >
                    {version.version_name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
