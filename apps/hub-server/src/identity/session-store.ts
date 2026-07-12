import { randomBytes } from 'node:crypto';
import type { SessionIdentity } from '@teamhub/hub-contracts';

/**
 * 服务端内存会话表（IDENTITY-LITE，D-083 §4.2）。**家庭影院级重量**：随机 token → 身份映射，带 TTL；
 * 存在**内存**——进程重启 = 全员重登（可接受，小作坊内网单实例；不引 Redis / 不落盘 token）。
 *
 * **密钥纪律**：token 是不可预测的 32 字节随机十六进制串；只存 memberId 投影身份（SessionIdentity，无
 * pinHash）；resolve 过 TTL 即删（惰性驱逐）。
 */
export class SessionManager {
  private readonly sessions = new Map<
    string,
    { identity: SessionIdentity; expiresAt: number }
  >();

  constructor(private readonly ttlMs: number) {}

  /** 登录成功签发：生成随机 token、登记身份 + 过期时刻，返回 token（写进 httpOnly cookie）。 */
  create(identity: SessionIdentity): string {
    const token = randomBytes(32).toString('hex');
    this.sessions.set(token, { identity, expiresAt: Date.now() + this.ttlMs });
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
}
