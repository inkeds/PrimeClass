'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { AppShell } from '@/components/app-shell';
import { useAppContext } from '@/components/app-provider';
import { DownloadIcon, FileTextIcon, HeartIcon, HistoryIcon } from '@/components/icons';
import { CourseCard, EmptyState, LearningCard, NoteCard, SectionTitle } from '@/components/ui-blocks';
import { getLibrary, isUnauthorizedError } from '@/lib/api';
import type { LibraryOverview } from '@/lib/types';
import { getMembershipTone, hasVipMembership } from '@/lib/utils';

export default function LibraryPage() {
  const { mounted, session, logout } = useAppContext();
  const [library, setLibrary] = useState<LibraryOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const membership = session?.membership ?? null;
  const hasVip = hasVipMembership(membership);
  const vipTone = getMembershipTone(membership);

  useEffect(() => {
    const token = session?.token;

    if (!token) {
      setLibrary(null);
      return;
    }

    const resolvedToken = token;

    let active = true;

    async function loadLibrary() {
      setLoading(true);

      try {
        const data = await getLibrary(resolvedToken);

        if (active) {
          setLibrary(data);
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

    void loadLibrary();

    return () => {
      active = false;
    };
  }, [session?.token]);

  return (
    <AppShell>
      <div className="page-scroll library-page">
        <header className="library-page__header">
          <h1>我的学习库</h1>
          <div className="library-page__quick-grid">
            <div className="library-quick-item">
              <div className="library-quick-item__icon is-blue">
                <HistoryIcon className="library-quick-item__svg" />
              </div>
              <span>历史</span>
              <small>{library?.history_count ?? 0}</small>
            </div>
            <div className="library-quick-item">
              <div className="library-quick-item__icon is-orange">
                <DownloadIcon className="library-quick-item__svg" />
              </div>
              <span>下载</span>
              <small>{library?.download_count ?? 0}</small>
            </div>
            <div className="library-quick-item">
              <div className="library-quick-item__icon is-red">
                <HeartIcon className="library-quick-item__svg" />
              </div>
              <span>收藏</span>
              <small>{library?.favorite_count ?? 0}</small>
            </div>
            <div className="library-quick-item">
              <div className="library-quick-item__icon is-green">
                <FileTextIcon className="library-quick-item__svg" />
              </div>
              <span>笔记</span>
              <small>{library?.note_count ?? 0}</small>
            </div>
          </div>
        </header>

        <main className="page-body page-body--library">
          {!mounted ? (
            <div className="skeleton-card" />
          ) : !session ? (
            <EmptyState
              title="登录后查看学习库"
              description="学习历史、下载记录、收藏和笔记，需要账号登录后才会同步。"
              action={
                <Link href="/login" className="primary-button primary-button--inline">
                  去登录
                </Link>
              }
            />
          ) : loading ? (
            <>
              <div className="skeleton-card" />
              <div className="skeleton-card" />
            </>
          ) : library ? (
            <>
              <section>
                <SectionTitle title="继续学习" />
                {library.continue_learning_list.length > 0 ? (
                  <div className="library-list">
                    {library.continue_learning_list.map((item) => (
                      <LearningCard key={item.record_id} item={item} />
                    ))}
                  </div>
                ) : (
                  <EmptyState title="还没有学习记录" description="去首页选择一门同步课，学习后这里会自动累计进度。" />
                )}
              </section>

              <section>
                <SectionTitle title="我的收藏" />
                {library.favorite_course_list.length > 0 ? (
                  <div className="course-list">
                    {library.favorite_course_list.map((course) => (
                      <CourseCard key={course.course_id} course={course} hasVip={hasVip} vipTone={vipTone} />
                    ))}
                  </div>
                ) : (
                  <EmptyState title="还没有收藏课程" description="在课程详情或播放页点亮收藏，常学课程会收纳到这里。" />
                )}
              </section>

              <section>
                <SectionTitle title="最近笔记" />
                {library.recent_note_list.length > 0 ? (
                  <div className="note-list">
                    {library.recent_note_list.map((item) => (
                      <NoteCard key={item.note_id} item={item} />
                    ))}
                  </div>
                ) : (
                  <EmptyState title="还没有随堂笔记" description="在课时播放页记录重点内容，最近保存的笔记会显示在这里。" />
                )}
              </section>
            </>
          ) : null}
        </main>
      </div>
    </AppShell>
  );
}
