/**
 * Respons 401 kunci situs (dituju lewat rewrite dari proxy). Header WWW-Authenticate harus dikirim dari route handler:
 * di Vercel, header ini dibuang kalau respons 401 dibuat langsung di proxy → browser tidak memunculkan kotak login.
 */
function locked() {
  return new Response("Situs uji coba Rilisin — butuh username & password dari tim.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Rilisin (uji coba)", charset="UTF-8"',
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
      "Cache-Control": "no-store",
    },
  });
}
export const GET = locked;
export const HEAD = locked;
export const POST = locked;
export const PUT = locked;
export const PATCH = locked;
export const DELETE = locked;
export const OPTIONS = locked;
