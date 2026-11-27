import assert from 'node:assert/strict';
import {
  hashPassword,
  isScryptHash,
  issueSessionToken,
  revokeSessionToken,
  verifyPassword,
  verifySessionToken,
} from '../src/server/auth.ts';
import { DatabaseService } from '../src/server/db.ts';
import { handleApiRoute } from '../src/server/handler.ts';

async function main() {
  console.log('\n=====================================================================');
  console.log('TESTES DE SEGURANÇA & BLOQUEIO DE LOGIN — LOJINHA ICEVES');
  console.log('=====================================================================\n');

  // 1. Bloqueio de rotas protegidas sem autenticação (401)
  const unauthRoutes = [
    { method: 'GET', url: '/api/sales' },
    { method: 'GET', url: '/api/products' },
    { method: 'GET', url: '/api/students' },
    { method: 'GET', url: '/api/settings' },
    { method: 'GET', url: '/api/audit' },
    { method: 'POST', url: '/api/reset-data' },
  ];

  for (const r of unauthRoutes) {
    const res = await handleApiRoute({
      method: r.method,
      url: r.url,
      headers: { 'x-user-id': 'user-admin' }, // Cabeçalho forjado deve ser ignorado
      user: undefined,
    });
    assert.equal(res.status, 401, `Rota ${r.method} ${r.url} deve retornar 401 sem sessão válida`);
  }
  console.log('✅ [PASS] A1 — Todas as rotas protegidas bloqueiam acesso sem autenticação (HTTP 401) mesmo com x-user-id forjado');

  // 2. Hash scrypt + verificação segura
  const hashed = hashPassword('SenhaForte#2026');
  assert.ok(isScryptHash(hashed), 'Hash deve usar formato scrypt$salt$derived');
  assert.notEqual(hashed, 'SenhaForte#2026');
  assert.equal(verifyPassword('SenhaForte#2026', hashed), true);
  assert.equal(verifyPassword('SenhaErrada', hashed), false);
  console.log('✅ [PASS] A2 — Hashing scrypt com salt aleatório e verificação em tempo constante');

  // 3. Assinatura, validação, adulteração e revogação de Bearer token
  const session = issueSessionToken({ id: 'user-admin', role: 'ADMIN', email: 'admin.lojinha@gmail.com' });
  const verified = verifySessionToken(`Bearer ${session.token}`);
  assert.ok(verified);
  assert.equal(verified.sub, 'user-admin');
  assert.equal(verified.role, 'ADMIN');

  // Token adulterado deve ser rejeitado
  const tampered = `${session.token.slice(0, -4)}AAAA`;
  assert.equal(verifySessionToken(`Bearer ${tampered}`), null);

  // Revogação no logout deve invalidar o token imediatamente
  revokeSessionToken(`Bearer ${session.token}`);
  assert.equal(verifySessionToken(`Bearer ${session.token}`), null);
  console.log('✅ [PASS] A3 — Emissão, rejeição de adulteração e revogação imediata de token Bearer');

  // 4. First-run admin claim + trava definitiva + preservação no resetToSeed (em DB isolado)
  const prevEnvPass = process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_PASSWORD;
  try {
    const isolated = new DatabaseService({ disableDisk: true, disableSupabase: true });
    assert.equal(isolated.hasAdminClaimedPassword(), false);

    const admin = isolated.claimInitialAdminPassword('MinhaSenhaAdmin#99');
    assert.ok(isScryptHash(admin.password), 'Senha do admin deve ser salva como hash scrypt');
    assert.equal(isolated.hasAdminClaimedPassword(), true);

    // Segunda tentativa de claim DEVE falhar
    assert.throws(
      () => isolated.claimInitialAdminPassword('OutraSenha#999'),
      /já foi configurada/
    );

    // resetToSeed deve preservar o hash da senha administrativa
    isolated.resetToSeed({ id: admin.id, name: admin.name, role: 'ADMIN' });
    assert.equal(isolated.hasAdminClaimedPassword(), true);
    const adminAfterReset = isolated.getUsers().find(u => u.id === 'user-admin')!;
    assert.equal(verifyPassword('MinhaSenhaAdmin#99', adminAfterReset.password), true);
  } finally {
    if (prevEnvPass !== undefined) process.env.ADMIN_PASSWORD = prevEnvPass;
  }
  console.log('✅ [PASS] A4 — Primeiro acesso trava após uso único e preserva hash do admin no reset');

  // 5. RBAC: Usuário STUDENT não consegue acessar rotas administrativas (403)
  const studentRes = await handleApiRoute({
    method: 'POST',
    url: '/api/reset-data',
    user: { id: 'user-student-1', name: 'Ana Vitória Lisboa', role: 'STUDENT', studentId: 'student-1' },
  });
  assert.equal(studentRes.status, 403);

  const studentSyncRes = await handleApiRoute({
    method: 'POST',
    url: '/api/supabase/sync-push',
    user: { id: 'user-student-1', name: 'Ana Vitória Lisboa', role: 'STUDENT', studentId: 'student-1' },
  });
  assert.equal(studentSyncRes.status, 403);
  console.log('✅ [PASS] A5 — RBAC bloqueia rotas administrativas para perfis não-admin (HTTP 403)');

  console.log('\n=====================================================================');
  console.log('RESUMO SEGURANÇA: 5/5 VERIFICAÇÕES APROVADAS');
  console.log('=====================================================================\n');
}

main().catch(err => {
  console.error('❌ Falha no teste de segurança:', err);
  process.exit(1);
});
