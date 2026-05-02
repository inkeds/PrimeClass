# 优学课堂首版 API 接口清单

## 1. 文档信息

- 文档版本：v0.1
- 更新时间：2026-03-23
- 关联文档：`docs/项目设计规范.md`
- 文档目标：定义首版前台 App/H5 与后台管理系统的核心接口清单、统一约定、字段方向与错误规则，作为前后端联调基础

## 2. 设计范围

本接口文档覆盖：

- 前台 App/H5 接口
- 后台管理系统接口
- 资源上传与存储配置接口
- 会员激活码体系接口

本接口文档不覆盖：

- 第三方支付接口
- 订单与退款接口
- 推送消息平台接口

## 3. 全局约定

### 3.1 基础路径

建议区分前台端与后台端：

- 前台接口前缀：`/api/v1/app`
- 后台接口前缀：`/api/v1/admin`

### 3.2 认证方式

| 端 | 认证方式 |
| --- | --- |
| App/H5 | `Authorization: Bearer <user_token>` |
| Admin | `Authorization: Bearer <admin_token>` |

### 3.3 返回结构

统一返回结构建议：

```json
{
  "code": 0,
  "message": "ok",
  "data": {},
  "request_id": "req_xxx"
}
```

### 3.4 分页结构

分页接口 `data` 建议结构：

```json
{
  "list": [],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 100
  }
}
```

### 3.5 通用状态码建议

| code | 说明 |
| --- | --- |
| `0` | 成功 |
| `40001` | 参数错误 |
| `40100` | 未登录或 token 失效 |
| `40300` | 无权限 |
| `40400` | 资源不存在 |
| `40900` | 状态冲突 |
| `42200` | 业务校验失败 |
| `50000` | 系统异常 |

### 3.6 时间与 ID 约定

- 时间统一返回 ISO 8601 或 `YYYY-MM-DD HH:mm:ss`，项目内保持一致即可。
- 所有主键建议使用字符串返回，避免前端精度问题。

### 3.7 幂等要求

以下接口建议支持幂等：

- 激活码兑换
- 激活码批量生成
- 人工会员补偿
- 资源上传完成回调

可通过请求头 `Idempotency-Key` 或服务端业务幂等键实现。

## 4. 前台 App/H5 接口

### 4.1 认证与用户

#### 4.1.1 登录

- 方法：`POST`
- 路径：`/api/v1/app/auth/login`

请求字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `login_type` | 是 | `sms` / `password` / `guest_upgrade` |
| `account` | 否 | 手机号或账号 |
| `password` | 否 | 密码 |
| `sms_code` | 否 | 短信验证码 |

返回字段：

- `token`
- `user_info`
- `membership`

#### 4.1.2 退出登录

- 方法：`POST`
- 路径：`/api/v1/app/auth/logout`

#### 4.1.3 获取当前用户信息

- 方法：`GET`
- 路径：`/api/v1/app/me`

返回字段：

- `user_id`
- `nickname`
- `avatar`
- `user_level`
- `membership_status`
- `membership_expired_at`
- `message_count`

### 4.2 首页与字典

#### 4.2.1 首页聚合数据

- 方法：`GET`
- 路径：`/api/v1/app/home`

返回字段建议：

- `current_version`
- `banner_list`
- `subject_list`
- `continue_learning`
- `sync_course_list`
- `vip_entry`

#### 4.2.2 教材版本列表

- 方法：`GET`
- 路径：`/api/v1/app/versions`

查询参数：

- `grade`
- `subject`

返回字段建议：

- `version_code`
- `version_name`

#### 4.2.3 学科列表

- 方法：`GET`
- 路径：`/api/v1/app/subjects`

返回字段建议：

- `subject_code`
- `subject_name`

### 4.3 课程相关

#### 4.3.1 同步课列表

- 方法：`GET`
- 路径：`/api/v1/app/courses/sync`

查询参数：

