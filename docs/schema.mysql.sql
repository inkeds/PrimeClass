-- MySQL 8.0 initialization script
-- Project: PrimeClass
-- Notes:
-- 1. Replace database name if needed before execution.
-- 2. This script creates both P0 core tables and P1 extension tables.
-- 3. The schema follows the design in docs/数据库表结构设计.md.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS `primeclass`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `primeclass`;

-- =========================================================
-- Admin and RBAC
-- =========================================================

CREATE TABLE IF NOT EXISTS `admins` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `username` VARCHAR(64) NOT NULL COMMENT 'Login username',
  `password_hash` VARCHAR(255) NOT NULL COMMENT 'Password hash',
  `real_name` VARCHAR(64) NOT NULL COMMENT 'Real name',
  `avatar_asset_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Avatar asset id',
  `mobile` VARCHAR(32) DEFAULT NULL COMMENT 'Mobile number',
  `email` VARCHAR(128) DEFAULT NULL COMMENT 'Email',
  `status` VARCHAR(16) NOT NULL DEFAULT 'enabled' COMMENT 'enabled/disabled',
  `session_version` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Session revoke version',
  `last_login_at` DATETIME DEFAULT NULL COMMENT 'Last login time',
  `last_login_ip` VARCHAR(64) DEFAULT NULL COMMENT 'Last login ip',
  `remark` VARCHAR(255) DEFAULT NULL COMMENT 'Remark',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`),
  KEY `idx_avatar_asset_id` (`avatar_asset_id`),
  KEY `idx_mobile` (`mobile`),
  KEY `idx_email` (`email`),
  KEY `idx_status` (`status`),
  KEY `idx_last_login_at` (`last_login_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Admin users';

CREATE TABLE IF NOT EXISTS `admin_roles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `role_code` VARCHAR(64) NOT NULL COMMENT 'Role code',
  `role_name` VARCHAR(64) NOT NULL COMMENT 'Role name',
  `status` VARCHAR(16) NOT NULL DEFAULT 'enabled' COMMENT 'enabled/disabled',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT 'Sort order',
  `remark` VARCHAR(255) DEFAULT NULL COMMENT 'Remark',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_code` (`role_code`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Admin roles';

CREATE TABLE IF NOT EXISTS `admin_permissions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `permission_key` VARCHAR(128) NOT NULL COMMENT 'Permission key',
  `permission_name` VARCHAR(64) NOT NULL COMMENT 'Permission name',
  `module_code` VARCHAR(64) NOT NULL COMMENT 'Module code',
  `group_code` VARCHAR(64) DEFAULT NULL COMMENT 'Group code',
  `description` VARCHAR(255) DEFAULT NULL COMMENT 'Description',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT 'Sort order',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_permission_key` (`permission_key`),
  KEY `idx_module_code` (`module_code`),
  KEY `idx_group_code` (`group_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Admin permissions';

CREATE TABLE IF NOT EXISTS `admin_user_roles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `admin_id` BIGINT UNSIGNED NOT NULL COMMENT 'Admin id',
  `role_id` BIGINT UNSIGNED NOT NULL COMMENT 'Role id',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_admin_role` (`admin_id`, `role_id`),
  KEY `idx_role_id` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Admin role mapping';

CREATE TABLE IF NOT EXISTS `admin_role_permissions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `role_id` BIGINT UNSIGNED NOT NULL COMMENT 'Role id',
  `permission_id` BIGINT UNSIGNED NOT NULL COMMENT 'Permission id',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_permission` (`role_id`, `permission_id`),
  KEY `idx_permission_id` (`permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Role permission mapping';

CREATE TABLE IF NOT EXISTS `admin_operation_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `admin_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Admin id',
  `module_code` VARCHAR(64) NOT NULL COMMENT 'Module code',
  `action_code` VARCHAR(64) NOT NULL COMMENT 'Action code',
  `target_type` VARCHAR(64) DEFAULT NULL COMMENT 'Target type',
  `target_id` VARCHAR(64) DEFAULT NULL COMMENT 'Target id',
  `request_method` VARCHAR(16) DEFAULT NULL COMMENT 'HTTP method',
  `request_path` VARCHAR(255) DEFAULT NULL COMMENT 'Request path',
  `request_id` VARCHAR(64) DEFAULT NULL COMMENT 'Request id',
  `change_summary` TEXT COMMENT 'Change summary',
  `ip` VARCHAR(64) DEFAULT NULL COMMENT 'Operator ip',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  PRIMARY KEY (`id`),
  KEY `idx_admin_id` (`admin_id`),
  KEY `idx_module_code` (`module_code`),
  KEY `idx_action_code` (`action_code`),
  KEY `idx_target_type` (`target_type`),
  KEY `idx_target_id` (`target_id`),
  KEY `idx_request_id` (`request_id`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Admin operation logs';

CREATE TABLE IF NOT EXISTS `admin_login_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `admin_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Admin id',
  `username_snapshot` VARCHAR(64) NOT NULL COMMENT 'Username snapshot',
  `login_result` VARCHAR(16) NOT NULL COMMENT 'success/failed',
  `failure_reason` VARCHAR(255) DEFAULT NULL COMMENT 'Failure reason',
  `login_ip` VARCHAR(64) DEFAULT NULL COMMENT 'Login ip',
  `user_agent` VARCHAR(500) DEFAULT NULL COMMENT 'User agent',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  PRIMARY KEY (`id`),
  KEY `idx_admin_id` (`admin_id`),
  KEY `idx_login_result` (`login_result`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Admin login logs';

-- =========================================================
-- Dictionary and content config
-- =========================================================

CREATE TABLE IF NOT EXISTS `dict_types` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `type_code` VARCHAR(64) NOT NULL COMMENT 'Type code',
  `type_name` VARCHAR(64) NOT NULL COMMENT 'Type name',
  `status` VARCHAR(16) NOT NULL DEFAULT 'enabled' COMMENT 'enabled/disabled',
  `remark` VARCHAR(255) DEFAULT NULL COMMENT 'Remark',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_type_code` (`type_code`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Dictionary types';

CREATE TABLE IF NOT EXISTS `dict_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `type_id` BIGINT UNSIGNED NOT NULL COMMENT 'Dictionary type id',
  `item_code` VARCHAR(64) NOT NULL COMMENT 'Item code',
  `item_name` VARCHAR(64) NOT NULL COMMENT 'Item name',
  `parent_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Parent item id',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT 'Sort order',
  `status` VARCHAR(16) NOT NULL DEFAULT 'enabled' COMMENT 'enabled/disabled',
  `extra_json` JSON DEFAULT NULL COMMENT 'Extra data',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_type_item_code` (`type_id`, `item_code`),
  KEY `idx_parent_id` (`parent_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Dictionary items';

CREATE TABLE IF NOT EXISTS `topic_tags` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `tag_code` VARCHAR(64) NOT NULL COMMENT 'Tag code',
  `tag_name` VARCHAR(64) NOT NULL COMMENT 'Tag name',
  `subject_code` VARCHAR(32) DEFAULT NULL COMMENT 'Subject code',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT 'Sort order',
  `status` VARCHAR(16) NOT NULL DEFAULT 'enabled' COMMENT 'enabled/disabled',
  `remark` VARCHAR(255) DEFAULT NULL COMMENT 'Remark',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tag_code` (`tag_code`),
  KEY `idx_tag_name` (`tag_name`),
  KEY `idx_subject_code` (`subject_code`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Topic tags';

CREATE TABLE IF NOT EXISTS `content_banners` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `banner_type` VARCHAR(32) NOT NULL DEFAULT 'home' COMMENT 'Banner type',
  `title` VARCHAR(128) NOT NULL COMMENT 'Title',
  `subtitle` VARCHAR(255) DEFAULT NULL COMMENT 'Subtitle',
  `badge_text` VARCHAR(32) DEFAULT NULL COMMENT 'Badge text',
  `image_asset_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Image asset id',
  `link_type` VARCHAR(16) NOT NULL DEFAULT 'none' COMMENT 'none/course/external',
  `link_value` VARCHAR(255) DEFAULT NULL COMMENT 'Link value',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT 'Sort order',
  `status` VARCHAR(16) NOT NULL DEFAULT 'enabled' COMMENT 'enabled/disabled',
  `start_at` DATETIME DEFAULT NULL COMMENT 'Start time',
  `end_at` DATETIME DEFAULT NULL COMMENT 'End time',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  PRIMARY KEY (`id`),
  KEY `idx_banner_type` (`banner_type`),
  KEY `idx_image_asset_id` (`image_asset_id`),
  KEY `idx_link_type` (`link_type`),
  KEY `idx_status` (`status`),
  KEY `idx_start_at` (`start_at`),
  KEY `idx_end_at` (`end_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Content banners';

CREATE TABLE IF NOT EXISTS `content_recommendations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `position_code` VARCHAR(64) NOT NULL COMMENT 'Position code',
  `content_type` VARCHAR(32) NOT NULL COMMENT 'course/banner/topic',
  `ref_id` BIGINT UNSIGNED NOT NULL COMMENT 'Referenced content id',
  `subject_code` VARCHAR(32) DEFAULT NULL COMMENT 'Subject code',
  `grade_code` VARCHAR(32) DEFAULT NULL COMMENT 'Grade code',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT 'Sort order',
  `status` VARCHAR(16) NOT NULL DEFAULT 'enabled' COMMENT 'enabled/disabled',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  PRIMARY KEY (`id`),
  KEY `idx_position_code` (`position_code`),
  KEY `idx_content_type` (`content_type`),
  KEY `idx_subject_grade` (`subject_code`, `grade_code`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Content recommendations';

-- =========================================================
-- Assets and system config
-- =========================================================

CREATE TABLE IF NOT EXISTS `assets` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `asset_no` VARCHAR(32) NOT NULL COMMENT 'Asset number',
  `provider` VARCHAR(32) NOT NULL COMMENT 'local/s3/tencent_cos/ftp',
  `bucket_or_root` VARCHAR(255) DEFAULT NULL COMMENT 'Bucket or root path',
  `object_key` VARCHAR(500) NOT NULL COMMENT 'Object key',
  `origin_name` VARCHAR(255) NOT NULL COMMENT 'Original file name',
  `stored_name` VARCHAR(255) DEFAULT NULL COMMENT 'Stored file name',
  `asset_type` VARCHAR(32) NOT NULL COMMENT 'image/video/document/avatar/other',
  `business_type` VARCHAR(32) DEFAULT NULL COMMENT 'Business type',
  `mime_type` VARCHAR(128) DEFAULT NULL COMMENT 'Mime type',
  `ext` VARCHAR(16) DEFAULT NULL COMMENT 'File extension',
  `size` BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'File size',
  `etag_hash` VARCHAR(128) DEFAULT NULL COMMENT 'Hash or etag',
  `public_url` VARCHAR(1000) DEFAULT NULL COMMENT 'Public url',
  `meta_json` JSON DEFAULT NULL COMMENT 'Metadata json',
  `status` VARCHAR(16) NOT NULL DEFAULT 'enabled' COMMENT 'enabled/disabled',
  `uploaded_by_admin_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Uploaded by admin',
  `uploaded_by_user_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Uploaded by user',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  `deleted_at` DATETIME DEFAULT NULL COMMENT 'Deleted time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_asset_no` (`asset_no`),
  KEY `idx_provider_business_type` (`provider`, `business_type`),
  KEY `idx_object_key` (`object_key`),
  KEY `idx_origin_name` (`origin_name`),
  KEY `idx_asset_type` (`asset_type`),
  KEY `idx_size` (`size`),
  KEY `idx_etag_hash` (`etag_hash`),
  KEY `idx_status` (`status`),
  KEY `idx_uploaded_by_admin_id` (`uploaded_by_admin_id`),
  KEY `idx_uploaded_by_user_id` (`uploaded_by_user_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Assets';

CREATE TABLE IF NOT EXISTS `storage_configs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `provider` VARCHAR(32) NOT NULL COMMENT 'local/s3/tencent_cos/ftp',
  `is_enabled` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Is enabled',
  `is_default` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Is default provider',
  `config_json` JSON NOT NULL COMMENT 'Provider config',
  `last_test_at` DATETIME DEFAULT NULL COMMENT 'Last test time',
  `last_test_status` VARCHAR(16) DEFAULT NULL COMMENT 'success/failed',
  `last_test_message` VARCHAR(255) DEFAULT NULL COMMENT 'Last test message',
  `updated_by_admin_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Updated by admin',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_provider` (`provider`),
  KEY `idx_is_enabled` (`is_enabled`),
  KEY `idx_is_default` (`is_default`),
  KEY `idx_last_test_status` (`last_test_status`),
  KEY `idx_updated_by_admin_id` (`updated_by_admin_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Storage provider configs';

CREATE TABLE IF NOT EXISTS `system_settings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `category` VARCHAR(32) NOT NULL COMMENT 'basic/display/upload/business',
  `setting_key` VARCHAR(64) NOT NULL COMMENT 'Setting key',
  `setting_name` VARCHAR(64) NOT NULL COMMENT 'Setting name',
  `value_type` VARCHAR(16) NOT NULL DEFAULT 'string' COMMENT 'string/int/bool/json',
  `setting_value` LONGTEXT DEFAULT NULL COMMENT 'Setting value',
  `is_encrypted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Is encrypted',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT 'Sort order',
  `updated_by_admin_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Updated by admin',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_category_key` (`category`, `setting_key`),
  KEY `idx_is_encrypted` (`is_encrypted`),
  KEY `idx_updated_by_admin_id` (`updated_by_admin_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='System settings';

CREATE TABLE IF NOT EXISTS `system_notifications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `title` VARCHAR(120) NOT NULL COMMENT 'Notification title',
  `content` VARCHAR(1000) NOT NULL COMMENT 'Notification content',
  `tone` VARCHAR(16) NOT NULL DEFAULT 'info' COMMENT 'info/warning/success/vip',
  `status` VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT 'draft/published/disabled',
  `published_at` DATETIME DEFAULT NULL COMMENT 'Published time',
  `created_by_admin_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Created by admin',
  `updated_by_admin_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Updated by admin',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  PRIMARY KEY (`id`),
  KEY `idx_status_published_at` (`status`, `published_at`),
  KEY `idx_created_by_admin_id` (`created_by_admin_id`),
  KEY `idx_updated_by_admin_id` (`updated_by_admin_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='System notifications';

-- =========================================================
-- Users
-- =========================================================

CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `user_no` VARCHAR(32) NOT NULL COMMENT 'External user number',
  `login_account` VARCHAR(64) DEFAULT NULL COMMENT 'Login account',
  `phone` VARCHAR(20) DEFAULT NULL COMMENT 'Phone',
  `password_hash` VARCHAR(255) DEFAULT NULL COMMENT 'Password hash',
  `nickname` VARCHAR(64) NOT NULL COMMENT 'Nickname',
  `avatar_asset_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Avatar asset id',
  `register_source` VARCHAR(32) NOT NULL DEFAULT 'app' COMMENT 'Register source',
  `status` VARCHAR(16) NOT NULL DEFAULT 'normal' COMMENT 'normal/frozen/canceled',
  `session_version` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Session revoke version',
  `last_login_at` DATETIME DEFAULT NULL COMMENT 'Last login time',
  `last_login_ip` VARCHAR(64) DEFAULT NULL COMMENT 'Last login ip',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  `deleted_at` DATETIME DEFAULT NULL COMMENT 'Deleted time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_no` (`user_no`),
  UNIQUE KEY `uk_login_account` (`login_account`),
  UNIQUE KEY `uk_phone` (`phone`),
  KEY `idx_nickname` (`nickname`),
  KEY `idx_avatar_asset_id` (`avatar_asset_id`),
  KEY `idx_register_source` (`register_source`),
  KEY `idx_status_created_at` (`status`, `created_at`),
  KEY `idx_last_login_at` (`last_login_at`),
  KEY `idx_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='App users';

CREATE TABLE IF NOT EXISTS `user_profiles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  `gender` VARCHAR(16) DEFAULT NULL COMMENT 'Gender',
  `grade_code` VARCHAR(32) DEFAULT NULL COMMENT 'Grade code',
  `version_code` VARCHAR(32) DEFAULT NULL COMMENT 'Default version code',
  `province` VARCHAR(64) DEFAULT NULL COMMENT 'Province',
  `city` VARCHAR(64) DEFAULT NULL COMMENT 'City',
  `school_name` VARCHAR(128) DEFAULT NULL COMMENT 'School name',
  `ext_json` JSON DEFAULT NULL COMMENT 'Extra data',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_id` (`user_id`),
  KEY `idx_grade_code` (`grade_code`),
  KEY `idx_version_code` (`version_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='User profiles';

CREATE TABLE IF NOT EXISTS `user_remarks` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  `admin_id` BIGINT UNSIGNED NOT NULL COMMENT 'Admin id',
  `content` VARCHAR(500) NOT NULL COMMENT 'Remark content',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_admin_id` (`admin_id`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='User remarks';

CREATE TABLE IF NOT EXISTS `user_learning_records` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  `course_id` BIGINT UNSIGNED NOT NULL COMMENT 'Course id',
  `lesson_id` BIGINT UNSIGNED NOT NULL COMMENT 'Lesson id',
  `progress_percent` DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT 'Progress percent',
  `watched_seconds` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Watched seconds',
  `last_position_seconds` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Last playback position',
  `is_completed` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Is completed',
  `learn_source` VARCHAR(32) DEFAULT NULL COMMENT 'Learn source',
  `first_learned_at` DATETIME DEFAULT NULL COMMENT 'First learned time',
  `last_learned_at` DATETIME DEFAULT NULL COMMENT 'Last learned time',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_lesson` (`user_id`, `lesson_id`),
  KEY `idx_course_id` (`course_id`),
  KEY `idx_is_completed` (`is_completed`),
  KEY `idx_learn_source` (`learn_source`),
  KEY `idx_user_last_learned` (`user_id`, `last_learned_at`),
  KEY `idx_course_lesson` (`course_id`, `lesson_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='User learning records';

CREATE TABLE IF NOT EXISTS `user_course_favorites` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  `course_id` BIGINT UNSIGNED NOT NULL COMMENT 'Course id',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_course` (`user_id`, `course_id`),
  KEY `idx_course_id` (`course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='User course favorites';

CREATE TABLE IF NOT EXISTS `user_download_records` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  `asset_id` BIGINT UNSIGNED NOT NULL COMMENT 'Asset id',
  `course_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Course id',
  `lesson_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Lesson id',
  `download_channel` VARCHAR(32) DEFAULT NULL COMMENT 'Download channel',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_asset_id` (`asset_id`),
  KEY `idx_course_id` (`course_id`),
  KEY `idx_lesson_id` (`lesson_id`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='User download records';

CREATE TABLE IF NOT EXISTS `user_notes` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  `course_id` BIGINT UNSIGNED NOT NULL COMMENT 'Course id',
  `lesson_id` BIGINT UNSIGNED NOT NULL COMMENT 'Lesson id',
  `content` LONGTEXT COMMENT 'Note content',
  `status` VARCHAR(16) NOT NULL DEFAULT 'enabled' COMMENT 'enabled/disabled',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_course_id` (`course_id`),
  KEY `idx_lesson_id` (`lesson_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='User notes';

-- =========================================================
-- Courses
-- =========================================================

CREATE TABLE IF NOT EXISTS `courses` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `course_no` VARCHAR(32) NOT NULL COMMENT 'Course number',
  `course_type` VARCHAR(16) NOT NULL COMMENT 'sync/topic',
  `title` VARCHAR(255) NOT NULL COMMENT 'Course title',
  `subtitle` VARCHAR(255) DEFAULT NULL COMMENT 'Course subtitle',
  `subject_code` VARCHAR(32) DEFAULT NULL COMMENT 'Subject code',
  `grade_code` VARCHAR(32) DEFAULT NULL COMMENT 'Grade code',
  `term_code` VARCHAR(32) DEFAULT NULL COMMENT 'Term code',
  `version_code` VARCHAR(32) DEFAULT NULL COMMENT 'Version code',
  `teacher_name` VARCHAR(64) DEFAULT NULL COMMENT 'Teacher name',
  `description` TEXT COMMENT 'Description',
  `recommendation` VARCHAR(255) DEFAULT NULL COMMENT 'Recommendation',
  `cover_asset_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Cover asset id',
  `access_type` VARCHAR(16) NOT NULL DEFAULT 'free' COMMENT 'free/vip',
  `status` VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT 'draft/published/offline',
  `view_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'View count',
  `favorite_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Favorite count',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT 'Sort order',
  `published_at` DATETIME DEFAULT NULL COMMENT 'Published at',
  `creator_admin_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Creator admin id',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  `deleted_at` DATETIME DEFAULT NULL COMMENT 'Deleted time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_course_no` (`course_no`),
  KEY `idx_title` (`title`),
  KEY `idx_course_filter` (`course_type`, `subject_code`, `grade_code`, `version_code`, `status`),
  KEY `idx_cover_asset_id` (`cover_asset_id`),
  KEY `idx_access_type` (`access_type`),
  KEY `idx_sort_order` (`sort_order`),
  KEY `idx_published_at` (`published_at`),
  KEY `idx_creator_admin_id` (`creator_admin_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Courses';

CREATE TABLE IF NOT EXISTS `course_topic_tags` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `course_id` BIGINT UNSIGNED NOT NULL COMMENT 'Course id',
  `tag_id` BIGINT UNSIGNED NOT NULL COMMENT 'Topic tag id',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_course_tag` (`course_id`, `tag_id`),
  KEY `idx_tag_id` (`tag_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Course topic tag mapping';

CREATE TABLE IF NOT EXISTS `course_lessons` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `course_id` BIGINT UNSIGNED NOT NULL COMMENT 'Course id',
  `parent_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Parent node id',
  `node_type` VARCHAR(16) NOT NULL COMMENT 'chapter/section/lesson',
  `lesson_no` VARCHAR(64) DEFAULT NULL COMMENT 'Lesson number',
  `title` VARCHAR(255) NOT NULL COMMENT 'Lesson title',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT 'Sort order',
  `status` VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT 'draft/published/offline',
  `video_asset_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Video asset id',
  `handout_asset_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Handout asset id',
  `note_template_asset_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Note template asset id',
  `duration_seconds` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Duration seconds',
  `is_preview` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Is preview',
  `access_type` VARCHAR(16) DEFAULT NULL COMMENT 'Override access type',
  `published_at` DATETIME DEFAULT NULL COMMENT 'Published at',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  `deleted_at` DATETIME DEFAULT NULL COMMENT 'Deleted time',
  PRIMARY KEY (`id`),
  KEY `idx_course_parent_sort` (`course_id`, `parent_id`, `sort_order`),
  KEY `idx_course_node_type` (`course_id`, `node_type`, `status`),
  KEY `idx_title` (`title`),
  KEY `idx_video_asset_id` (`video_asset_id`),
  KEY `idx_handout_asset_id` (`handout_asset_id`),
  KEY `idx_note_template_asset_id` (`note_template_asset_id`),
  KEY `idx_is_preview` (`is_preview`),
  KEY `idx_access_type` (`access_type`),
  KEY `idx_deleted_at` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Course lesson tree';

CREATE TABLE IF NOT EXISTS `course_assets` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `course_id` BIGINT UNSIGNED NOT NULL COMMENT 'Course id',
  `lesson_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Lesson id',
  `asset_id` BIGINT UNSIGNED NOT NULL COMMENT 'Asset id',
  `asset_role` VARCHAR(32) NOT NULL COMMENT 'cover/video/handout/attachment/note_template',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT 'Sort order',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  PRIMARY KEY (`id`),
  KEY `idx_course_asset_role` (`course_id`, `asset_role`),
  KEY `idx_lesson_asset_role` (`lesson_id`, `asset_role`),
  KEY `idx_asset_id` (`asset_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Course asset mapping';

-- =========================================================
-- Membership and activation code
-- =========================================================

CREATE TABLE IF NOT EXISTS `membership_packages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `package_code` VARCHAR(32) NOT NULL COMMENT 'Package code',
  `package_name` VARCHAR(64) NOT NULL COMMENT 'Package name',
  `package_type` VARCHAR(16) NOT NULL COMMENT 'day_card/term_card/year_card/permanent',
  `package_tone` VARCHAR(16) NOT NULL DEFAULT 'gold' COMMENT 'gold/blue/green/violet/red/slate',
  `duration_days` INT DEFAULT NULL COMMENT 'Duration in days',
  `is_permanent` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Is permanent',
  `rights_desc` VARCHAR(500) DEFAULT NULL COMMENT 'Rights description',
  `status` VARCHAR(16) NOT NULL DEFAULT 'enabled' COMMENT 'enabled/disabled',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT 'Sort order',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_package_code` (`package_code`),
  KEY `idx_package_name` (`package_name`),
  KEY `idx_package_type` (`package_type`),
  KEY `idx_package_tone` (`package_tone`),
  KEY `idx_is_permanent` (`is_permanent`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Membership packages';

CREATE TABLE IF NOT EXISTS `user_memberships` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  `current_package_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Current package id',
  `membership_status` VARCHAR(16) NOT NULL DEFAULT 'normal' COMMENT 'normal/active/expired/permanent',
  `started_at` DATETIME DEFAULT NULL COMMENT 'Membership start time',
  `expired_at` DATETIME DEFAULT NULL COMMENT 'Membership expire time',
  `is_permanent` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Is permanent',
  `source_type` VARCHAR(32) DEFAULT NULL COMMENT 'redeem/manual/system_init',
  `source_ref_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Source reference id',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_membership` (`user_id`),
  KEY `idx_current_package_id` (`current_package_id`),
  KEY `idx_status_expired_at` (`membership_status`, `expired_at`),
  KEY `idx_is_permanent` (`is_permanent`),
  KEY `idx_source_type` (`source_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Current user memberships';

CREATE TABLE IF NOT EXISTS `membership_change_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  `package_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Package id',
  `change_type` VARCHAR(32) NOT NULL COMMENT 'redeem/manual_compensation/system_init',
  `delta_days` INT DEFAULT NULL COMMENT 'Changed days',
  `old_expired_at` DATETIME DEFAULT NULL COMMENT 'Old expired at',
  `new_expired_at` DATETIME DEFAULT NULL COMMENT 'New expired at',
  `is_permanent` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Is permanent',
  `operator_admin_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Operator admin id',
  `source_batch_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Source batch id',
  `source_code_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Source code id',
  `remark` VARCHAR(255) DEFAULT NULL COMMENT 'Remark',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_package_id` (`package_id`),
  KEY `idx_change_type` (`change_type`),
  KEY `idx_new_expired_at` (`new_expired_at`),
  KEY `idx_operator_admin_id` (`operator_admin_id`),
  KEY `idx_source_batch_id` (`source_batch_id`),
  KEY `idx_source_code_id` (`source_code_id`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Membership change logs';

CREATE TABLE IF NOT EXISTS `activation_code_batches` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `batch_no` VARCHAR(32) NOT NULL COMMENT 'Batch number',
  `package_id` BIGINT UNSIGNED NOT NULL COMMENT 'Package id',
  `quantity` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Generated quantity',
  `used_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Used count',
  `expired_count` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Expired count',
  `status` VARCHAR(16) NOT NULL DEFAULT 'enabled' COMMENT 'enabled/disabled',
  `expired_at` DATETIME DEFAULT NULL COMMENT 'Batch expire time',
  `source_channel` VARCHAR(64) DEFAULT NULL COMMENT 'Source channel',
  `remark` VARCHAR(255) DEFAULT NULL COMMENT 'Remark',
  `created_admin_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Created by admin',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_batch_no` (`batch_no`),
  KEY `idx_package_id` (`package_id`),
  KEY `idx_status` (`status`),
  KEY `idx_expired_at` (`expired_at`),
  KEY `idx_source_channel` (`source_channel`),
  KEY `idx_created_admin_id` (`created_admin_id`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Activation code batches';

CREATE TABLE IF NOT EXISTS `activation_codes` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `batch_id` BIGINT UNSIGNED NOT NULL COMMENT 'Batch id',
  `code` VARCHAR(32) NOT NULL COMMENT 'Activation code',
  `package_id` BIGINT UNSIGNED NOT NULL COMMENT 'Package id',
  `status` VARCHAR(16) NOT NULL DEFAULT 'unused' COMMENT 'unused/used/expired/invalid',
  `expired_at` DATETIME DEFAULT NULL COMMENT 'Code expire time',
  `used_by_user_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Used by user id',
  `used_at` DATETIME DEFAULT NULL COMMENT 'Used at',
  `source_channel` VARCHAR(64) DEFAULT NULL COMMENT 'Source channel',
  `invalid_reason` VARCHAR(255) DEFAULT NULL COMMENT 'Invalid reason',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_package_id` (`package_id`),
  KEY `idx_batch_status` (`batch_id`, `status`),
  KEY `idx_expired_at` (`expired_at`),
  KEY `idx_user_status` (`used_by_user_id`, `status`),
  KEY `idx_used_at` (`used_at`),
  KEY `idx_source_channel` (`source_channel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Activation codes';

CREATE TABLE IF NOT EXISTS `activation_redeem_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  `code_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Code id',
  `batch_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Batch id',
  `code_snapshot` VARCHAR(32) NOT NULL COMMENT 'Code snapshot',
  `package_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Package id',
  `result_status` VARCHAR(16) NOT NULL COMMENT 'success/failed/repeated',
  `failure_reason` VARCHAR(255) DEFAULT NULL COMMENT 'Failure reason',
  `previous_expired_at` DATETIME DEFAULT NULL COMMENT 'Previous expired at',
  `current_expired_at` DATETIME DEFAULT NULL COMMENT 'Current expired at',
  `request_id` VARCHAR(64) DEFAULT NULL COMMENT 'Idempotency request id',
  `source_platform` VARCHAR(32) NOT NULL DEFAULT 'app' COMMENT 'Source platform',
  `operator_admin_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'Admin operator id',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_request_id` (`request_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_code_id` (`code_id`),
  KEY `idx_batch_id` (`batch_id`),
  KEY `idx_code_snapshot` (`code_snapshot`),
  KEY `idx_package_id` (`package_id`),
  KEY `idx_result_status` (`result_status`),
  KEY `idx_source_platform` (`source_platform`),
  KEY `idx_operator_admin_id` (`operator_admin_id`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Activation redeem logs';

-- =========================================================
-- Optional seed data
-- =========================================================

INSERT INTO `storage_configs` (`provider`, `is_enabled`, `is_default`, `config_json`)
VALUES
  ('local', 1, 1, JSON_OBJECT()),
  ('s3', 0, 0, JSON_OBJECT()),
  ('tencent_cos', 0, 0, JSON_OBJECT()),
  ('ftp', 0, 0, JSON_OBJECT())
ON DUPLICATE KEY UPDATE
  `provider` = VALUES(`provider`);

SET FOREIGN_KEY_CHECKS = 1;
