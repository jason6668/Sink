CREATE TABLE IF NOT EXISTS `license_codes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `code` text NOT NULL UNIQUE,
  `status` text NOT NULL DEFAULT 'unused',
  `device_id` text,
  `license_token_hash` text,
  `created_at` integer NOT NULL,
  `activated_at` integer,
  `revoked_at` integer,
  `note` text
);
CREATE INDEX IF NOT EXISTS `license_codes_status_idx` ON `license_codes` (`status`);
CREATE INDEX IF NOT EXISTS `license_codes_device_idx` ON `license_codes` (`device_id`);