| 字段 | 说明 |
| --- | --- |
| `subject` | 学科 |
| `grade` | 年级 |
| `term` | 学期 |
| `version` | 教材版本 |
| `page` | 页码 |
| `page_size` | 每页数量 |

返回列表字段建议：

- `course_id`
- `title`
- `cover_url`
- `difficulty`
- `view_count`
- `access_type`
- `teacher_name`
- `progress`

#### 4.3.2 专题标签列表

- 方法：`GET`
- 路径：`/api/v1/app/topics/tags`

#### 4.3.3 专题课列表

- 方法：`GET`
- 路径：`/api/v1/app/courses/topics`

查询参数：

- `tag_id`
- `subject`
- `page`
- `page_size`

#### 4.3.4 课程搜索

- 方法：`GET`
- 路径：`/api/v1/app/courses/search`

查询参数：

- `keyword`
- `course_type`
- `subject`
- `grade`
- `version`
- `page`
- `page_size`

#### 4.3.5 课程详情

- 方法：`GET`
- 路径：`/api/v1/app/courses/{course_id}`

返回字段建议：

- `course_id`
- `title`
- `description`
- `teacher_name`
- `subject`
- `grade`
- `term`
- `version`
- `access_type`
- `is_collected`
- `lesson_list`

#### 4.3.6 课时播放详情

- 方法：`GET`
- 路径：`/api/v1/app/lessons/{lesson_id}/play`

返回字段建议：

- `lesson_id`
- `lesson_title`
- `video_url`
- `handout_url`
- `note_enabled`
- `progress`
- `can_access`
- `access_denied_reason`

#### 4.3.7 更新学习进度

- 方法：`POST`
- 路径：`/api/v1/app/learning/progress`

请求字段：

- `course_id`
- `lesson_id`
- `progress`
- `watched_seconds`

### 4.4 学习库

#### 4.4.1 学习库首页

- 方法：`GET`
- 路径：`/api/v1/app/library`

返回字段建议：

- `history_count`
- `download_count`
- `favorite_count`
- `note_count`
- `continue_learning_list`

#### 4.4.2 继续学习列表

- 方法：`GET`
- 路径：`/api/v1/app/library/continue-learning`

#### 4.4.3 学习记录列表

- 方法：`GET`
- 路径：`/api/v1/app/library/history`

### 4.5 会员与激活码

#### 4.5.1 当前会员信息

- 方法：`GET`
- 路径：`/api/v1/app/membership`

返回字段建议：

- `status`
- `package_name`
- `started_at`
- `expired_at`
- `is_permanent`

#### 4.5.2 兑换激活码

- 方法：`POST`
- 路径：`/api/v1/app/membership/redeem`

请求字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `code` | 是 | 激活码 |

返回字段建议：

- `success`
- `package_name`
- `previous_expired_at`
- `current_expired_at`
- `is_permanent`

业务要求：

- 必须支持幂等。
- 必须校验激活码状态、有效期、使用人。
- 成功后立即生效。

### 4.6 系统展示配置

#### 4.6.1 前台展示配置

- 方法：`GET`
- 路径：`/api/v1/app/settings/display`

返回字段建议：

- `customer_service`
- `vip_copy`
- `redeem_copy`
- `banner_fallback`

## 5. 后台管理系统接口

### 5.1 后台认证

#### 5.1.1 管理员登录

- 方法：`POST`
- 路径：`/api/v1/admin/auth/login`

请求字段：

- `username`
- `password`
- `captcha`

返回字段：

- `token`
- `admin_info`
- `permissions`

#### 5.1.2 获取当前管理员信息

- 方法：`GET`
- 路径：`/api/v1/admin/auth/me`

#### 5.1.3 退出登录

- 方法：`POST`
- 路径：`/api/v1/admin/auth/logout`

### 5.2 工作台

#### 5.2.1 工作台概览

- 方法：`GET`
- 路径：`/api/v1/admin/dashboard/overview`

返回字段建议：

- `user_total`
- `active_user_today`
- `course_total`
- `published_course_total`
- `vip_active_total`
- `redeem_today_total`

