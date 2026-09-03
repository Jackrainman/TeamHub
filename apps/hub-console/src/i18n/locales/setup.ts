export const zhSetup = {
  'fleet.section.robots': '机器人清单',
  'fleet.section.relay': '接力画布',
  'setup.title': '欢迎，先选个开局',
  'setup.subtitle':
    '第一次打开 TeamHub，选一种方式开始。选完自动配置，几秒后就绪；之后随时能在设置里改。',
  'setup.unclaimed.title': '检测到未认领的业务数据',
  'setup.unclaimed.desc':
    '检测到数据库里已有业务数据，但还没有部署配置。为了避免把旧数据误认领到新部署，初始化已暂停。请先由管理员备份并处理数据库，然后重新加载。',
  'setup.stateUnavailable.title': '暂时无法读取 TeamHub 设置',
  'setup.stateUnavailable.desc':
    '未能从服务端读取配置状态。为避免加载错误的模块，界面不会使用本地默认值继续。',
  'setup.stateUnavailable.retry': '重新读取',
  'setup.demo.title': '先试试（演示数据）',
  'setup.demo.desc': '带一套演示任务、机器人和排班，随便点不心疼。想先摸清楚它能干嘛，选这个。',
  'setup.demo.advanced': '高级',
  'setup.demo.advanced.identityLabel': '演示态也开登录制',
  'setup.demo.advanced.identityHint':
    '默认匿名，谁都能读能写。勾上则演示里也要先点名字才能写，用来预览登录制的样子。',
  'setup.demo.cta': '先试试',
  'setup.real.title': '直接安装（正式使用）',
  'setup.real.desc': '空白开始，录你们战队真实的任务和数据。正式用，选这个。',
  'setup.real.identity.question': '写操作要登录吗？',
  'setup.real.identity.identity': '登录制（推荐）',
  'setup.real.identity.identityHint': '认领 / 验收都留名。首次登录后须先设密码（至少 8 位）。',
  'setup.real.identity.anon': '匿名共用（最省事）',
  'setup.real.identity.anonHint':
    '不用登录，谁都能改、写操作不留名。暴露到内网时需要共享一个写口令。',
  'setup.real.cta': '直接安装',
  'setup.changeableHint': '之后随时可在 设置 → 部署配置 更改。',
  'setup.applying.title': '正在应用配置，服务将自动重启（约 10 秒）',
  'setup.applying.desc': '这个页面会自动刷新，不用手动操作。',
  'setup.error.title': '没能完成初始化',
  'setup.error.desc': 'app_settings 可能没写成功。点下面重新加载再试一次。',
  'setup.error.timeout': '服务重启等得有点久。多半已经装好了，点下面重新加载看看。',
  'setup.error.retry': '重新加载',
  'setup.landing.title': '装好了，三步就能开始用',
  'setup.landing.steps': '① 导入名册　② 登录你自己　③ 初始化管理员——都在下面这一页完成。',
  'setup.landing.dismiss': '知道了',
};

export const enSetup = {
  'fleet.section.robots': 'Robots',
  'fleet.section.relay': 'Relay board',
  'setup.title': 'Welcome — pick how to start',
  'setup.subtitle':
    'First time opening TeamHub. Choose a way to begin; it configures itself and is ready in seconds. Change this anytime in Settings.',
  'setup.unclaimed.title': 'Unclaimed business data detected',
  'setup.unclaimed.desc':
    'This database already contains business data but has no deployment configuration. To avoid claiming old data into a new deployment by mistake, initialization is paused. Ask an administrator to back up and resolve the database, then reload.',
  'setup.stateUnavailable.title': 'Unable to read TeamHub settings',
  'setup.stateUnavailable.desc':
    'The configuration state could not be read from the server. To avoid loading the wrong modules, the console will not continue with local defaults.',
  'setup.stateUnavailable.retry': 'Read again',
  'setup.demo.title': 'Try it first (demo data)',
  'setup.demo.desc':
    'Comes with sample tasks, robots and schedules — click around freely. Pick this to see what it does.',
  'setup.demo.advanced': 'Advanced',
  'setup.demo.advanced.identityLabel': 'Turn on login in demo too',
  'setup.demo.advanced.identityHint':
    'Anonymous by default — anyone can read and write. Check this to require picking your name before writing, to preview the login mode.',
  'setup.demo.cta': 'Try it first',
  'setup.real.title': 'Install now (real use)',
  'setup.real.desc':
    "Start blank and enter your team's real tasks and data. Pick this for production use.",
  'setup.real.identity.question': 'Require login to write?',
  'setup.real.identity.identity': 'Login (recommended)',
  'setup.real.identity.identityHint':
    'Claims and reviews are attributed. On first login you set a password (8+ characters).',
  'setup.real.identity.anon': 'Anonymous (simplest)',
  'setup.real.identity.anonHint':
    "No login — anyone can edit and writes aren't attributed. Needs a shared write passphrase when exposed on a LAN.",
  'setup.real.cta': 'Install now',
  'setup.changeableHint': 'Change anytime under Settings → Deployment config.',
  'setup.applying.title':
    'Applying config — the service will restart automatically (about 10s)',
  'setup.applying.desc': 'This page refreshes on its own; nothing to do.',
  'setup.error.title': "Couldn't finish setup",
  'setup.error.desc': 'app_settings may not have been written. Reload below and try again.',
  'setup.error.timeout':
    'The restart is taking a while. It probably already installed — reload below to check.',
  'setup.error.retry': 'Reload',
  'setup.landing.title': "You're set — three steps to get going",
  'setup.landing.steps':
    '(1) Import the roster  (2) Log in as yourself  (3) Initialize an admin — all on this page below.',
  'setup.landing.dismiss': 'Got it',
};
