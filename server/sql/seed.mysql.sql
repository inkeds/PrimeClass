-- Seed data for PrimeClass backend
-- Run this after docs/schema.mysql.sql

USE `primeclass`;

SET NAMES utf8mb4;

-- =========================================================
-- Admin role / permissions / default account
-- Default admin username:
-- admin
-- Password is injected by bootstrap-local-db.mjs or should be reset manually after import.
-- =========================================================

INSERT INTO `admin_roles` (`role_code`, `role_name`, `status`, `sort_order`, `remark`)
VALUES
  ('super_admin', '超级管理员', 'enabled', 100, 'Seeded super admin role')
ON DUPLICATE KEY UPDATE
  `role_name` = VALUES(`role_name`),
  `status` = VALUES(`status`),
  `sort_order` = VALUES(`sort_order`),
  `remark` = VALUES(`remark`);

INSERT INTO `admin_permissions` (`permission_key`, `permission_name`, `module_code`, `group_code`, `description`, `sort_order`)
VALUES
  ('dashboard.view', '查看工作台', 'dashboard', 'overview', '查看后台工作台数据', 100),
  ('users.view', '查看用户', 'users', 'read', '查看用户列表与详情', 100),
  ('users.edit', '编辑用户', 'users', 'write', '更新用户状态与备注', 90),
  ('courses.view', '查看课程', 'courses', 'read', '查看课程、课时、专题标签和资源', 100),
  ('courses.edit', '编辑课程', 'courses', 'write', '维护课程、课时、专题标签和资源', 90),
  ('membership.view', '查看会员', 'membership', 'read', '查看套餐、激活码和兑换记录', 100),
  ('membership.edit', '编辑会员', 'membership', 'write', '生成激活码、作废、人工补偿', 90),
  ('system.view', '查看系统设置', 'system', 'read', '查看基础设置和存储配置', 100),
  ('system.edit', '编辑系统设置', 'system', 'write', '修改系统设置和存储配置', 90)
ON DUPLICATE KEY UPDATE
  `permission_name` = VALUES(`permission_name`),
  `module_code` = VALUES(`module_code`),
  `group_code` = VALUES(`group_code`),
  `description` = VALUES(`description`),
  `sort_order` = VALUES(`sort_order`);

INSERT INTO `admins` (`username`, `password_hash`, `real_name`, `status`, `remark`)
VALUES
  (
    'admin',
    'scrypt$bootstrap_admin$00',
    '系统管理员',
    'enabled',
    'Seeded default administrator'
  )
ON DUPLICATE KEY UPDATE
  `password_hash` = VALUES(`password_hash`),
  `real_name` = VALUES(`real_name`),
  `status` = VALUES(`status`),
  `remark` = VALUES(`remark`);

INSERT INTO `admin_user_roles` (`admin_id`, `role_id`)
SELECT a.id, r.id
FROM `admins` a
INNER JOIN `admin_roles` r ON r.role_code = 'super_admin'
WHERE a.username = 'admin'
ON DUPLICATE KEY UPDATE
  `admin_id` = VALUES(`admin_id`);