#### 5.2.2 待处理事项

- 方法：`GET`
- 路径：`/api/v1/admin/dashboard/todos`

### 5.3 用户管理

#### 5.3.1 用户列表

- 方法：`GET`
- 路径：`/api/v1/admin/users`

查询参数：

- `keyword`
- `membership_status`
- `account_status`
- `registered_start`
- `registered_end`
- `active_start`
- `active_end`
- `page`
- `page_size`

#### 5.3.2 用户详情

- 方法：`GET`
- 路径：`/api/v1/admin/users/{user_id}`

#### 5.3.3 用户学习记录

- 方法：`GET`
- 路径：`/api/v1/admin/users/{user_id}/learning-records`

#### 5.3.4 更新用户状态

- 方法：`PATCH`
- 路径：`/api/v1/admin/users/{user_id}/status`

请求字段：

- `status`
- `reason`

#### 5.3.5 新增客服备注

- 方法：`POST`
- 路径：`/api/v1/admin/users/{user_id}/remarks`

请求字段：

- `content`

### 5.4 课程管理

#### 5.4.1 课程列表

- 方法：`GET`
- 路径：`/api/v1/admin/courses`

查询参数：

- `course_type`
- `subject`
- `grade`
- `term`
- `version`
- `access_type`
- `status`
- `keyword`
- `page`
- `page_size`

#### 5.4.2 新增课程

- 方法：`POST`
- 路径：`/api/v1/admin/courses`

请求字段建议：

- `course_type`
- `title`
- `subject`
- `grade`
- `term`
- `version`
- `topic_tag_ids`
- `teacher_name`
- `description`
- `cover_asset_id`
- `access_type`
- `status`
- `sort_order`

#### 5.4.3 课程详情

- 方法：`GET`
- 路径：`/api/v1/admin/courses/{course_id}`

#### 5.4.4 更新课程

- 方法：`PUT`
- 路径：`/api/v1/admin/courses/{course_id}`

#### 5.4.5 上架课程

- 方法：`POST`
- 路径：`/api/v1/admin/courses/{course_id}/publish`

#### 5.4.6 下架课程

- 方法：`POST`
- 路径：`/api/v1/admin/courses/{course_id}/offline`

#### 5.4.7 删除课程

- 方法：`DELETE`
- 路径：`/api/v1/admin/courses/{course_id}`

说明：

- 建议逻辑删除。

### 5.5 章节与课时管理

#### 5.5.1 课时列表

- 方法：`GET`
- 路径：`/api/v1/admin/courses/{course_id}/lessons`

#### 5.5.2 新增课时

- 方法：`POST`
- 路径：`/api/v1/admin/courses/{course_id}/lessons`

请求字段建议：

- `parent_id`
- `lesson_type`
- `title`
- `sort_order`
- `video_asset_id`
- `handout_asset_id`
- `duration_seconds`
- `is_preview`
- `status`

#### 5.5.3 更新课时

- 方法：`PUT`
- 路径：`/api/v1/admin/lessons/{lesson_id}`

#### 5.5.4 删除课时

- 方法：`DELETE`
- 路径：`/api/v1/admin/lessons/{lesson_id}`

#### 5.5.5 调整课时排序

- 方法：`POST`
- 路径：`/api/v1/admin/courses/{course_id}/lessons/sort`

请求字段：

```json
{
  "items": [
    { "lesson_id": "l1", "sort_order": 1 },
    { "lesson_id": "l2", "sort_order": 2 }
  ]
}
```

### 5.6 专题标签管理

#### 5.6.1 标签列表

- 方法：`GET`
- 路径：`/api/v1/admin/topic-tags`

#### 5.6.2 新增标签

- 方法：`POST`
- 路径：`/api/v1/admin/topic-tags`

#### 5.6.3 更新标签

- 方法：`PUT`
- 路径：`/api/v1/admin/topic-tags/{tag_id}`

#### 5.6.4 删除标签

