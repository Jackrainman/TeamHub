// D-052 重复真相收口：deriveErrorCode 下沉 @teamhub/hub-contracts（与 hub-console mock 共用同一源），
// 此处保留 re-export 维持既有 import 路径（server.ts / import/import-debug-archive.ts / 测试 仍 from './kb/error-code.js'）。
export { deriveErrorCode } from '@teamhub/hub-contracts';
