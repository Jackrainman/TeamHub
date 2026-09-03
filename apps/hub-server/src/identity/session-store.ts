import { randomBytes } from 'node:crypto';
import type { SessionIdentity } from '@teamhub/hub-contracts';

/**
 * 服务端内存会话表（IDENTITY-LITE，D-083 §4.2）。**家庭影院级重量**：随机 token → 身份映射，带 TTL；
 * 存在**内存**——进程重启 = 全员重登（可接受，小作坊内网单实例；不引 Redis / 不落盘 token）。
 *
 * **密钥纪律**：token 是不可预测的 32 字节随机十六进制串；只存 memberId 投影身份（SessionIdentity，无
 * pinHash）；resolve 过 TTL 即删（惰性驱逐）。
 */
interface SessionEntry {
  identity: SessionIdentity;
  expiresAt: number;
  /** AUTH-LOGIN-USERNAME 旧短 PIN 强制升级：本次登录用的是 <8 位旧 PIN → true。
   *  auth-gate 视其同 mustSetPin（只放行设 PIN/session）；PUT 本人 pin 成功后清标记。 */
  pinUpgradeRequired: boolean;
}

export class SessionManager {
  private readonly sessions = new Map<string, SessionEntry>();

  constructor(private readonly ttlMs: number) {}

  /** 登录成功签发：生成随机 token、登记身份 + 过期时刻，返回 token（写进 httpOnly cookie）。 */
  create(identity: SessionIdentity, opts?: { pinUpgradeRequired?: boolean }): string {
    const token = randomBytes(32).toString('hex');
    this.sessions.set(token, {
      identity,
      expiresAt: Date.now() + this.ttlMs,
      pinUpgradeRequired: opts?.pinUpgradeRequired ?? false,
    });
    return token;
  }

  /** 解析 token → 当前身份；不存在 / 已过期 → null（过期条目惰性删除）。 */
  resolve(token: string): SessionIdentity | null {
    const entry = this.sessions.get(token);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      this.sessions.delete(token);
      return null;
    }
    return entry.identity;
  }

  /** 登出：销毁该 token（幂等——不存在也不报错）。 */
  destroy(token: string): void {
    this.sessions.delete(token);
  }

  /** 该 token 会话是否挂着「旧短 PIN 强制升级」标记（auth-gate / GET session 的 mustSetPin 判定用）。 */
  isPinUpgradeRequired(token: string): boolean {
    const entry = this.sessions.get(token);
    if (!entry) return false;
    if (Date.now() >= entry.expiresAt) {
      this.sessions.delete(token);
      return false;
    }
    return entry.pinUpgradeRequired;
  }

  /** PUT 本人 pin 成功后调用：清掉该成员**所有在途会话**的升级标记（同会话立即解禁）。 */
  clearPinUpgrade(memberId: string): void {
    for (const entry of this.sessions.values()) {
      if (entry.identity.memberId === memberId) entry.pinUpgradeRequired = false;
    }
  }
}