- 方法：`DELETE`
- 路径：`/api/v1/admin/topic-tags/{tag_id}`

### 5.7 资源管理

#### 5.7.1 资源列表

- 方法：`GET`
- 路径：`/api/v1/admin/assets`

查询参数：

- `asset_type`
- `provider`
- `business_type`
- `keyword`
- `page`
- `page_size`

#### 5.7.2 上传资源

- 方法：`POST`
- 路径：`/api/v1/admin/assets/upload`

请求方式：

- `multipart/form-data`

表单字段建议：

- `file`
- `asset_type`
- `business_type`
- `provider`

返回字段建议：

- `asset_id`
- `provider`
- `object_key`
- `public_url`

#### 5.7.3 资源详情

- 方法：`GET`
- 路径：`/api/v1/admin/assets/{asset_id}`

#### 5.7.4 删除资源

- 方法：`DELETE`
- 路径：`/api/v1/admin/assets/{asset_id}`

### 5.8 会员管理

#### 5.8.1 会员套餐列表

- 方法：`GET`
- 路径：`/api/v1/admin/membership/packages`

#### 5.8.2 新增会员套餐

- 方法：`POST`
- 路径：`/api/v1/admin/membership/packages`

请求字段建议：

- `name`
- `package_type`
- `days`
- `is_permanent`
- `rights_desc`
- `status`

#### 5.8.3 更新会员套餐

- 方法：`PUT`
- 路径：`/api/v1/admin/membership/packages/{package_id}`

#### 5.8.4 激活码批次列表

- 方法：`GET`
- 路径：`/api/v1/admin/membership/code-batches`

#### 5.8.5 新建激活码批次

- 方法：`POST`
- 路径：`/api/v1/admin/membership/code-batches`

请求字段：

- `package_id`
- `quantity`
- `expired_at`
- `source_channel`
- `remark`

返回字段：

- `batch_no`
- `generated_count`

#### 5.8.6 激活码列表

- 方法：`GET`
- 路径：`/api/v1/admin/membership/codes`

查询参数：

- `batch_no`
- `code`
- `status`
- `user_id`
- `expired_start`
- `expired_end`
- `page`
- `page_size`

#### 5.8.7 作废激活码

- 方法：`POST`
- 路径：`/api/v1/admin/membership/codes/{code_id}/invalidate`

请求字段：

- `reason`

#### 5.8.8 导出批次激活码

- 方法：`GET`
- 路径：`/api/v1/admin/membership/code-batches/{batch_no}/export`

说明：

- 返回文件流或下载地址。

#### 5.8.9 兑换记录列表

- 方法：`GET`
- 路径：`/api/v1/admin/membership/redeem-logs`

#### 5.8.10 人工会员补偿

- 方法：`POST`
- 路径：`/api/v1/admin/membership/compensations`

请求字段建议：

- `user_id`
- `compensation_type`
- `days`
- `is_permanent`
- `reason`

### 5.9 系统设置

#### 5.9.1 获取基础设置

- 方法：`GET`
- 路径：`/api/v1/admin/settings/basic`

#### 5.9.2 更新基础设置

- 方法：`PUT`
- 路径：`/api/v1/admin/settings/basic`

#### 5.9.3 获取展示设置

- 方法：`GET`
- 路径：`/api/v1/admin/settings/display`

#### 5.9.4 更新展示设置

- 方法：`PUT`
- 路径：`/api/v1/admin/settings/display`

#### 5.9.5 获取上传设置

- 方法：`GET`
- 路径：`/api/v1/admin/settings/upload`

#### 5.9.6 更新上传设置

- 方法：`PUT`
- 路径：`/api/v1/admin/settings/upload`

### 5.10 存储配置

#### 5.10.1 获取存储配置

- 方法：`GET`
- 路径：`/api/v1/admin/settings/storage`

返回字段建议：

- `default_provider`
- `local`
- `s3`
- `tencent_cos`
- `ftp`

#### 5.10.2 更新存储配置

