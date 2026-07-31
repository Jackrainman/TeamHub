import { ARTIFACT_ACCEPT_EXT } from '../../../verticals/robotics';

// 上传文件后缀白名单（与 server ARTIFACT_ALLOWED_EXT 对齐）：CAD / 文档 / 图 / 包 / 固件。
// 前端 accept 仅是提示，真正把关在 server（415）。
export const ARTIFACT_ACCEPT = ARTIFACT_ACCEPT_EXT.join(',');
