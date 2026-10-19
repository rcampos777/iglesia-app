import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "./send";

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

/**
 * Código para vincular una cuenta con el registro anterior. Va al correo
 * que la iglesia YA tenía registrado. No dice a qué cuenta ni a qué
 * persona: quien lo reciba sin haberlo pedido puede ignorarlo.
 */
export async function sendIdentityCodeEmail(input: {
  to: string;
  code: string;
  claimId: string;
}): Promise<{ ok: boolean; error?: string }> {
  return sendEmail(
    {
      to: input.to,
      subject: "Tu código para vincular tu cuenta",
      html: `<p>Alguien pidió vincular una cuenta nueva de la app de la iglesia con el registro que tenemos con este correo.</p>
<p>Si fuiste tú, escribe este código en la app (vence en 15 minutos):</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:4px">${input.code}</p>
<p>Si no fuiste tú, ignora este mensaje: sin el código no se vincula nada.</p>`,
      templateCode: "identity_claim_code",
      relatedEntityType: "identity_claims",
      relatedEntityId: input.claimId,
    },
    // Se registra con el cliente de servicio: quien lo pide no puede leer
    // ni escribir el registro de envíos (y no debe ver a dónde fue).
    createAdminClient(),
  );
}