- 方法：`PUT`
- 路径：`/api/v1/admin/settings/storage`

请求字段建议：

```json
{
  "default_provider": "s3",
  "providers": {
    "local": {},
    "s3": {},
    "tencent_cos": {},
    "ftp": {}
  }
}
```

#### 5.10.3 测试存储连接

- 方法：`POST`
- 路径：`/api/v1/admin/settings/storage/test`

请求字段：

- `provider`
- `config`

返回字段：

- `success`
- `message`

### 5.11 字典配置

#### 5.11.1 字典列表

- 方法：`GET`
- 路径：`/api/v1/admin/dictionaries`

查询参数：

- `type`
- `status`

#### 5.11.2 新增字典项

- 方法：`POST`
- 路径：`/api/v1/admin/dictionaries`

#### 5.11.3 更新字典项

- 方法：`PUT`
- 路径：`/api/v1/admin/dictionaries/{id}`

#### 5.11.4 删除字典项

- 方法：`DELETE`
- 路径：`/api/v1/admin/dictionaries/{id}`

## 6. 关键响应模型建议

### 6.1 用户模型

```json
{
  "user_id": "u_1001",
  "nickname": "优学用户_7829",
  "avatar": "https://cdn.example.com/avatar.png",
  "phone": "138****0000",
  "membership_status": "vip",
  "membership_expired_at": "2026-08-31 23:59:59",
  "account_status": "normal"
}
```

### 6.2 课程模型

```json
{
  "course_id": "c_1001",
  "course_type": "sync",
  "title": "高一数学人教A版：集合的概念与运算法则",
  "subject": "math",
  "grade": "high_1",
  "term": "1",
  "version": "renjiao_a",
  "teacher_name": "王老师",
  "access_type": "vip",
  "status": "published",
  "cover_url": "https://cdn.example.com/course-cover.png"
}
```

### 6.3 激活码模型

```json
{
  "code_id": "ac_1001",
  "batch_no": "B20260323001",
  "code": "ABCD-EFGH-IJKL",
  "package_name": "90天VIP",
  "status": "unused",
  "expired_at": "2026-12-31 23:59:59",
  "source_channel": "douyin"
}
```

### 6.4 资源模型

```json
{
  "asset_id": "as_1001",
  "provider": "s3",
  "origin_name": "lesson-1.mp4",
  "mime_type": "video/mp4",
  "size": 104857600,
  "object_key": "courses/videos/lesson-1.mp4",
  "public_url": "https://cdn.example.com/courses/videos/lesson-1.mp4"
}
```

## 7. 业务校验规则

### 7.1 激活码兑换

- 未登录不可兑换。
- 已使用、已过期、已作废激活码必须返回明确错误。
- 同一请求重复提交不能重复加时。

### 7.2 课程发布

- 未配置封面、权限、至少一个有效课时，不允许发布。
- 课时绑定的视频资源不存在时，不允许发布。

### 7.3 存储配置

- 设为默认驱动前必须先通过连接测试。
- 仅允许一个默认上传驱动。
- 密钥更新建议支持“保持原值”模式。

## 8. 联调优先级建议

### 第一批优先联调

- 后台登录
- 课程列表/新增/编辑/发布
- 课时管理
- 资源上传
- 前台首页
- 前台课程详情
- 前台课时播放
- 激活码兑换

### 第二批补充联调

- 用户详情与学习记录
- 会员套餐与人工补偿
- 展示设置
- 字典配置

## 9. 后续需补的接口文档细节

当前文档已经能支撑首版接口设计与分工，但正式开发前仍建议补充：

- 每个接口的完整请求示例
- 完整响应示例
- 字段枚举值定义
- 权限点清单
- 错误码对照表
- OpenAPI/Swagger 规范文件

---

本接口清单用于支撑首版前后端并行开发与联调。若后台菜单、课程模型、会员体系或存储策略发生变化，应同步更新“接口路径、字段建议、业务校验规则、联调优先级”四部分内容。
