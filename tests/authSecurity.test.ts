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

  // 4. First-run admin claim + trava definitiva + validações + preservação no resetToSeed (em DB isolado)
  const prevEnvPass = process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_PASSWORD;
  try {
    const isolated = new DatabaseService({ disableDisk: true, disableSupabase: true });
    assert.equal(isolated.hasAdminClaimedPassword(), false);

    // E-mail inválido deve falhar com 400
    assert.throws(
      () => isolated.claimInitialAdminPassword('MinhaSenhaAdmin#99', 'email-invalido'),
      /e-mail válido/
    );

    // Conflito com e-mail de conta não-admin (aluno) deve falhar com 409 e não ser ignorado silenciosamente
    assert.throws(
      () => isolated.claimInitialAdminPassword('MinhaSenhaAdmin#99', 'ana.lisboa@gmail.com'),
      /já está em uso por outra conta/
    );
    assert.equal(isolated.hasAdminClaimedPassword(), false);

    // Senha curta deve falhar
    assert.throws(
      () => isolated.claimInitialAdminPassword('1234567', 'admin.lojinha@gmail.com'),
      /mínimo 8 caracteres/
    );

    // Claim válido com e-mail customizado livre deve atualizar o e-mail e salvar hash scrypt
    const admin = isolated.claimInitialAdminPassword('MinhaSenhaAdmin#99', 'novo.admin@iceves.org');
    assert.equal(admin.email, 'novo.admin@iceves.org');
    assert.ok(isScryptHash(admin.password), 'Senha do admin deve ser salva como hash scrypt');
    assert.equal(isolated.hasAdminClaimedPassword(), true);
    assert.equal(isolated.getPrimaryAdminEmail(), 'novo.admin@iceves.org');

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

    // Claim quando há uma segunda conta ADMIN existente e o usuário informa o e-mail dela
    const isolatedMultiAdmin = new DatabaseService({ disableDisk: true, disableSupabase: true });
    isolatedMultiAdmin.getUsers().push({
      id: 'user-admin-2',
      name: 'Diretor Secundário',
      email: 'diretor@iceves.org',
      role: 'ADMIN',
      createdAt: new Date().toISOString(),
    });
    const claimedSecond = isolatedMultiAdmin.claimInitialAdminPassword('DiretorForte#2026', 'diretor@iceves.org');
    assert.equal(claimedSecond.id, 'user-admin-2');
    assert.equal(claimedSecond.email, 'diretor@iceves.org');
    assert.equal(verifyPassword('DiretorForte#2026', claimedSecond.password), true);
    assert.equal(isolatedMultiAdmin.getPrimaryAdminEmail(), 'diretor@iceves.org');
  } finally {
    if (prevEnvPass !== undefined) process.env.ADMIN_PASSWORD = prevEnvPass;
  }
  console.log('✅ [PASS] A4 — Primeiro acesso valida e-mail/conflito, suporta admin secundário, trava após uso único e preserva hash no reset');

  // 5. Fluxo completo das rotas HTTP /api/auth/bootstrap-status -> /api/auth/setup-admin -> /api/auth/login -> /api/auth/me
  const { db } = await import('../src/server/db.ts');
  const { mapUserToSupabase, mapUserFromSupabase } = await import('../src/server/supabase.ts');
  const dbSnapshot = db.takeSnapshot();
  const prevSupaActive = db.getSettings().supabaseActive;
  const prevEnvPassRoute = process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_PASSWORD;
  try {
    db.getSettings().supabaseActive = false;
    // Simula ambiente limpo sem nenhuma senha de admin gravada
    for (const u of db.getUsers()) {
      if (u.role === 'ADMIN') delete u.password;
    }

    const statusBefore = await handleApiRoute({ method: 'GET', url: '/api/auth/bootstrap-status' });
    assert.equal(statusBefore.status, 200);
    assert.equal(statusBefore.data.adminSetupRequired, true);

    // confirmPassword divergente ou vazio deve retornar 400
    const badConfirmRes = await handleApiRoute({
      method: 'POST',
      url: '/api/auth/setup-admin',
      body: { email: 'admin.lojinha@gmail.com', password: 'SenhaInicial#2026', confirmPassword: '' },
    });
    assert.equal(badConfirmRes.status, 400);

    // Setup inicial válido deve retornar 201 com token válido e sem vazar password
    const setupRes = await handleApiRoute({
      method: 'POST',
      url: '/api/auth/setup-admin',
      body: {
        email: 'admin.lojinha@gmail.com',
        password: 'SenhaInicial#2026',
        confirmPassword: 'SenhaInicial#2026',
      },
    });
    assert.equal(setupRes.status, 201);
    assert.ok(setupRes.data.token);
    assert.equal(setupRes.data.user.email, 'admin.lojinha@gmail.com');
    assert.equal(setupRes.data.user.password, undefined);

    // Bootstrap status agora deve retornar adminSetupRequired: false
    const statusAfter = await handleApiRoute({ method: 'GET', url: '/api/auth/bootstrap-status' });
    assert.equal(statusAfter.status, 200);
    assert.equal(statusAfter.data.adminSetupRequired, false);

    // Segunda chamada ao setup-admin deve retornar 403 com alreadyConfigured: true
    const secondSetup = await handleApiRoute({
      method: 'POST',
      url: '/api/auth/setup-admin',
      body: {
        email: 'admin.lojinha@gmail.com',
        password: 'OutraSenha#2026',
        confirmPassword: 'OutraSenha#2026',
      },
    });
    assert.equal(secondSetup.status, 403);
    assert.equal(secondSetup.data.alreadyConfigured, true);

    // Token emitido no setup deve autenticar imediatamente em /api/auth/me
    const payload = verifySessionToken(`Bearer ${setupRes.data.token}`);
    assert.ok(payload);
    const resolved = db.resolveUserById(payload.sub);
    const meRes = await handleApiRoute({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${setupRes.data.token}` },
      user: resolved,
    });
    assert.equal(meRes.status, 200);
    assert.equal(meRes.data.user.email, 'admin.lojinha@gmail.com');

    // Login com a senha recém-criada deve funcionar (200)
    const loginRes = await handleApiRoute({
      method: 'POST',
      url: '/api/auth/login',
      body: { email: 'admin.lojinha@gmail.com', password: 'SenhaInicial#2026' },
    });
    assert.equal(loginRes.status, 200);
    assert.ok(loginRes.data.token);

    // Admin secundário sem senha NÃO deve disparar loop adminSetupRequired: true quando já existe admin configurado
    db.getUsers().push({
      id: 'user-admin-sem-senha',
      name: 'Admin Sem Senha',
      email: 'admin2.teste@iceves.org',
      role: 'ADMIN',
      createdAt: new Date().toISOString(),
    });
    const secondAdminLogin = await handleApiRoute({
      method: 'POST',
      url: '/api/auth/login',
      body: { email: 'admin2.teste@iceves.org', password: 'QualquerSenha#123' },
    });
    assert.equal(secondAdminLogin.status, 401);
    assert.equal(secondAdminLogin.data.adminSetupRequired, false);

    // Mapeamento Supabase de usuário deve preservar password_hash ida e volta
    const mappedRow = mapUserToSupabase(db.getUsers().find(u => u.id === 'user-admin'));
    assert.ok(isScryptHash(mappedRow.password_hash), 'mapUserToSupabase deve incluir password_hash scrypt');
    const roundTripUser = mapUserFromSupabase(mappedRow);
    assert.equal(roundTripUser.password, mappedRow.password_hash);
  } finally {
    db.restoreSnapshot(dbSnapshot);
    db.getSettings().supabaseActive = prevSupaActive;
    if (prevEnvPassRoute !== undefined) process.env.ADMIN_PASSWORD = prevEnvPassRoute;
  }
  console.log('✅ [PASS] A5 — Fluxo completo bootstrap -> setup-admin -> /api/auth/me -> login + ausência de loop em admin secundário + mapeamento Supabase');

  // 6. RBAC: Usuário STUDENT não consegue acessar rotas administrativas (403)
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
  console.log('✅ [PASS] A6 — RBAC bloqueia rotas administrativas para perfis não-admin (HTTP 403)');

  console.log('\n=====================================================================');
  console.log('RESUMO SEGURANÇA: 6/6 VERIFICAÇÕES APROVADAS');
  console.log('=====================================================================\n');
}

main().catch(err => {
  console.error('❌ Falha no teste de segurança:', err);
  process.exit(1);
});
