/**
 * Script de prueba de correos (Resend).
 *
 * Envía los 3 casos de correo a una lista de destinatarios de prueba, para
 * verificar la entrega end-to-end (dominio verificado, API key, plantillas).
 *
 * Ejecutar en la consola de Railway (o local):
 *   node backend/scripts/test-emails.js
 *   npm run test:emails
 *
 * Destinatarios: por defecto los de abajo; se pueden sobreescribir por argumentos:
 *   node backend/scripts/test-emails.js otro@correo.com,mas@correo.com
 *
 * Requiere RESEND_API_KEY (y RESEND_FROM con dominio verificado). Si falta la key,
 * el mailer lo avisa y los envíos se omiten — el script lo reporta.
 */
require('dotenv').config();

const {
  sendBoothConfirmation,
  sendWelcomeEmail,
  sendAdminBoothNotification,
} = require('../lib/mailer');
const { frontendUrl } = require('../lib/urls');

const DEFAULT_RECIPIENTS = ['gabriel.leal.n1@gmail.com', 'adrian.sgone@gmail.com'];

const recipients = (process.argv[2] ? process.argv[2].split(',') : DEFAULT_RECIPIENTS)
  .map((e) => e.trim())
  .filter(Boolean);

async function main() {
  if (!process.env.RESEND_API_KEY) {
    console.error('\n✖ RESEND_API_KEY no está definida — no se enviará ningún correo.');
    console.error('  Define la variable en Railway (o en .env local) y vuelve a ejecutar.\n');
    process.exit(1);
  }

  console.log('\n=== Prueba de correos (Resend) ===');
  console.log('Remitente (RESEND_FROM):', process.env.RESEND_FROM || '(default por función)');
  console.log('Destinatarios:', recipients.join(', '));
  console.log('====================================\n');

  const activationName = 'Best Booth Award (PRUEBA)';
  const boothName = 'Stand de Prueba';
  const profileUrl = `${frontendUrl()}/activations/best-booth-award/stand-de-prueba/profile`;

  for (const to of recipients) {
    console.log(`\n--- Enviando los 3 casos a: ${to} ---`);

    // Caso 1: confirmación al vendedor
    try {
      await sendBoothConfirmation({ to, boothName, activationName, profileUrl });
    } catch (e) {
      console.error(`[script] booth confirmation lanzó excepción para ${to}:`, e.message);
    }

    // Caso 2: aviso al admin. La función envía a ACTIVATIONS_ADMIN_NOTIFY_EMAIL,
    // así que lo redirigimos temporalmente al destinatario de prueba.
    const prevNotify = process.env.ACTIVATIONS_ADMIN_NOTIFY_EMAIL;
    process.env.ACTIVATIONS_ADMIN_NOTIFY_EMAIL = to;
    try {
      await sendAdminBoothNotification({
        boothName,
        activationName,
        contactEmail: to,
        contactPhone: '+1 555 0100',
        instagramHandle: 'stand_prueba',
        profileUrl,
      });
    } catch (e) {
      console.error(`[script] admin notification lanzó excepción para ${to}:`, e.message);
    } finally {
      if (prevNotify === undefined) delete process.env.ACTIVATIONS_ADMIN_NOTIFY_EMAIL;
      else process.env.ACTIVATIONS_ADMIN_NOTIFY_EMAIL = prevNotify;
    }

    // Caso 3: welcome del opt-in
    try {
      await sendWelcomeEmail({ to });
    } catch (e) {
      console.error(`[script] welcome lanzó excepción para ${to}:`, e.message);
    }
  }

  console.log('\n=== Fin. Revisa los logs de arriba y las bandejas (incluido spam). ===');
  console.log('Un "enviado OK -> id ..." por caso = Resend aceptó el envío.\n');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Fallo inesperado del script:', e);
    process.exit(1);
  });
