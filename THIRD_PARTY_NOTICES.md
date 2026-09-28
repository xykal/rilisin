# THIRD_PARTY_NOTICES

Rilisin memuat komponen open-source pihak ketiga. Setiap komponen tetap di bawah
lisensinya masing-masing. License di bawah diverifikasi dari registry npm pada
2026-09-28 (versi sesuai rentang di `package.json`; versi pasti ada di
`package-lock.json`).

## Runtime dependencies

| Paket | Rentang | License |
|---|---|---|
| @vercel/blob | ^2.8.0 | Apache-2.0 |
| drizzle-orm | ^0.45.3 | Apache-2.0 |
| lucide-react | ^1.48.0 | ISC |
| next | 16.3.6 | MIT |
| postgres | ^3.4.9 | Unlicense |
| qrcode | ^1.5.4 | MIT |
| react | 19.2.8 | MIT |
| react-dom | 19.2.8 | MIT |
| react-markdown | ^10.1.0 | MIT |
| remark-gfm | ^4.0.1 | MIT |
| server-only | ^0.0.1 | MIT |
| sharp | ^0.35.4 | Apache-2.0 |
| zod | ^4.6.5 | MIT |

## Development dependencies

| Paket | Rentang | License |
|---|---|---|
| @tailwindcss/postcss | ^4 | MIT |
| @types/node | ^20 | MIT |
| @types/qrcode | ^1.5.6 | MIT |
| @types/react | ^19 | MIT |
| @types/react-dom | ^19 | MIT |
| dotenv | ^18.0.4 | BSD-2-Clause |
| drizzle-kit | ^0.31.11 | MIT |
| eslint | ^9 | MIT |
| eslint-config-next | 16.3.6 | MIT |
| fflate | ^0.8.3 | MIT |
| playwright | ^1.63.0 | Apache-2.0 |
| tailwindcss | ^4 | MIT |
| tsx | ^4.23.15 | MIT |
| typescript | ^5 | Apache-2.0 |

## Font

| Font | Sumber | License |
|---|---|---|
| Plus Jakarta Sans | Google Fonts (di-self-host oleh next/font saat build) | SIL Open Font License 1.1 |

## Actions GitHub (dipakai CI)

| Action | Versi | Commit SHA | License |
|---|---|---|---|
| actions/checkout | v7.0.1 | 3d3c42e5aac5ba805825da76410c181273ba90b1 | MIT |
| actions/setup-node | v7 | 820762786026740c76f36085b0efc47a31fe5020 | MIT |

## Catatan

- Dependency transitif TIDAK didaftar di sini. Jalankan `npm ls --all` atau
  `npx license-checker --production` untuk daftar lengkap sebelum rilis publik.
- Kalau aset pihak ketiga (ikon, ilustrasi, template) masuk ke repo, tambahkan
  entri beserta teks license-nya di file ini — jangan commit aset tanpa entri.
