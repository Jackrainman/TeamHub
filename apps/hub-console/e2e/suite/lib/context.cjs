const BASE_CONTEXT = { reducedMotion: 'reduce', locale: 'zh-CN', timezoneId: 'Asia/Shanghai' };

function contextOptions(overrides = {}) {
  return { ...BASE_CONTEXT, ...overrides };
}

module.exports = { contextOptions };