INSERT INTO `admin_role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `admin_roles` r
INNER JOIN `admin_permissions` p ON p.permission_key IN (
  'dashboard.view',
  'users.view',
  'users.edit',
  'courses.view',
  'courses.edit',
  'membership.view',
  'membership.edit',
  'system.view',
  'system.edit'
)
WHERE r.role_code = 'super_admin'
ON DUPLICATE KEY UPDATE
  `role_id` = VALUES(`role_id`);

-- =========================================================
-- Storage defaults
-- =========================================================

INSERT INTO `storage_configs` (`provider`, `is_enabled`, `is_default`, `config_json`)
VALUES
  ('local', 1, 1, JSON_OBJECT('root_path', './uploads')),
  ('s3', 0, 0, JSON_OBJECT('bucket', '', 'region', '', 'endpoint', '', 'access_key', '', 'secret_key', '')),
  ('tencent_cos', 0, 0, JSON_OBJECT('bucket', '', 'region', '', 'secret_id', '', 'secret_key', '')),
  ('ftp', 0, 0, JSON_OBJECT('host', '', 'port', 21, 'username', '', 'password', '', 'root_path', '/'))
ON DUPLICATE KEY UPDATE
  `is_enabled` = VALUES(`is_enabled`),
  `is_default` = VALUES(`is_default`),
  `config_json` = VALUES(`config_json`);

-- =========================================================
-- Basic settings
-- =========================================================

INSERT INTO `system_settings` (`category`, `setting_key`, `setting_name`, `value_type`, `setting_value`, `sort_order`)
VALUES
  ('basic', 'site_name', '站点名称', 'string', '优学课堂', 100),
  ('basic', 'service_phone', '客服电话', 'string', '400-000-0000', 90),
  ('basic', 'service_wechat', '客服微信', 'string', 'primeclass_support', 80),
  ('display', 'vip_copy', '会员文案', 'string', '激活 VIP 后解锁全站同步课与专题课', 100),
  ('display', 'redeem_copy', '兑换文案', 'string', '输入 12 位激活码立即生效', 90),
  ('display', 'banner_fallback', 'Banner 默认文案', 'string', '让每次学习都能继续向前', 80),
  ('upload', 'max_file_size_mb', '单文件大小限制', 'int', '500', 100),
  ('upload', 'allowed_image_exts', '图片扩展名', 'json', '["jpg","jpeg","png","webp"]', 90),
  ('upload', 'allowed_video_exts', '视频扩展名', 'json', '["mp4","m3u8"]', 80)
ON DUPLICATE KEY UPDATE
  `setting_name` = VALUES(`setting_name`),
  `value_type` = VALUES(`value_type`),
  `setting_value` = VALUES(`setting_value`),
  `sort_order` = VALUES(`sort_order`);

INSERT INTO `system_notifications` (`title`, `content`, `tone`, `status`, `published_at`)
VALUES
  ('欢迎使用优学课堂', '系统后台已支持发布站内通知，新的课程动态、系统公告和运营提醒都会显示在这里。', 'info', 'published', NOW()),
  ('会员权益提醒', '会员相关活动、激活码规则变更或重点权益说明，会通过站内通知及时发送。', 'vip', 'published', DATE_SUB(NOW(), INTERVAL 1 DAY))
ON DUPLICATE KEY UPDATE
  `content` = VALUES(`content`),
  `tone` = VALUES(`tone`),
  `status` = VALUES(`status`);

-- =========================================================
-- Dictionary defaults
-- =========================================================

INSERT INTO `dict_types` (`type_code`, `type_name`, `status`, `remark`)
VALUES
  ('subject', '学科', 'enabled', '系统基础字典'),
  ('grade', '年级', 'enabled', '系统基础字典'),
  ('term', '学期', 'enabled', '系统基础字典'),
  ('version', '教材版本', 'enabled', '系统基础字典')
ON DUPLICATE KEY UPDATE
  `type_name` = VALUES(`type_name`),
  `status` = VALUES(`status`),
  `remark` = VALUES(`remark`);

INSERT INTO `dict_items` (`type_id`, `item_code`, `item_name`, `parent_id`, `sort_order`, `status`, `extra_json`)
SELECT t.id, 'chinese', '语文', NULL, 500, 'enabled', JSON_OBJECT()
FROM `dict_types` t
WHERE t.type_code = 'subject'
ON DUPLICATE KEY UPDATE
  `item_name` = VALUES(`item_name`),
  `sort_order` = VALUES(`sort_order`),
  `status` = VALUES(`status`);

INSERT INTO `dict_items` (`type_id`, `item_code`, `item_name`, `parent_id`, `sort_order`, `status`, `extra_json`)
SELECT t.id, 'math', '数学', NULL, 400, 'enabled', JSON_OBJECT()
FROM `dict_types` t
WHERE t.type_code = 'subject'
ON DUPLICATE KEY UPDATE
  `item_name` = VALUES(`item_name`),
  `sort_order` = VALUES(`sort_order`),
  `status` = VALUES(`status`);

INSERT INTO `dict_items` (`type_id`, `item_code`, `item_name`, `parent_id`, `sort_order`, `status`, `extra_json`)
SELECT t.id, 'english', '英语', NULL, 300, 'enabled', JSON_OBJECT()
FROM `dict_types` t
WHERE t.type_code = 'subject'
ON DUPLICATE KEY UPDATE
  `item_name` = VALUES(`item_name`),
  `sort_order` = VALUES(`sort_order`),
  `status` = VALUES(`status`);

INSERT INTO `dict_items` (`type_id`, `item_code`, `item_name`, `parent_id`, `sort_order`, `status`, `extra_json`)
SELECT t.id, 'physics', '物理', NULL, 200, 'enabled', JSON_OBJECT()
FROM `dict_types` t
WHERE t.type_code = 'subject'
ON DUPLICATE KEY UPDATE
  `item_name` = VALUES(`item_name`),
  `sort_order` = VALUES(`sort_order`),
  `status` = VALUES(`status`);

INSERT INTO `dict_items` (`type_id`, `item_code`, `item_name`, `parent_id`, `sort_order`, `status`, `extra_json`)
SELECT t.id, 'chemistry', '化学', NULL, 100, 'enabled', JSON_OBJECT()
FROM `dict_types` t
WHERE t.type_code = 'subject'
ON DUPLICATE KEY UPDATE
  `item_name` = VALUES(`item_name`),
  `sort_order` = VALUES(`sort_order`),
  `status` = VALUES(`status`);

INSERT INTO `dict_items` (`type_id`, `item_code`, `item_name`, `parent_id`, `sort_order`, `status`, `extra_json`)
SELECT t.id, 'high_1', '高一', NULL, 100, 'enabled', JSON_OBJECT()
FROM `dict_types` t
WHERE t.type_code = 'grade'
ON DUPLICATE KEY UPDATE
  `item_name` = VALUES(`item_name`),
  `sort_order` = VALUES(`sort_order`),
  `status` = VALUES(`status`);

INSERT INTO `dict_items` (`type_id`, `item_code`, `item_name`, `parent_id`, `sort_order`, `status`, `extra_json`)
SELECT t.id, 'term_1', '上学期', NULL, 100, 'enabled', JSON_OBJECT()
FROM `dict_types` t
WHERE t.type_code = 'term'
ON DUPLICATE KEY UPDATE
  `item_name` = VALUES(`item_name`),
  `sort_order` = VALUES(`sort_order`),
  `status` = VALUES(`status`);

INSERT INTO `dict_items` (`type_id`, `item_code`, `item_name`, `parent_id`, `sort_order`, `status`, `extra_json`)
SELECT t.id, 'pep', '人教版', NULL, 100, 'enabled', JSON_OBJECT()
FROM `dict_types` t
WHERE t.type_code = 'version'
ON DUPLICATE KEY UPDATE
  `item_name` = VALUES(`item_name`),
  `sort_order` = VALUES(`sort_order`),
  `status` = VALUES(`status`);

-- =========================================================
-- Membership package defaults
-- =========================================================

INSERT INTO `membership_packages` (`package_code`, `package_name`, `package_type`, `package_tone`, `duration_days`, `is_permanent`, `rights_desc`, `status`, `sort_order`)
VALUES
  ('PKG_TRIAL_7', '7天体验卡', 'day_card', 'blue', 7, 0, '适合首批活动发放与拉新试用', 'enabled', 40),
  ('PKG_MONTH_30', '30天月卡', 'term_card', 'green', 30, 0, '覆盖同步课与专题课基础权益', 'enabled', 60),
  ('PKG_YEAR_365', '365天年卡', 'year_card', 'violet', 365, 0, '年度会员，适合长期学习用户', 'enabled', 80),
  ('PKG_FOREVER', '永久会员', 'permanent', 'gold', NULL, 1, '永久解锁课程权益', 'enabled', 100)
ON DUPLICATE KEY UPDATE
  `package_name` = VALUES(`package_name`),
  `package_type` = VALUES(`package_type`),
  `package_tone` = VALUES(`package_tone`),
  `duration_days` = VALUES(`duration_days`),
  `is_permanent` = VALUES(`is_permanent`),
  `rights_desc` = VALUES(`rights_desc`),
  `status` = VALUES(`status`),
  `sort_order` = VALUES(`sort_order`);

-- =========================================================
-- Demo app user
-- username: student_demo
-- Password is injected by bootstrap-local-db.mjs or should be reset manually after import.
-- =========================================================

INSERT INTO `users` (`user_no`, `login_account`, `phone`, `password_hash`, `nickname`, `register_source`, `status`)
VALUES
  (
    'U_DEMO_001',
    'student_demo',
    '13800000001',
    'scrypt$bootstrap_app$00',
    '演示学员',
    'seed',
    'normal'
  )
ON DUPLICATE KEY UPDATE
  `login_account` = VALUES(`login_account`),
  `phone` = VALUES(`phone`),
  `password_hash` = VALUES(`password_hash`),
  `nickname` = VALUES(`nickname`),
  `register_source` = VALUES(`register_source`),
  `status` = VALUES(`status`);

INSERT INTO `user_profiles` (`user_id`, `gender`, `grade_code`, `version_code`, `province`, `city`, `school_name`, `ext_json`)
SELECT
  u.id,
  'unknown',
  'high_1',
  'pep',
  '上海',
  '上海',
  '优学演示中学',
  JSON_OBJECT('seed', true)
FROM `users` u
WHERE u.user_no = 'U_DEMO_001'
ON DUPLICATE KEY UPDATE
  `gender` = VALUES(`gender`),
  `grade_code` = VALUES(`grade_code`),
  `version_code` = VALUES(`version_code`),
  `province` = VALUES(`province`),
  `city` = VALUES(`city`),
  `school_name` = VALUES(`school_name`),
  `ext_json` = VALUES(`ext_json`);

-- =========================================================
-- Demo course content
-- =========================================================

INSERT INTO `topic_tags` (`tag_code`, `tag_name`, `subject_code`, `sort_order`, `status`, `remark`)
VALUES
  ('TAG_MATH_RISE', '数学提分专题', 'math', 100, 'enabled', 'Seed topic tag')
ON DUPLICATE KEY UPDATE
  `tag_name` = VALUES(`tag_name`),
  `subject_code` = VALUES(`subject_code`),
  `sort_order` = VALUES(`sort_order`),
  `status` = VALUES(`status`),
  `remark` = VALUES(`remark`);

INSERT INTO `courses` (
  `course_no`,
  `course_type`,
  `title`,
  `subtitle`,
  `subject_code`,
  `grade_code`,
  `term_code`,
  `version_code`,
  `teacher_name`,
  `description`,
  `recommendation`,
  `access_type`,
  `status`,
  `sort_order`,
  `published_at`
)
VALUES
  (
    'COURSE_SYNC_DEMO_001',
    'sync',
    '高一数学同步精讲示例课',
    '集合与函数基础',
    'math',
    'high_1',
    'term_1',
    'pep',
    '李老师',
    '用于演示首页、课程详情和学习进度接口。',
    '同步课种子数据',
    'free',
    'published',
    100,
    NOW()
  ),
  (
    'COURSE_TOPIC_DEMO_001',
    'topic',
    '高一数学提分专题示例课',
    '函数压轴题突破',
    'math',
    'high_1',
    'term_1',
    'pep',
    '王老师',
    '用于演示专题课与会员访问控制。',
    '专题课种子数据',
    'vip',
    'published',
    90,
    NOW()
  )
ON DUPLICATE KEY UPDATE
  `title` = VALUES(`title`),
  `subtitle` = VALUES(`subtitle`),
  `subject_code` = VALUES(`subject_code`),
  `grade_code` = VALUES(`grade_code`),
  `term_code` = VALUES(`term_code`),
  `version_code` = VALUES(`version_code`),
  `teacher_name` = VALUES(`teacher_name`),
  `description` = VALUES(`description`),
  `recommendation` = VALUES(`recommendation`),
  `access_type` = VALUES(`access_type`),
  `status` = VALUES(`status`),
  `sort_order` = VALUES(`sort_order`),
  `published_at` = VALUES(`published_at`);

INSERT INTO `course_topic_tags` (`course_id`, `tag_id`)
SELECT c.id, t.id
FROM `courses` c
INNER JOIN `topic_tags` t ON t.tag_code = 'TAG_MATH_RISE'
WHERE c.course_no = 'COURSE_TOPIC_DEMO_001'
ON DUPLICATE KEY UPDATE
  `course_id` = VALUES(`course_id`);

INSERT INTO `course_lessons` (
  `course_id`,
  `parent_id`,
  `node_type`,
  `lesson_no`,
  `title`,
  `sort_order`,
  `status`,
  `duration_seconds`,
  `is_preview`,
  `access_type`,
  `published_at`
)
SELECT
  c.id,
  NULL,
  'lesson',
  'LESSON_SYNC_DEMO_001',
  '集合概念与基础练习',
  100,
  'published',
  1800,
  1,
  'free',
  NOW()
FROM `courses` c
WHERE c.course_no = 'COURSE_SYNC_DEMO_001'
  AND NOT EXISTS (
    SELECT 1
    FROM `course_lessons` l
    WHERE l.course_id = c.id
      AND l.lesson_no = 'LESSON_SYNC_DEMO_001'
      AND l.deleted_at IS NULL
  );

INSERT INTO `course_lessons` (
  `course_id`,
  `parent_id`,
  `node_type`,
  `lesson_no`,
  `title`,
  `sort_order`,
  `status`,
  `duration_seconds`,
  `is_preview`,
  `access_type`,
  `published_at`
)
SELECT
  c.id,
  NULL,
  'lesson',
  'LESSON_TOPIC_DEMO_001',
  '函数压轴题解题套路',
  100,
  'published',
  2400,
  0,
  'vip',
  NOW()
FROM `courses` c
WHERE c.course_no = 'COURSE_TOPIC_DEMO_001'
  AND NOT EXISTS (
    SELECT 1
    FROM `course_lessons` l
    WHERE l.course_id = c.id
      AND l.lesson_no = 'LESSON_TOPIC_DEMO_001'
      AND l.deleted_at IS NULL
  );

INSERT INTO `content_banners` (
  `banner_type`,
  `title`,
  `subtitle`,
  `badge_text`,
  `link_type`,
  `link_value`,
  `sort_order`,
  `status`,
  `start_at`
)
SELECT
  'home',
  '新用户体验课',
  '导入种子数据后即可看到首页推荐',
  'Demo',
  'none',
  NULL,
  100,
  'enabled',
  NOW()
WHERE NOT EXISTS (
  SELECT 1
  FROM `content_banners`
  WHERE `banner_type` = 'home'
    AND `title` = '新用户体验课'
);
