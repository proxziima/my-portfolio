import { photonIMessageChannel } from 'eve/channels/photon'
import { photonCredentials } from '../lib/imessage'
import { handleOwnerMessage } from '../lib/photon-inbound'

// Read when the module loads, as eve's Photon example does (the one env read outside getEnv); eve
// re-imports channel modules in the runtime process, so the runtime value is the one used. Unset,
// a rejecting verifier replaces eve's Vercel OIDC fallback, which this self-hosted app doesn't use.
// With iMessage off, a delivery already fails when the adapter initialises: the credentials throw.
const webhookSecret = process.env.IMESSAGE_WEBHOOK_SECRET?.trim()

/**
 * iMessage through Photon: the owner's replies to approval requests. Reached only through the web
 * app's forwarder (`/api/twin/hooks/photon`), like the other webhooks; the adapter verifies the
 * `X-Spectrum-Signature` HMAC itself.
 */
export default photonIMessageChannel({
  credentials: photonCredentials,
  route: '/webhooks/photon',
  ...(webhookSecret ? { webhookSecret } : { webhookVerifier: () => false }),
  onMessage: handleOwnerMessage,
})
