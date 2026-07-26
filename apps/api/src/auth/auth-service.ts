import { randomBytes, randomUUID, createHash } from 'node:crypto';
import type { PrismaClient, MembershipRole } from '@rda/database';

export interface TenantContext { userId: string; organizationId: string; restaurantId: string; permittedBranchIds: string[]; role: MembershipRole; sessionId: string }
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const expiry = () => new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
const argon2 = async () => (await import('argon2')).default;

export class AuthService {
  public constructor(private readonly db: PrismaClient) {}
  public async register(input: { email: string; password: string; displayName: string; organizationName: string; restaurantName: string }) {
    const crypto = await argon2();
    const passwordHash = await crypto.hash(input.password, { type: crypto.argon2id });
    const organizationId = randomUUID(); const restaurantId = randomUUID(); const userId = randomUUID();
    return this.db.$transaction(async (tx) => {
      await tx.user.create({ data: { id: userId, email: input.email.toLowerCase(), passwordHash, displayName: input.displayName } });
      await tx.organization.create({ data: { id: organizationId, name: input.organizationName, slug: `${input.organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${organizationId.slice(0, 8)}` } });
      await tx.restaurant.create({ data: { id: restaurantId, organizationId, name: input.restaurantName, currency: 'CNY', timezone: 'Asia/Shanghai' } });
      await tx.membership.create({ data: { organizationId, restaurantId, userId, role: 'OWNER' } });
      return { userId, organizationId, restaurantId };
    });
  }
  public async authenticate(email: string, password: string) {
    const user = await this.db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.isActive || (user.lockedUntil && user.lockedUntil > new Date())) throw new Error('INVALID_CREDENTIALS');
    const crypto = await argon2();
    const valid = await crypto.verify(user.passwordHash, password).catch(() => false);
    if (!valid) { const attempts = user.failedLoginAttempts + 1; await this.db.user.update({ where: { id: user.id }, data: { failedLoginAttempts: attempts, lockedUntil: attempts >= 5 ? new Date(Date.now() + 15 * 60_000) : null } }); throw new Error('INVALID_CREDENTIALS'); }
    await this.db.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } }); return user;
  }
  public async createSession(userId: string) {
    const membership = await this.db.membership.findFirst({ where: { userId, restaurantId: { not: null } }, orderBy: { createdAt: 'asc' } });
    if (!membership?.restaurantId) throw new Error('NO_RESTAURANT_ACCESS');
    const token = randomBytes(32).toString('base64url');
    const session = await this.db.session.create({ data: { id: randomUUID(), organizationId: membership.organizationId, userId, tokenHash: hashToken(token), expiresAt: expiry() } }); return { token, sessionId: session.id };
  }
  public async resolveSession(token: string): Promise<TenantContext | null> {
    const session = await this.db.session.findUnique({ where: { tokenHash: hashToken(token) } }); if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
    const membership = await this.db.membership.findFirst({ where: { userId: session.userId, organizationId: session.organizationId, restaurantId: { not: null } }, orderBy: { createdAt: 'asc' } }); if (!membership?.restaurantId) return null;
    const branches = await this.db.membership.findMany({ where: { userId: session.userId, organizationId: session.organizationId, restaurantId: membership.restaurantId, branchId: { not: null } } });
    return { userId: session.userId, organizationId: session.organizationId, restaurantId: membership.restaurantId, permittedBranchIds: branches.flatMap((item) => item.branchId ? [item.branchId] : []), role: membership.role, sessionId: session.id };
  }
  public revokeSession(sessionId: string) { return this.db.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } }); }
  public revokeAllSessions(userId: string) { return this.db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }); }
  public async requestPasswordReset(email: string) {
    const user = await this.db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return null;
    const token = randomBytes(32).toString('base64url');
    await this.db.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    await this.db.passwordResetToken.create({ data: { id: randomUUID(), userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 30 * 60_000) } });
    return token;
  }
  public async resetPassword(token: string, password: string) {
    const record = await this.db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!record || record.usedAt || record.expiresAt <= new Date()) throw new Error('INVALID_RESET_TOKEN');
    const crypto = await argon2();
    const passwordHash = await crypto.hash(password, { type: crypto.argon2id });
    await this.db.$transaction([
      this.db.user.update({ where: { id: record.userId }, data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null } }),
      this.db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.db.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
  }
}
