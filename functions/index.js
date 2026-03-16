const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

admin.initializeApp();

exports.setVendorPassword = onCall({ region: 'us-central1' }, async (request) => {
  // Only authenticated admins can call this
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Usuário não autenticado');
  }

  const callerUid = request.auth.uid;
  const db = admin.firestore();

  // Verify the caller is an admin
  const callerDoc = await db.collection('users').doc(callerUid).get();
  if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
    throw new HttpsError('permission-denied', 'Apenas administradores podem redefinir senhas');
  }

  const { vendorUid, newPassword } = request.data;

  if (!vendorUid || !newPassword || newPassword.length < 6) {
    throw new HttpsError('invalid-argument', 'UID do vendedor e senha (mín. 6 chars) são obrigatórios');
  }

  try {
    // Try to update existing user password
    await admin.auth().updateUser(vendorUid, { password: newPassword });
    return { success: true, action: 'updated', message: 'Senha atualizada com sucesso' };
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      // User doesn't exist in Auth — get their email from Firestore and create
      const vendorDoc = await db.collection('users').doc(vendorUid).get();
      if (!vendorDoc.exists) {
        throw new HttpsError('not-found', 'Vendedor não encontrado no banco de dados');
      }
      const vendorData = vendorDoc.data();
      const email = vendorData.email;
      if (!email) {
        throw new HttpsError('failed-precondition', 'Vendedor não tem email cadastrado');
      }

      // Create the Firebase Auth user
      const newUser = await admin.auth().createUser({
        uid: vendorUid,
        email: email,
        password: newPassword,
        displayName: vendorData.nome || '',
      });

      return { success: true, action: 'created', message: `Conta criada para ${email}`, uid: newUser.uid };
    }
    throw new HttpsError('internal', err.message || 'Erro ao redefinir senha');
  }
});
