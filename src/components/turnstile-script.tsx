import { headers } from "next/headers";

/** Muat script Turnstile dengan nonce CSP halaman ini (CSP memakai 'strict-dynamic'). Render hanya di halaman yang butuh. */
export async function TurnstileScript() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer nonce={nonce} />;
}
