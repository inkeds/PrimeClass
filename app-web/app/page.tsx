'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';

import { AppShell } from '@/components/app-shell';
import { useAppContext } from '@/components/app-provider';
import { BellIcon, ChevronDownIcon, ChevronRightIcon, CrownIcon, EyeIcon, FlameIcon, GiftIcon, SearchIcon } from '@/components/icons';
import { CourseCard, EmptyState, SectionTitle } from '@/components/ui-blocks';
import { getGrades, getHome, getMe, getSubjects, getSyncCourses, getVersions, isUnauthorizedError, searchCourses } from '@/lib/api';
import { readContentFilter, writeContentFilter } from '@/lib/content-filter';
import type { CourseSummary, GradeItem, HomePayload, MePayload, SubjectItem, VersionItem } from '@/lib/types';
import {
  buildRedirect,
  formatCount,
  formatDateLabel,
  formatRelativeTime,
  getMembershipTone,
  hasVipMembership,
  isPermanentMembership,
} from '@/lib/utils';

const subjectTones = [
  ['#fff1f2', '#e11d48'],
  ['#eff6ff', '#2563eb'],
  ['#f5f3ff', '#7c3aed'],
  ['#fff7ed', '#ea580c'],
  ['#ecfdf5', '#059669'],
];

export default function HomePage() {
  const router = useRouter();
  const { mounted, session, openRedeem, showToast, logout } = useAppContext();
  const [home, setHome] = useState<HomePayload | null>(null);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [grades, setGrades] = useState<GradeItem[]>([]);
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedGradeName, setSelectedGradeName] = useState('');
  const [selectedVersion, setSelectedVersion] = useState<VersionItem | null>(null);
  const [filterReady, setFilterReady] = useState(false);
  const [versionPickerOpen, setVersionPickerOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeLoading, setNoticeLoading] = useState(false);
  const [profile, setProfile] = useState<MePayload | null>(null);
  const [courseList, setCourseList] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [courseLoading, setCourseLoading] = useState(false);
  const deferredKeyword = useDeferredValue(searchKeyword.trim());
  const token = session?.token ?? null;

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      setLoading(true);

      try {
        const persistedFilter = readContentFilter();
        const [homeData, versionList] = await Promise.all([
          getHome(token),
          getVersions(persistedFilter?.grade_code ? { grade: persistedFilter.grade_code } : undefined),
        ]);

        if (!active) {
          return;
        }

        const preferredVersionCode =
          persistedFilter?.version_code || homeData.current_version_code || versionList[0]?.version_code || '';
        const resolvedSelectedVersion =
          preferredVersionCode
            ? versionList.find((item) => item.version_code === preferredVersionCode) ?? {
                version_code: preferredVersionCode,
                version_name:
                  persistedFilter?.version_name ??
                  homeData.current_version_name ??
                  homeData.current_version ??
                  preferredVersionCode,
              }
            : null;

        setHome(homeData);
        setSubjects(homeData.subject_list);
        setGrades([]);
        setVersions(versionList);
        setSelectedVersion(resolvedSelectedVersion);
        setSelectedGrade(persistedFilter?.grade_code ?? '');
        setSelectedGradeName(persistedFilter?.grade_name ?? '');
        setCourseList(homeData.sync_course_list);
        setFilterReady(true);
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
  }, [token]);

  useEffect(() => {
    if (!token) {
      setProfile(null);
      setNoticeOpen(false);
      return;
    }

    const resolvedToken = token;
    let active = true;

    async function loadProfile() {
      setNoticeLoading(true);

      try {
        const data = await getMe(resolvedToken);

        if (active) {
          setProfile(data);
        }
      } catch (error) {
        if (active && isUnauthorizedError(error)) {
          logout();
        }
      } finally {
        if (active) {
          setNoticeLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, [logout, token]);

  useEffect(() => {
    let active = true;

    async function loadVersions() {
      const list = await getVersions(selectedGrade ? { grade: selectedGrade } : undefined);

      if (!active) {
        return;
      }

      setVersions(list);
      setSelectedVersion((current) =>
        current && !list.some((item) => item.version_code === current.version_code) ? null : current,
      );
    }

    void loadVersions();

    return () => {
      active = false;
    };
  }, [selectedGrade]);

  useEffect(() => {
    let active = true;

    async function loadSubjectsAndGrades() {
      const [subjectList, gradeList] = await Promise.all([
        getSubjects(selectedVersion?.version_code ? { version: selectedVersion.version_code } : undefined),
        getGrades(selectedVersion?.version_code ? { version: selectedVersion.version_code } : undefined),
      ]);

      if (!active) {
        return;
      }

      setSubjects(subjectList);
      setGrades(gradeList);
      setSelectedGradeName((current) => {
        if (!selectedGrade) {
          return '';
        }

        return gradeList.find((item) => item.grade_code === selectedGrade)?.grade_name ?? current;
      });
    }

    void loadSubjectsAndGrades();

    return () => {
      active = false;
    };
  }, [selectedVersion?.version_code]);

  useEffect(() => {
    if (!filterReady) {
      return;
    }

    writeContentFilter({
      version_code: selectedVersion?.version_code ?? null,
      version_name: selectedVersion?.version_name ?? null,
      grade_code: selectedGrade || null,
      grade_name: selectedGradeName || null,
    });
  }, [filterReady, selectedGrade, selectedGradeName, selectedVersion?.version_code, selectedVersion?.version_name]);

  useEffect(() => {
    const initialHome = home;

    if (!initialHome) {
      return;
    }

    const baseHome = initialHome;

    let active = true;

    async function loadCourses() {
      const usingDefaultVersion =
        !selectedVersion ||
        (selectedVersion.version_code &&
          selectedVersion.version_code === baseHome.current_version_code);

      if (!deferredKeyword && !selectedGrade && usingDefaultVersion) {
        setCourseList(baseHome.sync_course_list);
        return;
      }

      setCourseLoading(true);

      try {
        const response = deferredKeyword
          ? await searchCourses(
              {
                keyword: deferredKeyword,
                grade: selectedGrade || undefined,
                version: selectedVersion?.version_code,
                page_size: 12,
              },
              token,
            )
          : await getSyncCourses(
              {
                grade: selectedGrade || undefined,
                version: selectedVersion?.version_code,
                page_size: 12,
              },
              token,
            );

        if (active) {
          setCourseList(response.list);
        }
      } finally {
        if (active) {
          setCourseLoading(false);
        }
      }
    }

    void loadCourses();

    return () => {
      active = false;
    };
  }, [deferredKeyword, home, selectedGrade, selectedVersion, token]);

  const banner = home?.banner_list[0] ?? null;
  const currentVersionLabel =
    selectedVersion?.version_name ??
    (loading ? home?.current_version_name ?? home?.current_version ?? '选择教材版本' : '不限版本');
  const displayedSubjects = subjects.length > 0 ? subjects : home?.subject_list ?? [];
  const selectedGradeLabel =
    (grades.find((item) => item.grade_code === selectedGrade)?.grade_name ?? selectedGradeName) || null;
  const membership = session?.membership ?? null;
  const hasVip = hasVipMembership(membership);
  const isPermanent = isPermanentMembership(membership);
  const vipTone = getMembershipTone(membership);
  const vipLabel = isPermanent
    ? `${membership?.package_name ?? '永久 VIP'} 已生效`
    : hasVip
      ? membership?.expired_at
        ? `VIP 至 ${formatDateLabel(membership.expired_at)}`
        : `${membership?.package_name ?? 'VIP'} 已开通`
      : home?.vip_entry.vip_copy ?? 'VIP 激活后解锁全站同步课与专题课';
  const showVipRedeem = mounted && !hasVip && (home?.vip_entry.enabled ?? true);
  const searchFilterLabels = [selectedGradeLabel, selectedVersion?.version_name].filter(Boolean) as string[];
  const searchFilterSummary = searchFilterLabels.join(' / ');
  const topFilterLabel = [currentVersionLabel, selectedGradeLabel].filter(Boolean).join(' · ') || '选择教材版本';
  const popularCourseList = useMemo(
    () =>
      [...courseList]
        .filter((course) => course.course_type === 'sync')
        .sort((left, right) => {
          if (right.view_count !== left.view_count) {
            return right.view_count - left.view_count;
          }

          return right.title.localeCompare(left.title, 'zh-CN');
        })
        .slice(0, 3),
    [courseList],
  );
  const showNoticeBadge = Boolean(session?.token && (profile?.message_count ?? 0) > 0);

  function closeSearchPanel() {
    setSearchOpen(false);
    setSearchKeyword('');
  }

  function handleOpenSearch() {
    setSearchOpen(true);
  }

  function handleOpenNotice() {
    if (!session?.token) {
      showToast('请先登录后查看站内通知', 'error');
      router.push(buildRedirect('/'));
      return;
    }

    setNoticeOpen(true);
  }

  return (
    <AppShell>
      <div className="page-scroll home-page">
        <header className="top-bar">
          <div className="top-bar__row">
            <button type="button" className="version-trigger" onClick={() => setVersionPickerOpen(true)}>
              <span>{topFilterLabel}</span>
              <ChevronDownIcon className="version-trigger__icon" />
            </button>
            <div className={`vip-pill${hasVip ? ' is-member' : ''}${isPermanent ? ' is-permanent' : ''} tone-${vipTone}`}>
              <CrownIcon className="vip-pill__icon" />
              <span>{vipLabel}</span>
            </div>
          </div>
          <div className="top-bar__row">
            <button type="button" className="search-trigger" onClick={handleOpenSearch}>
              <SearchIcon className="search-trigger__icon" />
              <div className="search-trigger__copy">
                <strong>搜索课程 / 章节</strong>
              </div>
              {searchFilterSummary ? <span className="search-trigger__tag">{searchFilterSummary}</span> : null}
            </button>
            <button type="button" className="notify-button" onClick={handleOpenNotice}>
              <BellIcon className="notify-button__icon" />
              {showNoticeBadge ? <span /> : null}
            </button>
          </div>
        </header>

        <main className="page-body page-body--home">
          <section className="banner-card">
            <div className="banner-card__copy">
              <span className="banner-card__eyebrow">{banner?.badge_text ?? 'Exclusive'}</span>
              <h2>{banner?.title ?? '同步视频课程'}</h2>
              <p>{banner?.subtitle ?? '全教材覆盖 · 课后重点详讲'}</p>
            </div>
            {banner?.image_url ? <img src={banner.image_url} alt={banner.title} className="banner-card__image" /> : null}
          </section>

          <section className="subject-grid">
            {displayedSubjects.map((subject, index) => {
              const [background, color] = subjectTones[index % subjectTones.length];
              const style = {
                '--tile-bg': background,
                '--tile-color': color,
              } as CSSProperties;
              const subjectHref = selectedVersion?.version_code
                ? `/subjects/${subject.subject_code}?version=${encodeURIComponent(selectedVersion.version_code)}`
                : `/subjects/${subject.subject_code}`;

              return (
                <Link
                  key={subject.subject_code}
                  className="subject-tile subject-tile-link"
                  href={subjectHref}
                  style={style}
                >
                  <div className="subject-tile__icon">{subject.subject_name.slice(0, 1)}</div>
                  <span>{subject.subject_name}</span>
                </Link>
              );
            })}
          </section>

          {home?.continue_learning ? (
            <section className="highlight-panel">
              <div className="highlight-panel__bar" />
              <div className="highlight-panel__body">
                <small>{formatRelativeTime(home.continue_learning.last_learned_at)}</small>
                <h3>{home.continue_learning.title}</h3>
                <p>已学 {home.continue_learning.progress}% · {home.continue_learning.lesson_title}</p>
              </div>
              <Link
                href={`/lessons/${home.continue_learning.lesson_id}?courseId=${home.continue_learning.course_id}`}
                className="highlight-panel__button"
              >
                继续
              </Link>
            </section>
          ) : !mounted ? (
            <section className="login-banner">
              <div>
                <small>正在同步账号状态</small>
                <h3>学习进度与会员权益加载中</h3>
              </div>
            </section>
          ) : session ? (
            <section className="login-banner">
              <div>
                <small>还没有学习记录</small>
                <h3>去下方选择一门同步课开始学习</h3>
              </div>
              <a href="#sync-courses" className="secondary-button">
                去看看
              </a>
            </section>
          ) : (
            <section className="login-banner">
              <div>
                <small>登录后可同步学习进度</small>
                <h3>继续学习与权益状态会在这里展示</h3>
              </div>
              <Link href="/login" className="secondary-button">
                立即登录
              </Link>
            </section>
          )}

          <section id="sync-courses">
            <SectionTitle title="同步精讲" />
            {courseLoading || loading ? (
              <div className="course-list">
                <div className="skeleton-card" />
                <div className="skeleton-card" />
              </div>
            ) : courseList.length > 0 ? (
                <div className="course-list">
                  {courseList.map((course) => (
                  <CourseCard key={course.course_id} course={course} hasVip={hasVip} vipTone={vipTone} />
                ))}
              </div>
            ) : (
              <EmptyState title="暂无匹配课程" description="换个关键词，或切换教材版本再试试看。" />
            )}
          </section>

          {popularCourseList.length > 0 ? (
            <section>
              <SectionTitle title="大家都在学" />
              <div className="popular-course-list">
                {popularCourseList.map((course, index) => (
                  <Link href={`/courses/${course.course_id}`} className="popular-course-item" key={course.course_id}>
                    <div className={`popular-course-rank${index === 0 ? ' is-top' : ''}`}>
                      {String(index + 1).padStart(2, '0')}
                    </div>
                    <div className="popular-course-copy">
                      <div className="popular-course-head">
                        <strong>{course.title}</strong>
                        <span className={`popular-course-access${course.access_type === 'vip' ? ' is-vip' : ''}`}>
                          {course.access_type === 'vip' ? 'VIP' : 'FREE'}
                        </span>
                      </div>
                      <p>
                        {course.teacher_name || '名师课程'}
                        {course.version ? ` · ${course.version}` : ''}
                      </p>
                      <div className="popular-course-meta">
                        <span>
                          <FlameIcon className="popular-course-meta-icon" />
                          {index === 0 ? '当前最热' : '热门课程'}
                        </span>
                        <span>
                          <EyeIcon className="popular-course-meta-icon" />
                          {formatCount(course.view_count)}
                        </span>
                      </div>
                    </div>
                    <ChevronRightIcon className="popular-course-arrow" />
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </main>

        {showVipRedeem ? (
          <button type="button" className="floating-redeem" onClick={openRedeem}>
            <GiftIcon className="floating-redeem__icon" />
            <span>{home?.vip_entry.redeem_copy ?? '兑换'}</span>
          </button>
        ) : null}
      </div>

      {searchOpen ? (
        <div className="modal-backdrop" onClick={closeSearchPanel}>
          <div className="home-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="home-sheet__header">
              <div className="home-sheet__copy">
                <h3>搜索课程</h3>
              </div>
              <button type="button" className="ghost-button home-sheet__close" onClick={closeSearchPanel}>
                关闭
              </button>
            </div>
            <div className="home-sheet__body">
              <label className="home-search-field">
                <SearchIcon className="home-search-field__icon" />
                <input
                  value={searchKeyword}
                  onChange={(event) => setSearchKeyword(event.target.value)}
                  placeholder="搜索课程、章节、知识点"
                  autoFocus
                />
              </label>

              {searchFilterLabels.length ? (
                <div className="search-filter-row">
                  {searchFilterLabels.map((item) => (
                    <span key={item} className="search-filter-tag">
                      {item}
                    </span>
                  ))}
                </div>
              ) : null}

              {deferredKeyword ? (
                <div className="search-result-head">
                  <strong>{courseLoading ? '正在搜索...' : `${courseList.length} 条结果`}</strong>
                  <button type="button" className="ghost-button home-sheet__clear" onClick={() => setSearchKeyword('')}>
                    清空关键词
                  </button>
                </div>
              ) : (
                <div className="search-empty-inline">输入关键词后显示结果列表</div>
              )}

              {deferredKeyword ? (
                courseLoading ? (
                  <div className="course-list search-result-list">
                    <div className="skeleton-card" />
                    <div className="skeleton-card" />
                  </div>
                ) : courseList.length > 0 ? (
                  <div className="course-list search-result-list">
                    {courseList.map((course) => (
                      <CourseCard key={course.course_id} course={course} hasVip={hasVip} vipTone={vipTone} />
                    ))}
                  </div>
                ) : (
                  <EmptyState title="没有找到匹配课程" description="换个关键词，或切换上方教材筛选后再试。" />
                )
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {noticeOpen ? (
        <div className="modal-backdrop" onClick={() => setNoticeOpen(false)}>
          <div className="home-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="home-sheet__header">
              <div className="home-sheet__copy">
                <h3>站内通知</h3>
              </div>
              <button type="button" className="ghost-button home-sheet__close" onClick={() => setNoticeOpen(false)}>
                关闭
              </button>
            </div>
            <div className="home-sheet__body">
              {noticeLoading ? (
                <>
                  <div className="skeleton-card" />
                  <div className="skeleton-card" />
                </>
              ) : profile ? (
                <>
                  {!profile.notification_settings.in_app_system_notice ? (
                    <div className="search-empty-tip is-warning">
                      <strong>站内提醒当前已关闭</strong>
                      <p>你仍可查看已有通知，如需继续接收新的站内提醒，请到“我的 &gt; 消息通知”中开启。</p>
                    </div>
                  ) : null}

                  <div className="message-feed">
                    <div className="message-feed__head">
                      <strong>近期提醒</strong>
                      <span>{profile.message_count} 条</span>
                    </div>
                    <div className="message-feed__list">
                      {profile.message_list.length > 0 ? (
                        profile.message_list.map((item) => (
                          <article className={`message-item is-${item.tone}`} key={item.message_id}>
                            <div className="message-item__meta">
                              <strong>{item.title}</strong>
                              <span>{item.created_at ? formatDateLabel(item.created_at) : '系统实时生成'}</span>
                            </div>
                            <p>{item.content}</p>
                          </article>
                        ))
                      ) : (
                        <div className="knowledge-empty">当前没有新的站内通知。</div>
                      )}
                    </div>
                  </div>

                  <div className="home-sheet__actions">
                    <Link href="/me" className="primary-button" onClick={() => setNoticeOpen(false)}>
                      去我的页管理通知
                    </Link>
                    <button type="button" className="ghost-button" onClick={() => setNoticeOpen(false)}>
                      稍后查看
                    </button>
                  </div>
                </>
              ) : (
                <EmptyState title="通知加载失败" description="当前无法读取站内通知，请稍后再试。" />
              )}
            </div>
          </div>
        </div>
      ) : null}

      {versionPickerOpen ? (
        <div className="modal-backdrop" onClick={() => setVersionPickerOpen(false)}>
          <div className="version-modal" onClick={(event) => event.stopPropagation()}>
            <h3>选择教材版本和年级</h3>

            <div className="version-modal__group">
              <div className="version-modal__label">教材版本</div>
              <div className="version-modal__list">
                <button
                  type="button"
                  className={`filter-pill${selectedVersion === null ? ' is-active' : ''}`}
                  onClick={() => {
                    setSelectedVersion(null);
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
                    }}
                  >
                    {version.version_name}
                  </button>
                ))}
              </div>
            </div>

            <div className="version-modal__group">
              <div className="version-modal__label">年级</div>
              <div className="version-modal__list">
                <button
                  type="button"
                  className={`filter-pill${selectedGrade === '' ? ' is-active' : ''}`}
                  onClick={() => {
                    setSelectedGrade('');
                    setSelectedGradeName('');
                  }}
                >
                  全部年级
                </button>
                {grades.map((grade) => (
                  <button
                    key={grade.grade_code}
                    type="button"
                    className={`filter-pill${selectedGrade === grade.grade_code ? ' is-active' : ''}`}
                    onClick={() => {
                      if (selectedGrade === grade.grade_code) {
                        setSelectedGrade('');
                        setSelectedGradeName('');
                        return;
                      }

                      setSelectedGrade(grade.grade_code);
                      setSelectedGradeName(grade.grade_name);
                    }}
                  >
                    {grade.grade_name}
                  </button>
                ))}
              </div>
            </div>

            <div className="version-modal__footer">
              <button type="button" className="primary-button primary-button--inline" onClick={() => setVersionPickerOpen(false)}>
                完成
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
