-- 0004_file_links.sql
-- 为「文件/视频转链接」新增的列：
--   type      : url | file | video（旧数据视为 url）
--   file_key  : R2 对象 Key（如 files/ab12cd/hk3....mp4）
--   file_name : 原始文件名（下载/播放页展示用）
--   file_type : MIME 类型（冗余存储，R2 httpMetadata 之外兜底）
--   file_size : 文件字节数
-- 过期时间与密码复用已有列：expiration / password

ALTER TABLE links ADD COLUMN type text;
ALTER TABLE links ADD COLUMN file_key text;
ALTER TABLE links ADD COLUMN file_name text;
ALTER TABLE links ADD COLUMN file_type text;
ALTER TABLE links ADD COLUMN file_size integer;

-- 可选：为文件链接查询建索引（file_key 非空场景较少，通常不需要）
-- CREATE INDEX IF NOT EXISTS links_file_key_idx ON links (file_key);
