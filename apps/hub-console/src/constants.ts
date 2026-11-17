

/**
 * localStorage key used to override the API base URL.
 * App.tsx reads it at startup; SettingsPage.tsx writes/clears it.
 */
export const APIBASE_KEY = 'teamhub.apiBase';

/**
 * localStorage key for the write token (Bearer) sent on POST /api/* writes.
 * Server requires it when bound to a non-loopback host (0.0.0.0). App.tsx reads
 * it at startup; SettingsPage.tsx writes/clears it. Empty → no Authorization header.
 */
export const WRITE_TOKEN_KEY = 'teamhub.writeToken';

/**
 * localStorage key: 首启动向导（SETUP-WIZARD 刀②）提交并重启完成后、整页刷新前写入的落点提示。
 * 只在「正式 + 登录制」组合下写值 `'roster'`——重启后 ConsoleApp 首屏据此落到设置页 + 亮出
 * 「三步走：导入名册 → 登录本人 → 初始化管理员」引导横幅（复用现有流程，不重复实现）。读到即清除，
 * 只出现一次。其余组合（试驾 / 正式+匿名）不写值，落点走各自默认（总览页）。
 */
export const SETUP_LANDING_KEY = 'teamhub.setup.landing';


// B5 图标尺寸三档（design-language §6）：全站 lucide-react 统一用这三档，禁散落魔法数字。
export const ICON_SM = 12;
export const ICON_MD = 14;
export const ICON_LG = 16;
